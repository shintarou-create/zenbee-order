// カラーミー（D2C）「売上詳細データ」CSV → sales_facts への取込バッチ。
// 何度実行しても結果が同じ（冪等）。source_type='colorme_csv' / source_ref='{売上ID}:{行番号}' で一意化する
// （同一売上IDに複数明細行がある＝1注文で複数商品を買うケースがあるため行番号が必須）。
//
// ⚠️ 個人情報の取り扱い:
//   CSVには 顧客ID・名前・メールアドレス・電話番号・配送先ID が含まれるが、
//   このスクリプトは列インデックスで「対象列だけ」を読み取り、それ以外の列には一切アクセスしない。
//   ログ・エラーメッセージにも顧客情報は出力しない。
//
// 使い方:
//   npm run import:colorme -- --dry-run   # DB書き込みなしで件数・警告だけ確認
//   npm run import:colorme                # 実行

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import iconv from 'iconv-lite'
import { parse } from 'csv-parse/sync'
import { getFiscalYear, getFiscalMonth } from '../src/lib/fiscal-year'
import { COLORME_MAPPINGS } from './colorme-product-mappings'

const CHANNEL_CODE = 'd2c'
const SOURCE_TYPE = 'colorme_csv'
const UPSERT_CHUNK_SIZE = 500
const CSV_PATH = 'data/colorme-sales-detail.csv'

// CSV列インデックス（列構成: 売上ID,配送先ID,受注日,型番,商品名,販売価格(消費税込),原価,販売個数,小計,顧客ID,名前,メールアドレス,電話番号）
// 個人情報列（配送先ID=1, 顧客ID=9, 名前=10, メールアドレス=11, 電話番号=12）には一切アクセスしない。
const COL = {
  SALES_ID: 0,
  SALE_DATE: 2,
  PRODUCT_NAME: 4,
  PRICE_INCL_TAX: 5,
  QUANTITY: 7,
} as const

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

function loadCsv(path: string): string[][] {
  const buf = readFileSync(path)
  const content = iconv.decode(buf, 'cp932')
  return parse(content, { relax_column_count: true }) as string[][]
}

// 受注日は 'YYYY/MM/DD' 形式（カラーミー仕様）。fiscal-year.ts の各関数は 'YYYY-MM-DD' 前提のため変換する。
function normalizeDate(s: string): string {
  return s.replace(/\//g, '-')
}

type Counters = {
  totalRows: number
  skippedZeroQty: number
  unmappedNames: Map<string, number>
}

function newCounters(): Counters {
  return { totalRows: 0, skippedZeroQty: 0, unmappedNames: new Map() }
}

function parseRows(rows: string[][], mappingByName: Map<string, ColormeMappingLike>, counters: Counters): SalesFactRow[] {
  const out: SalesFactRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    const salesId = row[COL.SALES_ID]
    const saleDate = row[COL.SALE_DATE] ? normalizeDate(row[COL.SALE_DATE]) : row[COL.SALE_DATE]
    const productName = row[COL.PRODUCT_NAME]
    const price = Number(row[COL.PRICE_INCL_TAX])
    const qty = Number(row[COL.QUANTITY])

    if (!salesId && !saleDate && !productName) continue
    counters.totalRows++

    if (!qty || qty === 0) {
      counters.skippedZeroQty++
      continue
    }

    const mapping = mappingByName.get(productName)
    let productId: string | null = null
    let varietyLabel: string
    let unit: string | null
    let kgPerUnit: number | null = null

    if (mapping) {
      productId = mapping.product_id
      varietyLabel = mapping.variety_label
      unit = mapping.unit
      kgPerUnit = mapping.kg_per_unit
    } else {
      counters.unmappedNames.set(productName, (counters.unmappedNames.get(productName) ?? 0) + 1)
      varietyLabel = `未マッピング:${productName}`
      unit = null
    }

    const quantityKg = kgPerUnit != null ? kgPerUnit * qty : null
    const grossSales = Math.round(price * qty)

    out.push({
      sale_date: saleDate,
      fiscal_year: getFiscalYear(saleDate),
      fiscal_month: getFiscalMonth(saleDate),
      channel_code: CHANNEL_CODE,
      product_id: productId,
      variety_label: varietyLabel,
      quantity_kg: quantityKg,
      quantity_raw: qty,
      unit,
      order_status: null,
      gross_sales_incl_tax: grossSales,
      shipping_revenue: 0,
      shipping_cost: 0,
      material_cost: 0,
      commission: 0,
      purchase_cost: 0,
      source_type: SOURCE_TYPE,
      source_ref: `${salesId}:${rowNum}`,
      is_estimated: true,
    })
  }
  return out
}

type ColormeMappingLike = { product_id: string | null; kg_per_unit: number | null; variety_label: string; unit: string }

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.local を確認してください）')
  }
  const supabase = createClient(url, key)

  // product_id は product_mappings 経由で解決する（colorme-product-mappings.ts の variety_label/unit/kg_per_unit と併用）
  const { data: dbMappings, error: mErr } = await supabase
    .from('product_mappings')
    .select('source_name, product_id')
    .eq('source_type', SOURCE_TYPE)
  if (mErr) throw new Error(`product_mappings取得失敗: ${mErr.message}`)
  const productIdBySourceName = new Map((dbMappings ?? []).map((m) => [m.source_name, m.product_id]))

  const mappingByName = new Map<string, ColormeMappingLike>(
    COLORME_MAPPINGS.map((m) => [
      m.source_name,
      {
        product_id: productIdBySourceName.get(m.source_name) ?? null,
        kg_per_unit: m.kg_per_unit,
        variety_label: m.variety_label,
        unit: m.unit,
      },
    ]),
  )

  const counters = newCounters()
  const rows = loadCsv(CSV_PATH)
  const allRows = parseRows(rows, mappingByName, counters)

  console.log('[import-colorme-sales] --- 集計 ---')
  console.log(`  読み取り対象行数: ${counters.totalRows}`)
  console.log(`  販売個数=0でスキップ: ${counters.skippedZeroQty}`)
  console.log(`  生成行数: ${allRows.length}`)
  if (counters.unmappedNames.size > 0) {
    console.log(`  product_mappings未登録の商品名（variety_label='未マッピング:...'）: ${counters.unmappedNames.size}種`)
    for (const [name, cnt] of Array.from(counters.unmappedNames.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${name} (${cnt}回)`)
    }
  }

  const totalGross = allRows.reduce((s, r) => s + r.gross_sales_incl_tax, 0)
  console.log(`\n[import-colorme-sales] gross_sales_incl_tax合計: ${totalGross.toLocaleString('ja-JP')}円`)

  const byFy = new Map<number, number>()
  for (const r of allRows) byFy.set(r.fiscal_year, (byFy.get(r.fiscal_year) ?? 0) + r.gross_sales_incl_tax)
  console.log('[import-colorme-sales] 期別内訳:')
  for (const [fy, amount] of Array.from(byFy.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`  第${fy}期: ${amount.toLocaleString('ja-JP')}円`)
  }

  if (dryRun) {
    console.log('\n[import-colorme-sales] --dry-run のためDBへの書き込みは行っていません')
    return
  }

  let upserted = 0
  for (let i = 0; i < allRows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = allRows.slice(i, i + UPSERT_CHUNK_SIZE)
    const { error } = await supabase.from('sales_facts').upsert(chunk, { onConflict: 'source_type,source_ref' })
    if (error) throw new Error(`upsert失敗（${i}〜${i + chunk.length}件目）: ${error.message}`)
    upserted += chunk.length
    console.log(`[import-colorme-sales] upsert進捗: ${upserted}/${allRows.length}`)
  }
  console.log(`[import-colorme-sales] 完了: ${upserted}件をupsertしました`)
}

main().catch((err) => {
  console.error('[import-colorme-sales] エラー:', err)
  process.exit(1)
})
