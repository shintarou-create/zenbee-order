import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateYamatoCsv } from '@/lib/yamato-csv'
import type { OrderForCsv } from '@/lib/yamato-csv'
import { calcCodAmount, calcCodTax } from '@/lib/cod'
import type { ShippingCsvRequest } from '@/types'

export async function POST(req: NextRequest) {
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
          tier_quantity,
          tier_label,
          subtotal,
          product:products (name, category, unit, step_qty, cool_type)
        ),
        order_shipping (
          quantity,
          cost
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
      const orderItems = order.order_items || []
      const orderShipping = order.order_shipping || []

      // 代引き（payment_method='cod'）の注文のみ codAmount・codTax を算出する。
      let codAmount: number | undefined
      let codTax: number | undefined
      if (order.payment_method === 'cod') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemsTotal = orderItems.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const shippingTotal = orderShipping.reduce((sum: number, s: any) => sum + (s.cost || 0), 0)
        // 整合性チェック: 明細合計とtotal_amountが一致しない場合はtotal_amountを正として
        // 代引き総額を算出する（税額の内訳計算だけは取得した明細から求める）。
        if (itemsTotal + shippingTotal !== order.total_amount) {
          console.warn(
            `[shipping-csv] 注文 ${order.order_number} の明細合計(${itemsTotal + shippingTotal})と total_amount(${order.total_amount}) が一致しません。total_amount を正として代引き総額を算出します。`
          )
        }
        // company.delivery_method が pickup/direct_delivery の会社はそもそもヤマトを使わない運用。
        if (company?.delivery_method === 'pickup' || company?.delivery_method === 'direct_delivery') {
          console.warn(
            `[shipping-csv] 注文 ${order.order_number} は代金引換ですが、取引先の発送方法が${company.delivery_method}です（通常ヤマトを使わない運用のはずです）。`
          )
        }
        codAmount = calcCodAmount(order.total_amount, order.cod_fee)
        codTax = calcCodTax(itemsTotal, shippingTotal, order.cod_fee)
      }

      return {
        orderNumber: order.order_number,
        deliveryDate: order.delivery_date || undefined,
        deliveryTimeSlot: order.delivery_time_slot || undefined,
        notes: order.notes || undefined,
        // 口数（箱数）= 送料行の「本数」（行数）。送料欄UIは1行=1箱で、箱を増やす際は
        // 行を追加する運用のため、quantity の合算ではなく行数（length）で数える。
        shippingCount: orderShipping.length,
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
        items: orderItems.map((item: any) => ({
          quantity: item.quantity,
          tier_quantity: item.tier_quantity ?? null,
          tier_label: item.tier_label ?? null,
          product: {
            name: item.product?.name || '',
            category: item.product?.category || 'その他',
            unit: item.product?.unit || 'kg',
            step_qty: item.product?.step_qty || 1,
            cool_type: item.product?.cool_type ?? 0,
          },
        })),
        codAmount,
        codTax,
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
