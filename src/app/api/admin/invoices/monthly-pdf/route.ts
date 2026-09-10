import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildInvoiceDetail } from '@/lib/invoice-detail-data'
import { renderInvoiceHtml } from '@/lib/invoice-html'
import { htmlToPdf } from '@/lib/pdf-render'

// 月次PDF一式（その月の全社ぶん請求書を1本のPDFに連結）。生成した瞬間にダウンロードでき、
// 同時に Storage（invoice-archives・非公開バケット）へ保存して履歴化する。
// 認証は middleware（/api/admin/*：LIFFアクセストークン→admin_users照合）で実施済み。
// middleware が検証済みの line_user_id を x-line-user-id ヘッダーで転送してくれるため、
// ここで再度LINE APIを呼ぶ必要はない（freee-export-download/route.ts と同じ方式）。
export const runtime = 'nodejs'
export const maxDuration = 60

const BUCKET = 'invoice-archives'

function em(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200)
}

// Storageのオブジェクトキー（内部パス）はASCII安全な文字だけにする。
// 日本語・アンダースコア・全角文字を含めると Supabase Storage が
// "Invalid key" で upload を拒否するため。
function storagePathFor(billingMonth: string): string {
  return `monthly/invoices-${billingMonth}.pdf`
}

// ユーザーに見えるダウンロードファイル名（Content-Disposition・署名URLのdownloadオプション用）。
// Storageのキーとは別物。こちらは従来通り日本語のまま維持する。
function downloadFilenameFor(billingMonth: string): string {
  return `請求書_${billingMonth}_一式.pdf`
}

function extractHead(html: string): string {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/)
  if (!match) throw new Error('請求書HTMLから<head>を抽出できませんでした')
  return match[1]
}

function extractBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/)
  if (!match) throw new Error('請求書HTMLから<body>を抽出できませんでした')
  return match[1]
}

// renderInvoiceHtml が返す「1社分の完全なHTML文書」を複数、1つのHTML文書に改ページ連結する。
// head（Googleフォント読込・@pageスタイル）は全社共通なので先頭の1件から流用し、以降は
// <body>の中身だけを page-break-before:always で積む。DOM解析ライブラリは使わず正規表現で
// head/bodyを抽出する方式にした（renderInvoiceHtmlの出力は自前テンプレートで動的値は
// 全てescapeされているため、想定外の<head>/<body>混入は起きない＝最も壊れにくい方法）。
function buildMonthlyInvoiceHtml(perInvoiceHtml: string[]): string {
  const head = extractHead(perInvoiceHtml[0])
  const bodies = perInvoiceHtml.map((html, i) => {
    const inner = extractBody(html)
    const pageBreak = i === 0 ? '' : 'page-break-before:always;'
    return `<div style="${pageBreak}">${inner}</div>`
  })
  return `<!DOCTYPE html><html lang="ja"><head>${head}</head><body>${bodies.join('')}</body></html>`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { billingMonth } = body as { billingMonth?: string }

    if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
      return NextResponse.json({ error: '請求月の形式が正しくありません (YYYY-MM)' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('billing_month', billingMonth)
      .order('invoice_number', { ascending: true })

    if (invoicesError) throw invoicesError
    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ error: '対象月の請求書がありません' }, { status: 404 })
    }

    // 各社のHTMLを組み立てる（buildInvoiceDetailがnullの社はログに残して続行。他社は止めない）
    const perInvoiceHtml: string[] = []
    for (const inv of invoices) {
      try {
        const detail = await buildInvoiceDetail(supabase, { invoiceId: inv.id })
        if (!detail) {
          console.error(`[monthly-pdf] buildInvoiceDetailがnull: invoice_id=${inv.id} (${inv.invoice_number})`)
          continue
        }
        perInvoiceHtml.push(renderInvoiceHtml(detail))
      } catch (err) {
        console.error(`[monthly-pdf] HTML生成失敗: invoice_id=${inv.id} (${inv.invoice_number}):`, err)
      }
    }

    if (perInvoiceHtml.length === 0) {
      return NextResponse.json({ error: '対象月の請求書がありません' }, { status: 404 })
    }

    const combinedHtml = buildMonthlyInvoiceHtml(perInvoiceHtml)

    // PDF生成（chromiumはここで1回だけ起動する。社ごとには回さない）
    let pdf: Buffer
    try {
      pdf = await htmlToPdf(combinedHtml)
    } catch (err) {
      console.error('[monthly-pdf] PDF生成失敗:', err)
      return NextResponse.json({ error: `PDF生成に失敗: ${em(err)}` }, { status: 500 })
    }

    // Storageへ保存（同月を再出力したら上書き）
    const storagePath = storagePathFor(billingMonth)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, pdf, { upsert: true, contentType: 'application/pdf' })

    if (uploadError) {
      console.error('[monthly-pdf] Storageアップロード失敗:', uploadError)
      return NextResponse.json({ error: `PDFの保存に失敗しました: ${uploadError.message}` }, { status: 500 })
    }

    // 履歴ログ（非致命: 失敗してもレスポンスは返す）
    const lineUserId = req.headers.get('x-line-user-id') ?? null
    const { error: logError } = await supabase.from('invoice_monthly_export_log').insert({
      billing_month: billingMonth,
      storage_path: storagePath,
      invoice_count: perInvoiceHtml.length,
      exported_by: lineUserId,
    })
    if (logError) {
      console.error('[monthly-pdf] invoice_monthly_export_log insert (non-fatal):', logError.message)
    }

    const filename = downloadFilenameFor(billingMonth)
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(pdf.length),
      },
    })
  } catch (err) {
    console.error('[monthly-pdf] 予期しないエラー:', err)
    return NextResponse.json({ error: `PDF生成に失敗: ${em(err)}` }, { status: 500 })
  }
}

// 保存済みPDFの再取得（署名付きURLを返す。invoice-archives は非公開バケットのため
// 公開URLは使わない）。
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const billingMonth = searchParams.get('billingMonth')

    if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
      return NextResponse.json({ error: '請求月の形式が正しくありません (YYYY-MM)' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: logRow, error: logError } = await supabase
      .from('invoice_monthly_export_log')
      .select('storage_path, created_at')
      .eq('billing_month', billingMonth)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (logError) throw logError
    if (!logRow) {
      return NextResponse.json({ error: 'この月の保存済みPDFはありません' }, { status: 404 })
    }

    // download オプションに日本語ファイル名を指定し、署名URLを開いたときも
    // Storageキー（invoices-2026-06.pdf等）ではなく日本語のファイル名で保存されるようにする。
    const { data: signed, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(logRow.storage_path, 60, { download: downloadFilenameFor(billingMonth) })

    if (signedError || !signed) {
      console.error('[monthly-pdf GET] createSignedUrl失敗:', signedError)
      return NextResponse.json({ error: '署名付きURLの発行に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ url: signed.signedUrl, exportedAt: logRow.created_at })
  } catch (err) {
    console.error('[monthly-pdf GET] 予期しないエラー:', err)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}
