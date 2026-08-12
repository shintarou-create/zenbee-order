// 卸データ（orders × order_items × order_shipping × products）→ sales_facts への UPSERT バッチ。
// 何度実行しても結果が同じ（冪等）。source_type='order_system' / source_ref=order_items.id で一意化する。
//
// 使い方:
//   npm run sync:wholesale-sales                          # 現在の期（未指定時）を対象
//   npm run sync:wholesale-sales -- --fiscal-year=6        # 指定の期を対象
//   npm run sync:wholesale-sales -- --from=2025-09-01 --to=2025-09-30   # 任意期間を対象

import { createClient } from '@supabase/supabase-js'
import { fetchAllRows, fetchInChunksByIds } from '../src/lib/supabase-batch'
import { getFiscalYear, getFiscalMonth, getFiscalYearRange } from '../src/lib/fiscal-year'

const CHANNEL_CODE = 'wholesale'
const SOURCE_TYPE = 'order_system'
// 売上確定とみなす status。既存ダッシュボード(src/app/api/admin/analytics/route.ts)と同じ基準で
// cancelled のみ除外する（pending/shipped/done を売上計上）。
const SOLD_STATUSES = ['pending', 'shipped', 'done']
const ID_CHUNK_SIZE = 200
const UPSERT_CHUNK_SIZE = 500

type OrderRow = { id: string; delivery_date: string; status: string }
type ItemRow = {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  quantity: number | null
  unit: string | null
  subtotal: number | null
}
type ShippingRow = { order_id: string; cost: number | null }
type ProductRow = { id: string; name: string; weight_kg_per_unit: number | null }

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
  order_status: string
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

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (name: string) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.split('=').slice(1).join('=') : undefined
  }
  return { fiscalYear: get('fiscal-year'), from: get('from'), to: get('to') }
}

// order_shipping の注文合計を order_items の gross_sales_incl_tax 比で按分する。
// 端数は最初の行（id昇順で先頭）に寄せる。totalSubtotal=0（全行0円）の場合は均等割り。
function allocateShipping(shippingSum: number, subtotals: number[]): number[] {
  const n = subtotals.length
  const shares = new Array(n).fill(0)
  if (shippingSum === 0 || n === 0) return shares

  const totalSubtotal = subtotals.reduce((sum, v) => sum + v, 0)
  let restSum = 0
  for (let i = 1; i < n; i++) {
    const share =
      totalSubtotal > 0
        ? Math.round((shippingSum * subtotals[i]) / totalSubtotal)
        : Math.floor(shippingSum / n)
    shares[i] = share
    restSum += share
  }
  shares[0] = shippingSum - restSum
  return shares
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.local を確認してください）')
  }
  const supabase = createClient(url, key)

  const { fiscalYear, from, to } = parseArgs()
  let rangeStart: string
  let rangeEnd: string
  if (from && to) {
    rangeStart = from
    rangeEnd = to
  } else {
    const fy = fiscalYear ? parseInt(fiscalYear, 10) : getFiscalYear(new Date().toISOString().slice(0, 10))
    const range = getFiscalYearRange(fy)
    rangeStart = range.start
    rangeEnd = range.end
  }
  console.log(`[sync-wholesale-sales] 対象期間: ${rangeStart} 〜 ${rangeEnd}`)
  console.log(`[sync-wholesale-sales] 対象status: ${SOLD_STATUSES.join(', ')}（cancelled除外）`)

  const orders = await fetchAllRows<OrderRow>((f, t) =>
    supabase
      .from('orders')
      .select('id, delivery_date, status')
      .in('status', SOLD_STATUSES)
      .gte('delivery_date', rangeStart)
      .lte('delivery_date', rangeEnd)
      .range(f, t),
  )
  console.log(`[sync-wholesale-sales] 対象注文数: ${orders.length}`)

  const orderIds = orders.map((o) => o.id)
  const orderById = new Map(orders.map((o) => [o.id, o]))

  const items =
    orderIds.length > 0
      ? await fetchInChunksByIds<ItemRow>(orderIds, ID_CHUNK_SIZE, (chunkIds, f, t) =>
          supabase
            .from('order_items')
            .select('id, order_id, product_id, product_name, quantity, unit, subtotal')
            .in('order_id', chunkIds)
            .range(f, t),
        )
      : []
  console.log(`[sync-wholesale-sales] 対象order_items数: ${items.length}`)

  const shippingRows =
    orderIds.length > 0
      ? await fetchInChunksByIds<ShippingRow>(orderIds, ID_CHUNK_SIZE, (chunkIds, f, t) =>
          supabase.from('order_shipping').select('order_id, cost').in('order_id', chunkIds).range(f, t),
        )
      : []
  const shippingSumByOrder = new Map<string, number>()
  for (const s of shippingRows) {
    shippingSumByOrder.set(s.order_id, (shippingSumByOrder.get(s.order_id) ?? 0) + Math.round(s.cost ?? 0))
  }

  const productIds = Array.from(new Set(items.map((i) => i.product_id).filter((id): id is string => !!id)))
  const products =
    productIds.length > 0
      ? await fetchInChunksByIds<ProductRow>(productIds, ID_CHUNK_SIZE, (chunkIds, f, t) =>
          supabase.from('products').select('id, name, weight_kg_per_unit').in('id', chunkIds).range(f, t),
        )
      : []
  const productById = new Map(products.map((p) => [p.id, p]))

  // order_id -> items[]（id昇順で固定。按分の端数配分と実行順を再実行間で一致させるため）
  const itemsByOrder = new Map<string, ItemRow[]>()
  for (const item of items) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, [])
    itemsByOrder.get(item.order_id)!.push(item)
  }

  let skippedNoItems = 0
  const rows: SalesFactRow[] = []

  for (const orderId of orderIds) {
    const order = orderById.get(orderId)!
    const orderItems = (itemsByOrder.get(orderId) ?? []).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    if (orderItems.length === 0) {
      skippedNoItems++
      continue
    }

    const subtotals = orderItems.map((it) => Math.round(it.subtotal ?? 0))
    const shippingSum = shippingSumByOrder.get(orderId) ?? 0
    const shares = allocateShipping(shippingSum, subtotals)

    const saleDate = order.delivery_date
    const fiscalYearOfRow = getFiscalYear(saleDate)
    const fiscalMonth = getFiscalMonth(saleDate)

    orderItems.forEach((item, idx) => {
      const product = item.product_id ? productById.get(item.product_id) : undefined
      const varietyLabel = item.product_name || product?.name || '不明'
      const quantityRaw = item.quantity ?? null
      // kg換算値が無い品目・自由記入行(product_id無し)は quantity_kg=null のまま。推測換算はしない。
      const quantityKg =
        item.product_id && product?.weight_kg_per_unit != null && quantityRaw != null
          ? quantityRaw * product.weight_kg_per_unit
          : null

      rows.push({
        sale_date: saleDate,
        fiscal_year: fiscalYearOfRow,
        fiscal_month: fiscalMonth,
        channel_code: CHANNEL_CODE,
        product_id: item.product_id,
        variety_label: varietyLabel,
        quantity_kg: quantityKg,
        quantity_raw: quantityRaw,
        unit: item.unit,
        order_status: order.status,
        gross_sales_incl_tax: subtotals[idx],
        shipping_revenue: shares[idx],
        shipping_cost: 0, // ヤマト実送料はDBに無い。概算値は入れない
        material_cost: 0, // shipping_box_templates.cost は顧客請求送料であり資材原価ではないため使用しない
        commission: 0,
        purchase_cost: 0,
        source_type: SOURCE_TYPE,
        source_ref: item.id,
        is_estimated: true, // shipping_cost / material_cost が確定値でないため全行common
      })
    })
  }

  if (skippedNoItems > 0) {
    console.log(`[sync-wholesale-sales] order_itemsが0件の注文をスキップ: ${skippedNoItems}件`)
  }
  console.log(`[sync-wholesale-sales] 生成行数: ${rows.length}`)

  let upserted = 0
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE)
    const { error } = await supabase.from('sales_facts').upsert(chunk, { onConflict: 'source_type,source_ref' })
    if (error) throw new Error(`upsert失敗（${i}〜${i + chunk.length}件目）: ${error.message}`)
    upserted += chunk.length
    console.log(`[sync-wholesale-sales] upsert進捗: ${upserted}/${rows.length}`)
  }

  console.log(`[sync-wholesale-sales] 完了: ${upserted}件をupsertしました`)
}

main().catch((err) => {
  console.error('[sync-wholesale-sales] エラー:', err)
  process.exit(1)
})
