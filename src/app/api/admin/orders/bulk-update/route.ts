import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { validateOrderUpdate } from '@/lib/order-update'

// 複数の注文に同じ更新をかける（受注一覧の「確認済み」「完了」「出荷済み」、一括印刷の「印刷済み」）。
// 受け付けるのは src/lib/order-update.ts の9列のみ。body は { orderIds: string[], fields: {...} }。
// 認証: middleware が /api/admin/* を保護済み＋ verifyAdmin で再確認

const MAX_IDS = 1000
const ID_CHUNK_SIZE = 200 // .in() の URL 長対策

export async function PATCH(req: NextRequest) {
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const otherKeys = Object.keys(body ?? {}).filter((k) => k !== 'orderIds' && k !== 'fields')
    if (otherKeys.length > 0) {
      return NextResponse.json({ error: `指定できない項目があります: ${otherKeys.join(', ')}` }, { status: 400 })
    }

    const { orderIds } = body as { orderIds?: unknown }
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: '更新する注文IDを1件以上指定してください' }, { status: 400 })
    }
    if (!orderIds.every((id) => typeof id === 'string' && id)) {
      return NextResponse.json({ error: '注文IDの形式が不正です' }, { status: 400 })
    }
    const ids = Array.from(new Set(orderIds as string[]))
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: `一度に更新できるのは${MAX_IDS}件までです` }, { status: 400 })
    }

    const result = validateOrderUpdate(body.fields)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    if (Object.keys(result.data).length === 0) {
      return NextResponse.json({ error: '変更する項目を指定してください' }, { status: 400 })
    }

    const supabase = createServiceClient()
    let updated = 0
    for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + ID_CHUNK_SIZE)
      const { data, error } = await supabase.from('orders').update(result.data).in('id', chunk).select('id')
      if (error) throw error
      updated += data?.length ?? 0
    }
    return NextResponse.json({ data: { updated } })
  } catch (err) {
    console.error('orders bulk-update PATCH error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
