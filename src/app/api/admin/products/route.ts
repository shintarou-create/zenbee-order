import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { validateBusinessTypeIds, syncProductBusinessTypes } from '@/lib/business-type-products'

export const dynamic = 'force-dynamic'

// 管理画面用の商品一覧（非表示の商品も含む全件）。価格系テーブルは公開キーで読めないため、
// 管理画面の商品・価格・価格段階の取得はこのAPIを経由する。
// 認証: middleware が /api/admin/* を保護済み
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      inventory (id, product_id, available_qty, reserved_qty, updated_at),
      product_prices (id, product_id, price_rank, price_per_unit),
      pricing_tiers:product_pricing_tiers (id, product_id, tier_label, quantity, unit_price, display_order, is_active, visible_company_id),
      business_type_products (business_type_id)
    `)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('admin products GET error:', error)
    return NextResponse.json({ error: '商品の取得に失敗しました' }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { prices, stockQty, businessTypeIds, ...productFields } = body as {
    prices?: unknown
    stockQty?: unknown
    businessTypeIds?: unknown
    [key: string]: unknown
  }

  if (!productFields.name || typeof productFields.name !== 'string' || !productFields.name.trim()) {
    return NextResponse.json({ error: '商品名は必須です' }, { status: 400 })
  }
  if (productFields.description !== null && productFields.description !== undefined &&
      typeof productFields.description === 'string' && productFields.description.length > 1000) {
    return NextResponse.json({ error: '説明は1000文字以内で入力してください' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 見せる業態（必須・1つ以上）。商品を作る前に検証する
  const btResult = await validateBusinessTypeIds(supabase, businessTypeIds)
  if ('error' in btResult) {
    return NextResponse.json({ error: btResult.error }, { status: 400 })
  }

  // 商品を作成
  const { data: newProduct, error: insertError } = await supabase
    .from('products')
    .insert(productFields)
    .select()
    .single()

  if (insertError || !newProduct) {
    console.error('[products POST] insert error:', insertError)
    return NextResponse.json({ error: '商品の作成に失敗しました' }, { status: 500 })
  }

  // 価格を挿入
  if (prices && typeof prices === 'object' && !Array.isArray(prices)) {
    const pricesObj = prices as Record<string, unknown>
    const priceRows = (['standard', 'premium', 'vip'] as const)
      .filter((rank) => rank in pricesObj && typeof pricesObj[rank] === 'number')
      .map((rank) => ({
        product_id: newProduct.id,
        price_rank: rank,
        price_per_unit: pricesObj[rank] as number,
      }))

    if (priceRows.length > 0) {
      const { error: pricesError } = await supabase.from('product_prices').insert(priceRows)
      if (pricesError) {
        console.error('[products POST] prices insert error:', pricesError)
        return NextResponse.json({ error: '価格の保存に失敗しました' }, { status: 500 })
      }
    }
  }

  // 在庫を初期化
  const { error: inventoryError } = await supabase.from('inventory').insert({
    product_id: newProduct.id,
    available_qty: typeof stockQty === 'number' && stockQty >= 0 ? stockQty : 0,
    reserved_qty: 0,
  })
  if (inventoryError) {
    console.error('[products POST] inventory insert error:', inventoryError)
    return NextResponse.json({ error: '在庫の初期化に失敗しました' }, { status: 500 })
  }

  // 見せる業態の紐づけ（登録画面で選んだ業態のみ）
  const linkError = await syncProductBusinessTypes(supabase, newProduct.id, btResult.ids)
  if (linkError) {
    console.error('[products POST] business_type_products error:', linkError)
    return NextResponse.json(
      { error: `商品は作成しましたが、${linkError}。業態の設定画面から設定してください` },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: newProduct }, { status: 201 })
}
