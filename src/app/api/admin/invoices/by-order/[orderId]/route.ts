import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin-auth'

// 指定した注文が載っている請求書（あれば）を1件返す。注文詳細の「代引きへの変更可否」判定に使う。
// 認証: middleware が /api/admin/* を保護済み＋ verifyAdmin で再確認
export async function GET(req: NextRequest, { params }: { params: { orderId: string } }) {
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('invoice_items')
    .select('invoice:invoices (id, invoice_number)')
    .eq('order_id', params.orderId)
    .limit(1)
  if (error) {
    console.error('invoices/by-order GET error:', error)
    return NextResponse.json({ error: '請求書の確認に失敗しました' }, { status: 500 })
  }
  // invoice_items → invoices は多対1なので、埋め込みは1件のオブジェクト（型推論は配列になるため明示する）
  const row = data?.[0] as unknown as { invoice?: { id: string; invoice_number: string } | null } | undefined
  return NextResponse.json({ invoice: row?.invoice ?? null })
}
