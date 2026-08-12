// フェーズD検証: レガシー取込（sheet_legacy）と発注システム（order_system）を突き合わせる。
// 1) 第5期・第6期の月別卸売上（source_type別内訳）
// 2) 2026年6月以降の重複チェック（自動削除はしない。一覧を報告するのみ）
// 3) 品種別集計（第5期 vs 第6期）
// 4) product_id が null の行の件数と variety_label 一覧
//
// 使い方: npm run verify:legacy-wholesale

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { fetchAllRows, fetchInChunksByIds } from '../src/lib/supabase-batch'
import { getFiscalMonths } from '../src/lib/fiscal-year'

const CHANNEL_CODE = 'wholesale'
const ID_CHUNK_SIZE = 200

function yen(n: number): string {
  return n.toLocaleString('ja-JP')
}

// 表記ゆれ吸収: 空白除去+小文字化+全角半角統一(NFKC)
function normalizeDest(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

const csvCache = new Map<string, string[][]>()
function loadCsv(sheetLabel: string): string[][] {
  if (!csvCache.has(sheetLabel)) {
    const content = readFileSync(`data/legacy-${sheetLabel}.csv`, 'utf-8')
    csvCache.set(sheetLabel, parse(content, { relax_column_count: true }) as string[][])
  }
  return csvCache.get(sheetLabel)!
}

// source_ref='{sheet}:{row}' から元CSVの送り先を引く
function destFromSourceRef(sourceRef: string): string | null {
  const [sheet, rowStr] = sourceRef.split(':')
  const row = parseInt(rowStr, 10)
  const rows = loadCsv(sheet)
  const csvRow = rows[row - 1]
  if (!csvRow) return null
  const destCol = sheet === '2026' ? 3 : 2
  return csvRow[destCol] || null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です')
  }
  const supabase = createClient(url, key)

  type FactRow = {
    fiscal_year: number
    fiscal_month: string
    source_type: string
    sale_date: string
    product_id: string | null
    variety_label: string
    quantity_kg: number | null
    quantity_raw: number | null
    unit: string | null
    gross_sales_incl_tax: number
    shipping_revenue: number
    source_ref: string | null
  }

  const allFacts = await fetchAllRows<FactRow>((f, t) =>
    supabase
      .from('sales_facts')
      .select('fiscal_year, fiscal_month, source_type, sale_date, product_id, variety_label, quantity_kg, quantity_raw, unit, gross_sales_incl_tax, shipping_revenue, source_ref')
      .eq('channel_code', CHANNEL_CODE)
      .range(f, t),
  )
  console.log(`[verify-legacy-wholesale] sales_facts（wholesale）全件: ${allFacts.length}件\n`)

  // ============================================================
  // 1) 第5期・第6期の月別卸売上（source_type別内訳）
  // ============================================================
  console.log('=== 1. 第5期・第6期 月別卸売上（source_type別）===\n')
  console.log('月       order_system    sheet_legacy    合計')
  for (const fy of [5, 6]) {
    for (const month of getFiscalMonths(fy)) {
      const rows = allFacts.filter((r) => r.fiscal_month === month)
      const bySource: Record<string, number> = {}
      for (const r of rows) {
        bySource[r.source_type] = (bySource[r.source_type] ?? 0) + r.gross_sales_incl_tax + r.shipping_revenue
      }
      const os = bySource['order_system'] ?? 0
      const sl = bySource['sheet_legacy'] ?? 0
      console.log(`${month}   ${yen(os).padStart(10)}      ${yen(sl).padStart(10)}      ${yen(os + sl).padStart(10)}`)
    }
    const fyRows = allFacts.filter((r) => r.fiscal_year === fy)
    const fyOs = fyRows.filter((r) => r.source_type === 'order_system').reduce((s, r) => s + r.gross_sales_incl_tax + r.shipping_revenue, 0)
    const fySl = fyRows.filter((r) => r.source_type === 'sheet_legacy').reduce((s, r) => s + r.gross_sales_incl_tax + r.shipping_revenue, 0)
    console.log(`--- 第${fy}期合計 ---   ${yen(fyOs).padStart(10)}      ${yen(fySl).padStart(10)}      ${yen(fyOs + fySl).padStart(10)}\n`)
  }

  // ============================================================
  // 2) 2026年6月以降の重複チェック
  // ============================================================
  console.log('=== 2. 2026年6月以降の重複チェック ===\n')
  const CUTOFF = '2026-06-01'
  const legacyJunePlus = allFacts.filter((r) => r.source_type === 'sheet_legacy' && r.sale_date >= CUTOFF)
  const orderSystemJunePlus = allFacts.filter((r) => r.source_type === 'order_system' && r.sale_date >= CUTOFF)
  console.log(`sheet_legacy（${CUTOFF}以降）: ${legacyJunePlus.length}件`)
  console.log(`order_system（${CUTOFF}以降）: ${orderSystemJunePlus.length}件`)

  const legacyMaxDate = allFacts.filter((r) => r.source_type === 'sheet_legacy').reduce((m, r) => (r.sale_date > m ? r.sale_date : m), '')
  const orderSystemMinDate = allFacts.filter((r) => r.source_type === 'order_system').reduce((m, r) => (m === '' || r.sale_date < m ? r.sale_date : m), '')
  console.log(`sheet_legacy 最終納品日: ${legacyMaxDate}`)
  console.log(`order_system 最初の納品日: ${orderSystemMinDate}`)

  if (legacyJunePlus.length === 0) {
    console.log(`→ sheet_legacyに${CUTOFF}以降のデータが存在しないため、日付ベースでは重複は構造的に発生しません。\n`)
  }

  // 追加の安全策: 日付の境界をまたいだ二重記帳を疑い、
  // レガシー側の最終2週間 と 発注システム側の最初の2週間 を「取引先(正規化)＋金額」で突合する
  // （日付が多少ズレて二重登録された場合を拾うため、日付の完全一致は条件にしない）。
  console.log('--- 追加チェック: 移行期（レガシー最終14日 vs 発注システム最初14日）の 取引先＋金額 突合 ---')
  const legacyWindowStart = shiftDate(legacyMaxDate, -13)
  const orderSystemWindowEnd = shiftDate(orderSystemMinDate, 13)
  console.log(`レガシー側ウィンドウ: ${legacyWindowStart} 〜 ${legacyMaxDate}`)
  console.log(`発注システム側ウィンドウ: ${orderSystemMinDate} 〜 ${orderSystemWindowEnd}`)

  const legacyWindowRows = allFacts.filter(
    (r) => r.source_type === 'sheet_legacy' && r.sale_date >= legacyWindowStart && r.sale_date <= legacyMaxDate,
  )
  const orderSystemWindowRows = allFacts.filter(
    (r) => r.source_type === 'order_system' && r.sale_date >= orderSystemMinDate && r.sale_date <= orderSystemWindowEnd,
  )
  console.log(`レガシー側該当行: ${legacyWindowRows.length}件, 発注システム側該当行: ${orderSystemWindowRows.length}件`)

  // order_system側: order_item id(source_ref) -> order_id -> company_name を解決
  type ItemRow = { id: string; order_id: string }
  type OrderRow = { id: string; company_id: string | null }
  type CompanyRow = { id: string; company_name: string }

  const itemIds = orderSystemWindowRows.map((r) => r.source_ref).filter((x): x is string => !!x)
  const items =
    itemIds.length > 0
      ? await fetchInChunksByIds<ItemRow>(itemIds, ID_CHUNK_SIZE, (chunkIds, f, t) =>
          supabase.from('order_items').select('id, order_id').in('id', chunkIds).range(f, t),
        )
      : []
  const orderIdByItemId = new Map(items.map((i) => [i.id, i.order_id]))
  const orderIds = Array.from(new Set(items.map((i) => i.order_id)))
  const orders =
    orderIds.length > 0
      ? await fetchInChunksByIds<OrderRow>(orderIds, ID_CHUNK_SIZE, (chunkIds, f, t) =>
          supabase.from('orders').select('id, company_id').in('id', chunkIds).range(f, t),
        )
      : []
  const companyIdByOrderId = new Map(orders.map((o) => [o.id, o.company_id]))
  const companyIds = Array.from(new Set(orders.map((o) => o.company_id).filter((x): x is string => !!x)))
  const companies =
    companyIds.length > 0
      ? await fetchInChunksByIds<CompanyRow>(companyIds, ID_CHUNK_SIZE, (chunkIds, f, t) =>
          supabase.from('companies').select('id, company_name').in('id', chunkIds).range(f, t),
        )
      : []
  const companyNameById = new Map(companies.map((c) => [c.id, c.company_name]))

  type MatchCandidate = { dest: string; amount: number; legacyRef: string; legacyDate: string; orderSystemRef: string; orderSystemDate: string }
  const candidates: MatchCandidate[] = []
  for (const lg of legacyWindowRows) {
    if (!lg.source_ref) continue
    const dest = destFromSourceRef(lg.source_ref)
    if (!dest) continue
    const normDest = normalizeDest(dest)
    const amount = lg.gross_sales_incl_tax + lg.shipping_revenue
    for (const os of orderSystemWindowRows) {
      if (!os.source_ref) continue
      const orderId = orderIdByItemId.get(os.source_ref)
      const companyId = orderId ? companyIdByOrderId.get(orderId) : null
      const companyName = companyId ? companyNameById.get(companyId) : null
      if (!companyName) continue
      const osAmount = os.gross_sales_incl_tax + os.shipping_revenue
      if (normalizeDest(companyName) === normDest && osAmount === amount) {
        candidates.push({ dest, amount, legacyRef: lg.source_ref, legacyDate: lg.sale_date, orderSystemRef: os.source_ref, orderSystemDate: os.sale_date })
      }
    }
  }
  if (candidates.length === 0) {
    console.log('重複候補: 0件\n')
  } else {
    console.log(`重複候補: ${candidates.length}件（自動削除していません。以下を確認してください）`)
    for (const c of candidates) {
      console.log(`  ${c.dest} / ${yen(c.amount)}円 / legacy:${c.legacyRef}(${c.legacyDate}) <-> order_system:${c.orderSystemRef}(${c.orderSystemDate})`)
    }
    console.log()
  }

  // ============================================================
  // 3) 品種別集計（第5期 vs 第6期）
  //    - 集計キー: product_id を優先。product_id が null の行のみ variety_label を使う
  //      （同一商品がシート/発注システムで表記違いになるのを防ぐ）。
  //    - kg単価（円/kg）は「果実」カテゴリ（柑橘・枇杷（びわ））のみ対象。
  //      ジュース・葉物・副産物は数量(本/枚/個等)と金額のみで見る（kg単価は出さない）。
  // ============================================================
  const FRUIT_CATEGORIES = new Set(['柑橘', '枇杷（びわ）'])
  type ProductRow = { id: string; name: string; category: string | null }
  const { data: productsForAgg, error: prodAggErr } = await supabase.from('products').select('id, name, category')
  if (prodAggErr) throw new Error(`products取得失敗: ${prodAggErr.message}`)
  const productNameById = new Map((productsForAgg ?? []).map((p) => [p.id, p.name]))
  const productCategoryById = new Map((productsForAgg ?? []).map((p) => [p.id, p.category]))

  type UnitAgg = { fy5: Record<string, number>; fy6: Record<string, number> }
  type FruitAgg = { fy5Kg: number; fy5Sales: number; fy6Kg: number; fy6Sales: number }
  const fruitMap = new Map<string, FruitAgg>()
  const otherMap = new Map<string, { fy5Sales: number; fy6Sales: number; units: UnitAgg }>()
  const fruitNameByKey = new Map<string, string>()
  const otherNameByKey = new Map<string, string>()

  for (const r of allFacts) {
    if (r.fiscal_year !== 5 && r.fiscal_year !== 6) continue
    const key = r.product_id ?? `label:${r.variety_label}`
    const displayName = r.product_id ? (productNameById.get(r.product_id) ?? r.variety_label) : r.variety_label
    const category = r.product_id ? (productCategoryById.get(r.product_id) ?? null) : null
    const isFruit = category != null && FRUIT_CATEGORIES.has(category)
    const sales = r.gross_sales_incl_tax + r.shipping_revenue

    if (isFruit) {
      if (!fruitMap.has(key)) fruitMap.set(key, { fy5Kg: 0, fy5Sales: 0, fy6Kg: 0, fy6Sales: 0 })
      const agg = fruitMap.get(key)!
      if (r.fiscal_year === 5) {
        agg.fy5Kg += r.quantity_kg ?? 0
        agg.fy5Sales += sales
      } else {
        agg.fy6Kg += r.quantity_kg ?? 0
        agg.fy6Sales += sales
      }
      fruitNameByKey.set(key, displayName)
    } else {
      if (!otherMap.has(key)) otherMap.set(key, { fy5Sales: 0, fy6Sales: 0, units: { fy5: {}, fy6: {} } })
      const agg = otherMap.get(key)!
      const unitBucket = r.fiscal_year === 5 ? agg.units.fy5 : agg.units.fy6
      if (r.unit) unitBucket[r.unit] = (unitBucket[r.unit] ?? 0) + (r.quantity_raw ?? 0)
      if (r.fiscal_year === 5) agg.fy5Sales += sales
      else agg.fy6Sales += sales
      otherNameByKey.set(key, displayName)
    }
  }

  console.log('=== 3a. 果実カテゴリ（柑橘・枇杷）品種別集計：kg単価あり ===\n')
  const fruitRows = Array.from(fruitMap.entries()).sort((a, b) => b[1].fy5Sales + b[1].fy6Sales - (a[1].fy5Sales + a[1].fy6Sales))
  console.log('品種                    FY5数量kg   FY5売上      FY5円/kg   FY6数量kg   FY6売上      FY6円/kg')
  for (const [key, agg] of fruitRows) {
    const name = fruitNameByKey.get(key)!
    const fy5PerKg = agg.fy5Kg > 0 ? Math.round(agg.fy5Sales / agg.fy5Kg) : null
    const fy6PerKg = agg.fy6Kg > 0 ? Math.round(agg.fy6Sales / agg.fy6Kg) : null
    console.log(
      `${name.padEnd(20)}  ${agg.fy5Kg.toFixed(1).padStart(9)}  ${yen(agg.fy5Sales).padStart(10)}  ${(fy5PerKg ?? '-').toString().padStart(8)}   ${agg.fy6Kg.toFixed(1).padStart(9)}  ${yen(agg.fy6Sales).padStart(10)}  ${(fy6PerKg ?? '-').toString().padStart(8)}`,
    )
  }

  console.log('\n=== 3b. ジュース・葉物・副産物（kg単価対象外）：数量(本/枚/個等)と金額のみ ===\n')
  const otherRows = Array.from(otherMap.entries()).sort((a, b) => b[1].fy5Sales + b[1].fy6Sales - (a[1].fy5Sales + a[1].fy6Sales))
  const fmtUnits = (u: Record<string, number>) =>
    Object.entries(u)
      .map(([unit, qty]) => `${qty.toFixed(1)}${unit}`)
      .join(', ') || '-'
  console.log('品種                    FY5数量          FY5売上        FY6数量          FY6売上')
  for (const [key, agg] of otherRows) {
    const name = otherNameByKey.get(key)!
    console.log(`${name.padEnd(20)}  ${fmtUnits(agg.units.fy5).padEnd(16)}  ${yen(agg.fy5Sales).padStart(10)}  ${fmtUnits(agg.units.fy6).padEnd(16)}  ${yen(agg.fy6Sales).padStart(10)}`)
  }

  // ============================================================
  // 3c) processing チャネル 品種別集計（第5期 vs 第6期）
  // ============================================================
  console.log('\n=== 3c. 加工用販売（processing）品種別集計 ===\n')
  const processingFacts = await fetchAllRows<FactRow>((f, t) =>
    supabase
      .from('sales_facts')
      .select('fiscal_year, fiscal_month, source_type, sale_date, product_id, variety_label, quantity_kg, quantity_raw, unit, gross_sales_incl_tax, shipping_revenue, source_ref')
      .eq('channel_code', 'processing')
      .range(f, t),
  )
  const processingMap = new Map<string, FruitAgg>()
  const processingNameByKey = new Map<string, string>()
  for (const r of processingFacts) {
    if (r.fiscal_year !== 5 && r.fiscal_year !== 6) continue
    const key = r.product_id ?? `label:${r.variety_label}`
    const displayName = r.product_id ? (productNameById.get(r.product_id) ?? r.variety_label) : r.variety_label
    if (!processingMap.has(key)) processingMap.set(key, { fy5Kg: 0, fy5Sales: 0, fy6Kg: 0, fy6Sales: 0 })
    const agg = processingMap.get(key)!
    const sales = r.gross_sales_incl_tax + r.shipping_revenue
    if (r.fiscal_year === 5) {
      agg.fy5Kg += r.quantity_kg ?? 0
      agg.fy5Sales += sales
    } else {
      agg.fy6Kg += r.quantity_kg ?? 0
      agg.fy6Sales += sales
    }
    processingNameByKey.set(key, displayName)
  }
  console.log(`対象行数: ${processingFacts.length}件（取引先名に「伊藤農園」を含み、kg単価が0円超200円未満の行）`)
  console.log('品種                    FY5数量kg   FY5売上      FY5円/kg   FY6数量kg   FY6売上      FY6円/kg')
  for (const [key, agg] of Array.from(processingMap.entries())) {
    const name = processingNameByKey.get(key)!
    const fy5PerKg = agg.fy5Kg > 0 ? Math.round(agg.fy5Sales / agg.fy5Kg) : null
    const fy6PerKg = agg.fy6Kg > 0 ? Math.round(agg.fy6Sales / agg.fy6Kg) : null
    console.log(
      `${name.padEnd(20)}  ${agg.fy5Kg.toFixed(1).padStart(9)}  ${yen(agg.fy5Sales).padStart(10)}  ${(fy5PerKg ?? '-').toString().padStart(8)}   ${agg.fy6Kg.toFixed(1).padStart(9)}  ${yen(agg.fy6Sales).padStart(10)}  ${(fy6PerKg ?? '-').toString().padStart(8)}`,
    )
  }

  // ============================================================
  // 4) product_id が null の行
  // ============================================================
  console.log('\n=== 4. product_id が null の行 ===\n')
  const nullRows = allFacts.filter((r) => r.product_id === null)
  console.log(`product_id が null の行数: ${nullRows.length} / 全${allFacts.length}件`)
  const nullVarietyCount = new Map<string, number>()
  for (const r of nullRows) {
    nullVarietyCount.set(r.variety_label, (nullVarietyCount.get(r.variety_label) ?? 0) + 1)
  }
  const sortedNullVariety = Array.from(nullVarietyCount.entries()).sort((a, b) => b[1] - a[1])
  console.log(`variety_label ユニーク数: ${sortedNullVariety.length}`)
  for (const [label, cnt] of sortedNullVariety) {
    console.log(`  ${label} (${cnt}件)`)
  }
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

main().catch((err) => {
  console.error('[verify-legacy-wholesale] エラー:', err)
  process.exit(1)
})
