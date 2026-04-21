import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateB2CSV } from '@/lib/yamato-csv'
import type { ShipmentRow } from '@/lib/yamato-csv'
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

    // 注文と会社情報を取得（納品先住所を使用）
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select(`
        *,
        company:companies (*),
        order_shipping (*)
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

    // CSV行データを作成（ヤマトCSVは納品先住所を使用）
    const rows: ShipmentRow[] = orders.map((order) => {
      const company = order.company
      const address = [
        company?.prefecture || '',
        company?.city || '',
        company?.address || '',
      ].filter(Boolean).join('')

      // 冷蔵品があるか送料明細から判定
      const hasCool = (order.order_shipping || []).some(
        (s: { label: string }) => s.label.includes('冷蔵')
      )

      return {
        recipientPostalCode: (company?.postal_code || '').replace('-', ''),
        recipientAddress: address,
        recipientBuilding: company?.building || '',
        recipientCompanyName: company?.company_name || '',
        recipientName: company?.representative_name || company?.company_name || '',
        recipientPhone: (company?.phone || '').replace(/-/g, ''),
        shipDate: formatDateForYamato(shipDate),
        deliveryDate: order.delivery_date ? formatDateForYamato(order.delivery_date) : '',
        deliveryTimeSlot: '',
        coolType: hasCool ? 2 : 0,
        itemName: '農産物',
        clientOrderNumber: order.order_number,
        notes: order.notes || '',
      }
    })

    // CSV生成
    const csvBuffer = generateB2CSV(rows)

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

function formatDateForYamato(dateStr: string): string {
  return dateStr.replace(/-/g, '/')
}
