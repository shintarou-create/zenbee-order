import type { InvoiceDetail } from './invoice-detail-data'

// 請求書の印刷用HTMLを組み立てる（/admin/invoices/print と同一レイアウト）。
// puppeteer で HTML→PDF する際の入力。日本語は Google Fonts（Noto Sans JP / Noto Serif JP）を読み込む。

// 発行者（株式会社善兵衛）固定情報。納品書（DeliveryNoteLayout）と同一の本社住所。
const ISSUER = {
  name: '株式会社善兵衛',
  postal: '〒643-0006',
  address: '和歌山県有田郡湯浅町大字田340-3',
  representative: '代表取締役 井上信太郎',
  registrationNumber: '登録番号 T6170001016584',
}

const BANK = {
  bank: 'PayPay銀行 ビジネス営業部（店番005）',
  account: '普通 5419086',
  holder: 'カ）ゼンベエ（株式会社善兵衛）',
}

function yen(n: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(n)
}

// 本日（JST）を「YYYY年M月D日」で返す
function jpToday(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return `${jst.getFullYear()}年${jst.getMonth() + 1}月${jst.getDate()}日`
}

function jpDate(d: string | null): string {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length < 3) return d
  return `${parseInt(parts[0])}年${parseInt(parts[1])}月${parseInt(parts[2])}日`
}

// HTML特殊文字をエスケープ（会社名・品名などの動的文字列用）
function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderInvoiceHtml(detail: InvoiceDetail): string {
  const { invoice, billing, lineItems, summary } = detail
  const addrLine = [billing.prefecture, billing.city, billing.address, billing.building]
    .filter(Boolean)
    .join('')

  const rowsHtml = lineItems
    .map(
      (item) => `
      <tr style="border-bottom:1px solid #ddd;">
        <td style="padding:5px 6px;">${esc(item.date)}</td>
        <td style="padding:5px 6px;">${item.reduced ? '★' : ''}${esc(item.description)}</td>
        <td style="padding:5px 6px;text-align:right;">${item.quantity}</td>
        <td style="padding:5px 6px;">${esc(item.unit)}</td>
        <td style="padding:5px 6px;text-align:right;">${yen(item.unitPrice)}</td>
        <td style="padding:5px 6px;text-align:right;">${yen(item.amount)}</td>
        <td style="padding:5px 6px;text-align:right;">${item.taxRate}%</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>請求書 ${esc(invoice.invoice_number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@400&display=swap" rel="stylesheet" />
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; font-size: 13px; line-height: 1.6;
    font-family: 'Noto Sans JP', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>
  <div style="max-width:720px;margin:0 auto;padding:0 8px;">
    <!-- ヘッダー: タイトル / 右上 発行日・請求書番号 -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
      <h1 style="font-size:26px;font-family:'Noto Serif JP',serif;font-weight:400;letter-spacing:0.4em;padding-left:0.4em;margin:0;">請求書</h1>
      <div style="text-align:right;font-size:11px;color:#444;line-height:1.7;">
        <p style="margin:0;">発行日: ${jpToday()}</p>
        <p style="margin:0;">請求書番号: ${esc(invoice.invoice_number)}</p>
      </div>
    </div>

    <!-- 宛名（左） / 発行者（右） -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;gap:24px;">
      <div style="flex:1;">
        <p style="font-size:18px;font-weight:500;margin:0;border-bottom:1px solid #111;padding-bottom:5px;">${esc(billing.name)}　御中</p>
        <div style="font-size:11px;color:#444;margin-top:6px;line-height:1.7;">
          ${billing.postal_code ? `<p style="margin:0;">〒${esc(billing.postal_code)}</p>` : ''}
          ${addrLine ? `<p style="margin:0;">${esc(addrLine)}</p>` : ''}
        </div>
      </div>
      <div style="text-align:right;font-size:11px;color:#222;line-height:1.8;">
        <p style="margin:0;font-size:13px;font-weight:500;">${ISSUER.name}</p>
        <p style="margin:0;">${ISSUER.postal} ${ISSUER.address}</p>
        <p style="margin:0;">${ISSUER.representative}</p>
        <p style="margin:0;">${ISSUER.registrationNumber}</p>
      </div>
    </div>

    <!-- ご請求金額 -->
    <div style="display:flex;justify-content:space-between;align-items:baseline;border:2px solid #111;padding:10px 16px;margin-bottom:8px;">
      <span style="font-size:15px;font-weight:500;">ご請求金額</span>
      <span style="font-size:24px;font-weight:700;">${yen(summary.grandTotal)}</span>
    </div>
    <p style="font-size:11px;color:#444;margin:0 0 18px;">お支払期限: ${jpDate(invoice.due_date)}</p>

    <!-- 明細テーブル -->
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      <thead>
        <tr style="border-top:2px solid #111;border-bottom:2px solid #111;">
          <th style="text-align:left;padding:6px;font-weight:500;font-size:11px;width:52px;">日付</th>
          <th style="text-align:left;padding:6px;font-weight:500;font-size:11px;">品名</th>
          <th style="text-align:right;padding:6px;font-weight:500;font-size:11px;width:50px;">数量</th>
          <th style="text-align:left;padding:6px;font-weight:500;font-size:11px;width:44px;">単位</th>
          <th style="text-align:right;padding:6px;font-weight:500;font-size:11px;width:72px;">単価</th>
          <th style="text-align:right;padding:6px;font-weight:500;font-size:11px;width:84px;">金額</th>
          <th style="text-align:right;padding:6px;font-weight:500;font-size:11px;width:48px;">税率</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <!-- 税区分別サマリ -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
      <table style="border-collapse:collapse;font-size:12px;min-width:300px;">
        <tbody>
          <tr>
            <td style="padding:4px 10px;color:#444;">8%対象（軽減税率）</td>
            <td style="padding:4px 10px;text-align:right;">${yen(summary.subtotal8)}</td>
            <td style="padding:4px 10px;text-align:right;color:#444;">（消費税 ${yen(summary.tax8)}）</td>
          </tr>
          <tr>
            <td style="padding:4px 10px;color:#444;">10%対象</td>
            <td style="padding:4px 10px;text-align:right;">${yen(summary.subtotal10)}</td>
            <td style="padding:4px 10px;text-align:right;color:#444;">（消費税 ${yen(summary.tax10)}）</td>
          </tr>
          <tr style="border-top:2px solid #111;">
            <td style="padding:6px 10px;font-weight:700;">合計（税込）</td>
            <td style="padding:6px 10px;text-align:right;font-weight:700;" colspan="2">${yen(summary.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p style="font-size:10px;color:#666;margin:0 0 16px;">★は軽減税率(8%)対象</p>

    <!-- お振込先 -->
    <div style="border:1px solid #111;padding:10px 14px;margin-bottom:14px;">
      <p style="margin:0;font-size:12px;font-weight:500;">お振込先</p>
      <p style="margin:4px 0 0;font-size:12px;">${BANK.bank}</p>
      <p style="margin:0;font-size:12px;">${BANK.account}</p>
      <p style="margin:0;font-size:12px;">${BANK.holder}</p>
    </div>

    <p style="font-size:10px;color:#666;margin:0;">お振込手数料は御社にてご負担いただけますようお願い申し上げます。</p>
  </div>
</body>
</html>`
}
