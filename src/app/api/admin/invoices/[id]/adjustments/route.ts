import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildInvoiceDetail } from '@/lib/invoice-detail-data'

// 請求書の調整行（注文由来ではない任意の追加項目・値引き等）。
// 認証は middleware（/api/admin/*）で実施済み。
//
// GET: その請求書の調整行を sort_order 昇順で返す。
// PUT: 送られてきた配列で全置換する（既存行を DELETE → まとめて INSERT）。
//      保存後は invoices.total_amount / tax_amount を必ず再計算して更新する
//      （一覧の金額表示・月合計・PDF/Gmail下書きが total_amount を参照しているため）。

const MAX_ADJUSTMENTS = 20
const TAX_RATES = ['8', '10', '0'] as const
type TaxRate = (typeof TAX_RATES)[number]

type AdjustmentInput = { description: string; amount: number; tax_rate: TaxRate }

function em(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200)
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoiceId = params.id
    if (!invoiceId) {
      return NextResponse.json({ error: '請求書IDが指定されていません' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('invoice_adjustments')
      .select('id, invoice_id, description, amount, tax_rate, sort_order, created_at')
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({ error: `調整行の取得に失敗: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ adjustments: data ?? [] })
  } catch (err) {
    console.error('[invoice-adjustments] GET 予期しないエラー:', err)
    return NextResponse.json({ error: `調整行の取得に失敗しました: ${em(err)}` }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoiceId = params.id
    if (!invoiceId) {
      return NextResponse.json({ error: '請求書IDが指定されていません' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    const rawAdjustments = (body as { adjustments?: unknown } | null)?.adjustments
    if (!Array.isArray(rawAdjustments)) {
      return NextResponse.json({ error: 'adjustments は配列で指定してください' }, { status: 400 })
    }
    if (rawAdjustments.length > MAX_ADJUSTMENTS) {
      return NextResponse.json({ error: `調整行は1請求書あたり最大${MAX_ADJUSTMENTS}件までです` }, { status: 400 })
    }

    // バリデーション: description は必須・trim後1〜100文字／amount は整数（小数不可）／tax_rate は '8'|'10'|'0'
    const adjustments: AdjustmentInput[] = []
    for (const raw of rawAdjustments) {
      const r = raw as { description?: unknown; amount?: unknown; tax_rate?: unknown }
      const description = typeof r.description === 'string' ? r.description.trim() : ''
      if (description.length < 1 || description.length > 100) {
        return NextResponse.json({ error: '品名は1〜100文字で入力してください' }, { status: 400 })
      }
      if (typeof r.amount !== 'number' || !Number.isInteger(r.amount)) {
        return NextResponse.json({ error: '金額は整数で指定してください（小数不可）' }, { status: 400 })
      }
      if (typeof r.tax_rate !== 'string' || !TAX_RATES.includes(r.tax_rate as TaxRate)) {
        return NextResponse.json({ error: '税率が不正です' }, { status: 400 })
      }
      adjustments.push({ description, amount: r.amount, tax_rate: r.tax_rate as TaxRate })
    }

    const supabase = createServiceClient()

    // 請求書の存在確認（存在しない場合はFK違反で分かりにくいエラーになるため事前にチェックする）
    const { data: invoiceRow, error: invoiceCheckError } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', invoiceId)
      .single()
    if (invoiceCheckError || !invoiceRow) {
      return NextResponse.json({ error: '請求書が見つかりません' }, { status: 404 })
    }

    // 全置換: 既存行を DELETE → まとめて INSERT。Supabaseは該当0件でもエラーを返さないため
    // DELETE・INSERT とも error を必ず確認する。
    const { error: deleteError } = await supabase
      .from('invoice_adjustments')
      .delete()
      .eq('invoice_id', invoiceId)
    if (deleteError) {
      return NextResponse.json({ error: `既存の調整行の削除に失敗: ${deleteError.message}` }, { status: 500 })
    }

    if (adjustments.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('invoice_adjustments')
        .insert(
          adjustments.map((a, i) => ({
            invoice_id: invoiceId,
            description: a.description,
            amount: a.amount,
            tax_rate: a.tax_rate,
            sort_order: i,
          }))
        )
        .select('id')
      if (insertError) {
        return NextResponse.json({ error: `調整行の保存に失敗: ${insertError.message}` }, { status: 500 })
      }
      // .select()で返却行数と送信件数の一致を検証（サイレント失敗対策）
      if ((inserted ?? []).length !== adjustments.length) {
        return NextResponse.json(
          { error: `調整行の保存件数が一致しません（送信${adjustments.length}件・保存${(inserted ?? []).length}件）` },
          { status: 500 }
        )
      }
    }

    // 保存後は invoices の金額を必ず再計算して更新する（一覧・PDF・Gmail下書きが
    // total_amount / tax_amount を参照しているため、ここを抜かすと画面とズレる）。
    const detail = await buildInvoiceDetail(supabase, { invoiceId })
    if (!detail) {
      return NextResponse.json({ error: '調整行は保存されましたが、請求書金額の再計算に失敗しました' }, { status: 500 })
    }
    const totalAmount = detail.summary.grandTotal
    const taxAmount = detail.summary.tax8 + detail.summary.tax10

    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update({ total_amount: totalAmount, tax_amount: taxAmount })
      .eq('id', invoiceId)
      .select('id')
    if (updateError) {
      return NextResponse.json(
        { error: `調整行は保存されましたが、請求書金額の更新に失敗しました: ${updateError.message}` },
        { status: 500 }
      )
    }
    if ((updatedInvoice ?? []).length !== 1) {
      return NextResponse.json(
        { error: '調整行は保存されましたが、請求書金額の更新件数が一致しませんでした' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      adjustments: adjustments.length,
      totalAmount,
      taxAmount,
    })
  } catch (err) {
    console.error('[invoice-adjustments] PUT 予期しないエラー:', err)
    return NextResponse.json({ error: `調整行の保存に失敗しました: ${em(err)}` }, { status: 500 })
  }
}
