import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateYamatoCsv } from '@/lib/yamato-csv'
import type { OrderForCsv } from '@/lib/yamato-csv'
import type { ShippingCsvRequest } from '@/types'

export async function POST(req: NextRequest) {
  // 管理者認証チェック
  const adminToken = req.headers.get('x-admin-token')
  if (!adminToken && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as ShippingCsvRequest
    const { orderIds, shipDate } = body

    if (!orderIds || orderIds.length === 0) {
      return NextResponse.json({ error: '注文IDが指定されていません' }, { status: 400 })
    }

    if (!shipDate) {
      return NextResponse.json({ error: '発送日が指定されていません' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 注文・会社情報・注文明細・商品情報を取得
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select(`
        *,
        company:companies (*),
        order_items (
          quantity,
          product:products (category, unit, step_qty)
        )
      `)
      .in('id', orderIds)
      .in('status', ['pending', 'shipped'])

    if (fetchError || !orders) {
      console.error('注文取得エラー:', fetchError)
      return NextResponse.json({ error: '注文情報の取得に失敗しました' }, { status: 500 })
    }

    if (orders.length === 0) {
      return NextResponse.json({ error: '対象の注文が見つかりません' }, { status: 404 })
    }

    // OrderForCsv 形式に変換
    const csvOrders: OrderForCsv[] = orders.map((order) => {
      const company = order.company
      return {
        orderNumber: order.order_number,
        deliveryDate: order.delivery_date || undefined,
        notes: order.notes || undefined,
        company: {
          postalCode: company?.postal_code || '',
          prefecture: company?.prefecture || '',
          city: company?.city || '',
          address: company?.address || '',
          building: company?.building || '',
          companyName: company?.company_name || '',
          representativeName: company?.representative_name || company?.company_name || '',
          phone: company?.phone || '',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: (order.order_items || []).map((item: any) => ({
          quantity: item.quantity,
          product: {
            category: item.product?.category || 'その他',
            unit: item.product?.unit || 'kg',
            step_qty: item.product?.step_qty || 1,
          },
        })),
      }
    })

    // CSV生成
    const csvBuffer = generateYamatoCsv(csvOrders, shipDate)

    // 伝票印刷済みフラグを更新（ステータスは変更しない）
    await supabase
      .from('orders')
      .update({
        shipping_label_printed: true,
        updated_at: new Date().toISOString(),
      })
      .in('id', orderIds)

    // CSVファイルとして返す
    const filename = `yamato_b2_${shipDate.replace(/-/g, '')}.csv`

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(csvBuffer)
        controller.close()
      },
    })

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=Shift_JIS',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': csvBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('CSV生成エラー:', error)
    return NextResponse.json({ error: 'CSV生成に失敗しました' }, { status: 500 })
  }
}
