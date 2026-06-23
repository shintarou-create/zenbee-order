import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

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

  const { prices, stockQty, ...productFields } = body as { prices?: unknown; stockQty?: unknown; [key: string]: unknown }

  if (!productFields.name || typeof productFields.name !== 'string' || !productFields.name.trim()) {
    return NextResponse.json({ error: '商品名は必須です' }, { status: 400 })
  }
  if (productFields.description !== null && productFields.description !== undefined &&
      typeof productFields.description === 'string' && productFields.description.length > 1000) {
    return NextResponse.json({ error: '説明は1000文字以内で入力してください' }, { status: 400 })
  }

  const supabase = createServiceClient()

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

  return NextResponse.json({ data: newProduct }, { status: 201 })
}
