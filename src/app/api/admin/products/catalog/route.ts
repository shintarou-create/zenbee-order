import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchCatalog } from '@/lib/product-catalog'

export const dynamic = 'force-dynamic'

// 管理画面プレビュー（/admin/preview）用の商品カタログ。
// priceRank='standard'・companyId未指定（会社専用tierは出さない）で返す。
// 認証: middleware が /api/admin/* を保護済み
export async function GET() {
  try {
    const supabase = createServiceClient()
    const products = await fetchCatalog(supabase, { priceRank: 'standard', companyId: null })
    return NextResponse.json({ data: products })
  } catch (err) {
    console.error('admin products catalog GET error:', err)
    return NextResponse.json({ error: '商品情報の取得に失敗しました' }, { status: 500 })
  }
}
