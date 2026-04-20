export interface FreeeTransactionRow {
  date: string           // 発生日 (YYYY/MM/DD)
  partner: string        // 取引先名
  accountTitle: string   // 勘定科目
  itemName: string       // 品目
  taxClass: string       // 税区分
  amount: number         // 金額（税込）
  memo: string           // 備考
}

// freee 取引インポートCSV ヘッダー
const CSV_HEADERS = [
  '収支区分',
  '発生日',
  '管理番号',
  '取引先',
  '勘定科目',
  '税区分',
  '金額',
  '品目',
  '部門',
  'メモタグ（複数指定可、カンマ区切り）',
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
      '収入',                  // 収支区分
      row.date,                // 発生日
      '',                      // 管理番号
      row.partner,             // 取引先
      row.accountTitle,        // 勘定科目
      row.taxClass,            // 税区分
      String(row.amount),      // 金額
      row.itemName,            // 品目
      '',                      // 部門
      '',                      // メモタグ
      row.memo,                // 備考
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
