import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 請求書ステータスの一括更新。認証は middleware（/api/admin/*）で実施済み。
// サーバー側でも対象条件を再検証し、条件を満たす行だけ更新する。
// paid_at 規則:
//   - status→'paid': paid_at が null なら now() をセット（既に値があれば維持）
//   - status→'sent'（=paid以外）: paid_at を null に戻す

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '一括更新に失敗: リクエストボディが不正です' }, { status: 400 })
  }

  const { ids, status } = (body ?? {}) as { ids?: unknown; status?: unknown }

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: '一括更新に失敗: ids は1件以上の文字列配列で指定してください' }, { status: 400 })
  }
  if (status !== 'sent' && status !== 'paid') {
    return NextResponse.json({ error: "一括更新に失敗: status は 'sent' または 'paid' のみ許可されます" }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()

    // 対象行の現在値を取得
    const { data: rows, error: fetchError } = await supabase
      .from('invoices')
      .select('id, status, paid_at')
      .in('id', ids)

    if (fetchError) {
      return NextResponse.json({ error: `一括更新に失敗: ${fetchError.message}` }, { status: 500 })
    }

    type Row = { id: string; status: string; paid_at: string | null }
    const found = (rows ?? []) as Row[]
    const foundIds = new Set(found.map((r) => r.id))

    const skipped: { id: string; reason: string }[] = []
    // 取得できなかった id（存在しない）
    for (const id of ids as string[]) {
      if (!foundIds.has(id)) skipped.push({ id, reason: '請求書が見つかりません' })
    }

    // 対象条件の再検証
    const targets: Row[] = []
    for (const r of found) {
      if (status === 'sent') {
        // 送信済み: draft のみ対象
        if (r.status === 'draft') targets.push(r)
        else skipped.push({ id: r.id, reason: r.status === 'sent' ? '既に送信済み' : `対象外（${r.status}）` })
      } else {
        // 入金済み: paid 以外が対象
        if (r.status !== 'paid') targets.push(r)
        else skipped.push({ id: r.id, reason: '既に入金済み' })
      }
    }

    const nowIso = new Date().toISOString()
    const updated: string[] = []

    if (status === 'sent') {
      // 送信済み: paid_at は null に戻す
      const targetIds = targets.map((t) => t.id)
      if (targetIds.length > 0) {
        const { error } = await supabase
          .from('invoices')
          .update({ status: 'sent', paid_at: null })
          .in('id', targetIds)
        if (error) return NextResponse.json({ error: `一括更新に失敗: ${error.message}` }, { status: 500 })
        updated.push(...targetIds)
      }
    } else {
      // 入金済み: paid_at が null の行のみ now() をセット、値がある行は維持
      const needPaidAt = targets.filter((t) => !t.paid_at).map((t) => t.id)
      const keepPaidAt = targets.filter((t) => t.paid_at).map((t) => t.id)
      if (needPaidAt.length > 0) {
        const { error } = await supabase
          .from('invoices')
          .update({ status: 'paid', paid_at: nowIso })
          .in('id', needPaidAt)
        if (error) return NextResponse.json({ error: `一括更新に失敗: ${error.message}` }, { status: 500 })
        updated.push(...needPaidAt)
      }
      if (keepPaidAt.length > 0) {
        const { error } = await supabase
          .from('invoices')
          .update({ status: 'paid' })
          .in('id', keepPaidAt)
        if (error) return NextResponse.json({ error: `一括更新に失敗: ${error.message}` }, { status: 500 })
        updated.push(...keepPaidAt)
      }
    }

    return NextResponse.json({ updated, skipped })
  } catch (err) {
    console.error('[bulk-status] 予期しないエラー:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `一括更新に失敗: ${msg}` }, { status: 500 })
  }
}
