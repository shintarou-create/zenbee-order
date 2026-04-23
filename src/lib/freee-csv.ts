// freee 請求書インポート CSV 生成（36列）
// 「本文」行 + 「明細」行の構造

export interface FreeeLineItem {
  description: string   // 摘要: "M/D納品 商品名" or "M/D 送料（ラベル名）"
  unitPrice: number     // 単価（税込）
  quantity: number      // 数量
  unit: string          // 単位（kg, 本, ケース 等。送料は空文字）
  taxRate: '8' | '10'   // 8%=食品（軽減税率）, 10%=送料（標準税率）
}

export interface FreeeInvoiceData {
  invoiceNumber: string   // 請求書番号
  date: string            // 発行日 YYYY/MM/DD（月末日）
  billingMonth: string    // YYYY-MM（件名に使用）
  partnerName: string     // 取引先名称
  items: FreeeLineItem[]  // 明細行（商品＋送料）
}

const CSV_HEADERS = [
  '行形式', '発行日', '番号', '枝番', '件名',
  '発行元担当者氏名', '社内メモ', '備考',
  '消費税の表示方法', '消費税端数の計算方法', '金額端数の計算方法',
  '取引先名称', '取引先宛名', '取引先敬称',
  '取引先郵便番号', '取引先都道府県', '取引先市区町村・番地', '取引先建物名・部屋番号',
  '取引先部署', '取引先担当者氏名',
  '行の種類', '摘要', '単価', '数量', '単位', '税率', '源泉徴収',
  '発生日', '勘定科目', '税区分', '部門', '品目', 'メモ',
  'セグメント1', 'セグメント2', 'セグメント3',
]

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function makeHeaderRow(invoice: FreeeInvoiceData): string[] {
  const [y, m] = invoice.billingMonth.split('-')
  const subject = `${y}年${parseInt(m)}月分 ご請求書`

  const row = new Array(36).fill('')
  row[0] = '本文'                 // 行形式
  row[1] = invoice.date           // 発行日
  row[2] = invoice.invoiceNumber  // 番号
  // row[3] 枝番: 空
  row[4] = subject                // 件名
  // row[5] 発行元担当者氏名: 空
  // row[6] 社内メモ: 空
  // row[7] 備考: 空
  row[8] = '内税'                 // 消費税の表示方法
  row[9] = '切り捨て'             // 消費税端数の計算方法
  row[10] = '切り捨て'            // 金額端数の計算方法
  row[11] = invoice.partnerName   // 取引先名称
  row[12] = invoice.partnerName   // 取引先宛名
  row[13] = '様'                  // 取引先敬称
  // row[14]〜row[19] 住所・部署・担当者: 空（freee側の取引先マスタに任せる）
  return row
}

function makeDetailRow(item: FreeeLineItem): string[] {
  const row = new Array(36).fill('')
  row[0] = '明細'                 // 行形式
  row[20] = '通常'                // 行の種類
  row[21] = item.description      // 摘要
  row[22] = String(item.unitPrice) // 単価
  row[23] = String(item.quantity)  // 数量
  row[24] = item.unit             // 単位
  row[25] = item.taxRate === '8' ? '8%' : '10%'  // 税率
  // row[26] 源泉徴収: 空
  // row[27] 発生日: 空
  row[28] = '売上高'              // 勘定科目
  row[29] = item.taxRate === '8' ? '課税売上8%（軽）' : '課税売上10%'  // 税区分
  return row
}

export function generateFreeeCSV(invoices: FreeeInvoiceData[]): Uint8Array {
  const lines: string[] = []

  lines.push(CSV_HEADERS.map(escapeCSV).join(','))

  for (const invoice of invoices) {
    lines.push(makeHeaderRow(invoice).map(escapeCSV).join(','))

    for (const item of invoice.items) {
      lines.push(makeDetailRow(item).map(escapeCSV).join(','))
    }
  }

  const csvString = '﻿' + lines.join('\n')
  return new TextEncoder().encode(csvString)
}
