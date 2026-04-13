import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateOrderNumber } from '@/lib/utils'
import { notifyOrderCreated } from '@/lib/line-messaging'
import type { CreateOrderRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateOrderRequest
    const { items, notes, deliveryDate, liffAccessToken } = body

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: '注文商品が指定されていません' },
        { status: 400 }
      )
    }

    // LIFF アクセストークンを検証してユーザーIDを取得
    let lineUserId: string

    if (liffAccessToken) {
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${liffAccessToken}` },
      })

      if (!profileRes.ok) {
        return NextResponse.json(
          { error: '認証に失敗しました。再度ログインしてください。' },
          { status: 401 }
        )
      }

      const profile = await profileRes.json()
      lineUserId = profile.userId
    } else {
      // 開発環境向けフォールバック（本番では使わない）
      if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json(
          { error: '認証トークンが必要です' },
          { status: 401 }
        )
      }
      lineUserId = 'dev_user_001'
    }

    const supabase = createServiceClient()

    // 顧客情報を取得
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('line_user_id', lineUserId)
      .eq('is_active', true)
      .single()

    if (customerError || !customer) {
      return NextResponse.json(
        { error: '顧客情報が見つかりません。登録申請をお待ちください。' },
        { status: 403 }
      )
    }

    // 商品情報と価格を取得
    const productIds = items.map((i) => i.productId)
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        *,
        product_prices (price_rank, price_per_unit),
        inventory (available_qty, reserved_qty)
      `)
      .in('id', productIds)
      .eq('is_active', true)

    if (productsError || !products) {
      return NextResponse.json(
        { error: '商品情報の取得に失敗しました' },
        { status: 500 }
      )
    }

    // 在庫確認と金額計算
    let totalAmount = 0
    const orderItemsData = []
    const inventoryUpdates: Array<{ productId: string; newReserved: number }> = []

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId)
      if (!product) {
        return NextResponse.json(
          { error: `商品が見つかりません: ${item.productId}` },
          { status: 400 }
        )
      }

      // 在庫確認
      const inv = product.inventory?.[0] || product.inventory
      if (inv) {
        const available = (inv.available_qty || 0) - (inv.reserved_qty || 0)
        if (available < item.quantity) {
          return NextResponse.json(
            { error: `${product.name} の在庫が不足しています（在庫: ${available}${product.unit}）` },
            { status: 400 }
          )
        }
        inventoryUpdates.push({
          productId: product.id,
          newReserved: (inv.reserved_qty || 0) + item.quantity,
        })
      }

      // 価格取得
      const priceEntry = Array.isArray(product.product_prices)
        ? product.product_prices.find((pp: { price_rank: string }) => pp.price_rank === customer.price_rank)
        : null
      const unitPrice = priceEntry?.price_per_unit || 0

      const subtotal = unitPrice * item.quantity
      totalAmount += subtotal

      orderItemsData.push({
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit: product.unit,
        unit_price: unitPrice,
        subtotal,
      })
    }

    // 今日の注文数を取得してシーケンス番号を計算
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    const { count: todayOrderCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())
      .lt('created_at', todayEnd.toISOString())

    const sequence = (todayOrderCount || 0) + 1
    const orderNumber = generateOrderNumber(today, sequence)

    // 注文を作成
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customer.id,
        status: 'pending',
        total_amount: totalAmount,
        notes: notes || null,
        delivery_date: deliveryDate || null,
        cool_type: orderItemsData.some(
          (item) => products.find((p) => p.id === item.product_id)?.cool_type === 1
        ) ? 1 : 0,
      })
      .select()
      .single()

    if (orderError || !order) {
      console.error('注文作成エラー:', orderError)
      return NextResponse.json(
        { error: '注文の作成に失敗しました' },
        { status: 500 }
      )
    }

    // 注文明細を作成
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(
        orderItemsData.map((item) => ({
          ...item,
          order_id: order.id,
        }))
      )

    if (itemsError) {
      console.error('注文明細作成エラー:', itemsError)
      // 注文を削除してロールバック
      await supabase.from('orders').delete().eq('id', order.id)
      return NextResponse.json(
        { error: '注文明細の作成に失敗しました' },
        { status: 500 }
      )
    }

    // 在庫のreserved_qtyを更新
    for (const update of inventoryUpdates) {
      await supabase
        .from('inventory')
        .update({ reserved_qty: update.newReserved })
        .eq('product_id', update.productId)
    }

    // LINE通知を送信（非同期、失敗しても注文は完了）
    const adminLineId = process.env.LINE_ADMIN_USER_ID
    if (adminLineId) {
      const productSummary = orderItemsData
        .map((item) => `・${item.product_name} ${item.quantity}${item.unit}`)
        .join('\n')

      notifyOrderCreated(
        customer.line_user_id,
        orderNumber,
        totalAmount,
        customer.company_name,
        productSummary,
        adminLineId
      ).catch((err) => console.error('LINE通知エラー:', err))
    }

    return NextResponse.json({
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        totalAmount: order.total_amount,
      },
    })
  } catch (error) {
    console.error('注文API エラー:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const lineUserId = searchParams.get('line_user_id')

  if (!lineUserId) {
    return NextResponse.json({ error: 'line_user_id が必要です' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('line_user_id', lineUserId)
      .single()

    if (!customer) {
      return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`*, order_items (*)`)
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ data: orders })
  } catch (error) {
    console.error('注文一覧取得エラー:', error)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
