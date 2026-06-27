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
// ヤマトB2クラウド CSVヘッダー（基本レイアウト 49項目固定）
// 「外部データから発行 → 基本レイアウト(csv,xls,xlsx)」の並びに一致させる
// ────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'お客様管理番号',           //  1
  '送り状種類',              //  2
  'クール区分',              //  3
  'お届け先コード',           //  4
  'お届け先電話番号',         //  5
  'お届け先電話番号枝番',     //  6
  'お届け先名',              //  7
  'お届け先郵便番号',         //  8
  'お届け先住所',             //  9
  'お届け先建物名',           // 10
  'お届け先会社・部門名１',    // 11
  'お届け先会社・部門名２',    // 12
  'お届け先名略称カナ',       // 13
  '敬称',                    // 14
  'ご依頼主コード',           // 15
  'ご依頼主電話番号',         // 16
  'ご依頼主電話番号枝番',     // 17
  'ご依頼主名',              // 18
  'ご依頼主郵便番号',         // 19
  'ご依頼主住所',             // 20
  'ご依頼主建物名',           // 21
  'ご依頼主名略称カナ',       // 22
  '品名コード１',             // 23
  '品名１',                  // 24
  '品名コード２',             // 25
  '品名２',                  // 26
  '荷扱い１',                // 27
  '荷扱い２',                // 28
  '記事',                    // 29
  'お届け予定（指定）日',      // 30
  '配達時間帯区分',           // 31
  'コレクト代金引換額',        // 32
  'コレクト内消費税額等',      // 33
  '営業所止置き',             // 34
  '営業所コード',             // 35
  '個数口枠の印字',           // 36
  '発行枚数',                // 37
  'ご請求先顧客コード',        // 38
  'ご請求先分類コード',        // 39
  '運賃管理番号',             // 40
  'お届け予定ｅメール利用区分', // 41
  'お届け予定ｅメールアドレス', // 42
  '入力機種',                // 43
  'お届け完了ｅメール利用区分', // 44
  'お届け完了ｅメールアドレス', // 45
  'お届け完了ｅメールメッセージ', // 46
  'お届け予定ｅメールメッセージ', // 47
  '複数口くくりキー',          // 48
  '検索キータイトル１',        // 49
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

function orderToRows(order: OrderForCsv): string[][] {
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
      '',                                          //  4: お届け先コード
      company.phone.replace(/-/g, ''),             //  5: お届け先電話番号
      '',                                          //  6: お届け先電話番号枝番
      company.representativeName,                  //  7: お届け先名
      company.postalCode.replace('-', ''),         //  8: お届け先郵便番号
      recipientAddress,                            //  9: お届け先住所
      recipientBuilding,                           // 10: お届け先建物名
      company.companyName,                         // 11: お届け先会社・部門名１
      '',                                          // 12: お届け先会社・部門名２
      '',                                          // 13: お届け先名略称カナ
      '',                                          // 14: 敬称
      getYamatoCustomerCode(),                     // 15: ご依頼主コード
      sender.phone,                                // 16: ご依頼主電話番号
      '',                                          // 17: ご依頼主電話番号枝番
      sender.name,                                 // 18: ご依頼主名
      sender.postalCode,                           // 19: ご依頼主郵便番号
      sender.address,                              // 20: ご依頼主住所
      sender.building,                             // 21: ご依頼主建物名
      '',                                          // 22: ご依頼主名略称カナ
      '',                                          // 23: 品名コード１
      itemName,                                    // 24: 品名１
      '',                                          // 25: 品名コード２
      '',                                          // 26: 品名２
      handling1,                                   // 27: 荷扱い１
      handling2,                                   // 28: 荷扱い２
      '',                                          // 29: 記事
      deliveryDate,                                // 30: お届け予定（指定）日
      toYamatoTimeSlotCode(order.deliveryTimeSlot),// 31: 配達時間帯区分（ヤマトコード）
      '',                                          // 32: コレクト代金引換額
      '',                                          // 33: コレクト内消費税額等
      '',                                          // 34: 営業所止置き
      '',                                          // 35: 営業所コード
      isMultiPackage ? '3' : '',                   // 36: 個数口枠の印字
      String(boxCount),                            // 37: 発行枚数
      getYamatoCustomerCode(),                     // 38: ご請求先顧客コード
      '',                                          // 39: ご請求先分類コード
      getYamatoFreightManagementNo(),              // 40: 運賃管理番号
      '',                                          // 41: お届け予定ｅメール利用区分
      '',                                          // 42: お届け予定ｅメールアドレス
      '',                                          // 43: 入力機種
      '',                                          // 44: お届け完了ｅメール利用区分
      '',                                          // 45: お届け完了ｅメールアドレス
      '',                                          // 46: お届け完了ｅメールメッセージ
      '',                                          // 47: お届け予定ｅメールメッセージ
      isMultiPackage ? orderNum : '',              // 48: 複数口くくりキー（複数口時のみ注文番号）
      '',                                          // 49: 検索キータイトル１
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
  const lines: string[] = [CSV_HEADERS.map(escapeCSVField).join(',')]

  for (const order of orders) {
    for (const row of orderToRows(order)) {
      lines.push(row.map(escapeCSVField).join(','))
    }
  }

  const csvText = lines.join('\r\n')
  const encoded = iconv.encode(csvText, 'Shift_JIS')
  return new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength)
}

// ヤマトB2クラウド「外部データ取込」用：配達時間帯を半角4桁コードに変換する。
// formatDeliveryTimeSlot（画面表示用の日本語ラベル）とはキーを共有するが用途が異なる。
function toYamatoTimeSlotCode(slot: string | null | undefined): string {
  if (!slot) return ''
  const codes: Record<string, string> = {
    'morning':  '0812',
    'afternoon':'1416',
    'evening1': '1618',
    'evening2': '1820',
    'evening3': '1921',
  }
  return codes[slot] || ''   // 未知の値は空（指定なし）にフォールバック
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
