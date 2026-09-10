// freeeがエクスポートした取引先マスターCSVをアップロードして、システム内の「freee未登録」
// リストと自動照合するためのパース処理。
//
// 背景: /admin/invoices の「取引先CSV」機能は、CSVダウンロード→freeeでインポート成功後に
// 「インポート済みにする」を手動で押すまで freee_partner_registered=false のまま残る設計のため、
// このボタンの押し忘れで「実際は登録済みだがシステム上は未登録」というズレが蓄積する。
// freee側のCSVを正として突き合わせることで、このズレを自動検知・解消する。

// freee-partner-csv.ts の CSV_HEADERS と同じ表記（一字一句同じにすること。freee公式フォーマット）。
const NAME_HEADER = '名前（通称）'

// RFC4180準拠の簡易CSVパーサー。カンマ・ダブルクォート・改行を含む値に対応する。外部ライブラリは使わない。
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const len = text.length

  while (i < len) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      if (ch === '\r' && text[i] === '\n') i++ // \r\n を1つの改行として扱う
      continue
    }

    field += ch
    i++
  }

  // 末尾に改行の無い最終行を拾う
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // 空行（フィールド1個・空文字のみの行）を除去
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/**
 * freeeがエクスポートした取引先CSVのテキストから「名前（通称）」列の値（trim済み）を配列で返す。
 * ヘッダー行から列インデックスを indexOf で探し、見つからなければ例外を投げる
 * （列の並びが違う＝想定外のCSVである可能性が高く、誤った列を照合に使うと誤爆するため）。
 */
export function parseFreeePartnerCsv(text: string): string[] {
  const rows = parseCsvRows(text)
  if (rows.length === 0) return []

  const header = rows[0]
  const nameIdx = header.indexOf(NAME_HEADER)
  if (nameIdx === -1) {
    throw new Error(`freeeの取引先CSVに「${NAME_HEADER}」列が見つかりません`)
  }

  return rows
    .slice(1)
    .map((r) => (r[nameIdx] ?? '').trim())
    .filter((name) => name.length > 0)
}

function stripBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * freeeのエクスポートCSVはUTF-8の場合とShift-JIS/cp932の場合があるため、
 * まずUTF-8での厳密デコードを試み、失敗（不正なバイト列）したらShift-JISでデコードする。
 */
export function decodeFreeeCsvFile(buffer: ArrayBuffer): string {
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return stripBOM(utf8)
  } catch {
    const sjis = new TextDecoder('shift-jis').decode(buffer)
    return stripBOM(sjis)
  }
}

export type PartnerMatchResult = {
  matchedIds: string[]
  matchedNames: string[]
  unmatchedCount: number
}

// ────────────────────────────────────────────────────────────
// freee取引先照合（請求書CSVを出す前の事前チェック）
//
// 上のCSV（freee-partner-csv.ts が生成する57列のインポート用テンプレート）とは別物。
// こちらは freee の「取引先」画面からエクスポートした、既存登録済み取引先の一覧CSV
// （実測: 56列、0列目=名前（通称）、3列目=正式名称、16列目=使用停止・使用再開）を扱う。
//
// 照合キーは必ず「名前（通称）」のみ。正式名称とは絶対に照合しないこと
// （2026年8月に「通称=ルフルー / 正式名称=ルフルーヴ」を正式名称側で一致と
//  誤判定し、検出漏れを起こした事故がある）。正式名称列はこのファイルでは
// 一切読み取らない（読み取る必要が無いようにパース対象から外している）。
// ────────────────────────────────────────────────────────────

const EXPORT_NAME_HEADER = '名前（通称）'
// freeeエクスポートCSVの「使用停止・使用再開」列。ヘッダー文言が未確認のため
// 位置（実測値）で固定する。列数チェックで想定外フォーマットを検知する。
const EXPORT_STATUS_COLUMN_INDEX = 16
const EXPORT_ACTIVE_STATUS_VALUE = '使用する'
const EXPORT_EXPECTED_MIN_COLUMN_COUNT = 56

export type FreeeExportPartner = {
  name: string
  isActive: boolean
}

/**
 * freeeの取引先エクスポートCSV（既存登録済み取引先の一覧。CP932エンコードのことが多い
 * ため decodeFreeeCsvFile でデコードしてから渡すこと）から「名前（通称）」と
 * 使用停止/使用再開ステータスを読み取る。列数が想定より少ない場合は
 * フォーマットが変わっている可能性が高いため例外を投げる（誤った列を読むと誤爆するため）。
 */
export function parseFreeeExportCsv(text: string): FreeeExportPartner[] {
  const rows = parseCsvRows(text)
  if (rows.length === 0) return []

  const header = rows[0]
  const nameIdx = header.indexOf(EXPORT_NAME_HEADER)
  if (nameIdx === -1) {
    throw new Error(`freeeの取引先エクスポートCSVに「${EXPORT_NAME_HEADER}」列が見つかりません`)
  }
  if (header.length < EXPORT_EXPECTED_MIN_COLUMN_COUNT) {
    throw new Error(
      `freeeの取引先エクスポートCSVの列数が想定と異なります（${header.length}列。想定${EXPORT_EXPECTED_MIN_COLUMN_COUNT}列以上）。フォーマットが変わっている可能性があります`
    )
  }

  return rows
    .slice(1)
    .map((r) => ({
      name: (r[nameIdx] ?? '').trim(),
      isActive: (r[EXPORT_STATUS_COLUMN_INDEX] ?? '').trim() === EXPORT_ACTIVE_STATUS_VALUE,
    }))
    .filter((p) => p.name.length > 0)
}

// Latin-1 Supplement・Latin Extended-A/B の範囲（アクセント付きラテン文字）を含むかどうか。
// freeeのエクスポートCSVはCP932エンコードのため、â/è等CP932に無い文字は
// エクスポート時に無言で削除される（例: "Pâtissière MAYO" → "Ptissire MAYO"）。
// この文字を含む社名は、実際は登録されていても文字化けにより不一致と誤判定される
// おそれがあるため、自動で「未登録」と断定せず「要目視確認」に振り分ける。
const NON_ASCII_LATIN_RE = /[À-ɏ]/

export function hasNonAsciiLatin(name: string): boolean {
  return NON_ASCII_LATIN_RE.test(name)
}

/**
 * 表記ゆれ判定用の正規化（NFKC＋空白除去＋小文字化）。あくまで「疑い」の提示にのみ使う
 * （自動修正はしない。誤爆すると請求書の宛先が壊れるため）。
 */
export function normalizeForFuzzyMatch(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

export type FreeeReconcileMissing = {
  id: string
  company_name: string
  // not_found: freeeエクスポートCSVのどの名前（通称）とも一致しなかった
  // suspended: 名前は完全一致するが、freee側で使用停止/使用再開ステータスになっている
  reason: 'not_found' | 'suspended'
}
export type FreeeReconcileFuzzy = {
  id: string
  company_name: string
  freeeSuggestions: string[]
}
export type FreeeReconcileManualCheck = {
  id: string
  company_name: string
}
export type FreeeReconcileResult = {
  missing: FreeeReconcileMissing[]
  fuzzyMatches: FreeeReconcileFuzzy[]
  needsManualCheck: FreeeReconcileManualCheck[]
  totalCompanies: number
  okCount: number
}

/**
 * その月の請求対象社（billingCompanies）を、freeeの取引先エクスポート一覧
 * （freeePartners）と突き合わせる。判定は「名前（通称）」の完全一致（バイト単位）のみ。
 * あいまい一致は自動修正せず「表記ゆれの疑い」として freee 側の綴りを提示するだけ。
 *
 * 判定の優先順位:
 *   1. 使用中のfreee取引先と完全一致 → 問題なし（okCountに計上）
 *   2. 使用停止/使用再開中のfreee取引先とだけ完全一致 → missing(reason='suspended')
 *      （名称は合っているが freee 側の状態次第でインポートが弾かれる可能性があるため警告に含める）
 *   3. 正規化した上でfreee側のいずれかの名前と一致 → fuzzyMatches（表記ゆれの疑い）
 *   4. 非ASCIIラテン文字（アクセント記号付き等）を含む → needsManualCheck
 *      （CP932エクスポートで文字が欠落し、本来一致するはずが見せかけ上「未登録」に
 *       見えている可能性があるため、自動で missing と断定しない）
 *   5. 上記いずれにも当てはまらない → missing(reason='not_found')
 */
export function reconcileFreeePartners(
  billingCompanies: { id: string; company_name: string }[],
  freeePartners: FreeeExportPartner[]
): FreeeReconcileResult {
  const activeNames = new Set(freeePartners.filter((p) => p.isActive).map((p) => p.name))
  const allNames = new Set(freeePartners.map((p) => p.name))

  const normalizedIndex = new Map<string, string[]>()
  for (const p of freeePartners) {
    const key = normalizeForFuzzyMatch(p.name)
    const list = normalizedIndex.get(key)
    if (list) {
      if (!list.includes(p.name)) list.push(p.name)
    } else {
      normalizedIndex.set(key, [p.name])
    }
  }

  const missing: FreeeReconcileMissing[] = []
  const fuzzyMatches: FreeeReconcileFuzzy[] = []
  const needsManualCheck: FreeeReconcileManualCheck[] = []
  let okCount = 0

  for (const c of billingCompanies) {
    if (activeNames.has(c.company_name)) {
      okCount++
      continue
    }
    if (allNames.has(c.company_name)) {
      missing.push({ id: c.id, company_name: c.company_name, reason: 'suspended' })
      continue
    }
    const suggestions = normalizedIndex.get(normalizeForFuzzyMatch(c.company_name))
    if (suggestions && suggestions.length > 0) {
      fuzzyMatches.push({ id: c.id, company_name: c.company_name, freeeSuggestions: suggestions })
      continue
    }
    if (hasNonAsciiLatin(c.company_name)) {
      needsManualCheck.push({ id: c.id, company_name: c.company_name })
      continue
    }
    missing.push({ id: c.id, company_name: c.company_name, reason: 'not_found' })
  }

  return { missing, fuzzyMatches, needsManualCheck, totalCompanies: billingCompanies.length, okCount }
}

/**
 * freeeのCSVから読み取った取引先名の集合と、システム内の未登録会社リストを突き合わせる。
 * company_name の完全一致のみ（表記ゆれの吸収はしない。あいまい照合は誤爆リスクがあるため、
 * ゆれがあれば人間が目視で気づいて手動対応する運用とする）。
 */
export function matchUnregisteredCompanies(
  freeeNames: string[],
  unregisteredCompanies: { id: string; company_name: string }[]
): PartnerMatchResult {
  const freeeNameSet = new Set(freeeNames)
  const matched = unregisteredCompanies.filter((c) => freeeNameSet.has(c.company_name))
  return {
    matchedIds: matched.map((c) => c.id),
    matchedNames: matched.map((c) => c.company_name),
    unmatchedCount: unregisteredCompanies.length - matched.length,
  }
}
