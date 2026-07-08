import iconv from 'iconv-lite'
import { formatYamatoItemName } from '@/lib/quantity-format'

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
  // 口数（箱数）の根拠。order_shipping（送料行）の本数。
  // 送料行は quantity 常に1で保存されるため「送料行の本数 = 箱数 = 口数」。
  // 未指定/0 の注文は最低1口として扱う。
  shippingCount?: number
  company: CompanyForCsv
  items: OrderItemForCsv[]
}

// ────────────────────────────────────────────────────────────
// ヤマトB2クラウド CSVヘッダー（公式テンプレート newb2web_template1.xls 準拠・全95列）
// 取込みファイルの実列順。紐付け設定画面の見た目順とは異なるため注意。
// ────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'お客様管理番号',                                  //  1
  '送り状種類',                                      //  2
  'クール区分',                                      //  3
  '伝票番号',                                        //  4
  '出荷予定日',                                      //  5
  'お届け予定日',                                    //  6
  '配達時間帯',                                      //  7
  'お届け先コード',                                  //  8
  'お届け先電話番号',                                //  9
  'お届け先電話番号枝番',                            // 10
  'お届け先郵便番号',                                // 11
  'お届け先住所',                                    // 12
  'お届け先アパートマンション名',                    // 13
  'お届け先会社・部門１',                            // 14
  'お届け先会社・部門２',                            // 15
  'お届け先名',                                      // 16
  'お届け先名(ｶﾅ)',                                  // 17
  '敬称',                                            // 18
  'ご依頼主コード',                                  // 19
  'ご依頼主電話番号',                                // 20
  'ご依頼主電話番号枝番',                            // 21
  'ご依頼主郵便番号',                                // 22
  'ご依頼主住所',                                    // 23
  'ご依頼主アパートマンション',                      // 24
  'ご依頼主名',                                      // 25
  'ご依頼主名(ｶﾅ)',                                  // 26
  '品名コード１',                                    // 27
  '品名１',                                          // 28
  '品名コード２',                                    // 29
  '品名２',                                          // 30
  '荷扱い１',                                        // 31
  '荷扱い２',                                        // 32
  '記事',                                            // 33
  'ｺﾚｸﾄ代金引換額（税込)',                            // 34
  '内消費税額等',                                    // 35
  '止置き',                                          // 36
  '営業所コード',                                    // 37
  '発行枚数',                                        // 38
  '個数口表示フラグ',                                // 39
  '請求先顧客コード',                                // 40
  '請求先分類コード',                                // 41
  '運賃管理番号',                                    // 42
  'クロネコwebコレクトデータ登録',                   // 43
  'クロネコwebコレクト加盟店番号',                   // 44
  'クロネコwebコレクト申込受付番号１',               // 45
  'クロネコwebコレクト申込受付番号２',               // 46
  'クロネコwebコレクト申込受付番号３',               // 47
  'お届け予定ｅメール利用区分',                      // 48
  'お届け予定ｅメールe-mailアドレス',                // 49
  '入力機種',                                        // 50
  'お届け予定ｅメールメッセージ',                    // 51
  'お届け完了ｅメール利用区分',                      // 52
  'お届け完了ｅメールe-mailアドレス',                // 53
  'お届け完了ｅメールメッセージ',                    // 54
  'クロネコ収納代行利用区分',                        // 55
  '予備',                                            // 56
  '収納代行請求金額(税込)',                          // 57
  '収納代行内消費税額等',                            // 58
  '収納代行請求先郵便番号',                          // 59
  '収納代行請求先住所',                              // 60
  '収納代行請求先住所（アパートマンション名）',      // 61
  '収納代行請求先会社・部門名１',                    // 62
  '収納代行請求先会社・部門名２',                    // 63
  '収納代行請求先名(漢字)',                          // 64
  '収納代行請求先名(カナ)',                          // 65
  '収納代行問合せ先名(漢字)',                        // 66
  '収納代行問合せ先郵便番号',                        // 67
  '収納代行問合せ先住所',                            // 68
  '収納代行問合せ先住所（アパートマンション名）',    // 69
  '収納代行問合せ先電話番号',                        // 70
  '収納代行管理番号',                                // 71
  '収納代行品名',                                    // 72
  '収納代行備考',                                    // 73
  '複数口くくりキー',                                // 74
  '検索キータイトル1',                               // 75
  '検索キー1',                                       // 76
  '検索キータイトル2',                               // 77
  '検索キー2',                                       // 78
  '検索キータイトル3',                               // 79
  '検索キー3',                                       // 80
  '検索キータイトル4',                               // 81
  '検索キー4',                                       // 82
  '検索キータイトル5',                               // 83
  '検索キー5',                                       // 84
  '予備',                                            // 85
  '予備',                                            // 86
  '投函予定メール利用区分',                          // 87
  '投函予定メールe-mailアドレス',                    // 88
  '投函予定メールメッセージ',                        // 89
  '投函完了メール（お届け先宛）利用区分',            // 90
  '投函完了メール（お届け先宛）e-mailアドレス',      // 91
  '投函完了メール（お届け先宛）メールメッセージ',    // 92
  '投函完了メール（ご依頼主宛）利用区分',            // 93
  '投函完了メール（ご依頼主宛）e-mailアドレス',      // 94
  '投函完了メール（ご依頼主宛）メールメッセージ',    // 95
]

// 列ズレ防止：公式テンプレートは必ず95列
if (CSV_HEADERS.length !== 95) {
  throw new Error(`[yamato-csv] CSV_HEADERS は95列でなければなりません（現在: ${CSV_HEADERS.length}）`)
}

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
    // ジュース：バラ「商品名×5」/ 箱「商品名 6本入×5」（quantity-format に集約）
    if (isJuice && tierQty) return formatYamatoItemName({ name, quantity: qty, tier_quantity: tierQty })
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

function orderToRows(order: OrderForCsv, shipDate: string): string[][] {
  const sender = getSenderInfo()
  const { company, items } = order

  // 画面入力(<input type="date">)は YYYY-MM-DD。CSVの出荷予定日列は YYYY/MM/DD。
  // 単なる日付文字列のためTZ曖昧性は発生しない。ハイフン→スラッシュに統一する。
  const shipDateStr = shipDate.replace(/-/g, '/')

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
    // 公式テンプレート95列。未指定の列は全て空文字のまま出力する。
    // 列番号(1始まり) = 配列index + 1。列ズレ防止のため index 指定で代入する。
    const row: string[] = new Array(95).fill('')
    row[0]  = orderNum                                   //  1: お客様管理番号
    row[1]  = isMultiPackage ? '6' : '0'                 //  2: 送り状種類（6=複数口 / 0=発払い）
    row[2]  = String(coolType)                           //  3: クール区分
    // row[3]                                            //  4: 伝票番号（B2自動付与・空欄）
    row[4]  = shipDateStr                                //  5: 出荷予定日（画面で選んだ発送日 YYYY/MM/DD）
    row[5]  = deliveryDate                               //  6: お届け予定日（各注文の delivery_date 由来・別物）
    row[6]  = toYamatoTimeSlotCode(order.deliveryTimeSlot) //  7: 配達時間帯（ヤマトコード）
    // row[7]                                            //  8: お届け先コード（空）
    row[8]  = company.phone.replace(/-/g, '')            //  9: お届け先電話番号
    // row[9]                                            // 10: お届け先電話番号枝番
    row[10] = company.postalCode.replace('-', '')        // 11: お届け先郵便番号
    row[11] = recipientAddress                           // 12: お届け先住所
    row[12] = recipientBuilding                          // 13: お届け先アパートマンション名
    row[13] = company.companyName                        // 14: お届け先会社・部門１
    // row[14]                                           // 15: お届け先会社・部門２
    row[15] = company.representativeName                 // 16: お届け先名
    // row[16]                                           // 17: お届け先名(ｶﾅ)
    // row[17]                                           // 18: 敬称
    // row[18]                                           // 19: ご依頼主コード（空）
    row[19] = sender.phone                               // 20: ご依頼主電話番号
    // row[20]                                           // 21: ご依頼主電話番号枝番
    row[21] = sender.postalCode                          // 22: ご依頼主郵便番号
    row[22] = sender.address                             // 23: ご依頼主住所
    row[23] = sender.building                            // 24: ご依頼主アパートマンション
    row[24] = sender.name                                // 25: ご依頼主名
    // row[25]                                           // 26: ご依頼主名(ｶﾅ)
    // row[26]                                           // 27: 品名コード１
    row[27] = itemName                                   // 28: 品名１
    // row[28]                                           // 29: 品名コード２
    // row[29]                                           // 30: 品名２
    row[30] = handling1                                  // 31: 荷扱い１
    row[31] = handling2                                  // 32: 荷扱い２
    // row[32]                                           // 33: 記事
    row[37] = String(boxCount)                           // 38: 発行枚数
    row[38] = isMultiPackage ? '3' : ''                  // 39: 個数口表示フラグ
    row[39] = getYamatoCustomerCode()                    // 40: 請求先顧客コード
    // row[40]                                           // 41: 請求先分類コード
    row[41] = getYamatoFreightManagementNo()             // 42: 運賃管理番号
    row[73] = isMultiPackage ? orderNum.replace(/-/g, '') : '' // 74: 複数口くくりキー（半角英数字20文字・ハイフン不可。複数口時のみ注文番号）
    return row
  }

  const rows: string[][] = []
  let suffix = 0

  if (ambientItems.length > 0) {
    suffix++
    const cats = new Set(ambientItems.map(i => i.product.category))
    const [h1, h2] = getAmbientHandling(cats)
    const itemName = buildItemNameFromProducts(ambientItems)

    if (typeCount === 1) {
      // 単一温度帯（常温のみ）。口数は kg箱数（10kg基準）で決める。
      // calcAmbientBoxes が唯一の根拠（柑橘=ceil(kg/10)・ジュース1ケース1箱・その他1箱）。
      // 送料行の本数や order.shippingCount には依存しない（kg実態を反映するため）。
      const ambientBoxes = calcAmbientBoxes(ambientItems)
      // 2箱以上なら複数口（送り状種類6）。発行枚数の上限99超はヤマト仕様外のため
      // 通常の発払い（単一送り状）にフォールバックする（混載側と同じ扱い）。
      let isMultiPackage = ambientBoxes >= 2
      if (ambientBoxes > 99) {
        console.warn(
          `[yamato-csv] 注文 ${order.orderNumber} の常温箱数が99を超過(${ambientBoxes})。複数口を無効化し発払いにフォールバックします。`,
        )
        isMultiPackage = false
      }
      // 複数口でも行は1行のみ。発行枚数(row[37])=N をB2が展開する。
      // 行を口数ぶん複製すると「行数 × 発行枚数」で二重計上されるため複製しない。
      rows.push(buildRow(
        order.orderNumber,
        0,
        itemName,
        h1,
        h2,
        ambientBoxes,
        isMultiPackage,
      ))
    } else {
      // 混載（常温＋クール/冷凍）。送料行はクール区分を持たず温度帯に按分できないため、
      // 従来の箱数換算ロジックを維持し、温度帯ごとに別々の送り状として出力する。
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
        `${order.orderNumber}-${suffix}`,
        0,
        itemName,
        h1,
        h2,
        ambientBoxes,
        ambientMultiPackage,
      ))
    }
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

export function generateYamatoCsv(orders: OrderForCsv[], shipDate: string): Uint8Array {
  const lines: string[] = [CSV_HEADERS.map(escapeCSVField).join(',')]

  for (const order of orders) {
    for (const row of orderToRows(order, shipDate)) {
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
