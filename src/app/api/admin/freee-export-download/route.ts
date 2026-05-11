import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateFreeeCSV } from '@/lib/freee-csv'
import type { FreeeInvoiceData, FreeeLineItem } from '@/lib/freee-csv'

function getTargetYearMonth(from: string, to: string): string {
  const fromDate = new Date(from)
  const toDate = new Date(to)

  const sameMonth =
    fromDate.getFullYear() === toDate.getFullYear() &&
    fromDate.getMonth() === toDate.getMonth()
  const isFirstOfMonth = fromDate.getDate() === 1
  const lastDay = new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0).getDate()
  const isLastOfMonth = toDate.getDate() === lastDay

  if (sameMonth && isFirstOfMonth && isLastOfMonth) {
    const y = fromDate.getFullYear()
    const m = String(fromDate.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }
  return `custom_${from}_${to}`
}

type OrderRow = {
  id: string
  company_id: string
  shipping_date: string | null
  company: { company_name?: string } | null
}
type OrderItemRow = {
  order_id: string
  quantity: number
  unit_price: number
  subtotal: number
  tier_label: string | null
  tier_quantity: number | null
  product: { name: string; unit: string; category: string } | null
}
type OrderShippingRow = {
  order_id: string
  label: string
  cost: number
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { from: string; to: string }
    const { from, to } = body

    // DEBUG: remove after diagnosis
    console.log('[freee-export-download] handler reached, from:', from, 'to:', to)

    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: '日付形式が正しくありません (YYYY-MM-DD)' }, { status: 400 })
    }
    if (from > to) {
      return NextResponse.json({ error: '開始日は終了日以前の日付を指定してください' }, { status: 400 })
    }
    const diffDays = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 180) {
      return NextResponse.json({ error: '期間は180日以内で指定してください' }, { status: 400 })
    }

    const fromUtc = new Date(`${from}T00:00:00+09:00`).toISOString()
    const toUtc = new Date(`${to}T23:59:59.999+09:00`).toISOString()
    console.log('[freee-export-download] fromUtc:', fromUtc, 'toUtc:', toUtc)

    const supabase = createServiceClient()

    // Stage 1: orders + company (avoids FK embed reliability issues)
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, company_id, shipping_date, company:companies(company_name)')
      .gte('created_at', fromUtc)
      .lte('created_at', toUtc)
      .order('created_at', { ascending: true })

    if (ordersError) {
      console.error('[freee-export-download] ordersError:', ordersError.message)
      throw ordersError
    }
    const orderList = (orders ?? []) as OrderRow[]
    console.log('[freee-export-download] orders.length:', orderList.length)

    const orderIds = orderList.map(o => o.id)

    let allItems: OrderItemRow[] = []
    let allShipping: OrderShippingRow[] = []

    if (orderIds.length > 0) {
      // Stage 2a: order_items
      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('order_id, quantity, unit_price, subtotal, tier_label, tier_quantity, product:products(name, unit, category)')
        .in('order_id', orderIds)

      if (itemsError) {
        console.error('[freee-export-download] itemsError:', itemsError.message)
        throw itemsError
      }
      allItems = (items ?? []) as unknown as OrderItemRow[]

      // Stage 2b: order_shipping
      const { data: shipping, error: shippingError } = await supabase
        .from('order_shipping')
        .select('order_id, label, cost')
        .in('order_id', orderIds)

      if (shippingError) {
        console.error('[freee-export-download] shippingError:', shippingError.message)
        throw shippingError
      }
      allShipping = (shipping ?? []) as OrderShippingRow[]
    }

    console.log('[freee-export-download] allItems:', allItems.length, 'allShipping:', allShipping.length)

    // Index by order_id for O(1) lookup
    const itemsByOrder = new Map<string, OrderItemRow[]>()
    for (const item of allItems) {
      const list = itemsByOrder.get(item.order_id) ?? []
      list.push(item)
      itemsByOrder.set(item.order_id, list)
    }
    const shippingByOrder = new Map<string, OrderShippingRow[]>()
    for (const s of allShipping) {
      const list = shippingByOrder.get(s.order_id) ?? []
      list.push(s)
      shippingByOrder.set(s.order_id, list)
    }

    // Group FreeeLineItems by company
    const companiesMap = new Map<string, { companyName: string; items: FreeeLineItem[] }>()

    for (const order of orderList) {
      const cid = order.company_id
      const companyName = (order.company as { company_name?: string } | null)?.company_name ?? ''

      if (!companiesMap.has(cid)) {
        companiesMap.set(cid, { companyName, items: [] })
      }

      const sd = order.shipping_date ?? ''
      const parts = sd.split('-')
      const md = parts[1] && parts[2] ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : ''
      const entry = companiesMap.get(cid)!

      for (const oi of itemsByOrder.get(order.id) ?? []) {
        const realQty = oi.tier_quantity ? oi.quantity * oi.tier_quantity : oi.quantity
        const unitPrice = oi.unit_price || oi.subtotal
        const quantity = oi.unit_price ? realQty : 1
        const desc = oi.tier_label
          ? `${md}納品 ${oi.product?.name ?? ''}（${oi.tier_label}）`
          : `${md}納品 ${oi.product?.name ?? ''}`
        entry.items.push({ description: desc, unitPrice, quantity, unit: oi.product?.unit ?? '', taxRate: '8' })
      }

      for (const os of shippingByOrder.get(order.id) ?? []) {
        if (!os.cost) continue
        entry.items.push({
          description: `${md}納品 送料（${os.label}）`,
          unitPrice: os.cost,
          quantity: 1,
          unit: '',
          taxRate: '10',
        })
      }
    }

    console.log('[freee-export-download] companiesMap.size:', companiesMap.size)

    const now = new Date()
    const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const date = `${jstNow.getFullYear()}/${String(jstNow.getMonth() + 1).padStart(2, '0')}/${String(jstNow.getDate()).padStart(2, '0')}`

    const fromDate = new Date(from)
    const billingMonth = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}`
    const billingMonthLabel = billingMonth.replace('-', '')

    const csvInvoices: FreeeInvoiceData[] = []
    let seq = 0

    for (const [, { companyName, items }] of Array.from(companiesMap)) {
      seq++
      csvInvoices.push({
        invoiceNumber: `${billingMonthLabel}-${String(seq).padStart(3, '0')}`,
        date,
        billingMonth,
        partnerName: companyName,
        items,
      })
    }

    console.log('[freee-export-download] csvInvoices.length:', csvInvoices.length)

    const csvBuffer = generateFreeeCSV(csvInvoices)

    const targetYearMonth = getTargetYearMonth(from, to)
    const lineUserId = req.headers.get('x-line-user-id') ?? null

    // Log export (non-fatal if freee_export_log table not yet created)
    const { error: logError } = await supabase.from('freee_export_log').insert({
      target_year_month: targetYearMonth,
      order_count: orderList.length,
      exported_by_line_user_id: lineUserId,
    })
    if (logError) {
      console.error('[freee-export-download] freee_export_log insert (non-fatal):', logError.message)
    }

    const isWholeMonth = !targetYearMonth.startsWith('custom_')
    const filename = isWholeMonth
      ? `zenbee-freee-${billingMonth}.csv`
      : `zenbee-freee-${from}_to_${to}.csv`

    console.log('[freee-export-download] success filename:', filename, 'bytes:', csvBuffer.length)

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(csvBuffer)
        controller.close()
      },
    })

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': csvBuffer.length.toString(),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[freee-export-download] fatal error:', msg)
    return NextResponse.json({ error: 'CSV生成に失敗しました' }, { status: 500 })
  }
}
