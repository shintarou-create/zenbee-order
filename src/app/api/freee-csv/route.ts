import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateFreeeCSV } from '@/lib/freee-csv'
import type { FreeeInvoiceData, FreeeLineItem } from '@/lib/freee-csv'
import { shouldShowTierBadge } from '@/lib/quantity-format'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { billingMonth: string }
    const { billingMonth } = body

    if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
      return NextResponse.json({ error: '請求月の形式が正しくありません (YYYY-MM)' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 請求書 → 請求明細 → 注文 → 注文明細（商品ごと）＋送料明細 を取得
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select(`
        invoice_number,
        company:companies (company_name),
        invoice_items (
          order:orders (
            shipping_date,
            delivery_date,
            order_items (product_name, unit, quantity, unit_price, subtotal, tier_label, tier_quantity, is_custom, product:products (name, unit, category)),
            order_shipping (label, cost)
          )
        )
      `)
      .eq('billing_month', billingMonth)
      .order('invoice_number')

    if (error) throw error

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ error: '対象月の請求書がありません' }, { status: 404 })
    }

    // 発行日 = 本日（JST）
    const now = new Date()
    const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const date = `${jstNow.getFullYear()}/${String(jstNow.getMonth() + 1).padStart(2, '0')}/${String(jstNow.getDate()).padStart(2, '0')}`

    const csvInvoices: FreeeInvoiceData[] = []

    for (const invoice of invoices) {
      const company = invoice.company as { company_name?: string } | undefined
      const partnerName = company?.company_name || ''
      const lineItems: FreeeLineItem[] = []

      type InvoiceItemRow = {
        order?: {
          shipping_date?: string | null
          delivery_date?: string | null
          order_items?: Array<{
            product_name: string
            unit: string
            quantity: number
            unit_price: number
            subtotal: number
            tier_label?: string | null
            tier_quantity?: number | null
            is_custom?: boolean | null
            product?: { name: string; unit: string; category: string } | null
          }>
          order_shipping?: Array<{ label: string; cost: number }>
        } | null
      }

      const invoiceItems = (invoice.invoice_items || []) as InvoiceItemRow[]

      for (const invItem of invoiceItems) {
        const order = invItem.order
        if (!order) continue

        // 「M/D納品」は納品日基準。delivery_date 優先・shipping_date フォールバック。
        const sd = order.delivery_date || order.shipping_date || ''
        const parts = sd.split('-')
        const md = parts[1] && parts[2]
          ? `${parseInt(parts[1])}/${parseInt(parts[2])}`
          : ''

        // 商品明細（8%軽減税率）
        for (const oi of order.order_items || []) {
          const itemName = oi.product?.name ?? oi.product_name ?? ''
          const itemUnit = oi.product?.unit ?? oi.unit ?? ''
          // tier_quantityがある場合は実本数（quantity × tier_quantity）で計算
          const realQty = oi.tier_quantity ? oi.quantity * oi.tier_quantity : oi.quantity
          const unitPrice = oi.unit_price || oi.subtotal
          const quantity = oi.unit_price ? realQty : 1
          // tier_label は箱(ケース)のみ併記。バラ(tier_quantity===1)は付けない。
          const desc = oi.tier_label && shouldShowTierBadge(oi.tier_quantity)
            ? `${md}納品 ${itemName}（${oi.tier_label}）`
            : `${md}納品 ${itemName}`
          lineItems.push({
            description: desc,
            unitPrice,
            quantity,
            unit: itemUnit,
            taxRate: '8',
          })
        }

        // 送料明細（10%標準税率）
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

      csvInvoices.push({
        invoiceNumber: invoice.invoice_number,
        date,
        billingMonth,
        partnerName,
        items: lineItems,
      })
    }

    const csvBuffer = generateFreeeCSV(csvInvoices)
    const filename = `freee_${billingMonth.replace('-', '')}.csv`

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
  } catch (error) {
    console.error('freee CSV生成エラー:', error)
    return NextResponse.json({ error: 'CSV生成に失敗しました' }, { status: 500 })
  }
}
