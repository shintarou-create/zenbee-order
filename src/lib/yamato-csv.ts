import iconv from 'iconv-lite'
import { formatYamatoItemName, isSetCategory } from '@/lib/quantity-format'

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
  tier_label?: string | null
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
  // 代引き（ヤマトコレクト）。codAmount・codTax の両方が入っていて codAmount > 0 のときだけ
  // 代引きモードとして扱う（どちらか欠けている・0以下の注文は従来通りの発払いで出力する）。
  codAmount?: number  // 代引き総額（税込）
  codTax?: number     // 内消費税額等
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
  // ジュースは「name + tier_quantity」、柑橘/その他のセットtierは「name + tier_label」
  // をキーに合算する（サイズ違いのセットを取り違えて合算しないため）。それ以外は name のみキー。
  type Entry = {
    key: string
    name: string
    isJuice: boolean
    tierQty: number | null
    unit: string
    isSet: boolean
    tierLabel: string | null
  }
  const ordered: Entry[] = []
  const qtyByKey = new Map<string, number>()

  for (const it of items) {
    const n = (it.product.name || '').trim()
    if (!n) continue
    const category = it.product.category || ''
    const isJuice = category.startsWith('ジュース')
    const isSet = !isJuice && isSetCategory(category) && it.tier_quantity != null
    const tierQty = isJuice && it.tier_quantity ? it.tier_quantity : null
    const key = isJuice
      ? `${n}_${tierQty ?? ''}`
      : isSet
        ? `${n}_${it.tier_label ?? ''}`
        : n
    if (!qtyByKey.has(key)) {
      ordered.push({ key, name: n, isJuice, tierQty, unit: it.product.unit || '', isSet, tierLabel: it.tier_label ?? null })
      qtyByKey.set(key, 0)
    }
    qtyByKey.set(key, (qtyByKey.get(key) || 0) + (it.quantity || 0))
  }

  const labels = ordered.map(({ key, name, isJuice, tierQty, unit, isSet, tierLabel }) => {
    const qty = qtyByKey.get(key) || 0
    // ジュース：バラ「商品名×5」/ 箱「商品名 6本入×5」（quantity-format に集約）
    if (isJuice && tierQty) return formatYamatoItemName({ name, quantity: qty, tier_quantity: tierQty })
    // 柑橘・その他のセットtier（Nkgセット等）：「商品名 2kgセット×3」形式（ジュースの
    // 「商品名 6本入×5」と同じ見た目）。quantityは実kgではなくセット数のため、
    // kg等の単位は使わずtier_labelとセット数で表す。
    if (isSet) return tierLabel ? `${name} ${tierLabel}×${qty}` : `${name} ×${qty}セット`
    // 柑橘・その他（tierなし・kgバラ）：「商品名 10kg」形式
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
  // quantity は常に実本数（ケース数ではない）。tier_quantity は表示用の内容量表記に
  // 使われるフィールドで、箱数計算には無関係。以前は tier_quantity != null のとき
  // quantity をケース数として扱っていたため、720ml 3本のような注文で
  // 「3本=3ケース=3箱」と誤計算し、柑橘1箱と合わせて4小口になるバグがあった。
  // → tier_quantity 分岐は廃止し、ジュースは常に ceil(quantity / step_qty) でケース換算する。
  //
  // さらに実運用では 720mlジュースは青果（柑橘/その他kg品）の箱に同梱できるため、
  // 青果のkg量に応じた同梱上限までは箱数に加算しない。180ml・2Lパック等の
  // 非720mlジュースは同梱対象外で、従来どおり ceil(quantity / step_qty) を加算する。

  let kgTotal = 0
  let citrusSetBoxes = 0
  let juice720Bottles = 0
  let juice720StepQty = 24
  let otherJuiceCases = 0

  for (const item of items) {
    const cat = item.product.category
    if ((cat === '柑橘' || cat === 'その他') && item.product.unit === 'kg') {
      if (item.tier_quantity != null) {
        // 「Nkgセット」等のtier経由購入（例: TATSUMI専用の2kg/5kg/10kg/20kgセット）。
        // quantity は「実kg」ではなく「購入セット数」のため kgTotal には混ぜない。
        // 1セット=1箱=1小口として扱う（セット箱は既に梱包済みのため他商品の同梱対象にもしない）。
        citrusSetBoxes += item.quantity
      } else {
        // 通常のkg売り（バラ）: quantity = 実kg。
        kgTotal += item.quantity
      }
    } else if (cat.startsWith('ジュース')) {
      if (cat.includes('720')) {
        // 720ml: 全720ml商品の実本数を合算し、後段で同梱上限を1回だけ適用する。
        // ここでの step_qty フォールバックは 24（|| 1 だと720mlで誤爆するため、
        // このジュース専用ロジックだけローカルで 24 を使う）。
        juice720Bottles += item.quantity
        juice720StepQty = item.product.step_qty || 24
      } else {
        // 180ml・2Lパック等：同梱ルール対象外。従来どおりケース換算のみ。
        const stepQty = item.product.step_qty || 1
        otherJuiceCases += Math.ceil(item.quantity / stepQty)
      }
    }
  }

  // 青果の箱数（現行と同じ）
  const kgBoxes = kgTotal > 0 ? (kgTotal <= 10 ? 1 : Math.ceil(kgTotal / 10)) : 0

  // 720mlの同梱上限（本数）。kgTotal==0（同梱先の青果箱がない）場合は同梱なし。
  let cap: number
  if (kgTotal === 0) {
    cap = 0
  } else if (kgTotal <= 4) {
    cap = 5
  } else if (kgTotal <= 7) {
    cap = 3
  } else if (kgTotal <= 9) {
    cap = 1
  } else {
    cap = 0
  }

  // 上限を超えた分だけ 720ml を別箱（24本=1箱換算）にする。
  const juice720ExtraBottles = Math.max(0, juice720Bottles - cap)
  const juice720ExtraBoxes =
    juice720ExtraBottles > 0 ? Math.ceil(juice720ExtraBottles / juice720StepQty) : 0

  // ── 検算 ──────────────────────────────────────────────
  // ・柑橘2kg + 720ml3本            → kgBoxes=1, cap=5(0<2<=4), extra=0            → total=1
  // ・柑橘なし + 720ml3本           → kgTotal=0, cap=0, extra=3, extraBoxes=1      → total=1
  // ・柑橘9kg + 720ml3本            → kgBoxes=1, cap=1(7<9<=9), extra=2, +1箱      → total=2
  // ・柑橘12kg + 720ml30本          → kgBoxes=2, cap=0(kgTotal>9), extra=30, +2箱  → total=4
  // ・柑橘2kg + 180ml30本(step=30)  → kgBoxes=1, 720mlなし, other=ceil(30/30)=1    → total=2
  // ・柑橘セット(tier_quantity=1)を3セット購入のみ → kgTotal=0, kgBoxes=0,
  //   citrusSetBoxes=3 → total=3（セット3個=3箱。3kgと誤カウントして1箱になるバグの回避）
  // ・柑橘2kgバラ + セット2セット → kgTotal=2, kgBoxes=1, citrusSetBoxes=2 → total=3
  //   （バラの箱数計算とセット箱数は独立に加算され、互いに影響しない）
  return Math.max(1, kgBoxes + otherJuiceCases + juice720ExtraBoxes + citrusSetBoxes)
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

  // 代引き（ヤマトコレクト）。codAmount・codTax の両方が入っていて codAmount > 0 のときだけ
  // 代引きモードとして扱う。代金は最初に出力される1行にのみ載せる（codAssignedで制御）。
  const isCod = order.codAmount != null && order.codTax != null && order.codAmount > 0
  const codInfo = isCod ? { amount: order.codAmount as number, tax: order.codTax as number } : null
  let codAssigned = false

  function buildRow(
    orderNum: string,
    coolType: number,
    itemName: string,
    handling1: string,
    handling2: string,
    boxCount: number,
    isMultiPackage: boolean,
    codRowInfo?: { amount: number; tax: number },
  ): string[] {
    // 公式テンプレート95列。未指定の列は全て空文字のまま出力する。
    // 列番号(1始まり) = 配列index + 1。列ズレ防止のため index 指定で代入する。
    const row: string[] = new Array(95).fill('')
    row[0]  = orderNum                                   //  1: お客様管理番号
    row[1]  = codRowInfo ? '2' : (isMultiPackage ? '6' : '0') //  2: 送り状種類（2=コレクト / 6=複数口 / 0=発払い）
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
    if (codRowInfo) {
      row[33] = String(codRowInfo.amount)                // 34: ｺﾚｸﾄ代金引換額（税込)
      row[34] = String(codRowInfo.tax)                   // 35: 内消費税額等
      row[37] = '1'                                      // 38: 発行枚数（コレクトは複数口が無いため必ず1）
      row[38] = ''                                       // 39: 個数口表示フラグ（コレクトでは使用不可）
    } else {
      // row[33]                                         // 34: ｺﾚｸﾄ代金引換額（税込)（コレクト以外は空）
      // row[34]                                         // 35: 内消費税額等（コレクト以外は空）
      row[37] = String(boxCount)                         // 38: 発行枚数
      row[38] = isMultiPackage ? '3' : ''                // 39: 個数口表示フラグ
    }
    row[39] = getYamatoCustomerCode()                    // 40: 請求先顧客コード
    // row[40]                                           // 41: 請求先分類コード
    row[41] = getYamatoFreightManagementNo()             // 42: 運賃管理番号
    row[73] = codRowInfo ? '' : (isMultiPackage ? orderNum.replace(/-/g, '') : '') // 74: 複数口くくりキー（半角英数字20文字・ハイフン不可。複数口時のみ注文番号。コレクトでは使用不可）
    return row
  }

  // 代引き対応の行追加ヘルパー。最初に呼ばれたとき（isCod && !codAssigned）だけ代引き行として
  // 積み、その温度帯の箱数が2以上なら残り(boxes-1)箱を通常の発払い（複数口可）行として
  // 追加で積む（コレクトには複数口が存在しないため）。2回目以降の呼び出しは常に通常どおり。
  function pushBandRow(
    customerMgmtNumber: string,
    coolType: number,
    itemName: string,
    handling1: string,
    handling2: string,
    boxes: number,
    normalMultiPackage: boolean,
    bandLabel: string,
  ) {
    if (codInfo && !codAssigned) {
      codAssigned = true
      rows.push(buildRow(customerMgmtNumber, coolType, itemName, handling1, handling2, 1, false, codInfo))
      if (boxes >= 2) {
        const remainderBoxes = boxes - 1
        let remainderMultiPackage = remainderBoxes >= 2
        if (remainderBoxes > 99) {
          console.warn(
            `[yamato-csv] 注文 ${order.orderNumber} の${bandLabel}残箱数が99を超過(${remainderBoxes})。複数口を無効化し発払いにフォールバックします。`,
          )
          remainderMultiPackage = false
        }
        rows.push(buildRow(`${customerMgmtNumber}-R`, coolType, itemName, handling1, handling2, remainderBoxes, remainderMultiPackage))
      }
      return
    }
    rows.push(buildRow(customerMgmtNumber, coolType, itemName, handling1, handling2, boxes, normalMultiPackage))
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
      pushBandRow(
        order.orderNumber,
        0,
        itemName,
        h1,
        h2,
        ambientBoxes,
        isMultiPackage,
        '常温',
      )
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
      pushBandRow(
        `${order.orderNumber}-${suffix}`,
        0,
        itemName,
        h1,
        h2,
        ambientBoxes,
        ambientMultiPackage,
        '常温',
      )
    }
  }

  if (coolItems.length > 0) {
    suffix++
    pushBandRow(
      typeCount > 1 ? `${order.orderNumber}-${suffix}` : order.orderNumber,
      2,  // ヤマト クール区分: 2=冷蔵
      '枇杷',
      '生物',
      '下積み厳禁',
      calcCoolBoxes(coolItems),
      false,  // クール便は複数口にできないため常に単一送り状
      'クール',
    )
  }

  if (frozenItems.length > 0) {
    suffix++
    pushBandRow(
      typeCount > 1 ? `${order.orderNumber}-${suffix}` : order.orderNumber,
      1,  // ヤマト クール区分: 1=冷凍
      '冷凍みかんジュース',
      '',
      '下積み厳禁',
      calcFrozenBoxes(frozenItems),
      false,  // クール便は複数口にできないため常に単一送り状
      '冷凍',
    )
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

// 配達時間帯の選択肢（値とラベルの対応）。新規注文作成・注文詳細の編集UIで共有する。
export const DELIVERY_TIME_SLOT_OPTIONS: { value: string; label: string }[] = [
  { value: 'morning', label: '午前中' },
  { value: 'afternoon', label: '14時〜16時' },
  { value: 'evening1', label: '16時〜18時' },
  { value: 'evening2', label: '18時〜20時' },
  { value: 'evening3', label: '19時〜21時' },
]

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
  return DELIVERY_TIME_SLOT_OPTIONS.find((o) => o.value === slot)?.label ?? slot
}
