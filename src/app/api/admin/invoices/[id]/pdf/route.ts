import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildInvoiceDetail } from '@/lib/invoice-detail-data'
import { renderInvoiceHtml } from '@/lib/invoice-html'
import { htmlToPdf } from '@/lib/pdf-render'

// 請求書PDFを生成して返す（郵送用に保存する用途）。Gmailは呼ばない。
// 認証は middleware（/api/admin/*：LIFFアクセストークン→admin_users照合）で実施済み。
export const runtime = 'nodejs'
export const maxDuration = 60

function em(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200)
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoiceId = params.id
    if (!invoiceId) {
      return NextResponse.json({ error: '請求書IDが指定されていません' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const detail = await buildInvoiceDetail(supabase, { invoiceId })
    if (!detail) {
      return NextResponse.json({ error: '請求書が見つかりません' }, { status: 404 })
    }

    // PDF生成（puppeteer/chromium）
    let pdf: Buffer
    try {
      const html = renderInvoiceHtml(detail)
      pdf = await htmlToPdf(html)
    } catch (err) {
      console.error('[invoice-pdf] PDF生成失敗:', err)
      return NextResponse.json({ error: `PDF生成に失敗: ${em(err)}` }, { status: 500 })
    }

    const companyForFile = detail.billing.company_name || detail.billing.name
    const filename = `請求書_${companyForFile}_${detail.invoice.billing_month}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        // 日本語ファイル名は filename*=UTF-8'' で対応
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(pdf.length),
      },
    })
  } catch (err) {
    console.error('[invoice-pdf] 予期しないエラー:', err)
    return NextResponse.json({ error: `PDF生成に失敗: ${em(err)}` }, { status: 500 })
  }
}
