import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { validateCompanyProfile } from '@/lib/company-profile'

// 取引先の事前登録（顧客管理の「顧客を事前登録」）。
// 受け付けるのは基本情報の列だけ（src/lib/company-profile.ts）。業態は作成後に
// PATCH /api/admin/companies/[id] の business_type_id で設定する（変更履歴を残すため）。
// 認証: middleware が /api/admin/* を保護済み＋ verifyAdmin で再確認
export async function POST(req: NextRequest) {
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { profile?: unknown }
    const result = validateCompanyProfile(body.profile, { requireName: true })
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase.from('companies').insert(result.data).select('id').single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '同じ店名の取引先が既に登録されています' }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('companies POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
