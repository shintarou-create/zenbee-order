import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildInvoiceDetail } from '@/lib/invoice-detail-data'
import { renderInvoiceHtml } from '@/lib/invoice-html'
import { htmlToPdf } from '@/lib/pdf-render'
import { hasGmailConfig, getGmailAccessToken, createGmailDraft } from '@/lib/gmail'

// 例外メッセージを先頭200字に丸める（画面表示・ログ用）
function em(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200)
}

// 請求書PDFを生成し、Gmailに下書き（PDF添付）を作成する。
// 認証は middleware（/api/admin/*：LIFFアクセストークン→admin_users照合）で実施済み。
export const runtime = 'nodejs'
export const maxDuration = 60

// "YYYY-MM" → "YYYY年M月"
function jpMonth(billingMonth: string): string {
  const [y, m] = billingMonth.split('-')
  return `${parseInt(y)}年${parseInt(m)}月`
}

// "YYYY-MM-DD" → "YYYY年M月D日"
function jpDate(d: string | null): string {
  if (!d) return '別途ご連絡'
  const [y, m, dd] = d.split('-').map((n) => parseInt(n))
  return `${y}年${m}月${dd}日`
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Gmail連携が未設定なら 503（クラッシュさせない）
    if (!hasGmailConfig()) {
      return NextResponse.json({ error: 'Gmail連携が未設定です' }, { status: 503 })
    }

    const invoiceId = params.id
    if (!invoiceId) {
      return NextResponse.json({ error: '請求書IDが指定されていません' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const detail = await buildInvoiceDetail(supabase, { invoiceId })
    if (!detail) {
      return NextResponse.json({ error: '請求書が見つかりません' }, { status: 404 })
    }

    // 送付方法ガード: メール以外（郵送・その他）は Gmail 下書きを作成しない。
    if (detail.billing.deliveryMethod !== 'email') {
      return NextResponse.json(
        { error: 'この取引先は郵送・メール以外の送付設定のためGmail下書きは作成できません' },
        { status: 400 }
      )
    }

    const email = detail.billing.email
    if (!email) {
      return NextResponse.json({ error: '取引先のメールアドレスが未登録です' }, { status: 400 })
    }

    // 請求書PDFを生成（puppeteer/chromium）
    const html = renderInvoiceHtml(detail)
    let pdf: Buffer
    try {
      pdf = await htmlToPdf(html)
    } catch (err) {
      console.error('[gmail-draft] PDF生成失敗:', err)
      return NextResponse.json({ error: `PDF生成に失敗: ${em(err)}` }, { status: 500 })
    }

    const monthLabel = jpMonth(detail.invoice.billing_month)
    const addressee = detail.billing.name
    const companyForFile = detail.billing.company_name || detail.billing.name

    const subject = `【善兵衛農園】${monthLabel}分 請求書のご送付`
    const bodyText = `${addressee} 御中

いつもお世話になっております。株式会社善兵衛でございます。
${monthLabel}分のご請求書を添付にてお送りいたします。

請求書番号: ${detail.invoice.invoice_number}
ご請求金額: ¥${detail.summary.grandTotal.toLocaleString('ja-JP')}（税込）
お支払期限: ${jpDate(detail.invoice.due_date)}

お振込先: PayPay銀行 ビジネス営業部（店番005）普通 5419086 カ）ゼンベエ

ご査収のほどよろしくお願い申し上げます。

──────────────
株式会社善兵衛
〒643-0006 和歌山県有田郡湯浅町大字田340-3
代表取締役 井上信太郎
登録番号 T6170001016584
──────────────`

    const filename = `請求書_${companyForFile}_${detail.invoice.billing_month}.pdf`

    // Gmail アクセストークン取得（refresh_token → access_token）
    let accessToken: string
    try {
      accessToken = await getGmailAccessToken()
    } catch (err) {
      console.error('[gmail-draft] Gmail認証失敗:', err)
      return NextResponse.json({ error: `Gmail認証に失敗: ${em(err)}` }, { status: 500 })
    }

    // Gmail 下書き作成（drafts.create）
    let draftId = ''
    try {
      const result = await createGmailDraft(
        {
          to: email,
          subject,
          bodyText,
          attachment: { filename, content: pdf, mimeType: 'application/pdf' },
        },
        accessToken,
      )
      draftId = result.draftId
    } catch (err) {
      console.error('[gmail-draft] Gmail下書きAPI失敗:', err)
      return NextResponse.json({ error: `Gmail下書きAPIエラー: ${em(err)}` }, { status: 500 })
    }

    // 下書き作成成功後、作成日時を記録する。
    // この更新に失敗しても下書き自体は作成済みなのでレスポンスは成功として返す。
    const gmailDraftCreatedAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ gmail_draft_created_at: gmailDraftCreatedAt })
      .eq('id', invoiceId)
    if (updateError) {
      console.error('[gmail-draft] gmail_draft_created_at 更新失敗:', updateError)
    }

    return NextResponse.json({ ok: true, draftId, gmailDraftCreatedAt })
  } catch (err) {
    console.error('[gmail-draft] 予期しないエラー:', err)
    return NextResponse.json({ error: `Gmail下書きの作成に失敗しました: ${em(err)}` }, { status: 500 })
  }
}
