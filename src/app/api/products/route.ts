import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchCatalog } from '@/lib/product-catalog'

export const dynamic = 'force-dynamic'

// 取引先（LIFF）向けの商品カタログ。LINEアクセストークンから取引先を特定し、
// 承認済み・有効・業態設定済みの取引先にだけ、その業態の商品を、取引先の価格ランク・専用tierで返す。
// 価格系テーブルは公開キーで読めないため、発注画面の商品取得はこのAPIを経由する。
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    let lineUserId: string
    if (token) {
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!profileRes.ok) {
        return NextResponse.json({ error: '認証に失敗しました。再度ログインしてください。' }, { status: 401 })
      }
      const profile = (await profileRes.json()) as { userId: string }
      lineUserId = profile.userId
    } else {
      // 開発環境向けフォールバック（注文APIと同じ）
      if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: '認証トークンが必要です' }, { status: 401 })
      }
      lineUserId = 'dev_user_001'
    }

    const supabase = createServiceClient()
    const { data: lineUser } = await supabase
      .from('line_users')
      .select('company:companies (id, price_rank, approval_status, is_active, business_type_id)')
      .eq('line_user_id', lineUserId)
      .eq('is_active', true)
      .maybeSingle()

    const company = lineUser?.company as unknown as
      | {
          id: string
          price_rank: 'standard' | 'premium' | 'vip'
          approval_status: string | null
          is_active: boolean
          business_type_id: string | null
        }
      | null
      | undefined

    if (!company || !company.is_active) {
      return NextResponse.json({ error: 'ご利用いただけません' }, { status: 403 })
    }
    if (company.approval_status && company.approval_status !== 'approved') {
      return NextResponse.json({ error: '承認待ちです' }, { status: 403 })
    }
    // 業態が未設定の取引先には商品・価格を一切返さない
    if (!company.business_type_id) {
      return NextResponse.json({ error: 'ご利用の準備中です' }, { status: 403 })
    }

    const products = await fetchCatalog(supabase, {
      priceRank: company.price_rank || 'standard',
      companyId: company.id,
      businessTypeId: company.business_type_id,
    })
    return NextResponse.json({ data: products })
  } catch (err) {
    console.error('products GET error:', err)
    return NextResponse.json({ error: '商品情報の取得に失敗しました' }, { status: 500 })
  }
}
