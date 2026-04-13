import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateB2CSV } from '@/lib/yamato-csv'
import type { ShipmentRow } from '@/lib/yamato-csv'
import type { ShippingCsvRequest } from '@/types'
import { formatDeliveryTimeSlot } from '@/lib/yamato-csv'

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

    // 注文と顧客情報を取得
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customers (*)
      `)
      .in('id', orderIds)
      .in('status', ['confirmed', 'shipped'])

    if (fetchError || !orders) {
      console.error('注文取得エラー:', fetchError)
      return NextResponse.json({ error: '注文情報の取得に失敗しました' }, { status: 500 })
    }

    if (orders.length === 0) {
      return NextResponse.json({ error: '対象の注文が見つかりません' }, { status: 404 })
    }

    // CSV行データを作成
    const rows: ShipmentRow[] = orders.map((order) => {
      const customer = order.customer
      const address = [
        customer?.prefecture || '',
        customer?.city || '',
        customer?.address || '',
      ].filter(Boolean).join('')

      return {
        recipientPostalCode: (customer?.postal_code || '').replace('-', ''),
        recipientAddress1: address,
        recipientAddress2: customer?.building || '',
        recipientCompanyName: customer?.company_name || '',
        recipientName: customer?.representative_name || customer?.company_name || '',
        recipientPhone: (customer?.phone || '').replace(/-/g, ''),
        shipDate: formatDateForYamato(shipDate),
        deliveryDate: order.delivery_date ? formatDateForYamato(order.delivery_date) : '',
        deliveryTimeSlot: formatDeliveryTimeSlot(order.delivery_time_slot),
        coolType: order.cool_type || 0,
        itemName: '農産物',
        quantity: 1,
        clientOrderNumber: order.order_number,
        notes: order.notes || '',
      }
    })

    // CSV生成
    const csvBuffer = generateB2CSV(rows)

    // 注文ステータスを shipped に更新
    await supabase
      .from('orders')
      .update({
        status: 'shipped',
        shipping_date: shipDate,
        updated_at: new Date().toISOString(),
      })
      .in('id', orderIds)
      .eq('status', 'confirmed')

    // CSVファイルとして返す
    const filename = `yamato_b2_${shipDate.replace(/-/g, '')}.csv`

    // Uint8Array をReadableStreamに変換してNextResponseに渡す
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

function formatDateForYamato(dateStr: string): string {
  // YYYY-MM-DD → YYYY/MM/DD
  return dateStr.replace(/-/g, '/')
}
