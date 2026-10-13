import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin-auth'

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

// 請求書の送信ステータス・支払済み日時・支払期限の更新（請求管理のステータスプルダウン・支払期限の入力）。
// body は { fields: { status?, paid_at?, due_date? } }。受け付けるのはこの3列のみ
// （金額・請求先・請求番号などは不可）。paid_at の決め方は従来どおり画面側の規則に従う。
// 認証: middleware が /api/admin/* を保護済み＋ verifyAdmin で再確認
const VALID_INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const
const INVOICE_UPDATE_FIELDS = ['status', 'paid_at', 'due_date'] as const

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const otherKeys = Object.keys(body ?? {}).filter((k) => k !== 'fields')
    if (otherKeys.length > 0) {
      return NextResponse.json({ error: `指定できない項目があります: ${otherKeys.join(', ')}` }, { status: 400 })
    }
    const fields = body.fields
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return NextResponse.json({ error: '更新内容の形式が不正です' }, { status: 400 })
    }
    const input = fields as Record<string, unknown>
    const unknownKeys = Object.keys(input).filter((k) => !(INVOICE_UPDATE_FIELDS as readonly string[]).includes(k))
    if (unknownKeys.length > 0) {
      return NextResponse.json(
        { error: `この操作では変更できない項目が含まれています: ${unknownKeys.join(', ')}` },
        { status: 400 }
      )
    }

    const updates: { status?: string; paid_at?: string | null; due_date?: string | null } = {}
    if ('status' in input) {
      if (typeof input.status !== 'string' || !(VALID_INVOICE_STATUSES as readonly string[]).includes(input.status)) {
        return NextResponse.json({ error: `status は ${VALID_INVOICE_STATUSES.join(' / ')} のいずれかです` }, { status: 400 })
      }
      updates.status = input.status
    }
    if ('paid_at' in input) {
      const v = input.paid_at
      if (v !== null && (typeof v !== 'string' || isNaN(new Date(v).getTime()))) {
        return NextResponse.json({ error: 'paid_at は日時（ISO形式）または null で指定してください' }, { status: 400 })
      }
      updates.paid_at = v as string | null
    }
    if ('due_date' in input) {
      const v = input.due_date
      if (v !== null && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v).getTime()))) {
        return NextResponse.json({ error: 'due_date は YYYY-MM-DD または null で指定してください' }, { status: 400 })
      }
      updates.due_date = v as string | null
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '変更する項目を指定してください' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', params.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: '請求書が見つかりません' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('invoice PATCH error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
