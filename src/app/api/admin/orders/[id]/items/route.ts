import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin-auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // 1. verifyAdmin
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  const orderId = params.id

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || !Array.isArray((body as { items?: unknown }).items)) {
    return NextResponse.json({ error: 'items は配列である必要があります' }, { status: 400 })
  }

  const items = (body as { items: unknown[] }).items

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return NextResponse.json({ error: '明細行のフォーマットが不正です' }, { status: 400 })
    }
    const i = item as { product_id?: unknown; quantity?: unknown }
    if (typeof i.product_id !== 'string' || !i.product_id) {
      return NextResponse.json({ error: 'product_id が不正です' }, { status: 400 })
    }
    if (!Number.isInteger(i.quantity) || (i.quantity as number) < 1 || (i.quantity as number) > 9999) {
      return NextResponse.json({ error: '数量は1〜9999の整数で指定してください' }, { status: 400 })
    }
  }

  const typedItems = items as { product_id: string; pricing_tier_id?: string | null; quantity: number }[]

  const supabase = createServiceClient()

  // 2. status = 'pending' のみ編集可
  const { data: orderData } = await supabase
    .from('orders')
    .select('status, company_id')
    .eq('id', orderId)
    .single()

  if (!orderData) {
    return NextResponse.json({ error: '注文が見つかりません' }, { status: 404 })
  }
  if (orderData.status !== 'pending') {
    return NextResponse.json({ error: 'この注文は編集できません（未対応の注文のみ編集可能）' }, { status: 409 })
  }

  // 会社の price_rank を取得（tier なし商品の単価算出に使用）
  const { data: company } = await supabase
    .from('companies')
    .select('price_rank')
    .eq('id', orderData.company_id)
    .single()

  // 3. 各明細行の商品情報・価格を DB から取得して組み立て
  const orderItemsData: Array<{
    order_id: string
    product_id: string
    product_name: string
    quantity: number
    unit: string
    unit_price: number
    subtotal: number
    pricing_tier_id: string | null
    tier_label: string | null
    tier_quantity: number | null
  }> = []

  for (const item of typedItems) {
    const { data: product } = await supabase
      .from('products')
      .select('id, name, unit, product_prices(price_rank, price_per_unit)')
      .eq('id', item.product_id)
      .eq('is_active', true)
      .single()

    if (!product) {
      return NextResponse.json({ error: `商品が見つかりません: ${item.product_id}` }, { status: 400 })
    }

    let unitPrice = 0
    let tierLabel: string | null = null
    let tierQuantity: number | null = null
    let pricingTierId: string | null = null

    if (item.pricing_tier_id) {
      const { data: tier } = await supabase
        .from('product_pricing_tiers')
        .select('id, tier_label, quantity, unit_price')
        .eq('id', item.pricing_tier_id)
        .eq('product_id', item.product_id)
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
      const prices = Array.isArray(product.product_prices) ? product.product_prices : []
      const priceEntry =
        prices.find((pp: { price_rank: string }) => pp.price_rank === company?.price_rank) ??
        prices.find((pp: { price_rank: string }) => pp.price_rank === 'standard')
      unitPrice = (priceEntry as { price_per_unit?: number } | undefined)?.price_per_unit ?? 0
    }

    const subtotal = tierQuantity
      ? unitPrice * tierQuantity * item.quantity
      : unitPrice * item.quantity

    orderItemsData.push({
      order_id: orderId,
      product_id: product.id,
      product_name: product.name,
      quantity: item.quantity,
      unit: product.unit,
      unit_price: unitPrice,
      subtotal,
      pricing_tier_id: pricingTierId,
      tier_label: tierLabel,
      tier_quantity: tierQuantity,
    })
  }

  // 4. 全置き換え: 既存 order_items を削除してから INSERT
  const { error: deleteError } = await supabase
    .from('order_items')
    .delete()
    .eq('order_id', orderId)

  if (deleteError) {
    console.error('[items PATCH] delete error:', deleteError)
    return NextResponse.json({ error: '明細の削除に失敗しました' }, { status: 500 })
  }

  if (orderItemsData.length > 0) {
    const { error: insertError } = await supabase
      .from('order_items')
      .insert(orderItemsData)

    if (insertError) {
      console.error('[items PATCH] insert error:', insertError)
      return NextResponse.json({ error: '明細の保存に失敗しました' }, { status: 500 })
    }
  }

  // 5. follow-up SELECT で結果を検証（silent failure 対策）
  const { data: updatedItems, error: fetchError } = await supabase
    .from('order_items')
    .select('id, order_id, product_id, product_name, quantity, unit, unit_price, subtotal, pricing_tier_id, tier_label, tier_quantity')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (fetchError) {
    console.error('[items PATCH] fetch updated items error:', fetchError)
    return NextResponse.json({ error: '保存後の取得に失敗しました' }, { status: 500 })
  }

  // 6. total_amount を再計算（商品小計合計 + 送料合計）
  const { data: shippingData } = await supabase
    .from('order_shipping')
    .select('cost')
    .eq('order_id', orderId)

  const itemsTotal = (updatedItems ?? []).reduce((sum, i) => sum + (i.subtotal ?? 0), 0)
  const shippingTotal = (shippingData ?? []).reduce((sum, s) => sum + (s.cost ?? 0), 0)
  const newTotal = itemsTotal + shippingTotal

  const { error: updateError } = await supabase
    .from('orders')
    .update({ total_amount: newTotal })
    .eq('id', orderId)

  if (updateError) {
    console.error('[items PATCH] total_amount update error:', updateError)
    return NextResponse.json({ error: '合計金額の更新に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ order_items: updatedItems, total_amount: newTotal })
}
