import { NextRequest, NextResponse } from 'next/server'
import { getAdminIdentity } from '@/lib/admin-auth'

// 呼び出した本人が管理者なら name と role だけを返す（他の管理者の情報は返さない）。
// 管理画面の入場判定と、顧客トップの「管理者なら /admin へ」に使う（RLS 段階3b）。
// 認証: middleware が /api/admin/* を保護済み（LIFFアクセストークン→LINE検証→admin_users照合）
//       ＋ getAdminIdentity でトークンから本人を特定し直す（クライアントが送る line_user_id は使わない）
export async function GET(req: NextRequest) {
  const admin = await getAdminIdentity(req)
  if (!admin) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }
  return NextResponse.json({ name: admin.name, role: admin.role })
}
