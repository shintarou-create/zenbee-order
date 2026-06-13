import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushMessage } from '@/lib/line-messaging'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9]{10,11}$/
const POSTAL_RE = /^[0-9]{7}$/

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      liff_access_token?: string
      company_name?: string
      postal_code?: string
      prefecture?: string
      city?: string
      address?: string
      building?: string
      phone?: string
      email?: string
      representative_name?: string
      notes?: string
    }

    // LIFF アクセストークンを検証してユーザーIDを取得
    let lineUserId: string
    let displayName: string | null = null

    if (body.liff_access_token) {
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${body.liff_access_token}` },
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

    // サーバ側バリデーション（必須・形式・文字数）
    const companyName = body.company_name?.trim() ?? ''
    const postalCode = body.postal_code?.replace(/[^0-9]/g, '') ?? ''
    const prefecture = body.prefecture?.trim() ?? ''
    const city = body.city?.trim() ?? ''
    const address = body.address?.trim() ?? ''
    const phone = body.phone?.replace(/[^0-9]/g, '') ?? ''
    const email = body.email?.trim() ?? ''
    const building = body.building?.trim() || null
    const representativeName = body.representative_name?.trim() || null
    const notes = body.notes?.trim() || null

    if (!companyName) return NextResponse.json({ error: '店舗名は必須です' }, { status: 400 })
    if (companyName.length > 200) return NextResponse.json({ error: '店舗名は200文字以内です' }, { status: 400 })
    if (!postalCode || !POSTAL_RE.test(postalCode)) return NextResponse.json({ error: '郵便番号は7桁の数字です' }, { status: 400 })
    if (!prefecture) return NextResponse.json({ error: '都道府県は必須です' }, { status: 400 })
    if (!city) return NextResponse.json({ error: '市区町村は必須です' }, { status: 400 })
    if (!address) return NextResponse.json({ error: '住所は必須です' }, { status: 400 })
    if (!phone || !PHONE_RE.test(phone)) return NextResponse.json({ error: '電話番号は10〜11桁の数字です' }, { status: 400 })
    if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'メールアドレスの形式が正しくありません' }, { status: 400 })
    if (email.length > 254) return NextResponse.json({ error: 'メールアドレスが長すぎます' }, { status: 400 })
    if (notes && notes.length > 500) return NextResponse.json({ error: 'メモは500文字以内です' }, { status: 400 })

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

    // companies に INSERT（price_rank='premium'、approval_status='pending'）
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        company_name: companyName,
        postal_code: postalCode,
        prefecture,
        city,
        address,
        building,
        phone,
        email,
        representative_name: representativeName,
        notes,
        price_rank: 'premium',
        approval_status: 'pending',
        is_active: true,
        has_separate_billing: false,
      })
      .select('id, company_name')
      .single()

    if (companyError || !company) {
      console.error('companies INSERT error:', companyError)
      return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 })
    }

    // line_users に即時 INSERT（発注可否は approval_status で制御）
    const { error: lineUserError } = await supabase
      .from('line_users')
      .insert({
        company_id: company.id,
        line_user_id: lineUserId,
        display_name: displayName,
        is_active: true,
      })

    if (lineUserError) {
      // ロールバック: company を削除
      await supabase.from('companies').delete().eq('id', company.id)
      console.error('line_users INSERT error:', lineUserError)
      return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 })
    }

    // 管理者 LINE Push 通知（Vercel の async 凍結対策として必ず await）
    const adminLineId = process.env.LINE_ADMIN_USER_ID
    if (adminLineId) {
      await sendPushMessage(
        adminLineId,
        `【新規登録申請】\nお店: ${company.company_name}\nLINE: ${displayName ?? '不明'}（${lineUserId}）\n\n管理画面で承認をお願いします。`
      ).catch((err) => {
        console.error('LINE Push 通知エラー（登録申請）:', err)
      })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('onboarding/register POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
