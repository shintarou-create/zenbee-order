import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      liff_access_token?: string
      registration_code?: string
    }
    const { liff_access_token, registration_code } = body

    if (!registration_code?.trim()) {
      return NextResponse.json({ error: '登録コードが必要です' }, { status: 400 })
    }

    // LIFF アクセストークンを検証してユーザーIDを取得（orders/route.ts と同手法）
    let lineUserId: string
    let displayName: string | null = null

    if (liff_access_token) {
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${liff_access_token}` },
      })
      if (!profileRes.ok) {
        return NextResponse.json(
          { error: '認証に失敗しました。再度ログインしてください。' },
          { status: 401 }
        )
      }
      const profile = (await profileRes.json()) as { userId: string; displayName?: string }
      lineUserId = profile.userId
      displayName = profile.displayName ?? null
    } else {
      if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: '認証トークンが必要です' }, { status: 401 })
      }
      lineUserId = 'dev_user_001'
      displayName = '開発テスト顧客'
    }

    const supabase = createServiceClient()

    // 既に紐付け済みかチェック
    const { data: existingLink } = await supabase
      .from('line_users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()

    if (existingLink) {
      return NextResponse.json(
        { error: 'このLINEアカウントは既に登録されています' },
        { status: 409 }
      )
    }

    // 登録コードで会社を検索
    const { data: company } = await supabase
      .from('companies')
      .select('id, company_name, approval_status, is_active')
      .eq('registration_code', registration_code.trim().toLowerCase())
      .maybeSingle()

    if (!company) {
      return NextResponse.json(
        { error: 'コードが正しくありません。ご確認の上、再度お試しください。' },
        { status: 404 }
      )
    }

    if (!company.is_active) {
      return NextResponse.json(
        { error: 'このコードは現在使用できません。善兵衛農園にお問い合わせください。' },
        { status: 403 }
      )
    }

    // line_users に紐付けを INSERT
    const { error: insertError } = await supabase
      .from('line_users')
      .insert({
        company_id: company.id,
        line_user_id: lineUserId,
        display_name: displayName,
        is_active: true,
      })

    if (insertError) throw insertError

    return NextResponse.json({
      success: true,
      company_name: company.company_name,
      approval_status: company.approval_status ?? 'approved',
    })
  } catch (err) {
    console.error('onboarding/link-by-code POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
