import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 請求書の削除。invoice_items は ON DELETE CASCADE で自動削除される。
// 紐づく注文（invoice_items.order_id）のうち status='done'（請求書発行済み扱い）のものだけ
// 'shipped'（出荷済・未請求）に戻す。既に手動で別ステータスへ変更済みの注文は対象外にする。
// 認証: middleware（/api/admin/*）が保護済み
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoiceId = params.id
    if (!invoiceId) {
      return NextResponse.json({ error: '請求書IDが指定されていません' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1. invoices を削除する前に、紐づく注文IDを取得しておく
    const { data: items, error: itemsError } = await supabase
      .from('invoice_items')
      .select('order_id')
      .eq('invoice_id', invoiceId)

    if (itemsError) {
      return NextResponse.json({ error: `請求明細の取得に失敗: ${itemsError.message}` }, { status: 500 })
    }

    const orderIds = Array.from(new Set((items ?? []).map((i) => i.order_id)))

    // 2. invoices を1行DELETE（invoice_items はCASCADEで自動削除）
    const { error: deleteError } = await supabase.from('invoices').delete().eq('id', invoiceId)

    if (deleteError) {
      return NextResponse.json({ error: `請求書の削除に失敗: ${deleteError.message}` }, { status: 500 })
    }

    // 3. 紐づく注文を「完了(done)」→「出荷済(shipped・未請求)」に戻す。
    //    status='done' の行のみ対象（既に手動で別ステータスにされている注文は巻き戻さない）。
    if (orderIds.length > 0) {
      const { error: revertError } = await supabase
        .from('orders')
        .update({ status: 'shipped' })
        .in('id', orderIds)
        .eq('status', 'done')

      if (revertError) {
        return NextResponse.json(
          { error: `請求書は削除されましたが、注文ステータスの復元に失敗しました: ${revertError.message}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('invoice DELETE error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `サーバーエラー: ${msg}` }, { status: 500 })
  }
}
