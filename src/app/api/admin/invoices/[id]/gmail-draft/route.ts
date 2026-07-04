import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildInvoiceDetail } from '@/lib/invoice-detail-data'
import { renderInvoiceHtml } from '@/lib/invoice-html'
import { htmlToPdf } from '@/lib/pdf-render'
import { hasGmailConfig, createGmailDraft } from '@/lib/gmail'

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

    const email = detail.billing.email
    if (!email) {
      return NextResponse.json({ error: '取引先のメールアドレスが未登録です' }, { status: 400 })
    }

    // 請求書PDFを生成
    const html = renderInvoiceHtml(detail)
    const pdf = await htmlToPdf(html)

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

    const { draftId } = await createGmailDraft({
      to: email,
      subject,
      bodyText,
      attachment: { filename, content: pdf, mimeType: 'application/pdf' },
    })

    return NextResponse.json({ ok: true, draftId })
  } catch (err) {
    console.error('Gmail下書き作成エラー:', err)
    return NextResponse.json({ error: 'Gmail下書きの作成に失敗しました' }, { status: 500 })
  }
}
