import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchInChunksByIds } from '@/lib/supabase-batch'

// 過去180日の注文実績から、商品ごとの「登場注文件数（distinct order_id 数）」を返す。
// 認証は middleware（/api/admin/*）で実施済み。
// レスポンス: { data: { [productId]: 件数 } }（実績0でも { data: {} }）

const ID_CHUNK_SIZE = 200

// 毎回DBを参照して最新の実績を返す（静的キャッシュ化を防ぐ）
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createServiceClient()
    const sinceIso = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()

    // 過去180日・cancelled 以外の注文ID（バッチ取得）
    const orders = await fetchAllRows<{ id: string }>((from, to) =>
      supabase
        .from('orders')
        .select('id')
        .neq('status', 'cancelled')
        .gte('created_at', sinceIso)
        .range(from, to)
    )
    const orderIds = orders.map((o) => o.id)
    if (orderIds.length === 0) {
      return NextResponse.json({ data: {} })
    }

    // 対象注文の order_items（order_id + product_id）を 200件ずつのチャンクで全件取得
    type ItemRow = { order_id: string; product_id: string | null }
    const items = await fetchInChunksByIds<ItemRow>(orderIds, ID_CHUNK_SIZE, (chunkIds, from, to) =>
      supabase.from('order_items').select('order_id, product_id').in('order_id', chunkIds).range(from, to)
    )

    // product_id ごとに distinct order_id 数を数える
    const byProduct = new Map<string, Set<string>>()
    for (const it of items) {
      if (!it.product_id) continue
      let set = byProduct.get(it.product_id)
      if (!set) {
        set = new Set<string>()
        byProduct.set(it.product_id, set)
      }
      set.add(it.order_id)
    }

    const data: Record<string, number> = {}
    byProduct.forEach((orderSet, productId) => {
      data[productId] = orderSet.size
    })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('usage-stats GET error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
