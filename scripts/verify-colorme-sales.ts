// フェーズC検証: カラーミー（D2C）取込結果（colorme_csv）の集計・検証。
// 1) 第5期・第6期の月別D2C売上
// 2) 品種別集計（第5期 vs 第6期）: kg単価あり／定期便・セット・ジュース・雑貨等は別表
// 3) 紅みかんのグレード別（善／恵／雫／潤）× 期別（最重要）
// 4) 販路横断サマリ（wholesale / processing / d2c）
// 5) 未マッピングの商品名一覧
//
// 使い方: npm run verify:colorme

import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from '../src/lib/supabase-batch'
import { getFiscalMonths } from '../src/lib/fiscal-year'

function yen(n: number): string {
  return Math.round(n).toLocaleString('ja-JP')
}

type FactRow = {
  fiscal_year: number
  fiscal_month: string
  channel_code: string
  source_type: string
  product_id: string | null
  variety_label: string
  quantity_kg: number | null
  quantity_raw: number | null
  unit: string | null
  gross_sales_incl_tax: number
  shipping_revenue: number
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です')
  }
  const supabase = createClient(url, key)

  const d2cFacts = await fetchAllRows<FactRow>((f, t) =>
    supabase
      .from('sales_facts')
      .select('fiscal_year, fiscal_month, channel_code, source_type, product_id, variety_label, quantity_kg, quantity_raw, unit, gross_sales_incl_tax, shipping_revenue')
      .eq('source_type', 'colorme_csv')
      .range(f, t),
  )
  console.log(`[verify-colorme-sales] sales_facts（colorme_csv）全件: ${d2cFacts.length}件\n`)

  const amount = (r: FactRow) => r.gross_sales_incl_tax + r.shipping_revenue

  // ============================================================
  // 1) 第5期・第6期の月別D2C売上
  // ============================================================
  console.log('=== 1. 第5期・第6期 月別D2C売上 ===\n')
  for (const fy of [5, 6]) {
    let fyTotal = 0
    for (const month of getFiscalMonths(fy)) {
      const rows = d2cFacts.filter((r) => r.fiscal_month === month)
      const total = rows.reduce((s, r) => s + amount(r), 0)
      fyTotal += total
      console.log(`  ${month}   ${yen(total).padStart(10)}円`)
    }
    console.log(`  --- 第${fy}期合計 ---   ${yen(fyTotal).padStart(10)}円\n`)
  }

  // ============================================================
  // 2) 品種別集計（第5期 vs 第6期）
  // ============================================================
  const productNameById = new Map<string, string>()
  const { data: products, error: pErr } = await supabase.from('products').select('id, name')
  if (pErr) throw new Error(`products取得失敗: ${pErr.message}`)
  for (const p of products ?? []) productNameById.set(p.id, p.name)

  type KgAgg = { fy5Kg: number; fy5Sales: number; fy6Kg: number; fy6Sales: number }
  type OtherAgg = { fy5Sales: number; fy6Sales: number; fy5Units: Record<string, number>; fy6Units: Record<string, number> }
  const kgMap = new Map<string, KgAgg>()
  const kgNameByKey = new Map<string, string>()
  const otherMap = new Map<string, OtherAgg>()

  for (const r of d2cFacts) {
    if (r.fiscal_year !== 5 && r.fiscal_year !== 6) continue
    if (r.variety_label.startsWith('未マッピング:')) continue
    const key = r.product_id ?? `label:${r.variety_label}`
    const displayName = r.product_id ? (productNameById.get(r.product_id) ?? r.variety_label) : r.variety_label
    const sales = amount(r)

    if (r.quantity_kg != null) {
      if (!kgMap.has(key)) kgMap.set(key, { fy5Kg: 0, fy5Sales: 0, fy6Kg: 0, fy6Sales: 0 })
      const agg = kgMap.get(key)!
      if (r.fiscal_year === 5) { agg.fy5Kg += r.quantity_kg; agg.fy5Sales += sales } else { agg.fy6Kg += r.quantity_kg; agg.fy6Sales += sales }
      kgNameByKey.set(key, displayName)
    } else {
      if (!otherMap.has(key)) otherMap.set(key, { fy5Sales: 0, fy6Sales: 0, fy5Units: {}, fy6Units: {} })
      const agg = otherMap.get(key)!
      const unitBucket = r.fiscal_year === 5 ? agg.fy5Units : agg.fy6Units
      if (r.unit) unitBucket[r.unit] = (unitBucket[r.unit] ?? 0) + (r.quantity_raw ?? 0)
      if (r.fiscal_year === 5) agg.fy5Sales += sales
      else agg.fy6Sales += sales
      kgNameByKey.set(key, displayName)
    }
  }

  console.log('=== 2a. 品種別集計：kg単価あり（quantity_kgがnullでない行のみ）===\n')
  console.log('品種                          FY5数量kg   FY5売上        FY5円/kg   FY6数量kg   FY6売上        FY6円/kg')
  const kgRows = Array.from(kgMap.entries()).sort((a, b) => b[1].fy5Sales + b[1].fy6Sales - (a[1].fy5Sales + a[1].fy6Sales))
  for (const [key, agg] of kgRows) {
    const name = kgNameByKey.get(key)!
    const fy5PerKg = agg.fy5Kg > 0 ? Math.round(agg.fy5Sales / agg.fy5Kg) : null
    const fy6PerKg = agg.fy6Kg > 0 ? Math.round(agg.fy6Sales / agg.fy6Kg) : null
    console.log(
      `${name.padEnd(28)}  ${agg.fy5Kg.toFixed(1).padStart(9)}  ${yen(agg.fy5Sales).padStart(11)}  ${(fy5PerKg ?? '-').toString().padStart(8)}   ${agg.fy6Kg.toFixed(1).padStart(9)}  ${yen(agg.fy6Sales).padStart(11)}  ${(fy6PerKg ?? '-').toString().padStart(8)}`,
    )
  }

  console.log('\n=== 2b. 定期便・セット・ジュース・雑貨・玉数もの（kg単価対象外）===\n')
  const fmtUnits = (u: Record<string, number>) =>
    Object.entries(u).map(([unit, qty]) => `${qty.toFixed(0)}${unit}`).join(', ') || '-'
  console.log('品種                          FY5数量              FY5売上        FY6数量              FY6売上')
  const otherRows = Array.from(otherMap.entries()).sort((a, b) => b[1].fy5Sales + b[1].fy6Sales - (a[1].fy5Sales + a[1].fy6Sales))
  for (const [key, agg] of otherRows) {
    const name = kgNameByKey.get(key)!
    console.log(`${name.padEnd(28)}  ${fmtUnits(agg.fy5Units).padEnd(18)}  ${yen(agg.fy5Sales).padStart(11)}  ${fmtUnits(agg.fy6Units).padEnd(18)}  ${yen(agg.fy6Sales).padStart(11)}`)
  }

  // ============================================================
  // 3) 紅みかんのグレード別（善／恵／雫／潤）× 期別 ★最重要
  // ============================================================
  console.log('\n=== 3. 紅みかんグレード別（善／恵／雫／潤）× 期別 ===\n')
  type GradeAgg = { fy5Kg: number; fy5Sales: number; fy6Kg: number; fy6Sales: number }
  const gradeMap = new Map<string, GradeAgg>()
  let beniFy5Total = 0
  let beniFy6Total = 0
  for (const r of d2cFacts) {
    if (r.fiscal_year !== 5 && r.fiscal_year !== 6) continue
    if (!r.variety_label.startsWith('紅みかん') && r.variety_label !== '越冬紅') continue
    const sales = amount(r)
    if (r.fiscal_year === 5) beniFy5Total += sales
    else beniFy6Total += sales

    const gradeMatch = r.variety_label.match(/「(.)」/)
    const grade = gradeMatch ? gradeMatch[1] : r.variety_label === '越冬紅' ? '越冬紅（グレード表記なし）' : '(不明)'
    if (!gradeMap.has(grade)) gradeMap.set(grade, { fy5Kg: 0, fy5Sales: 0, fy6Kg: 0, fy6Sales: 0 })
    const agg = gradeMap.get(grade)!
    if (r.fiscal_year === 5) { agg.fy5Kg += r.quantity_kg ?? 0; agg.fy5Sales += sales } else { agg.fy6Kg += r.quantity_kg ?? 0; agg.fy6Sales += sales }
  }
  console.log('グレード          FY5数量kg   FY5売上        FY5円/kg   FY6数量kg   FY6売上        FY6円/kg   前年比')
  for (const grade of ['善', '恵', '雫', '潤', '越冬紅（グレード表記なし）']) {
    const agg = gradeMap.get(grade)
    if (!agg) continue
    const fy5PerKg = agg.fy5Kg > 0 ? agg.fy5Sales / agg.fy5Kg : null
    const fy6PerKg = agg.fy6Kg > 0 ? agg.fy6Sales / agg.fy6Kg : null
    const pct = fy5PerKg != null && fy6PerKg != null ? `${((fy6PerKg / fy5PerKg - 1) * 100).toFixed(1)}%` : '-'
    console.log(
      `${grade.padEnd(14)}  ${agg.fy5Kg.toFixed(1).padStart(9)}  ${yen(agg.fy5Sales).padStart(11)}  ${(fy5PerKg != null ? Math.round(fy5PerKg) : '-').toString().padStart(8)}   ${agg.fy6Kg.toFixed(1).padStart(9)}  ${yen(agg.fy6Sales).padStart(11)}  ${(fy6PerKg != null ? Math.round(fy6PerKg) : '-').toString().padStart(8)}   ${pct}`,
    )
  }
  console.log(`\n紅みかん系（越冬紅含む）合計: 第5期 ${yen(beniFy5Total)}円 / 第6期 ${yen(beniFy6Total)}円`)

  // ============================================================
  // 4) 販路横断サマリ（wholesale / processing / d2c）
  // ============================================================
  console.log('\n=== 4. 販路横断サマリ ===\n')
  const allFacts = await fetchAllRows<FactRow>((f, t) =>
    supabase
      .from('sales_facts')
      .select('fiscal_year, fiscal_month, channel_code, source_type, product_id, variety_label, quantity_kg, quantity_raw, unit, gross_sales_incl_tax, shipping_revenue')
      .in('channel_code', ['wholesale', 'processing', 'd2c'])
      .range(f, t),
  )
  for (const fy of [5, 6]) {
    const fyRows = allFacts.filter((r) => r.fiscal_year === fy)
    const byChannel: Record<string, number> = {}
    for (const r of fyRows) byChannel[r.channel_code] = (byChannel[r.channel_code] ?? 0) + amount(r)
    const total = Object.values(byChannel).reduce((s, v) => s + v, 0)
    console.log(`--- 第${fy}期 ---`)
    for (const ch of ['wholesale', 'processing', 'd2c']) {
      const v = byChannel[ch] ?? 0
      const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0'
      console.log(`  ${ch.padEnd(12)}  ${yen(v).padStart(12)}円   (${pct}%)`)
    }
    console.log(`  ${'合計'.padEnd(12)}  ${yen(total).padStart(12)}円\n`)
  }

  // ============================================================
  // 5) 未マッピングの商品名一覧（colorme_csv・全期間）
  // ============================================================
  console.log('=== 5. 未マッピングの商品名一覧（colorme_csv）===\n')
  const unmapped = d2cFacts.filter((r) => r.variety_label.startsWith('未マッピング:'))
  console.log(`未マッピング行数（全期間）: ${unmapped.length} / ${d2cFacts.length}件`)
  const unmappedFy56 = unmapped.filter((r) => r.fiscal_year === 5 || r.fiscal_year === 6)
  console.log(`うち第5期・第6期: ${unmappedFy56.length}件（0件であるべき）`)
  const countByLabel = new Map<string, number>()
  for (const r of unmapped) countByLabel.set(r.variety_label, (countByLabel.get(r.variety_label) ?? 0) + 1)
  console.log(`未マッピング商品名ユニーク数（全期間）: ${countByLabel.size}種`)
}

main().catch((err) => {
  console.error('[verify-colorme-sales] エラー:', err)
  process.exit(1)
})
