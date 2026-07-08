import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminIdentity } from '@/lib/admin-auth'

const MAX_BODY_LENGTH = 500

// 取引先メモログ一覧（created_at 降順・全件）
// 認証: middleware が /api/admin/* を保護済み
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('company_memo_logs')
      .select('id, company_id, author_line_user_id, author_name, body, created_at')
      .eq('company_id', params.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('memo-logs GET error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

// メモログ追加。author はサーバー側で認証済み管理者から設定する（クライアントからは受け取らない）。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json().catch(() => ({}))) as { body?: unknown }
    const text = typeof body.body === 'string' ? body.body.trim() : ''

    if (!text) {
      return NextResponse.json({ error: 'メモ本文を入力してください' }, { status: 400 })
    }
    if (text.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `メモは${MAX_BODY_LENGTH}文字以内で入力してください` }, { status: 400 })
    }

    // 記入者情報はサーバー側で確定
    const admin = await getAdminIdentity(req)

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('company_memo_logs')
      .insert({
        company_id: params.id,
        author_line_user_id: admin?.lineUserId ?? null,
        author_name: admin?.name ?? '',
        body: text,
      })
      .select('id, company_id, author_line_user_id, author_name, body, created_at')
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('memo-logs POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
