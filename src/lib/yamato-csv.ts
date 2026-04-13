import iconv from 'iconv-lite'

export interface ShipmentRow {
  // お届け先
  recipientPostalCode: string      // お届け先郵便番号
  recipientAddress1: string        // お届け先住所1
  recipientAddress2: string        // お届け先住所2
  recipientAddress3?: string       // お届け先住所3
  recipientCompanyName: string     // お届け先会社名・名称
  recipientName: string            // お届け先名前
  recipientPhone: string           // お届け先電話番号

  // お届け情報
  shipDate: string                 // 発送予定日 (YYYY/MM/DD)
  deliveryDate?: string            // 配達予定日 (YYYY/MM/DD)
  deliveryTimeSlot?: string        // 配達時間帯
  coolType: number                 // 0=通常 1=冷蔵

  // 商品情報
  itemName: string                 // 品名
  quantity: number                 // 個数
  weight?: number                  // 重量

  // 管理番号
  clientOrderNumber: string        // お客様管理番号

  // その他
  notes?: string                   // 備考
}

// ヤマトB2クラウド CSV ヘッダー定義
const CSV_HEADERS = [
  'お客様管理番号',
  '送り状種類',
  'クール区分',
  '伝票番号',
  '出荷予定日',
  'お届け予定日',
  '配達時間帯',
  'お届け先コード',
  'お届け先電話番号',
  'お届け先電話番号枝番',
  'お届け先郵便番号',
  'お届け先住所',
  'お届け先住所（アパートマンション名）',
  'お届け先会社・部門１',
  'お届け先会社・部門２',
  'お届け先名',
  'お届け先名略称',
  'ご依頼主コード',
  'ご依頼主電話番号',
  'ご依頼主電話番号枝番',
  'ご依頼主郵便番号',
  'ご依頼主住所',
  'ご依頼主住所（アパートマンション名）',
  'ご依頼主名',
  '品名',
  '荷姿コード',
  '重量',
  'サイズコード',
  '請求先顧客コード',
  '請求先分類コード',
  '運賃管理番号',
  '発行枚数',
  '個数口表示フラグ',
  '請求金額',
  '消費税',
  '内税',
  '外税',
  '割引額',
  '割引率',
  '記事',
]

function escapeCSVField(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // カンマ、改行、ダブルクォートを含む場合はダブルクォートで囲む
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatShipmentRow(row: ShipmentRow): string[] {
  const senderName = process.env.SENDER_NAME || '善兵衛農園'
  const senderPhone = process.env.SENDER_PHONE || ''
  const senderPostalCode = process.env.SENDER_POSTAL_CODE || ''
  const senderAddress1 = process.env.SENDER_ADDRESS1 || ''
  const senderAddress2 = process.env.SENDER_ADDRESS2 || ''

  // クール区分: 0=通常, 1=冷蔵 → ヤマト形式: 0=通常, 2=冷蔵
  const coolCode = row.coolType === 1 ? '2' : '0'

  // 送り状種類: 0=発払い
  const invoiceType = '0'

  return [
    row.clientOrderNumber,           // お客様管理番号
    invoiceType,                     // 送り状種類
    coolCode,                        // クール区分
    '',                              // 伝票番号（空欄=自動採番）
    row.shipDate,                    // 出荷予定日
    row.deliveryDate || '',          // お届け予定日
    row.deliveryTimeSlot || '',      // 配達時間帯
    '',                              // お届け先コード
    row.recipientPhone,              // お届け先電話番号
    '',                              // お届け先電話番号枝番
    row.recipientPostalCode,         // お届け先郵便番号
    row.recipientAddress1,           // お届け先住所
    row.recipientAddress2,           // お届け先住所（アパートマンション名）
    row.recipientCompanyName,        // お届け先会社・部門１
    '',                              // お届け先会社・部門２
    row.recipientName,               // お届け先名
    '',                              // お届け先名略称
    '',                              // ご依頼主コード
    senderPhone,                     // ご依頼主電話番号
    '',                              // ご依頼主電話番号枝番
    senderPostalCode,                // ご依頼主郵便番号
    senderAddress1,                  // ご依頼主住所
    senderAddress2,                  // ご依頼主住所（アパートマンション名）
    senderName,                      // ご依頼主名
    row.itemName,                    // 品名
    '',                              // 荷姿コード
    row.weight ? String(row.weight) : '',  // 重量
    '',                              // サイズコード
    '',                              // 請求先顧客コード
    '',                              // 請求先分類コード
    '',                              // 運賃管理番号
    '1',                             // 発行枚数
    '0',                             // 個数口表示フラグ
    '',                              // 請求金額
    '',                              // 消費税
    '',                              // 内税
    '',                              // 外税
    '',                              // 割引額
    '',                              // 割引率
    row.notes || '',                 // 記事
  ]
}

export function generateB2CSV(rows: ShipmentRow[]): Uint8Array {
  const lines: string[] = []

  // ヘッダー行
  lines.push(CSV_HEADERS.map(escapeCSVField).join(','))

  // データ行
  for (const row of rows) {
    const fields = formatShipmentRow(row)
    lines.push(fields.map(escapeCSVField).join(','))
  }

  // CRLF改行でJoin
  const csvText = lines.join('\r\n')

  // Shift_JIS エンコード（BOMなし）
  const encoded = iconv.encode(csvText, 'Shift_JIS')
  return new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength)
}

export function formatDeliveryTimeSlot(slot: string | null | undefined): string {
  if (!slot) return ''
  const slots: Record<string, string> = {
    'morning': '午前中',
    'afternoon': '14時〜16時',
    'evening1': '16時〜18時',
    'evening2': '18時〜20時',
    'evening3': '19時〜21時',
  }
  return slots[slot] || slot
}
