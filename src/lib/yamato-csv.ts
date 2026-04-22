import iconv from 'iconv-lite'

export interface ShipmentRow {
  // お届け先
  recipientPostalCode: string      // お届け先郵便番号
  recipientAddress: string         // お届け先住所（都道府県〜番地）
  recipientBuilding: string        // お届け先建物名
  recipientCompanyName: string     // お届け先会社・部門１
  recipientName: string            // お届け先名
  recipientPhone: string           // お届け先電話番号

  // お届け情報
  shipDate: string                 // 出荷予定日 (YYYY/MM/DD)
  deliveryDate?: string            // お届け予定日 (YYYY/MM/DD)
  deliveryTimeSlot?: string        // 配達時間帯
  coolType: number                 // 0=通常, 2=冷蔵（B2クラウド仕様）

  // 商品情報
  itemName: string                 // 品名１

  // 管理番号
  clientOrderNumber: string        // お客様管理番号

  // その他
  notes?: string                   // 記事
}

// ヤマトB2クラウド CSVテンプレート準拠 — 全43列
const CSV_HEADERS = [
  'お客様管理番号',        //  1
  '送り状種類',           //  2
  'クール区分',           //  3
  '伝票番号',             //  4
  '出荷予定日',           //  5
  'お届け予定日',          //  6
  '配達時間帯',           //  7
  'お届け先コード',        //  8
  'お届け先電話番号',      //  9
  'お届け先電話番号枝',    // 10
  'お届け先郵便番号',      // 11
  'お届け先住所',          // 12
  'お届け先建物名',        // 13
  'お届け先会社・部門１',   // 14
  'お届け先会社・部門２',   // 15
  'お届け先名',            // 16
  'お届け先名略称カナ',    // 17
  '敬称',                 // 18
  'ご依頼主コード',        // 19
  'ご依頼主電話番号',      // 20
  'ご依頼主電話番号枝',    // 21
  'ご依頼主郵便番号',      // 22
  'ご依頼主住所',          // 23
  'ご依頼主建物名',        // 24
  'ご依頼主名',            // 25
  'ご依頼主名略称カナ',    // 26
  '品名コード１',          // 27
  '品名１',               // 28
  '品名コード２',          // 29
  '品名２',               // 30
  '荷扱い１',             // 31
  '荷扱い２',             // 32
  '記事',                 // 33
  'コレクト代金引換額',    // 34
  'コレクト内消費税',      // 35
  '営業所止置き',          // 36
  '営業所コード',          // 37
  '発行枚数',             // 38
  '個数口枠の印字',        // 39
  'ご請求先顧客コード',    // 40
  'ご請求先分類コード',    // 41
  '運賃管理番号',          // 42
  '備考',                 // 43
]

// 善兵衛農園の依頼主情報（環境変数 or デフォルト）
function getSenderInfo() {
  return {
    name: process.env.SENDER_NAME || '善兵衛農園',
    phone: process.env.SENDER_PHONE || '08053311066',
    postalCode: process.env.SENDER_POSTAL_CODE || '6430006',
    address: process.env.SENDER_ADDRESS || '和歌山県有田郡湯浅町大字田340-3',
    building: process.env.SENDER_BUILDING || '',
  }
}

function escapeCSVField(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatShipmentRow(row: ShipmentRow): string[] {
  const sender = getSenderInfo()

  return [
    row.clientOrderNumber,         //  1: お客様管理番号
    '0',                           //  2: 送り状種類（0=発払い）
    String(row.coolType),          //  3: クール区分（0=通常, 2=冷蔵）
    '',                            //  4: 伝票番号（空=自動採番）
    row.shipDate,                  //  5: 出荷予定日
    row.deliveryDate || '',        //  6: お届け予定日
    row.deliveryTimeSlot || '',    //  7: 配達時間帯
    '',                            //  8: お届け先コード
    row.recipientPhone,            //  9: お届け先電話番号
    '',                            // 10: お届け先電話番号枝
    row.recipientPostalCode,       // 11: お届け先郵便番号
    row.recipientAddress,          // 12: お届け先住所
    row.recipientBuilding,         // 13: お届け先建物名
    row.recipientCompanyName,      // 14: お届け先会社・部門１
    '',                            // 15: お届け先会社・部門２
    row.recipientName,             // 16: お届け先名
    '',                            // 17: お届け先名略称カナ
    '',                            // 18: 敬称
    '09069864632',                 // 19: ご依頼主コード
    sender.phone,                  // 20: ご依頼主電話番号
    '',                            // 21: ご依頼主電話番号枝
    sender.postalCode,             // 22: ご依頼主郵便番号
    sender.address,                // 23: ご依頼主住所
    sender.building,               // 24: ご依頼主建物名
    sender.name,                   // 25: ご依頼主名
    '',                            // 26: ご依頼主名略称カナ
    '',                            // 27: 品名コード１
    row.itemName,                  // 28: 品名１
    '',                            // 29: 品名コード２
    '',                            // 30: 品名２
    '',                            // 31: 荷扱い１
    '',                            // 32: 荷扱い２
    row.notes || '',               // 33: 記事
    '',                            // 34: コレクト代金引換額
    '',                            // 35: コレクト内消費税
    '',                            // 36: 営業所止置き
    '',                            // 37: 営業所コード
    '1',                           // 38: 発行枚数
    '',                            // 39: 個数口枠の印字
    '',                            // 40: ご請求先顧客コード
    '',                            // 41: ご請求先分類コード
    '',                            // 42: 運賃管理番号
    '',                            // 43: 備考
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

  // Shift_JIS エンコード（B2クラウドの要求仕様）
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
