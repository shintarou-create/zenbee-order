import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin-auth'

// 支払方法（payment_method）・代引き手数料（cod_fee）の変更専用エンドポイント。
// G-1: 'invoice' → 'cod' への変更は、対象注文が既に請求書（invoice_items）に含まれている
// 場合は拒否する（二重請求防止）。フロントの非活性化だけでは直POSTで抜けられるため、
// ここでも必ず同じチェックを行う。逆方向（'cod' → 'invoice'）は常に許可する
// （伝票出力済みかどうかの確認ダイアログはフロント側の責務）。
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  const orderId = params.id

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { payment_method, cod_fee } = (body ?? {}) as { payment_method?: unknown; cod_fee?: unknown }

  if (payment_method !== 'invoice' && payment_method !== 'cod') {
    return NextResponse.json({ error: 'payment_method は invoice または cod を指定してください' }, { status: 400 })
  }
  if (!Number.isInteger(cod_fee) || (cod_fee as number) < 0) {
    return NextResponse.json({ error: 'cod_fee は0以上の整数で指定してください' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .single()

  if (!order) {
    return NextResponse.json({ error: '注文が見つかりません' }, { status: 404 })
  }

  if (payment_method === 'cod') {
    const { data: invoiceItemRows, error: invoiceItemError } = await supabase
      .from('invoice_items')
      .select('invoice:invoices (invoice_number)')
      .eq('order_id', orderId)
      .limit(1)

    if (invoiceItemError) {
      console.error('[payment PATCH] invoice_items 確認エラー:', invoiceItemError)
      return NextResponse.json({ error: '請求書との紐づき確認に失敗しました' }, { status: 500 })
    }

    const linkedInvoice = invoiceItemRows?.[0] as { invoice?: { invoice_number?: string } | null } | undefined
    const invoiceNumber = linkedInvoice?.invoice?.invoice_number
    if (invoiceNumber) {
      return NextResponse.json(
        {
          error: `この注文は請求書 ${invoiceNumber} に含まれているため代引きに変更できません。先に請求管理からその請求書を削除してください（削除すると注文は未請求に戻ります）`,
        },
        { status: 409 }
      )
    }
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ payment_method, cod_fee })
    .eq('id', orderId)

  if (updateError) {
    console.error('[payment PATCH] update error:', updateError)
    return NextResponse.json({ error: '支払方法の保存に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ payment_method, cod_fee })
}
