// 既存売上分析ダッシュボード（src/app/api/admin/analytics/route.ts と同じ集計基準：
// status!=cancelled・orders.total_amount・delivery_date基準の月次）と、sales_facts の
// 月別合計（gross_sales_incl_tax + shipping_revenue）を突き合わせる検証スクリプト。
//
// 使い方:
//   npm run verify:wholesale-sales                    # 現在の期を検証
//   npm run verify:wholesale-sales -- --fiscal-year=6  # 指定の期を検証

import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from '../src/lib/supabase-batch'
import { getFiscalYear, getFiscalMonths, getFiscalYearRange } from '../src/lib/fiscal-year'

const CHANNEL_CODE = 'wholesale'
const SOURCE_TYPE = 'order_system'
const SOLD_STATUSES = ['pending', 'shipped', 'done']

function parseArgs() {
  const args = process.argv.slice(2)
  const hit = args.find((a) => a.startsWith('--fiscal-year='))
  return { fiscalYear: hit ? hit.split('=')[1] : undefined }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function monthRange(fiscalMonth: string): { start: string; end: string } {
  const [yearStr, monthStr] = fiscalMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const lastDay = daysInMonth(year, month)
  return {
    start: `${fiscalMonth}-01`,
    end: `${fiscalMonth}-${String(lastDay).padStart(2, '0')}`,
  }
}

function formatYen(n: number): string {
  return n.toLocaleString('ja-JP')
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.local を確認してください）')
  }
  const supabase = createClient(url, key)

  const { fiscalYear } = parseArgs()
  const fy = fiscalYear ? parseInt(fiscalYear, 10) : getFiscalYear(new Date().toISOString().slice(0, 10))
  const range = getFiscalYearRange(fy)
  const months = getFiscalMonths(fy)

  console.log(`[verify-wholesale-sales] 第${fy}期（${range.start} 〜 ${range.end}）を検証します\n`)

  type OrderRow = { id: string; total_amount: number | null }
  type FactRow = { gross_sales_incl_tax: number | null; shipping_revenue: number | null }

  const results: { month: string; dashboard: number; salesFacts: number; diff: number }[] = []

  for (const month of months) {
    const { start, end } = monthRange(month)

    const orders = await fetchAllRows<OrderRow>((f, t) =>
      supabase
        .from('orders')
        .select('id, total_amount')
        .in('status', SOLD_STATUSES)
        .gte('delivery_date', start)
        .lte('delivery_date', end)
        .range(f, t),
    )
    const dashboardTotal = orders.reduce((sum, o) => sum + (o.total_amount ?? 0), 0)

    const facts = await fetchAllRows<FactRow>((f, t) =>
      supabase
        .from('sales_facts')
        .select('gross_sales_incl_tax, shipping_revenue')
        .eq('fiscal_month', month)
        .eq('channel_code', CHANNEL_CODE)
        .eq('source_type', SOURCE_TYPE)
        .range(f, t),
    )
    const salesFactsTotal = facts.reduce((sum, r) => sum + (r.gross_sales_incl_tax ?? 0) + (r.shipping_revenue ?? 0), 0)

    results.push({ month, dashboard: dashboardTotal, salesFacts: salesFactsTotal, diff: salesFactsTotal - dashboardTotal })
  }

  console.log('月       既存ダッシュボード    sales_facts    差額    判定')
  let allOk = true
  let dashboardGrandTotal = 0
  let salesFactsGrandTotal = 0
  for (const r of results) {
    const verdict = r.diff === 0 ? 'OK' : 'NG'
    if (verdict === 'NG') allOk = false
    dashboardGrandTotal += r.dashboard
    salesFactsGrandTotal += r.salesFacts
    console.log(
      `${r.month}   ${formatYen(r.dashboard).padStart(12)}   ${formatYen(r.salesFacts).padStart(12)}   ${formatYen(r.diff).padStart(8)}   ${verdict}`,
    )
  }
  console.log('----')
  console.log(
    `合計     ${formatYen(dashboardGrandTotal).padStart(12)}   ${formatYen(salesFactsGrandTotal).padStart(12)}   ${formatYen(salesFactsGrandTotal - dashboardGrandTotal).padStart(8)}   ${allOk ? 'OK' : 'NG'}`,
  )

  if (!allOk) {
    console.log('\n差額のある月があります。source_type/channel_codeの絞り込み漏れ、statusの取りこぼし、按分計算の誤りなどを確認してください。')
    process.exit(1)
  } else {
    console.log('\n全月一致しました。')
  }
}

main().catch((err) => {
  console.error('[verify-wholesale-sales] エラー:', err)
  process.exit(1)
})
