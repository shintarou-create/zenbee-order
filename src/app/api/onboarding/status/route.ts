import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const queryUserId = searchParams.get('line_user_id')
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null

    let userId: string

    if (token) {
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!profileRes.ok) {
        return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 })
      }
      const profile = (await profileRes.json()) as { userId: string }
      userId = profile.userId
    } else if (queryUserId) {
      // 開発環境のみ line_user_id クエリパラメータを受け付ける
      if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Bearer トークンが必要です' }, { status: 401 })
      }
      userId = queryUserId
    } else {
      return NextResponse.json({ error: 'Bearer トークンまたは line_user_id が必要です' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: lineUser } = await supabase
      .from('line_users')
      .select('id, is_active, company:companies!left(id, approval_status, is_active)')
      .eq('line_user_id', userId)
      .maybeSingle()

    if (!lineUser) {
      return NextResponse.json({ linked: false })
    }

    const company = lineUser.company as unknown as { approval_status: string; is_active: boolean } | null
    return NextResponse.json({
      linked: true,
      approval_status: company?.approval_status ?? 'approved',
    })
  } catch (err) {
    console.error('onboarding/status GET error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
