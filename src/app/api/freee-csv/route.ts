import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateFreeeCSV, billingMonthToDate } from '@/lib/freee-csv'
import type { FreeeTransactionRow } from '@/lib/freee-csv'

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

    // 発生日 = 請求月末日
    const date = billingMonthToDate(billingMonth)

    const rows: FreeeTransactionRow[] = []

    for (const invoice of invoices) {
      const company = invoice.company as { company_name?: string } | undefined
      const partner = company?.company_name || ''
      const memo = `${invoice.invoice_number} ${billingMonth}月分`

      // 注文明細から食品合計・送料合計を算出
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

        // 食品 = order_items の subtotal 合計
        const orderFood = (order.order_items || []).reduce(
          (sum: number, oi: { subtotal: number }) => sum + oi.subtotal, 0
        )
        // 送料 = order_shipping の cost 合計
        const orderShipping = (order.order_shipping || []).reduce(
          (sum: number, os: { cost: number }) => sum + os.cost, 0
        )

        foodTotal += orderFood
        shippingTotal += orderShipping
      }

      // 食品行（8%軽減税率）
      if (foodTotal > 0) {
        rows.push({
          date,
          partner,
          accountTitle: '売上高',
          itemName: '農産物',
          taxClass: '課税売上8%（軽）',
          amount: foodTotal,
          memo,
        })
      }

      // 送料行（10%標準税率）
      if (shippingTotal > 0) {
        rows.push({
          date,
          partner,
          accountTitle: '売上高',
          itemName: '送料',
          taxClass: '課税売上10%',
          amount: shippingTotal,
          memo,
        })
      }
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
