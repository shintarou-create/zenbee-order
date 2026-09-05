// 手入力販路（産直・大口・市場出荷・イベント・加工用の一部）→ sales_facts への取込バッチ。
// data/manual-sales.csv（UTF-8・手動転記）を読む。何度実行しても結果が同じ（冪等）。
// source_type='manual_csv' / source_ref='{channel}:{sale_date}:{sub_channel}:{行番号}' で一意化する
// （同じ販路・同じ日・同じ相手で複数行あるケースがあるため行番号が必須）。
//
// ⚠️ amount は「手取り金額」（市場：振込額＝市場料・県連料・組合料・運送料控除後／産直：販売手数料控除後）。
//    そのためこのスクリプトでは commission は常に 0 のままにする。
//    amount に手取りが入っている運用なので、ここで手数料を再度引くと二重控除になる。
//
// 使い方:
//   npm run import:manual -- --dry-run   # DB書き込みなしで件数・警告だけ確認
//   npm run import:manual                # 実行

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { getFiscalYear, getFiscalMonth } from '../src/lib/fiscal-year'

const SOURCE_TYPE = 'manual_csv'
const MAPPING_SOURCE_TYPE = 'manual'
const UPSERT_CHUNK_SIZE = 500
const CSV_PATH = 'data/manual-sales.csv'

type CsvRecord = {
  sale_date: string
  channel: string
  sub_channel: string
  variety: string
  quantity_kg: string
  amount: string
  note: string
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

function loadCsv(path: string): CsvRecord[] {
  const content = readFileSync(path, 'utf-8')
  return parse(content, { columns: true }) as CsvRecord[]
}

type Counters = {
  totalRows: number
  skippedNoAmount: number
  unmappedVarieties: Map<string, number>
}

function newCounters(): Counters {
  return { totalRows: 0, skippedNoAmount: 0, unmappedVarieties: new Map() }
}

function parseRows(
  records: CsvRecord[],
  validChannels: Set<string>,
  productIdBySourceName: Map<string, string | null>,
  counters: Counters,
): SalesFactRow[] {
  const out: SalesFactRow[] = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const csvLine = i + 2 // ヘッダが1行目のため、データ行は2行目から

    if (!r.channel && !r.sale_date && !r.amount) continue
    counters.totalRows++

    if (!validChannels.has(r.channel)) {
      throw new Error(`未知のchannel='${r.channel}'（${CSV_PATH}:${csvLine}行目）。channelsテーブルに存在する値のみ使用可能です。`)
    }

    const amount = Number(r.amount)
    if (!r.amount || !amount) {
      counters.skippedNoAmount++
      continue
    }

    const variety = r.variety?.trim() ?? ''
    let productId: string | null = null
    let varietyLabel: string
    if (variety === '') {
      varietyLabel = '不明'
    } else {
      varietyLabel = variety
      if (productIdBySourceName.has(variety)) {
        productId = productIdBySourceName.get(variety) ?? null
      } else {
        counters.unmappedVarieties.set(variety, (counters.unmappedVarieties.get(variety) ?? 0) + 1)
      }
    }

    const quantityKgRaw = r.quantity_kg?.trim() ?? ''
    const quantityKg = quantityKgRaw === '' ? null : Number(quantityKgRaw)
    const quantityRaw = quantityKg
    const unit = quantityKg != null ? 'kg' : null

    out.push({
      sale_date: r.sale_date,
      fiscal_year: getFiscalYear(r.sale_date),
      fiscal_month: getFiscalMonth(r.sale_date),
      channel_code: r.channel,
      product_id: productId,
      variety_label: varietyLabel,
      quantity_kg: quantityKg,
      quantity_raw: quantityRaw,
      unit,
      order_status: null,
      gross_sales_incl_tax: amount,
      shipping_revenue: 0,
      shipping_cost: 0,
      material_cost: 0,
      commission: 0, // amountはすでに手取り（手数料控除後）のため、ここで引くと二重控除になる
      purchase_cost: 0,
      source_type: SOURCE_TYPE,
      source_ref: `${r.channel}:${r.sale_date}:${r.sub_channel}:${csvLine}`,
      is_estimated: true,
    })
  }
  return out
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.local を確認してください）')
  }
  const supabase = createClient(url, key)

  const { data: channels, error: chErr } = await supabase.from('channels').select('code')
  if (chErr) throw new Error(`channels取得失敗: ${chErr.message}`)
  const validChannels = new Set((channels ?? []).map((c) => c.code))

  const { data: mappings, error: mErr } = await supabase
    .from('product_mappings')
    .select('source_name, product_id')
    .eq('source_type', MAPPING_SOURCE_TYPE)
  if (mErr) throw new Error(`product_mappings取得失敗: ${mErr.message}`)
  const productIdBySourceName = new Map((mappings ?? []).map((m) => [m.source_name, m.product_id]))

  const counters = newCounters()
  const records = loadCsv(CSV_PATH)
  const allRows = parseRows(records, validChannels, productIdBySourceName, counters)

  console.log('[import-manual-sales] --- 集計 ---')
  console.log(`  読み取り対象行数: ${counters.totalRows}`)
  console.log(`  amount空欄/0でスキップ: ${counters.skippedNoAmount}`)
  console.log(`  生成行数: ${allRows.length}`)
  if (counters.unmappedVarieties.size > 0) {
    console.log(`  product_mappings未登録の品種名（product_id=null）: ${counters.unmappedVarieties.size}種`)
    for (const [name, cnt] of Array.from(counters.unmappedVarieties.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${name} (${cnt}回)`)
    }
  }

  const totalAmount = allRows.reduce((s, r) => s + r.gross_sales_incl_tax, 0)
  console.log(`\n[import-manual-sales] gross_sales_incl_tax合計: ${totalAmount.toLocaleString('ja-JP')}円`)

  const byChannel = new Map<string, number>()
  for (const r of allRows) byChannel.set(r.channel_code, (byChannel.get(r.channel_code) ?? 0) + r.gross_sales_incl_tax)
  console.log('[import-manual-sales] channel別内訳:')
  for (const [ch, amount] of Array.from(byChannel.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ch.padEnd(12)}: ${amount.toLocaleString('ja-JP')}円`)
  }

  if (dryRun) {
    console.log('\n[import-manual-sales] --dry-run のためDBへの書き込みは行っていません')
    return
  }

  let upserted = 0
  for (let i = 0; i < allRows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = allRows.slice(i, i + UPSERT_CHUNK_SIZE)
    const { error } = await supabase.from('sales_facts').upsert(chunk, { onConflict: 'source_type,source_ref' })
    if (error) throw new Error(`upsert失敗（${i}〜${i + chunk.length}件目）: ${error.message}`)
    upserted += chunk.length
  }
  console.log(`[import-manual-sales] 完了: ${upserted}件をupsertしました`)
}

main().catch((err) => {
  console.error('[import-manual-sales] エラー:', err)
  process.exit(1)
})
