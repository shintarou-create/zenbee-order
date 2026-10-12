import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// 取引先の業態変更履歴（新しい順）。
// 認証: middleware が /api/admin/* を保護済み
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('company_business_type_logs')
      .select(`
        id, changed_by, changed_at,
        from_type:business_types!company_business_type_logs_from_business_type_id_fkey (name),
        to_type:business_types!company_business_type_logs_to_business_type_id_fkey (name)
      `)
      .eq('company_id', params.id)
      .order('changed_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('business-type-logs GET error:', err)
    return NextResponse.json({ error: '業態変更履歴の取得に失敗しました' }, { status: 500 })
  }
}
