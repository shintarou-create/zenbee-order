import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { validateOrderUpdate } from '@/lib/order-update'

// 注文1件の状態・備考などの更新（注文詳細の「保存」「詳細確認済み」、受注一覧の各種解除）。
// 受け付けるのは src/lib/order-update.ts の9列のみ。body は { fields: {...} }。
// 認証: middleware が /api/admin/* を保護済み＋ verifyAdmin で再確認
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const otherKeys = Object.keys(body ?? {}).filter((k) => k !== 'fields')
    if (otherKeys.length > 0) {
      return NextResponse.json({ error: `指定できない項目があります: ${otherKeys.join(', ')}` }, { status: 400 })
    }

    const result = validateOrderUpdate(body.fields)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    if (Object.keys(result.data).length === 0) {
      return NextResponse.json({ error: '変更する項目を指定してください' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('orders')
      .update(result.data)
      .eq('id', params.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: '注文が見つかりません' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('orders PATCH error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
