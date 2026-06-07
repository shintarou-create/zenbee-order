import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const orderId = params.id

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || !Array.isArray((body as { lines?: unknown }).lines)) {
    return NextResponse.json({ error: 'lines は配列である必要があります' }, { status: 400 })
  }

  const lines = (body as { lines: unknown[] }).lines

  for (const line of lines) {
    if (!line || typeof line !== 'object') {
      return NextResponse.json({ error: '送料行のフォーマットが不正です' }, { status: 400 })
    }
    const l = line as { label?: unknown; cost?: unknown }
    if (typeof l.label !== 'string' || l.label.trim() === '') {
      return NextResponse.json({ error: 'ラベルは空にできません' }, { status: 400 })
    }
    if (
      typeof l.cost !== 'number' ||
      !Number.isInteger(l.cost) ||
      l.cost < 0 ||
      l.cost > 1_000_000
    ) {
      return NextResponse.json(
        { error: '金額は0以上1,000,000以下の整数で指定してください' },
        { status: 400 }
      )
    }
  }

  const typedLines = lines as { label: string; cost: number }[]
  const supabase = createServiceClient()

  // 1. この注文の送料行を全削除
  const { error: deleteError } = await supabase
    .from('order_shipping')
    .delete()
    .eq('order_id', orderId)

  if (deleteError) {
    console.error('[shipping PATCH] delete error:', deleteError)
    return NextResponse.json({ error: '送料の削除に失敗しました' }, { status: 500 })
  }

  // 2. 新しい送料行を全挿入（quantity=1, unit_cost=cost で保存）
  if (typedLines.length > 0) {
    const { error: insertError } = await supabase.from('order_shipping').insert(
      typedLines.map((line, idx) => ({
        order_id: orderId,
        label: line.label.trim(),
        quantity: 1,
        unit_cost: line.cost,
        cost: line.cost,
        sort_order: idx,
      }))
    )

    if (insertError) {
      console.error('[shipping PATCH] insert error:', insertError)
      return NextResponse.json({ error: '送料の保存に失敗しました' }, { status: 500 })
    }
  }

  // 3. total_amount を再計算（商品小計の合計 + 今回の送料合計）
  const { data: itemsData, error: itemsError } = await supabase
    .from('order_items')
    .select('subtotal')
    .eq('order_id', orderId)

  if (itemsError) {
    console.error('[shipping PATCH] order_items fetch error:', itemsError)
    return NextResponse.json({ error: '合計の再計算に失敗しました' }, { status: 500 })
  }

  const itemsTotal = (itemsData ?? []).reduce((sum, item) => sum + (item.subtotal ?? 0), 0)
  const shippingTotal = typedLines.reduce((sum, line) => sum + line.cost, 0)
  const newTotal = itemsTotal + shippingTotal

  const { error: updateError } = await supabase
    .from('orders')
    .update({ total_amount: newTotal })
    .eq('id', orderId)

  if (updateError) {
    console.error('[shipping PATCH] total_amount update error:', updateError)
    return NextResponse.json({ error: '合計金額の更新に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ total_amount: newTotal })
}
