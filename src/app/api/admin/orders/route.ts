import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { formatOrderItemLabel } from '@/lib/quantity-format'
import { generateOrderNumber } from '@/lib/utils'
import { notifyOrderCreated } from '@/lib/line-messaging'
import { calculateShipping } from '@/lib/shipping'
import {
  aggregateCases,
  getActiveOverrides,
  resolveUnitPriceOverride,
  resolveFixedShippingFee,
} from '@/lib/company-overrides'
import type { CartItem, CoolType, CompanyOverride, DeliveryMethod } from '@/types'

export async function POST(req: NextRequest) {
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { companyId, newCompanyName, items, notes, deliveryDate, deliveryTimeSlot } = body

    if (!companyId && !newCompanyName?.trim()) {
      return NextResponse.json({ error: '取引先を指定してください' }, { status: 400 })
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: '注文商品が指定されていません' }, { status: 400 })
    }

    // 自由記入行バリデーション
    const customItems = items.filter((i: { isCustom?: boolean }) => i.isCustom)
    if (customItems.length > 5) {
      return NextResponse.json({ error: '自由記入は1注文5件までです' }, { status: 400 })
    }
    for (const ci of customItems) {
      const text = (ci.customText ?? '').trim()
      if (!text) return NextResponse.json({ error: '自由記入の内容は必須です' }, { status: 400 })
      if (text.length > 100) return NextResponse.json({ error: '自由記入は100文字以内です' }, { status: 400 })
    }

    // 数量バリデーション（通常行）
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
      // 過去日は許可（Freee発行済み分を実日付で登録するため）。
      // フォーマットと未来上限（180日）のみ検証し、過去日弾きは行わない。
      if (isNaN(d.getTime()) || d > maxDate) {
        return NextResponse.json({ error: '納品希望日が無効です（未来180日以内で指定してください）' }, { status: 400 })
      }
    }
    const VALID_TIME_SLOTS = ['morning', 'afternoon', 'evening1', 'evening2', 'evening3']
    if (deliveryTimeSlot && !VALID_TIME_SLOTS.includes(deliveryTimeSlot)) {
      return NextResponse.json({ error: '配達時間帯の指定が不正です' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 取引先を解決
    let company: { id: string; company_name: string; price_rank: string; delivery_method: DeliveryMethod }

    if (companyId) {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, price_rank, delivery_method')
        .eq('id', companyId)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: '取引先が見つかりません' }, { status: 400 })
      }
      company = data
    } else {
      // 新規取引先: 同名重複確認
      const trimmedName = (newCompanyName as string).trim()
      const { data: existing } = await supabase
        .from('companies')
        .select('id, company_name, price_rank, delivery_method')
        .eq('company_name', trimmedName)
        .maybeSingle()

      if (existing) {
        company = existing
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('companies')
          .insert({
            company_name: trimmedName,
            price_rank: 'standard',
            approval_status: 'approved',
            is_active: true,
            has_separate_billing: false,
          })
          .select('id, company_name, price_rank, delivery_method')
          .single()
        if (insertError || !inserted) {
          console.error('companies INSERT error:', insertError)
          return NextResponse.json({ error: '取引先の作成に失敗しました' }, { status: 500 })
        }
        company = inserted
      }
    }

    // 商品取得
    const normalItems = items.filter((i: { isCustom?: boolean }) => !i.isCustom)
    const productIds = normalItems.map((i: { productId: string }) => i.productId)

    let products: Array<{
      id: string; name: string; unit: string; cool_type: number
      category: string
      step_qty: number; min_order_qty: number; stock_status: string
      ship_start_date: string | null
      product_prices: Array<{ price_rank: string; price_per_unit: number }>
    }> = []

    if (productIds.length > 0) {
      const { data: fetched, error: productsError } = await supabase
        .from('products')
        .select('*, product_prices (price_rank, price_per_unit)')
        .in('id', productIds)
        .eq('is_active', true)
      if (productsError || !fetched) {
        return NextResponse.json({ error: '商品情報の取得に失敗しました' }, { status: 500 })
      }
      products = fetched as typeof products
    }

    // パス0: 取引先別の個別単価・送料特例（company_overrides）を取得
    let overrides: CompanyOverride[] = []
    {
      const { data: ovData, error: ovError } = await supabase
        .from('company_overrides')
        .select('*')
        .eq('company_id', company.id)
      if (ovError) {
        console.error('company_overrides 取得エラー:', ovError)
      } else if (ovData) {
        overrides = ovData as CompanyOverride[]
      }
    }

    // パス1: ケース数を事前集計（商品単位・カテゴリ単位）
    const productCategory = new Map<string, string>()
    for (const p of products) {
      if (p.category) productCategory.set(p.id, p.category)
    }
    const caseAgg = aggregateCases(
      normalItems.map((i: { productId: string; quantity: number }) => ({
        productId: i.productId,
        quantity: i.quantity,
        isCustom: false,
      })),
      productCategory
    )

    // パス2: 有効な override を確定
    const activeOverrides = getActiveOverrides(overrides, caseAgg)
    // パス4（送料）用: 固定送料を決定
    const activeFixedShippingFee = resolveFixedShippingFee(activeOverrides)

    // 価格・送料計算
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
        return NextResponse.json({ error: `商品が見つかりません: ${item.productId}` }, { status: 400 })
      }

      let unitPrice = 0
      let tierLabel: string | null = null
      let tierQuantity: number | null = null
      let pricingTierId: string | null = null

      if (item.pricingTierId) {
        const { data: tier } = await supabase
          .from('product_pricing_tiers')
          .select('id, tier_label, quantity, unit_price')
          .eq('id', item.pricingTierId)
          .eq('product_id', item.productId)
          .eq('is_active', true)
          .single()
        if (!tier) {
          return NextResponse.json({ error: `価格段階が見つかりません: ${product.name}` }, { status: 400 })
        }
        unitPrice = tier.unit_price
        tierLabel = tier.tier_label
        tierQuantity = tier.quantity
        pricingTierId = tier.id
      } else {
        const priceEntry = Array.isArray(product.product_prices)
          ? (product.product_prices.find((pp: { price_rank: string }) => pp.price_rank === company.price_rank)
             ?? product.product_prices.find((pp: { price_rank: string }) => pp.price_rank === 'standard'))
          : null
        unitPrice = priceEntry?.price_per_unit || 0
      }

      // パス3: 個別単価オーバーライドの適用（通常価格確定の直後）
      const overridePrice = resolveUnitPriceOverride(activeOverrides, {
        productId: product.id,
        pricingTierId: pricingTierId,
        category: product.category ?? null,
      })
      if (overridePrice != null) {
        unitPrice = overridePrice
      }

      if (product.stock_status === 'cross') {
        return NextResponse.json({ error: `${product.name} は現在在庫がありません` }, { status: 400 })
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

    // パス4: 送料計算（発送方法 ＋ 固定送料override）
    const shippingBreakdown = calculateShipping(cartItemsForShipping, {
      deliveryMethod: company.delivery_method ?? 'yamato',
      fixedShippingFee: activeFixedShippingFee,
    })
    totalAmount += shippingBreakdown.total

    // order_number 採番
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

    // 注文作成
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
      return NextResponse.json({ error: '注文の作成に失敗しました' }, { status: 500 })
    }

    // 注文明細作成
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsData.map((item) => ({ ...item, order_id: order.id })))

    if (itemsError) {
      console.error('注文明細作成エラー:', itemsError)
      await supabase.from('orders').delete().eq('id', order.id)
      return NextResponse.json({ error: '注文明細の作成に失敗しました' }, { status: 500 })
    }

    // 送料明細保存
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
      }
    }

    // LINE通知（管理者側のみ）
    const adminLineId = process.env.LINE_ADMIN_USER_ID
    if (adminLineId) {
      const hasCustom = orderItemsData.some((i) => i.is_custom)
      const productSummary = orderItemsData
        .map((item) => {
          if (item.is_custom) return `・【自由記入】${item.product_name}（金額未確定）`
          return `・${formatOrderItemLabel({ product_name: item.product_name, quantity: item.quantity, tier_quantity: item.tier_quantity, unit: item.unit })}`
        })
        .join('\n')

      try {
        await notifyOrderCreated('', orderNumber, totalAmount, company.company_name, productSummary, adminLineId, hasCustom)
      } catch (err) {
        console.error('LINE通知エラー:', err)
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
    console.error('admin orders POST エラー:', error)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
