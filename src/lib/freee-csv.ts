export interface FreeeTransactionRow {
  date: string           // 発生日 (YYYY/MM/DD)
  partner: string        // 取引先名
  amount: number         // 金額（税込）
  taxAmount: number      // 税額
  invoiceNumber: string  // 請求書番号（備考用）
  billingMonth: string   // 請求月（備考用）
}

// freee 取引インポートCSV ヘッダー
const CSV_HEADERS = [
  '発生日',
  '収支区分',
  '取引先',
  '勘定科目',
  '品目',
  '部門',
  'メモタグ（複数可）',
  '税区分',
  '金額（税込）',
  '備考',
]

function escapeCSVField(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function generateFreeeCSV(rows: FreeeTransactionRow[]): Uint8Array {
  const lines: string[] = []

  // ヘッダー行
  lines.push(CSV_HEADERS.map(escapeCSVField).join(','))

  // データ行
  for (const row of rows) {
    const fields = [
      row.date,                                       // 発生日
      '収入',                                          // 収支区分
      row.partner,                                    // 取引先
      '売上高',                                        // 勘定科目
      '農産物',                                        // 品目
      '',                                             // 部門
      '',                                             // メモタグ
      '課税売上8%（軽減）',                             // 税区分（農産物は軽減税率）
      String(row.amount),                             // 金額（税込）
      `${row.invoiceNumber} ${row.billingMonth}月分`,  // 備考
    ]
    lines.push(fields.map(escapeCSVField).join(','))
  }

  // CRLF改行でJoin
  const csvText = lines.join('\r\n')

  // UTF-8 BOM付き（freee推奨）
  const bom = '\uFEFF'
  const buf = Buffer.from(bom + csvText, 'utf-8')
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

/**
 * 請求月の末日を YYYY/MM/DD 形式で返す
 */
export function billingMonthToDate(billingMonth: string): string {
  const [year, month] = billingMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0)
  return [
    lastDay.getFullYear(),
    String(lastDay.getMonth() + 1).padStart(2, '0'),
    String(lastDay.getDate()).padStart(2, '0'),
  ].join('/')
}
