import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// メモログ削除（誤記入の訂正用。編集はせず削除して書き直す運用）
// 認証: middleware が /api/admin/* を保護済み
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; logId: string } }
) {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from('company_memo_logs')
      .delete()
      .eq('id', params.logId)
      .eq('company_id', params.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('memo-logs DELETE error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
