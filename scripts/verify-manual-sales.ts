// フェーズC検証: 全販路（wholesale/processing/d2c/manual_csv）の横断確認。
// C-2) 全販路の期別サマリ（第5期 vs 第6期）
// C-3) 大口（bulk）の取引先別ランキング
// C-4) 販路×品種のクロス表（第6期）
//
// 使い方: npm run verify:manual

import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from '../src/lib/supabase-batch'

function yen(n: number): string {
  return Math.round(n).toLocaleString('ja-JP')
}

const ALL_CHANNELS = ['d2c', 'wholesale', 'processing', 'market', 'farmstand', 'bulk', 'event']

type FactRow = {
  fiscal_year: number
  channel_code: string
  source_type: string
  source_ref: string | null
  product_id: string | null
  variety_label: string
  quantity_kg: number | null
  gross_sales_incl_tax: number
  shipping_revenue: number
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です')
  const supabase = createClient(url, key)

  const allFacts = await fetchAllRows<FactRow>((f, t) =>
    supabase
      .from('sales_facts')
      .select('fiscal_year, channel_code, source_type, source_ref, product_id, variety_label, quantity_kg, gross_sales_incl_tax, shipping_revenue')
      .in('channel_code', ALL_CHANNELS)
      .range(f, t),
  )
  console.log(`[verify-manual-sales] sales_facts（全販路）全件: ${allFacts.length}件\n`)

  const amount = (r: FactRow) => r.gross_sales_incl_tax + r.shipping_revenue

  // ============================================================
  // C-2) 全販路の期別サマリ（第5期 vs 第6期）
  // ============================================================
  console.log('=== C-2. 全販路の期別サマリ（第5期 vs 第6期）===\n')
  const fy5ByChannel = new Map<string, number>()
  const fy6ByChannel = new Map<string, number>()
  for (const r of allFacts) {
    if (r.fiscal_year === 5) fy5ByChannel.set(r.channel_code, (fy5ByChannel.get(r.channel_code) ?? 0) + amount(r))
    if (r.fiscal_year === 6) fy6ByChannel.set(r.channel_code, (fy6ByChannel.get(r.channel_code) ?? 0) + amount(r))
  }
  const fy5Total = Array.from(fy5ByChannel.values()).reduce((s, v) => s + v, 0)
  const fy6Total = Array.from(fy6ByChannel.values()).reduce((s, v) => s + v, 0)

  console.log('販路           第5期売上      構成比    第6期売上      構成比    前期比')
  for (const ch of ALL_CHANNELS) {
    const fy5 = fy5ByChannel.get(ch) ?? 0
    const fy6 = fy6ByChannel.get(ch) ?? 0
    const fy5Pct = fy5Total > 0 ? ((fy5 / fy5Total) * 100).toFixed(1) : '-'
    const fy6Pct = fy6Total > 0 ? ((fy6 / fy6Total) * 100).toFixed(1) : '-'
    const yoy = fy5 > 0 ? `${(((fy6 - fy5) / fy5) * 100).toFixed(1)}%` : fy6 > 0 ? '(第5期未入力)' : '-'
    console.log(
      `${ch.padEnd(12)}  ${yen(fy5).padStart(11)}円  ${fy5Pct.padStart(6)}%   ${yen(fy6).padStart(11)}円  ${fy6Pct.padStart(6)}%   ${yoy}`,
    )
  }
  console.log(`${'合計'.padEnd(12)}  ${yen(fy5Total).padStart(11)}円          ${yen(fy6Total).padStart(11)}円`)
  console.log(`\n前期比: 第5期${yen(fy5Total)}円 → 第6期${yen(fy6Total)}円（${yen(fy6Total - fy5Total)}円 / ${(((fy6Total - fy5Total) / fy5Total) * 100).toFixed(1)}%）`)
  console.log('※ 第5期の market/farmstand/bulk は未入力のため空欄（0円）が正常。市場の2025年11-12月分は未入手のため第6期の市場も過小計上。')

  // ============================================================
  // C-3) 大口（bulk）の取引先別ランキング
  // ============================================================
  console.log('\n=== C-3. 大口（bulk）取引先別ランキング（第6期）===\n')
  // sub_channel は sales_facts に列が無いため source_ref '{channel}:{sale_date}:{sub_channel}:{行番号}' から復元する
  const bulkFy6 = allFacts.filter((r) => r.channel_code === 'bulk' && r.fiscal_year === 6 && r.source_type === 'manual_csv')
  const bySubChannel = new Map<string, number>()
  for (const r of bulkFy6) {
    const parts = (r.source_ref ?? '').split(':')
    const subChannel = parts.length >= 3 ? parts[2] : '(不明)'
    bySubChannel.set(subChannel, (bySubChannel.get(subChannel) ?? 0) + amount(r))
  }
  const bulkTotal = Array.from(bySubChannel.values()).reduce((s, v) => s + v, 0)
  const ranked = Array.from(bySubChannel.entries()).sort((a, b) => b[1] - a[1])
  console.log('取引先                    売上          構成比    累積構成比')
  let cumPct = 0
  for (const [name, v] of ranked) {
    const pct = (v / bulkTotal) * 100
    cumPct += pct
    console.log(`${name.padEnd(24)}  ${yen(v).padStart(10)}円   ${pct.toFixed(1).padStart(5)}%    ${cumPct.toFixed(1).padStart(5)}%`)
  }
  console.log(`${'合計'.padEnd(24)}  ${yen(bulkTotal).padStart(10)}円`)

  // ============================================================
  // C-4) 販路×品種のクロス表（第6期）
  // ============================================================
  console.log('\n=== C-4. 販路×品種のクロス表（第6期）===\n')
  const FRUIT_CATEGORIES = new Set(['柑橘', '枇杷（びわ）'])
  const { data: productsForAgg, error: prodErr } = await supabase.from('products').select('id, name, category')
  if (prodErr) throw new Error(`products取得失敗: ${prodErr.message}`)
  const productNameById = new Map((productsForAgg ?? []).map((p) => [p.id, p.name]))
  const productCategoryById = new Map((productsForAgg ?? []).map((p) => [p.id, p.category]))

  const fy6Facts = allFacts.filter((r) => r.fiscal_year === 6)

  type CrossKey = string // `${channel}||${varietyKey}`
  type CrossAgg = { kg: number; sales: number; hasKg: boolean }
  const fruitCross = new Map<CrossKey, CrossAgg>()
  const varietyNames = new Set<string>()
  const otherCross = new Map<CrossKey, CrossAgg>()
  const otherVarietyNames = new Set<string>()

  for (const r of fy6Facts) {
    const displayName = r.product_id ? (productNameById.get(r.product_id) ?? r.variety_label) : r.variety_label
    const category = r.product_id ? (productCategoryById.get(r.product_id) ?? null) : null
    const isFruit = category != null && FRUIT_CATEGORIES.has(category)
    const key = `${r.channel_code}||${displayName}`
    const sales = amount(r)
    if (isFruit) {
      if (!fruitCross.has(key)) fruitCross.set(key, { kg: 0, sales: 0, hasKg: false })
      const agg = fruitCross.get(key)!
      if (r.quantity_kg != null) { agg.kg += r.quantity_kg; agg.hasKg = true }
      agg.sales += sales
      varietyNames.add(displayName)
    } else {
      if (!otherCross.has(key)) otherCross.set(key, { kg: 0, sales: 0, hasKg: false })
      const agg = otherCross.get(key)!
      agg.sales += sales
      otherVarietyNames.add(displayName)
    }
  }

  console.log('--- C-4a. 果実カテゴリ（柑橘・枇杷）: 販路×品種、kg単価は quantity_kg ありの行のみ ---\n')
  const channelsUsed = ALL_CHANNELS.filter((ch) => fy6Facts.some((r) => r.channel_code === ch))
  for (const variety of Array.from(varietyNames).sort()) {
    console.log(`[${variety}]`)
    for (const ch of channelsUsed) {
      const agg = fruitCross.get(`${ch}||${variety}`)
      if (!agg) continue
      const perKg = agg.hasKg && agg.kg > 0 ? Math.round(agg.sales / agg.kg) : null
      console.log(`  ${ch.padEnd(12)}  数量kg=${agg.kg.toFixed(1).padStart(8)}  売上=${yen(agg.sales).padStart(10)}円  ${perKg != null ? `円/kg=${perKg}` : '(kg単価なし)'}`)
    }
  }

  console.log('\n--- C-4b. ジュース・葉物・副産物等（kg単価対象外）: 販路×品種、売上のみ ---\n')
  for (const variety of Array.from(otherVarietyNames).sort()) {
    console.log(`[${variety}]`)
    for (const ch of channelsUsed) {
      const agg = otherCross.get(`${ch}||${variety}`)
      if (!agg) continue
      console.log(`  ${ch.padEnd(12)}  売上=${yen(agg.sales).padStart(10)}円`)
    }
  }
}

main().catch((err) => {
  console.error('[verify-manual-sales] エラー:', err)
  process.exit(1)
})
