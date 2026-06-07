import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const ALLOWED_FIELDS = [
  'name', 'category', 'category_id', 'unit',
  'min_order_qty', 'max_order_qty', 'step_qty',
  'cool_type', 'stock_status', 'description', 'sort_order',
  'order_start_date', 'ship_start_date', 'order_end_date',
  'is_active', 'image_url',
] as const

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const productId = params.id

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { prices, ...rest } = body as { prices?: unknown; [key: string]: unknown }

  // 許可フィールドのみ抽出（未指定フィールドは更新しない部分更新）
  const updateData: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in rest) updateData[key] = rest[key]
  }

  // バリデーション（フィールドが存在する場合のみチェック）
  if ('name' in updateData && (typeof updateData.name !== 'string' || !(updateData.name as string).trim())) {
    return NextResponse.json({ error: '商品名は必須です' }, { status: 400 })
  }
  if ('description' in updateData && updateData.description !== null &&
      (typeof updateData.description !== 'string' || (updateData.description as string).length > 1000)) {
    return NextResponse.json({ error: '説明は1000文字以内で入力してください' }, { status: 400 })
  }
  if ('cool_type' in updateData && ![0, 1, 2].includes(Number(updateData.cool_type))) {
    return NextResponse.json({ error: 'cool_type は 0/1/2 のいずれかです' }, { status: 400 })
  }
  if ('stock_status' in updateData && !['circle', 'triangle', 'cross'].includes(updateData.stock_status as string)) {
    return NextResponse.json({ error: 'stock_status が不正です' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[products PATCH] SUPABASE_SERVICE_ROLE_KEY is not set')
    return NextResponse.json({ error: 'サーバー設定エラー（SERVICE_KEY未設定）' }, { status: 500 })
  }

  console.log('[products PATCH] productId:', productId, 'fields:', Object.keys(updateData))

  const supabase = createServiceClient()

  if (Object.keys(updateData).length > 0) {
    const { error: updateError } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId)

    if (updateError) {
      console.error('[products PATCH] update error:', JSON.stringify(updateError))
      return NextResponse.json({ error: `商品の更新に失敗しました: ${updateError.message}` }, { status: 500 })
    }
  }

  // 価格の upsert（prices が提供された場合のみ）
  if (prices && typeof prices === 'object' && !Array.isArray(prices)) {
    const pricesObj = prices as Record<string, unknown>
    for (const rank of ['standard', 'premium', 'vip'] as const) {
      if (!(rank in pricesObj)) continue
      const price = Number(pricesObj[rank])
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ error: `価格(${rank})は0以上の数値です` }, { status: 400 })
      }
      const { error: priceError } = await supabase
        .from('product_prices')
        .upsert(
          { product_id: productId, price_rank: rank, price_per_unit: price },
          { onConflict: 'product_id,price_rank' }
        )
      if (priceError) {
        console.error(`[products PATCH] price upsert error (${rank}):`, priceError)
        return NextResponse.json({ error: '価格の保存に失敗しました' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ message: '更新しました' })
}
