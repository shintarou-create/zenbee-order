import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateOrderNumber } from '@/lib/utils'
import { notifyOrderCreated } from '@/lib/line-messaging'
import { calculateShipping } from '@/lib/shipping'
import { isBlockedDeliveryDate, isTooSoonDeliveryDate, hasMixedShipStart } from '@/lib/delivery-rules'
import type { CreateOrderRequest, CartItem, CoolType } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateOrderRequest
    const { items, notes, deliveryDate, deliveryTimeSlot, liffAccessToken } = body

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: '注文商品が指定されていません' },
        { status: 400 }
      )
    }

    // 自由記入行のサーバ側バリデーション
    const customItems = items.filter((i) => i.isCustom)
    if (customItems.length > 5) {
      return NextResponse.json({ error: '自由記入は1注文5件までです' }, { status: 400 })
    }
    for (const ci of customItems) {
      const text = (ci.customText ?? '').trim()
      if (!text) return NextResponse.json({ error: '自由記入の内容は必須です' }, { status: 400 })
      if (text.length > 100) return NextResponse.json({ error: '自由記入は100文字以内です' }, { status: 400 })
    }

    // Input validation（通常行のみ）
    for (const item of items) {
      if (item.isCustom) continue
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999) {
        return NextResponse.json({ error: '数量は1〜9999の整数で指定してください' }, { status: 400 })
      }
    }
    if (notes && notes.length > 500) {
      return NextResponse.json({ error: '備考は500文字以内で入力してください' }, { status: 400 })
    }
    if (deliveryDate) {
      const d = new Date(deliveryDate)
      const now = new Date()
      const maxDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
      if (isNaN(d.getTime()) || d < now || d > maxDate) {
        return NextResponse.json({ error: '納品希望日が無効です（本日〜180日以内）' }, { status: 400 })
      }
      if (isTooSoonDeliveryDate(deliveryDate)) {
        return NextResponse.json({ error: 'お届け希望日はご注文日の2日後以降でご指定ください' }, { status: 400 })
      }
      if (isBlockedDeliveryDate(deliveryDate)) {
        return NextResponse.json({ error: '月曜・木曜はお届け日に指定できません' }, { status: 400 })
      }
    }
    const VALID_TIME_SLOTS = ['morning', 'afternoon', 'evening1', 'evening2', 'evening3']
    if (deliveryTimeSlot && !VALID_TIME_SLOTS.includes(deliveryTimeSlot)) {
      return NextResponse.json({ error: '配達時間帯の指定が無効です' }, { status: 400 })
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

    // line_users → companies で顧客情報を取得
    const { data: lineUser, error: lineUserError } = await supabase
      .from('line_users')
      .select('*, company:companies (*)')
      .eq('line_user_id', lineUserId)
      .eq('is_active', true)
      .single()

    if (lineUserError || !lineUser || !lineUser.company) {
      return NextResponse.json(
        { error: '顧客情報が見つかりません。登録申請をお待ちください。' },
        { status: 403 }
      )
    }

    const company = lineUser.company

    if (!company.is_active) {
      return NextResponse.json(
        { error: 'このアカウントは現在ご利用いただけません。' },
        { status: 403 }
      )
    }

    if (company.approval_status && company.approval_status !== 'approved') {
      return NextResponse.json(
        { error: '承認待ちです。担当者の確認をお待ちください。' },
        { status: 403 }
      )
    }

    // 通常行の productId リスト（自由記入行を除く）
    const normalItems = items.filter((i) => !i.isCustom)
    const productIds = normalItems.map((i) => i.productId)

    let products: Array<{
      id: string; name: string; unit: string; cool_type: number
      step_qty: number; min_order_qty: number; stock_status: string
      ship_start_date: string | null
      product_prices: Array<{ price_rank: string; price_per_unit: number }>
    }> = []

    if (productIds.length > 0) {
      const { data: fetched, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          product_prices (price_rank, price_per_unit)
        `)
        .in('id', productIds)
        .eq('is_active', true)

      if (productsError || !fetched) {
        return NextResponse.json(
          { error: '商品情報の取得に失敗しました' },
          { status: 500 }
        )
      }
      products = fetched as typeof products
    }

    // 発送開始日の混在チェック（is_custom 行は ship_start_date なし = NULL 扱い）
    if (hasMixedShipStart(products.map((p) => ({ shipStartDate: p.ship_start_date })))) {
      return NextResponse.json({ error: 'お届け開始時期が異なる商品は同時に注文できません' }, { status: 400 })
    }

    // 納品希望日が発送開始日より前の場合はブロック
    if (deliveryDate) {
      const shipStartDates = products.map((p) => p.ship_start_date).filter((d): d is string => !!d)
      if (shipStartDates.length > 0) {
        const latestShipStart = shipStartDates.reduce((a, b) => (a > b ? a : b))
        if (deliveryDate < latestShipStart) {
          return NextResponse.json(
            { error: `お届け希望日は ${latestShipStart} 以降でご指定ください（発送開始日前は指定できません）` },
            { status: 400 }
          )
        }
      }
    }

    // 在庫確認と金額計算
    let totalAmount = 0
    const orderItemsData: Array<{
      product_id: string | null
      product_name: string
      quantity: number
      unit: string
      unit_price: number
      subtotal: number
      pricing_tier_id: string | null
      tier_label: string | null
      tier_quantity: number | null
      is_custom: boolean
    }> = []
    const cartItemsForShipping: CartItem[] = []

    for (const item of items) {
      // 自由記入行
      if (item.isCustom) {
        const text = (item.customText ?? '').trim()
        orderItemsData.push({
          product_id: null,
          product_name: text,
          quantity: 1,
          unit: '',
          unit_price: 0,
          subtotal: 0,
          pricing_tier_id: null,
          tier_label: null,
          tier_quantity: null,
          is_custom: true,
        })
        continue
      }

      const product = products.find((p) => p.id === item.productId)
      if (!product) {
        return NextResponse.json(
          { error: `商品が見つかりません: ${item.productId}` },
          { status: 400 }
        )
      }

      let unitPrice = 0
      let tierLabel: string | null = null
      let tierQuantity: number | null = null
      let pricingTierId: string | null = null

      if (item.pricingTierId) {
        // 段階あり: DBから価格を取得（クライアント送信値は信用しない）
        const { data: tier } = await supabase
          .from('product_pricing_tiers')
          .select('id, tier_label, quantity, unit_price')
          .eq('id', item.pricingTierId)
          .eq('product_id', item.productId)
          .eq('is_active', true)
          .single()

        if (!tier) {
          return NextResponse.json(
            { error: `価格段階が見つかりません: ${product.name}` },
            { status: 400 }
          )
        }
        unitPrice = tier.unit_price
        tierLabel = tier.tier_label
        tierQuantity = tier.quantity
        pricingTierId = tier.id
      } else {
        // 段階なし: product_prices から取得
        const priceEntry = Array.isArray(product.product_prices)
          ? (product.product_prices.find((pp: { price_rank: string }) => pp.price_rank === company.price_rank)
             ?? product.product_prices.find((pp: { price_rank: string }) => pp.price_rank === 'standard'))
          : null
        unitPrice = priceEntry?.price_per_unit || 0
      }

      // 在庫確認
      if (product.stock_status === 'cross') {
        return NextResponse.json(
          { error: `${product.name} は現在在庫がありません` },
          { status: 400 }
        )
      }

      const subtotal = tierQuantity
        ? unitPrice * tierQuantity * item.quantity
        : unitPrice * item.quantity
      totalAmount += subtotal

      orderItemsData.push({
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit: product.unit,
        unit_price: unitPrice,
        subtotal,
        pricing_tier_id: pricingTierId,
        tier_label: tierLabel,
        tier_quantity: tierQuantity,
        is_custom: false,
      })

      cartItemsForShipping.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unit: product.unit,
        unitPrice,
        subtotal,
        coolType: product.cool_type as CoolType,
        stepQty: product.step_qty,
        minOrderQty: product.min_order_qty,
        tierQuantity: tierQuantity ?? undefined,
      })
    }

    // 送料計算
    const shippingBreakdown = calculateShipping(cartItemsForShipping)
    totalAmount += shippingBreakdown.total

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
        company_id: company.id,
        status: 'pending',
        total_amount: totalAmount,
        notes: notes || null,
        delivery_date: deliveryDate || null,
        delivery_time_slot: deliveryTimeSlot || null,
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
      await supabase.from('orders').delete().eq('id', order.id)
      return NextResponse.json(
        { error: '注文明細の作成に失敗しました' },
        { status: 500 }
      )
    }

    // 送料明細を保存
    if (shippingBreakdown.lines.length > 0) {
      const { error: shippingError } = await supabase
        .from('order_shipping')
        .insert(
          shippingBreakdown.lines.map((line, idx) => ({
            order_id: order.id,
            label: line.label,
            quantity: line.quantity,
            unit_cost: line.unitCost,
            cost: line.cost,
            sort_order: idx,
          }))
        )

      if (shippingError) {
        console.error('送料明細作成エラー:', shippingError)
        // 送料保存失敗しても注文は完了扱い（後から管理画面で修正可能）
      }
    }

    // LINE通知を送信（非同期、失敗しても注文は完了）
    const adminLineId = process.env.LINE_ADMIN_USER_ID
    if (adminLineId) {
      const hasCustom = orderItemsData.some((i) => i.is_custom)
      const productSummary = orderItemsData
        .map((item) => {
          if (item.is_custom) {
            return `・【自由記入】${item.product_name}（金額未確定）`
          }
          if (item.tier_label && item.tier_quantity) {
            const totalBottles = item.quantity * item.tier_quantity
            return `・${item.product_name} [${item.tier_label}] × ${item.quantity}ケース（${totalBottles}本）`
          }
          return `・${item.product_name} ${item.quantity}${item.unit}`
        })
        .join('\n')

      try {
        await notifyOrderCreated(
          lineUser.line_user_id,
          orderNumber,
          totalAmount,
          company.company_name,
          productSummary,
          adminLineId,
          hasCustom
        )
      } catch (err) {
        console.error('LINE通知エラー:', err)
        // 通知失敗しても注文は完了扱いのまま
      }
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

    // line_users → companies で会社IDを取得
    const { data: lineUser } = await supabase
      .from('line_users')
      .select('company_id')
      .eq('line_user_id', lineUserId)
      .single()

    if (!lineUser || !lineUser.company_id) {
      return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`*, order_items (*), order_shipping (*)`)
      .eq('company_id', lineUser.company_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ data: orders })
  } catch (error) {
    console.error('注文一覧取得エラー:', error)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
