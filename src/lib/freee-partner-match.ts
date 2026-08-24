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
