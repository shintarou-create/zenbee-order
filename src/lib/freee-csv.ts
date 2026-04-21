export interface FreeeInvoiceRow {
  invoiceNumber: string
  date: string          // YYYY/MM/DD（請求月末日）
  billingMonth: string  // YYYY-MM
  partnerName: string
  foodTotal: number
  shippingTotal: number
}

// freee 請求書インポートCSV ヘッダー（36列）
const CSV_HEADERS = [
  '行形式',
  '発行日',
  '番号',
  '枝番',
  '件名',
  '発行元担当者氏名',
  '社内メモ',
  '備考',
  '消費税の表示方法',
  '消費税端数の計算方法',
  '金額端数の計算方法',
  '取引先名称',
  '取引先宛名',
  '取引先敬称',
  '取引先郵便番号',
  '取引先都道府県',
  '取引先市区町村・番地',
  '取引先建物名・部屋番号',
  '取引先部署',
  '取引先担当者氏名',
  '行の種類',
  '摘要',
  '単価',
  '数量',
  '単位',
  '税率',
  '源泉徴収',
  '発生日',
  '勘定科目',
  '税区分',
  '部門',
  '品目',
  'メモ',
  'セグメント1',
  'セグメント2',
  'セグメント3',
]

function escapeCSVField(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function makeRow(fields: (string | number | undefined | null)[]): string {
  return fields.map(escapeCSVField).join(',')
}

function emptyRow(): (string | number)[] {
  return Array(36).fill('')
}

export function generateFreeeCSV(rows: FreeeInvoiceRow[]): Uint8Array {
  const lines: string[] = []

  lines.push(makeRow(CSV_HEADERS))

  for (const row of rows) {
    const [year, month] = row.billingMonth.split('-')
    const subject = `${year}年${parseInt(month)}月分`

    // ヘッダー行（請求書1件につき1行）
    const header = emptyRow()
    header[0] = 'ヘッダー'
    header[1] = row.date
    header[2] = row.invoiceNumber
    // [3] 枝番: 空
    header[4] = subject
    // [5] 発行元担当者氏名: 空
    // [6] 社内メモ: 空
    // [7] 備考: 空
    header[8] = '内税'
    // [9] 消費税端数の計算方法: 空
    // [10] 金額端数の計算方法: 空
    header[11] = row.partnerName
    header[12] = row.partnerName
    header[13] = '御中'
    // [14-19] 取引先住所系: 空
    // [20-35] 明細列: 空（ヘッダー行には不要）
    lines.push(makeRow(header))

    // 食品明細行（8%軽減税率）
    if (row.foodTotal > 0) {
      const food = emptyRow()
      food[0] = '明細'
      // [1-13] 請求書ヘッダー情報: 空（ヘッダー行から引き継ぎ）
      food[20] = '品目'
      food[21] = '農産物'
      food[22] = row.foodTotal
      food[23] = 1
      food[24] = '式'
      food[25] = 0.08
      // [26] 源泉徴収: 空
      food[27] = row.date
      food[28] = '売上高'
      food[29] = '課税売上8%（軽）'
      // [30-35] 部門・品目・メモ・セグメント: 空
      lines.push(makeRow(food))
    }

    // 送料明細行（10%標準税率）
    if (row.shippingTotal > 0) {
      const shipping = emptyRow()
      shipping[0] = '明細'
      shipping[20] = '品目'
      shipping[21] = '送料'
      shipping[22] = row.shippingTotal
      shipping[23] = 1
      shipping[24] = '式'
      shipping[25] = 0.1
      shipping[27] = row.date
      shipping[28] = '売上高'
      shipping[29] = '課税売上10%'
      lines.push(makeRow(shipping))
    }
  }

  const csvText = lines.join('\r\n')

  // BOM付きUTF-8（freee推奨）
  const bom = '﻿'
  const buf = Buffer.from(bom + csvText, 'utf-8')
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

export function billingMonthToDate(billingMonth: string): string {
  const [year, month] = billingMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0)
  return [
    lastDay.getFullYear(),
    String(lastDay.getMonth() + 1).padStart(2, '0'),
    String(lastDay.getDate()).padStart(2, '0'),
  ].join('/')
}
