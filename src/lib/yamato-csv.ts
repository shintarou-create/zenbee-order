import iconv from 'iconv-lite'

// ────────────────────────────────────────────────────────────
// JST 日付ユーティリティ
// ────────────────────────────────────────────────────────────

function getTodayJSTString(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

// dateStr は YYYY/MM/DD 形式で受け取る
function isAfterToday(dateStr: string): boolean {
  return dateStr > getTodayJSTString()
}

// ────────────────────────────────────────────────────────────
// 入力型定義
// ────────────────────────────────────────────────────────────

export interface ProductForCsv {
  name: string
  category: string   // 'びわ' | '柑橘' | 'ジュース' | 'その他'
  unit: string       // 'kg' | '本' | 'パック'
  step_qty: number
  cool_type: number  // 0=常温 / 1=冷蔵 / 2=冷凍
}

export interface OrderItemForCsv {
  quantity: number
  tier_quantity?: number | null
  product: ProductForCsv
}

export interface CompanyForCsv {
  postalCode: string
  prefecture: string
  city: string
  address: string
  building: string
  companyName: string
  representativeName: string
  phone: string
}

export interface OrderForCsv {
  orderNumber: string
  deliveryDate?: string  // YYYY-MM-DD or YYYY/MM/DD
  deliveryTimeSlot?: string
  notes?: string
  company: CompanyForCsv
  items: OrderItemForCsv[]
}

// ────────────────────────────────────────────────────────────
// ヤマトB2クラウド CSVヘッダー（43列固定）
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// 善兵衛農園 依頼主情報
// ────────────────────────────────────────────────────────────

function getSenderInfo() {
  return {
    name: process.env.SENDER_NAME || '善兵衛農園',
    phone: process.env.SENDER_PHONE || '08053311066',
    postalCode: process.env.SENDER_POSTAL_CODE || '6430006',
    address: process.env.SENDER_ADDRESS || '和歌山県有田郡湯浅町大字田340-3',
    building: process.env.SENDER_BUILDING || '',
  }
}

function getYamatoCustomerCode() {
  return process.env.YAMATO_CUSTOMER_CODE || '09069864632'
}

function getYamatoFreightManagementNo() {
  return process.env.YAMATO_FREIGHT_MANAGEMENT_NO || '01'
}

// ────────────────────────────────────────────────────────────
// CSV フィールドエスケープ
// ────────────────────────────────────────────────────────────

function escapeCSVField(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// ────────────────────────────────────────────────────────────
// 住所の文字数制限対応（B2クラウド上限: 全角16文字）
// ────────────────────────────────────────────────────────────

function splitAddress(
  prefecture: string,
  city: string,
  address: string,
  building: string,
): { recipientAddress: string; recipientBuilding: string } {
  const full = `${prefecture}${city}${address}`
  if (full.length <= 16) {
    return { recipientAddress: full, recipientBuilding: building }
  }
  return {
    recipientAddress: full.slice(0, 16),
    recipientBuilding: full.slice(16) + building,
  }
}

// ────────────────────────────────────────────────────────────
// 品名ロジック
// ────────────────────────────────────────────────────────────

function buildItemNameFromProducts(items: OrderItemForCsv[]): string {
  // ジュースは「name + tier_quantity」をキーに合算、それ以外は name のみキー
  type Entry = { key: string; name: string; isJuice: boolean; tierQty: number | null; unit: string }
  const ordered: Entry[] = []
  const qtyByKey = new Map<string, number>()

  for (const it of items) {
    const n = (it.product.name || '').trim()
    if (!n) continue
    const isJuice = (it.product.category || '').startsWith('ジュース')
    const tierQty = isJuice && it.tier_quantity ? it.tier_quantity : null
    const key = isJuice ? `${n}_${tierQty ?? ''}` : n
    if (!qtyByKey.has(key)) {
      ordered.push({ key, name: n, isJuice, tierQty, unit: it.product.unit || '' })
      qtyByKey.set(key, 0)
    }
    qtyByKey.set(key, (qtyByKey.get(key) || 0) + (it.quantity || 0))
  }

  const labels = ordered.map(({ key, name, isJuice, tierQty, unit }) => {
    const qty = qtyByKey.get(key) || 0
    // ジュース：「商品名 24本入×1」形式（tier_quantity がある場合）
    if (isJuice && tierQty) return `${name} ${tierQty}本入×${qty}`
    // 柑橘・その他：「商品名 10kg」形式
    return qty > 0 ? `${name} ${qty}${unit}` : name
  })

  const MAX = 25
  let result = ''
  for (const label of labels) {
    const candidate = result ? `${result}、${label}` : label
    if (candidate.length > MAX) break
    result = candidate
  }
  if (!result && labels.length > 0) result = labels[0].slice(0, MAX)
  return result
}

// ────────────────────────────────────────────────────────────
// 荷扱いロジック
// ────────────────────────────────────────────────────────────

function getAmbientHandling(cats: Set<string>): [string, string] {
  const c = cats.has('柑橘')
  const j = Array.from(cats).some(cat => cat.startsWith('ジュース'))
  const handling1 = j ? '割れ物' : c ? '生物' : ''
  const handling2 = '下積み厳禁'
  return [handling1, handling2]
}

// ────────────────────────────────────────────────────────────
// 箱数ロジック
// ────────────────────────────────────────────────────────────

function calcAmbientBoxes(items: OrderItemForCsv[]): number {
  let kgTotal = 0
  let juiceCases = 0
  for (const item of items) {
    const cat = item.product.category
    if ((cat === '柑橘' || cat === 'その他') && item.product.unit === 'kg') {
      kgTotal += item.quantity
    } else if (cat.startsWith('ジュース')) {
      if (item.tier_quantity != null) {
        // 新仕様: quantity = ケース数（tier_quantityは箱数計算不要、ケース単位で既にカウント済み）
        juiceCases += item.quantity
      } else {
        // 旧仕様: quantity = 実本数、step_qty = ケースあたり本数
        const stepQty = item.product.step_qty || 1
        juiceCases += Math.ceil(item.quantity / stepQty)
      }
    }
  }
  const kgBoxes = kgTotal > 0 ? (kgTotal <= 10 ? 1 : Math.ceil(kgTotal / 10)) : 0
  return Math.max(1, kgBoxes + juiceCases)
}

function calcCoolBoxes(items: OrderItemForCsv[]): number {
  const packs = items.reduce((sum, item) => sum + item.quantity, 0)
  return packs <= 12 ? 1 : Math.ceil(packs / 12)
}

function calcFrozenBoxes(items: OrderItemForCsv[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

// ────────────────────────────────────────────────────────────
// 1注文 → 1行または2行のCSVフィールド配列を生成
// ────────────────────────────────────────────────────────────

function orderToRows(order: OrderForCsv, shipDateStr: string): string[][] {
  const sender = getSenderInfo()
  const { company, items } = order

  const { recipientAddress, recipientBuilding } = splitAddress(
    company.prefecture,
    company.city,
    company.address,
    company.building,
  )

  const rawDelivery = order.deliveryDate ? order.deliveryDate.replace(/-/g, '/') : ''
  const deliveryDate = rawDelivery && isAfterToday(rawDelivery) ? rawDelivery : ''

  // cool_type でベース分類: 0=常温 / 1=冷蔵(びわ) / 2=冷凍(20Lジュース)
  // DB制約の都合でびわが誤って cool_type=2 になっている場合も unit='個' で冷凍ジュースのみを識別
  const frozenItems = items.filter(i => i.product.cool_type === 2 && i.product.unit === '個')
  const coolItems = items.filter(i => i.product.cool_type === 1 || (i.product.cool_type === 2 && i.product.unit === 'パック'))
  const ambientItems = items.filter(i => i.product.cool_type === 0)
  const typeCount = [ambientItems, coolItems, frozenItems].filter(a => a.length > 0).length

  function buildRow(
    orderNum: string,
    coolType: number,
    itemName: string,
    handling1: string,
    handling2: string,
    boxCount: number,
    isMultiPackage: boolean,
  ): string[] {
    return [
      orderNum,                                    //  1: お客様管理番号
      isMultiPackage ? '6' : '0',                  //  2: 送り状種類（6=複数口 / 0=発払い）
      String(coolType),                            //  3: クール区分
      '',                                          //  4: 伝票番号（自動採番）
      shipDateStr,                                 //  5: 出荷予定日
      deliveryDate,                                //  6: お届け予定日
      formatDeliveryTimeSlot(order.deliveryTimeSlot),   //  7: 配達時間帯
      '',                                          //  8: お届け先コード
      company.phone.replace(/-/g, ''),             //  9: お届け先電話番号
      '',                                          // 10: お届け先電話番号枝
      company.postalCode.replace('-', ''),         // 11: お届け先郵便番号
      recipientAddress,                            // 12: お届け先住所
      recipientBuilding,                           // 13: お届け先建物名
      company.companyName,                         // 14: お届け先会社・部門１
      '',                                          // 15: お届け先会社・部門２
      company.representativeName,                  // 16: お届け先名
      '',                                          // 17: お届け先名略称カナ
      '',                                          // 18: 敬称
      getYamatoCustomerCode(),                       // 19: ご依頼主コード
      sender.phone,                                // 20: ご依頼主電話番号
      '',                                          // 21: ご依頼主電話番号枝
      sender.postalCode,                           // 22: ご依頼主郵便番号
      sender.address,                              // 23: ご依頼主住所
      sender.building,                             // 24: ご依頼主建物名
      sender.name,                                 // 25: ご依頼主名
      '',                                          // 26: ご依頼主名略称カナ
      '',                                          // 27: 品名コード１
      itemName,                                    // 28: 品名１
      '',                                          // 29: 品名コード２
      '',                                          // 30: 品名２
      handling1,                                   // 31: 荷扱い１
      handling2,                                   // 32: 荷扱い２
      '',                                          // 33: 記事（備考はヤマト伝票に出さない）
      '',                                          // 34: コレクト代金引換額
      '',                                          // 35: コレクト内消費税
      '',                                          // 36: 営業所止置き
      '',                                          // 37: 営業所コード
      String(boxCount),                            // 38: 発行枚数
      isMultiPackage ? '3' : '',                   // 39: 個数口枠の印字
      getYamatoCustomerCode(),                       // 40: ご請求先顧客コード
      '',                                          // 41: ご請求先分類コード
      getYamatoFreightManagementNo(),              // 42: 運賃管理番号
      '',                                          // 43: 備考
    ]
  }

  const rows: string[][] = []
  let suffix = 0

  if (ambientItems.length > 0) {
    suffix++
    const cats = new Set(ambientItems.map(i => i.product.category))
    const [h1, h2] = getAmbientHandling(cats)
    const ambientBoxes = calcAmbientBoxes(ambientItems)
    // 常温が2箱以上なら複数口（送り状種類6）。発行枚数の上限99超は
    // ヤマト仕様外のため通常の発払い（単一送り状）にフォールバックする。
    let ambientMultiPackage = ambientBoxes >= 2
    if (ambientBoxes > 99) {
      console.warn(
        `[yamato-csv] 注文 ${order.orderNumber} の常温箱数が99を超過(${ambientBoxes})。複数口を無効化し発払いにフォールバックします。`,
      )
      ambientMultiPackage = false
    }
    rows.push(buildRow(
      typeCount > 1 ? `${order.orderNumber}-${suffix}` : order.orderNumber,
      0,
      buildItemNameFromProducts(ambientItems),
      h1,
      h2,
      ambientBoxes,
      ambientMultiPackage,
    ))
  }

  if (coolItems.length > 0) {
    suffix++
    rows.push(buildRow(
      typeCount > 1 ? `${order.orderNumber}-${suffix}` : order.orderNumber,
      2,  // ヤマト クール区分: 2=冷蔵
      '枇杷',
      '生物',
      '下積み厳禁',
      calcCoolBoxes(coolItems),
      false,  // クール便は複数口にできないため常に単一送り状
    ))
  }

  if (frozenItems.length > 0) {
    suffix++
    rows.push(buildRow(
      typeCount > 1 ? `${order.orderNumber}-${suffix}` : order.orderNumber,
      1,  // ヤマト クール区分: 1=冷凍
      '冷凍みかんジュース',
      '',
      '下積み厳禁',
      calcFrozenBoxes(frozenItems),
      false,  // クール便は複数口にできないため常に単一送り状
    ))
  }

  return rows
}

// ────────────────────────────────────────────────────────────
// 公開 API
// ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function generateYamatoCsv(orders: OrderForCsv[], shipDate: string): Uint8Array {
  const shipDateStr = getTodayJSTString()
  const lines: string[] = [CSV_HEADERS.map(escapeCSVField).join(',')]

  for (const order of orders) {
    for (const row of orderToRows(order, shipDateStr)) {
      lines.push(row.map(escapeCSVField).join(','))
    }
  }

  const csvText = lines.join('\r\n')
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
