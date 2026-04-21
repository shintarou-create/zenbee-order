import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateFreeeCSV, billingMonthToDate } from '@/lib/freee-csv'
import type { FreeeInvoiceRow } from '@/lib/freee-csv'

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

    // 請求書 → 請求明細 → 注文 → 注文明細 + 送料明細 を一括取得
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select(`
        *,
        company:companies (company_name),
        invoice_items (
          id,
          order_id,
          amount,
          order:orders (
            id,
            order_number,
            order_items (subtotal),
            order_shipping (cost)
          )
        )
      `)
      .eq('billing_month', billingMonth)
      .order('invoice_number')

    if (error) throw error

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ error: '対象月の請求書がありません' }, { status: 404 })
    }

    // 発行日 = 請求月末日
    const date = billingMonthToDate(billingMonth)

    const rows: FreeeInvoiceRow[] = []

    for (const invoice of invoices) {
      const company = invoice.company as { company_name?: string } | undefined
      const partnerName = company?.company_name || ''

      let foodTotal = 0
      let shippingTotal = 0

      const items = (invoice.invoice_items || []) as Array<{
        order?: {
          order_items?: Array<{ subtotal: number }>
          order_shipping?: Array<{ cost: number }>
        } | null
      }>

      for (const item of items) {
        const order = item.order
        if (!order) continue

        const orderFood = (order.order_items || []).reduce(
          (sum: number, oi: { subtotal: number }) => sum + oi.subtotal, 0
        )
        const orderShipping = (order.order_shipping || []).reduce(
          (sum: number, os: { cost: number }) => sum + os.cost, 0
        )

        foodTotal += orderFood
        shippingTotal += orderShipping
      }

      rows.push({
        invoiceNumber: invoice.invoice_number,
        date,
        billingMonth,
        partnerName,
        foodTotal,
        shippingTotal,
      })
    }

    const csvBuffer = generateFreeeCSV(rows)
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
