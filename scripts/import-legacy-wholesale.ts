// レガシー卸データ（Googleスプレッドシート「発注シート（飲食店）」の 2024/2025/2026 年別シート）
// → sales_facts への取込バッチ。CSVエクスポート（data/legacy-2024.csv 等）を読む。
// 何度実行しても結果が同じ（冪等）。source_type='sheet_legacy' / source_ref='{シート名}:{元シート行番号}' で一意化する。
//
// 対象シートと対象外の理由:
//   - 「商品発注書」シート（Googleフォーム回答）は金額列が1行ずれるバグが確認されているため取込対象外。
//   - 「ジュースの在庫管理表」「編集用」「シート5」も対象外。
//
// 使い方:
//   npm run import:legacy-wholesale -- --dry-run   # DB書き込みなしで件数・警告だけ確認
//   npm run import:legacy-wholesale                # 実行

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { getFiscalYear, getFiscalMonth } from '../src/lib/fiscal-year'

const CHANNEL_CODE = 'wholesale'
const SOURCE_TYPE = 'sheet_legacy'
const UPSERT_CHUNK_SIZE = 500
// 汎用・備考欄参照ラベル。variety_label を'不明'に強制する（フェーズB合意）。
const GENERIC_LABELS = new Set(['いろいろ', 'その他'])
// 2024シートの取込下限（第5期開始日）。これより前の行は対象外。
const CUTOFF_2024 = '2024-09-01'

// 加工業者向け卸（他社に転売・加工される取引）の判定。
// 取引先名にこのいずれかを含み、かつ kg単価が0円超200円未満の行を 'processing' に分類する。
// ホテル・レストラン向けの規格外品値引き（例: 神戸北野ホテル、hotel de yoshino）は
// 自店利用のためのwholesaleとして扱い、ここには含めない（2026-XX-XX 確定）。
// 将来加工業者が増えたらここに追加する。
const PROCESSING_CUSTOMERS = ['伊藤農園']

function classifyChannel(dest: string | null, kgUnitPrice: number | null): string {
  if (!dest || kgUnitPrice == null) return CHANNEL_CODE
  const isProcessingCustomer = PROCESSING_CUSTOMERS.some((name) => dest.includes(name))
  if (isProcessingCustomer && kgUnitPrice > 0 && kgUnitPrice < 200) return 'processing'
  return CHANNEL_CODE
}

type SalesFactRow = {
  sale_date: string
  fiscal_year: number
  fiscal_month: string
  channel_code: string
  product_id: string | null
  variety_label: string
  quantity_kg: number | null
  quantity_raw: number | null
  unit: string | null
  order_status: null
  gross_sales_incl_tax: number
  shipping_revenue: number
  shipping_cost: number
  material_cost: number
  commission: number
  purchase_cost: number
  source_type: string
  source_ref: string
  is_estimated: boolean
}

function num(s: string | undefined): number | null {
  if (s == null) return null
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isNaN(n) ? null : n
}

// 商品名本体を抽出（フェーズB合意：最初の "(" "（" より前）。
function baseName(s: string): string {
  const m = s.match(/^([^（(]*)/)
  return (m ? m[1] : s).trim()
}

function loadCsv(path: string): string[][] {
  const content = readFileSync(path, 'utf-8')
  return parse(content, { relax_column_count: true }) as string[][]
}

type Counters = {
  totalRows: number
  skippedNotShipped: number
  skippedNoDate: number
  skippedBeforeCutoff: number
  amountMismatch: number
  unmappedProducts: Map<string, number>
}

function newCounters(): Counters {
  return {
    totalRows: 0,
    skippedNotShipped: 0,
    skippedNoDate: 0,
    skippedBeforeCutoff: 0,
    amountMismatch: 0,
    unmappedProducts: new Map(),
  }
}

// 2024/2025 共通パーサー。
// 列: 発送済(0) 納品日(1) 送り先(2) 商品名(3) kg(4) 個数(5) 単価(6) 金額(7) [送料(8) 合計(9)] 備考
function parse2024_2025(
  rows: string[][],
  sheetLabel: '2024' | '2025',
  hasShipping: boolean,
  mappingByName: Map<string, string | null>,
  weightByProductId: Map<string, number>,
  counters: Counters,
): SalesFactRow[] {
  const out: SalesFactRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const sheetRow = i + 1
    const shipped = row[0]
    const deliveryDate = row[1]
    const dest = row[2]
    const product = row[3]
    const kg = num(row[4])
    const qty = num(row[5])
    const unitPrice = num(row[6])
    const amount = num(row[7])
    const shipping = hasShipping ? (num(row[8]) ?? 0) : 0

    // 完全な空行・集計行（日付なし）は素通しでカウントもしない
    if (!deliveryDate && !product && !shipped) continue
    counters.totalRows++

    if (shipped !== 'True') {
      counters.skippedNotShipped++
      continue
    }
    if (!deliveryDate) {
      counters.skippedNoDate++
      continue
    }
    if (sheetLabel === '2024' && deliveryDate < CUTOFF_2024) {
      counters.skippedBeforeCutoff++
      continue
    }

    const name = baseName(product ?? '')
    const baseQty = kg ?? qty
    const unit = kg != null ? 'kg' : qty != null ? '本' : null

    let productId: string | null = null
    let varietyLabel = name
    if (GENERIC_LABELS.has(name) || name === '') {
      varietyLabel = '不明'
    } else if (mappingByName.has(name)) {
      productId = mappingByName.get(name) ?? null
    } else {
      counters.unmappedProducts.set(name, (counters.unmappedProducts.get(name) ?? 0) + 1)
    }

    // kg換算: kg列があればそれ。無ければ products.weight_kg_per_unit × 個数（product_mappings.kg_per_unit は現状すべてnull）。
    const quantityKg = kg != null ? kg : productId && weightByProductId.has(productId) && qty != null ? qty * weightByProductId.get(productId)! : null

    const grossSales = Math.round((unitPrice ?? 0) * (baseQty ?? 0))
    if (amount != null && Math.abs(grossSales - amount) > 0.5) {
      counters.amountMismatch++
      console.warn(`[import-legacy-wholesale] 金額不一致 ${sheetLabel}:${sheetRow} 商品=${product} 単価×数量=${grossSales} 金額列=${amount}`)
    }

    // 加工用販売判定: kg列（kg単価）がある行のみ対象。個数(本)ベースの行はkg単価の概念がないため対象外。
    const channelCode = classifyChannel(dest, kg != null ? unitPrice : null)

    out.push({
      sale_date: deliveryDate,
      fiscal_year: getFiscalYear(deliveryDate),
      fiscal_month: getFiscalMonth(deliveryDate),
      channel_code: channelCode,
      product_id: productId,
      variety_label: varietyLabel,
      quantity_kg: quantityKg,
      quantity_raw: baseQty,
      unit,
      order_status: null,
      gross_sales_incl_tax: grossSales,
      shipping_revenue: Math.round(shipping),
      shipping_cost: 0,
      material_cost: 0,
      commission: 0,
      purchase_cost: 0,
      source_type: SOURCE_TYPE,
      source_ref: `${sheetLabel}:${sheetRow}`,
      is_estimated: true,
    })
  }
  return out
}

// 2026 パーサー。
// 列: 発送済(0) 送り状(1) タイムスタンプ(2) 納品先（店名）(3) 納品希望日(4) 商品名(単位)(5) 発注数(6)
//     備考欄(7) 単価(8) 納品書(9) 請求書(10) 金額(11) 合計金額(12) 送料(13)
function parse2026(
  rows: string[][],
  mappingByName: Map<string, string | null>,
  weightByProductId: Map<string, number>,
  counters: Counters,
): SalesFactRow[] {
  const out: SalesFactRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const sheetRow = i + 1
    const shipped = row[0]
    const dest = row[3]
    const wantDate = row[4]
    const productUnit = row[5]
    const qty = num(row[6])
    const unitPrice = num(row[8])
    const amount = num(row[11])
    const shipping = num(row[13]) ?? 0

    if (!wantDate && !productUnit && !shipped) continue
    counters.totalRows++

    if (shipped !== 'True') {
      counters.skippedNotShipped++
      continue
    }
    if (!wantDate) {
      counters.skippedNoDate++
      continue
    }

    const rawName = productUnit ?? ''
    const name = baseName(rawName)
    const suffixMatch = rawName.match(/[（(]([^）)]*)[）)]/)
    const suffix = suffixMatch ? suffixMatch[1] : ''
    const isKg = suffix.toLowerCase().includes('kg')
    const isBottle = suffix.includes('本')
    const unit = isKg ? 'kg' : isBottle ? '本' : suffix || null

    let productId: string | null = null
    let varietyLabel = name
    if (GENERIC_LABELS.has(name) || name === '') {
      varietyLabel = '不明'
    } else if (mappingByName.has(name)) {
      productId = mappingByName.get(name) ?? null
    } else {
      counters.unmappedProducts.set(name, (counters.unmappedProducts.get(name) ?? 0) + 1)
    }

    const quantityKg = isKg
      ? qty
      : productId && weightByProductId.has(productId) && qty != null
        ? qty * weightByProductId.get(productId)!
        : null

    const grossSales = Math.round((unitPrice ?? 0) * (qty ?? 0))
    if (amount != null && Math.abs(grossSales - amount) > 0.5) {
      counters.amountMismatch++
      console.warn(`[import-legacy-wholesale] 金額不一致 2026:${sheetRow} 商品=${productUnit} 単価×数量=${grossSales} 金額列=${amount}`)
    }

    const channelCode = classifyChannel(dest, isKg ? unitPrice : null)

    out.push({
      sale_date: wantDate,
      fiscal_year: getFiscalYear(wantDate),
      fiscal_month: getFiscalMonth(wantDate),
      channel_code: channelCode,
      product_id: productId,
      variety_label: varietyLabel,
      quantity_kg: quantityKg,
      quantity_raw: qty,
      unit,
      order_status: null,
      gross_sales_incl_tax: grossSales,
      shipping_revenue: Math.round(shipping),
      shipping_cost: 0,
      material_cost: 0,
      commission: 0,
      purchase_cost: 0,
      source_type: SOURCE_TYPE,
      source_ref: `2026:${sheetRow}`,
      is_estimated: true,
    })
  }
  return out
}

function printCounters(label: string, c: Counters, produced: number) {
  console.log(`[import-legacy-wholesale] --- ${label} ---`)
  console.log(`  読み取り対象行数: ${c.totalRows}`)
  console.log(`  発送済でないためスキップ: ${c.skippedNotShipped}`)
  console.log(`  納品日空欄でスキップ: ${c.skippedNoDate}`)
  if (c.skippedBeforeCutoff > 0) console.log(`  ${CUTOFF_2024}より前でスキップ: ${c.skippedBeforeCutoff}`)
  console.log(`  単価×数量と金額列の不一致（警告のみ・取込継続）: ${c.amountMismatch}`)
  console.log(`  生成行数: ${produced}`)
  if (c.unmappedProducts.size > 0) {
    console.log(`  product_mappings未登録の商品名（product_id=null）: ${c.unmappedProducts.size}種`)
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.local を確認してください）')
  }
  const supabase = createClient(url, key)

  const { data: mappings, error: mErr } = await supabase
    .from('product_mappings')
    .select('source_name, product_id')
    .eq('source_type', SOURCE_TYPE)
  if (mErr) throw new Error(`product_mappings取得失敗: ${mErr.message}`)
  const mappingByName = new Map((mappings ?? []).map((m) => [m.source_name, m.product_id]))

  const { data: products, error: pErr } = await supabase.from('products').select('id, weight_kg_per_unit')
  if (pErr) throw new Error(`products取得失敗: ${pErr.message}`)
  const weightByProductId = new Map(
    (products ?? []).filter((p) => p.weight_kg_per_unit != null).map((p) => [p.id, p.weight_kg_per_unit as number]),
  )

  const c2024 = newCounters()
  const c2025 = newCounters()
  const c2026 = newCounters()

  const rows2024 = parse2024_2025(loadCsv('data/legacy-2024.csv'), '2024', false, mappingByName, weightByProductId, c2024)
  const rows2025 = parse2024_2025(loadCsv('data/legacy-2025.csv'), '2025', true, mappingByName, weightByProductId, c2025)
  const rows2026 = parse2026(loadCsv('data/legacy-2026.csv'), mappingByName, weightByProductId, c2026)

  printCounters('2024（2024-09-01以降）', c2024, rows2024.length)
  printCounters('2025', c2025, rows2025.length)
  printCounters('2026', c2026, rows2026.length)

  const allUnmapped = new Map<string, number>()
  for (const c of [c2024, c2025, c2026]) {
    for (const [name, cnt] of Array.from(c.unmappedProducts.entries())) {
      allUnmapped.set(name, (allUnmapped.get(name) ?? 0) + cnt)
    }
  }
  console.log(`\n[import-legacy-wholesale] product_mappings未登録の商品名（合算・product_id=nullのままvariety_labelに残る）: ${allUnmapped.size}種`)
  const sortedUnmapped = Array.from(allUnmapped.entries()).sort((a, b) => b[1] - a[1])
  for (const [name, cnt] of sortedUnmapped) {
    console.log(`  ${name} (${cnt}回)`)
  }

  const allRows = [...rows2024, ...rows2025, ...rows2026]
  const totalGross = allRows.reduce((s, r) => s + r.gross_sales_incl_tax, 0)
  const totalShipping = allRows.reduce((s, r) => s + r.shipping_revenue, 0)
  console.log(`\n[import-legacy-wholesale] 合計生成行数: ${allRows.length}`)
  console.log(`[import-legacy-wholesale] gross_sales_incl_tax合計: ${totalGross.toLocaleString('ja-JP')}円`)
  console.log(`[import-legacy-wholesale] shipping_revenue合計: ${totalShipping.toLocaleString('ja-JP')}円`)
  console.log(`[import-legacy-wholesale] 合計（税込・送料込）: ${(totalGross + totalShipping).toLocaleString('ja-JP')}円`)

  const processingRows = allRows.filter((r) => r.channel_code === 'processing')
  console.log(`[import-legacy-wholesale] processing分類: ${processingRows.length}件`)
  for (const r of processingRows) {
    console.log(`  ${r.source_ref} ${r.sale_date} ${r.variety_label} ${r.quantity_raw}kg×?円 = ${r.gross_sales_incl_tax}円`)
  }

  if (dryRun) {
    console.log('\n[import-legacy-wholesale] --dry-run のためDBへの書き込みは行っていません')
    return
  }

  let upserted = 0
  for (let i = 0; i < allRows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = allRows.slice(i, i + UPSERT_CHUNK_SIZE)
    const { error } = await supabase.from('sales_facts').upsert(chunk, { onConflict: 'source_type,source_ref' })
    if (error) throw new Error(`upsert失敗（${i}〜${i + chunk.length}件目）: ${error.message}`)
    upserted += chunk.length
    console.log(`[import-legacy-wholesale] upsert進捗: ${upserted}/${allRows.length}`)
  }
  console.log(`[import-legacy-wholesale] 完了: ${upserted}件をupsertしました`)
}

main().catch((err) => {
  console.error('[import-legacy-wholesale] エラー:', err)
  process.exit(1)
})
