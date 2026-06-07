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

  const { orderIds } = body as { orderIds?: unknown }

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: '削除する注文IDを1件以上指定してください' }, { status: 400 })
  }

  if (!orderIds.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: '注文IDの形式が不正です' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 1. invoice_items の RESTRICT FK を先に解除
  const { error: invoiceItemsError } = await supabase
    .from('invoice_items')
    .delete()
    .in('order_id', orderIds)

  if (invoiceItemsError) {
    console.error('[bulk-delete] invoice_items delete error:', invoiceItemsError)
    return NextResponse.json({ error: '請求明細の削除に失敗しました' }, { status: 500 })
  }

  // 2. orders を削除（order_items・order_shipping は CASCADE で自動削除）
  const { data: deletedOrders, error: ordersError } = await supabase
    .from('orders')
    .delete()
    .in('id', orderIds)
    .select('id')

  if (ordersError) {
    console.error('[bulk-delete] orders delete error:', ordersError)
    return NextResponse.json({ error: '注文の削除に失敗しました' }, { status: 500 })
  }

  const deletedCount = (deletedOrders ?? []).length
  console.log(`[bulk-delete] deleted ${deletedCount} orders`)

  return NextResponse.json({ deletedCount })
}
