import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin-auth'

// 請求先会社1社分の請求書を作成する（請求管理の「一括作成」「1社だけ作成」から1社ずつ呼ぶ）。
// body: { billingMonth: 'YYYY-MM', companyId: 請求先会社ID, orderIds: 対象注文ID[] }
//
// 1回の呼び出しで次の3つを行い、途中で失敗したら作った分を取り消して元に戻す（残骸を残さない）:
//   1. invoices を作成（採番・合計・消費税・支払期限はサーバーで計算）
//   2. invoice_items を作成（注文ごとに1行）
//   3. 対象注文を「完了(done)」にする
//   2 か 3 が失敗した場合は 1 の請求書を削除する（invoice_items は CASCADE で消える）。
//   2・3 はそれぞれ1文のSQLなので、失敗した文の変更は残らない。
//
// 金額・状態はクライアントの値を信用せず、注文IDから DB を読み直して検証する。
// 認証: middleware が /api/admin/* を保護済み＋ verifyAdmin で再確認

const MAX_SEQ_RETRY = 3

// 対象月の請求書一覧（請求管理の一覧表示用）。従来ブラウザが公開キーで読んでいた埋め込み形をそのまま返す。
// 認証: middleware が /api/admin/* を保護済み＋ verifyAdmin で再確認
export async function GET(req: NextRequest) {
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  const billingMonth = req.nextUrl.searchParams.get('billingMonth')
  if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
    return NextResponse.json({ error: 'billingMonth は YYYY-MM で指定してください' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      company:companies (company_name, email, has_separate_billing, billing_name, invoice_delivery_method),
      invoice_items (id, order_id, amount, order:orders (payment_method)),
      invoice_adjustments (id)
    `)
    .eq('billing_month', billingMonth)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('invoices GET error:', error)
    return NextResponse.json({ error: '請求書の取得に失敗しました' }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}

type OrderRow = {
  id: string
  order_number: string
  company_id: string
  status: string
  payment_method: string | null
  total_amount: number
  delivery_date: string | null
  shipping_date: string | null
  company: { parent_company_id: string | null } | null
}

function nextSeqFrom(rows: { invoice_number: string }[]): number {
  const seqs = rows.map((inv) => {
    const m = /-(\d{3,})$/.exec(inv.invoice_number)
    return m ? parseInt(m[1], 10) : 0
  })
  return seqs.length > 0 ? Math.max(...seqs) + 1 : 1
}

export async function POST(req: NextRequest) {
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  let body: { billingMonth?: unknown; companyId?: unknown; orderIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { billingMonth, companyId, orderIds } = body
  if (typeof billingMonth !== 'string' || !/^\d{4}-\d{2}$/.test(billingMonth)) {
    return NextResponse.json({ error: 'billingMonth は YYYY-MM で指定してください' }, { status: 400 })
  }
  if (typeof companyId !== 'string' || !companyId) {
    return NextResponse.json({ error: '請求先会社を指定してください' }, { status: 400 })
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0 || !orderIds.every((id) => typeof id === 'string' && id)) {
    return NextResponse.json({ error: '対象の注文IDを1件以上指定してください' }, { status: 400 })
  }
  const ids = Array.from(new Set(orderIds as string[]))

  const supabase = createServiceClient()

  try {
    // 二重作成防止: その会社・その月の請求書が既にあれば作らない
    const { data: existing, error: existingError } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('company_id', companyId)
      .eq('billing_month', billingMonth)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      return NextResponse.json(
        { code: 'already_exists', invoiceNumber: existing.invoice_number, error: '既に請求書があります' },
        { status: 409 }
      )
    }

    // 対象注文を DB から読み直して検証する
    const { data: orderRows, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, company_id, status, payment_method, total_amount, delivery_date, shipping_date, company:companies (parent_company_id)')
      .in('id', ids)
    if (ordersError) throw ordersError
    const orders = (orderRows ?? []) as unknown as OrderRow[]

    if (orders.length !== ids.length) {
      return NextResponse.json({ error: '対象の注文の一部が見つかりません。画面を再読み込みしてください' }, { status: 400 })
    }
    // 代引き（cod）は現金回収済みのため請求書に載せない（画面側の G-3 チェックと同じ）
    const codOrder = orders.find((o) => o.payment_method === 'cod')
    if (codOrder) {
      return NextResponse.json(
        { error: `注文 ${codOrder.order_number} は代金引換のため請求書に含められません（データ不整合の可能性があります）。` },
        { status: 400 }
      )
    }
    for (const o of orders) {
      if (o.status !== 'shipped' && o.status !== 'done') {
        return NextResponse.json({ error: `注文 ${o.order_number} は出荷済み・完了ではないため請求書に含められません` }, { status: 400 })
      }
      const billingCompanyId = o.company?.parent_company_id ?? o.company_id
      if (billingCompanyId !== companyId) {
        return NextResponse.json({ error: `注文 ${o.order_number} は指定の請求先会社の注文ではありません` }, { status: 400 })
      }
      const basis = o.delivery_date ?? o.shipping_date
      if (!basis || basis.slice(0, 7) !== billingMonth) {
        return NextResponse.json({ error: `注文 ${o.order_number} は ${billingMonth} の請求対象ではありません` }, { status: 400 })
      }
    }
    // 既にどれかの請求書に載っている注文は含めない（二重請求防止）
    const { data: billed, error: billedError } = await supabase
      .from('invoice_items')
      .select('order_id')
      .in('order_id', ids)
    if (billedError) throw billedError
    if ((billed ?? []).length > 0) {
      const billedSet = new Set((billed ?? []).map((b) => b.order_id as string))
      const nums = orders.filter((o) => billedSet.has(o.id)).map((o) => o.order_number)
      return NextResponse.json({ error: `既に請求書に載っている注文が含まれています: ${nums.join('、')}` }, { status: 400 })
    }

    // 金額・消費税・支払期限（従来の画面側の計算と同じ）
    const [year, month] = billingMonth.split('-').map(Number)
    const totalAmount = orders.reduce((sum, o) => sum + Number(o.total_amount), 0)
    const taxRate = 0.08
    const taxAmount = Math.floor(totalAmount - totalAmount / (1 + taxRate))
    // 支払期限: billing_month の翌月末日（例: 2026-06 → 2026-07-31）
    const dueDate = new Date(year, month + 1, 0)
    const dueDateStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`

    // 1. 請求書を作成（採番が他の作成と重なって UNIQUE 違反になったら、採番し直して再試行）
    let invoice: { id: string; invoice_number: string } | null = null
    for (let attempt = 0; attempt < MAX_SEQ_RETRY && !invoice; attempt++) {
      const { data: monthInvoices, error: seqError } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('billing_month', billingMonth)
      if (seqError) throw seqError
      const invoiceNumber = `INV-${billingMonth.replace('-', '')}-${String(nextSeqFrom(monthInvoices ?? [])).padStart(3, '0')}`

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          company_id: companyId,
          billing_month: billingMonth,
          total_amount: totalAmount,
          tax_amount: taxAmount,
          status: 'draft',
          due_date: dueDateStr,
        })
        .select('id, invoice_number')
        .single()
      if (!error && data) {
        invoice = data
        break
      }
      if (error?.code !== '23505') {
        return NextResponse.json({ error: `請求書の作成に失敗しました: ${error?.message ?? '不明なエラー'}` }, { status: 500 })
      }
    }
    if (!invoice) {
      return NextResponse.json({ error: '請求書番号の採番が重なったため作成できませんでした。もう一度お試しください' }, { status: 409 })
    }

    // 失敗時に請求書を取り消す（invoice_items は CASCADE で消える）
    const rollback = async (reason: string) => {
      const { error: delError } = await supabase.from('invoices').delete().eq('id', invoice!.id)
      if (delError) {
        console.error(`[invoices POST] 取り消し失敗 ${invoice!.invoice_number}:`, delError)
        return NextResponse.json(
          {
            error: `${reason}。作成途中の請求書（${invoice!.invoice_number}）の取り消しにも失敗しました。請求書一覧から ${invoice!.invoice_number} を削除してから作成し直してください`,
          },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: `${reason}（請求書は作成していません）` }, { status: 500 })
    }

    // 2. 明細を作成（1文。失敗したら変更は残らない）
    const { error: itemsError } = await supabase.from('invoice_items').insert(
      orders.map((o) => ({ invoice_id: invoice!.id, order_id: o.id, amount: o.total_amount }))
    )
    if (itemsError) {
      console.error('[invoices POST] invoice_items insert error:', itemsError)
      return rollback(`明細の作成に失敗しました: ${itemsError.message}`)
    }

    // 3. 対象注文を完了にする（1文。失敗したら変更は残らない）
    const { error: doneError } = await supabase.from('orders').update({ status: 'done' }).in('id', ids)
    if (doneError) {
      console.error('[invoices POST] orders done update error:', doneError)
      return rollback(`対象注文の完了更新に失敗しました: ${doneError.message}`)
    }

    return NextResponse.json(
      { data: { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, orderIds: ids } },
      { status: 201 }
    )
  } catch (err) {
    console.error('invoices POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
