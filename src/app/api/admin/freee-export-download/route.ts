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

type InvoiceItemRow = {
  order?: {
    shipping_date?: string | null
    order_items?: Array<{
      quantity: number
      unit_price: number
      subtotal: number
      tier_label?: string | null
      tier_quantity?: number | null
      product?: { name: string; unit: string; category: string } | null
    }>
    order_shipping?: Array<{ label: string; cost: number }>
  } | null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { from: string; to: string }
    const { from, to } = body

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

    const fromDate = new Date(from)
    const billingMonth = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}`

    const supabase = createServiceClient()

    // Reuse existing invoice-based pipeline (same as /api/freee-csv)
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select(`
        invoice_number,
        company:companies (company_name),
        invoice_items (
          order:orders (
            shipping_date,
            order_items (quantity, unit_price, subtotal, tier_label, tier_quantity, product:products (name, unit, category)),
            order_shipping (label, cost)
          )
        )
      `)
      .eq('billing_month', billingMonth)
      .order('invoice_number')

    if (invError) throw invError

    if (!invoices || invoices.length === 0) {
      const [y, m] = billingMonth.split('-')
      return NextResponse.json(
        { error: `${y}年${parseInt(m)}月分の請求書がありません（まだ請求書が作成されていない可能性があります）` },
        { status: 404 },
      )
    }

    // Count orders in [from, to] JST range for the log
    const { count: orderCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${from}T00:00:00+09:00`)
      .lte('created_at', `${to}T23:59:59.999+09:00`)

    // Build FreeeInvoiceData — same data pipeline as /api/freee-csv
    const now = new Date()
    const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const date = `${jstNow.getFullYear()}/${String(jstNow.getMonth() + 1).padStart(2, '0')}/${String(jstNow.getDate()).padStart(2, '0')}`

    const csvInvoices: FreeeInvoiceData[] = []

    for (const invoice of invoices) {
      const company = invoice.company as { company_name?: string } | undefined
      const partnerName = company?.company_name || ''
      const lineItems: FreeeLineItem[] = []

      for (const invItem of (invoice.invoice_items || []) as InvoiceItemRow[]) {
        const order = invItem.order
        if (!order) continue

        const sd = order.shipping_date || ''
        const parts = sd.split('-')
        const md = parts[1] && parts[2] ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : ''

        for (const oi of order.order_items || []) {
          const realQty = oi.tier_quantity ? oi.quantity * oi.tier_quantity : oi.quantity
          const unitPrice = oi.unit_price || oi.subtotal
          const quantity = oi.unit_price ? realQty : 1
          const desc = oi.tier_label
            ? `${md}納品 ${oi.product?.name || ''}（${oi.tier_label}）`
            : `${md}納品 ${oi.product?.name || ''}`
          lineItems.push({ description: desc, unitPrice, quantity, unit: oi.product?.unit || '', taxRate: '8' })
        }

        for (const os of order.order_shipping || []) {
          if (!os.cost) continue
          lineItems.push({
            description: `${md}納品 送料（${os.label}）`,
            unitPrice: os.cost,
            quantity: 1,
            unit: '',
            taxRate: '10',
          })
        }
      }

      csvInvoices.push({ invoiceNumber: invoice.invoice_number, date, billingMonth, partnerName, items: lineItems })
    }

    const csvBuffer = generateFreeeCSV(csvInvoices)

    const targetYearMonth = getTargetYearMonth(from, to)
    const lineUserId = req.headers.get('x-line-user-id') ?? null

    await supabase.from('freee_export_log').insert({
      target_year_month: targetYearMonth,
      order_count: orderCount ?? 0,
      exported_by_line_user_id: lineUserId,
    })

    const isWholeMonth = !targetYearMonth.startsWith('custom_')
    const filename = isWholeMonth
      ? `zenbee-freee-${billingMonth}.csv`
      : `zenbee-freee-${from}_to_${to}.csv`

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
    console.error('freee-export-download error:', err)
    return NextResponse.json({ error: 'CSV生成に失敗しました' }, { status: 500 })
  }
}
