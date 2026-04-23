import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateFreeeCSV } from '@/lib/freee-csv'
import type { FreeeInvoiceData, FreeeLineItem } from '@/lib/freee-csv'
import type { ShippingCsvRequest } from '@/types'

export async function POST(req: NextRequest) {
  // 管理者認証チェック
  const adminToken = req.headers.get('x-admin-token')
  if (!adminToken && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }

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
            order_items (quantity, unit_price, product:products (name, unit)),
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

    // 発行日 = 請求月末日（YYYY/MM/DD）
    const [yearNum, monthNum] = billingMonth.split('-').map(Number)
    const lastDay = new Date(yearNum, monthNum, 0)
    const date = [
      lastDay.getFullYear(),
      String(lastDay.getMonth() + 1).padStart(2, '0'),
      String(lastDay.getDate()).padStart(2, '0'),
    ].join('/')

    const csvInvoices: FreeeInvoiceData[] = []

    for (const invoice of invoices) {
      const company = invoice.company as { company_name?: string } | undefined
      const partnerName = company?.company_name || ''
      const lineItems: FreeeLineItem[] = []

      type InvoiceItemRow = {
        order?: {
          shipping_date?: string | null
          order_items?: Array<{
            quantity: number
            unit_price: number
            product?: { name: string; unit: string } | null
          }>
          order_shipping?: Array<{ label: string; cost: number }>
        } | null
      }

      const invoiceItems = (invoice.invoice_items || []) as InvoiceItemRow[]

      for (const invItem of invoiceItems) {
        const order = invItem.order
        if (!order) continue

        // 出荷日を "M/D" 形式に変換
        const sd = order.shipping_date || ''
        const parts = sd.split('-')
        const md = parts[1] && parts[2]
          ? `${parseInt(parts[1])}/${parseInt(parts[2])}`
          : ''

        // 商品明細（8%軽減税率）
        for (const oi of order.order_items || []) {
          lineItems.push({
            description: `${md}納品 ${oi.product?.name || ''}`,
            unitPrice: oi.unit_price,
            quantity: oi.quantity,
            unit: oi.product?.unit || '',
            taxRate: '8',
          })
        }

        // 送料明細（10%標準税率）
        for (const os of order.order_shipping || []) {
          if (!os.cost) continue
          lineItems.push({
            description: `${md} 送料（${os.label}）`,
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
