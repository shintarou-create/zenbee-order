// 株式会社TATSUMI 向け見積書（2026-09-04発行）の内容を product_pricing_tiers / company_overrides に登録する。
// 単価はすべて税抜・送料込み（TATSUMIは price_tax_type='exclusive'。注文明細作成時に toInclusiveUnitPrice() で税込変換される）。
// 既存のバレンシアオレンジ・爽涼みかんと同じ「専用tier（visible_company_id=TATSUMI）」方式に統一する。
//
// 冪等: .upsert() は使わない。既存行を select してから
//   - 存在しない            → INSERT
//   - 存在し値が一致        → SKIP
//   - 存在するが値が異なる  → UPDATE
// の3分類で処理する。DELETE / TRUNCATE は一切行わない。products テーブルも一切更新しない。
//
// 使い方:
//   npm run setup:tatsumi-quote            # dry-run（書き込みなし。実行予定を表形式で出力）
//   npm run setup:tatsumi-quote -- --apply # 実際に書き込む

import { createClient } from '@supabase/supabase-js'

const TATSUMI_ID = '8c2fe701-7089-49fe-8050-28ae46480a58'

// DB上の実際の商品名（"温州みかんジュース２L" — ２は全角、Lは半角）。
// 見積書メモでは２Ｌ（Ｌも全角）と表記されていたが、DB照会で確認した実在の表記に合わせている。
const PRODUCT_NAMES = {
  juice180: '温州みかんジュース180ml',
  juice720: '温州みかんジュース720ml',
  juice2L: '温州みかんジュース２L',
  bergamot: 'ベルガモット',
} as const

type ProductKey = keyof typeof PRODUCT_NAMES

type TierSpec = {
  productKey: ProductKey
  tier_label: string
  quantity: number
  unit_price: number
  display_order: number
}

const TIER_SPECS: TierSpec[] = [
  { productKey: 'juice180', tier_label: '30本', quantity: 30, unit_price: 380, display_order: 1 },

  { productKey: 'juice720', tier_label: '6本', quantity: 6, unit_price: 1700, display_order: 1 },
  { productKey: 'juice720', tier_label: '12本', quantity: 12, unit_price: 1450, display_order: 2 },
  { productKey: 'juice720', tier_label: '24本', quantity: 24, unit_price: 1260, display_order: 3 },

  { productKey: 'juice2L', tier_label: '1パック', quantity: 1, unit_price: 4800, display_order: 1 },

  { productKey: 'bergamot', tier_label: '2kgセット', quantity: 1, unit_price: 3400, display_order: 1 },
  { productKey: 'bergamot', tier_label: '5kgセット', quantity: 1, unit_price: 6500, display_order: 2 },
  { productKey: 'bergamot', tier_label: '10kgセット', quantity: 1, unit_price: 12000, display_order: 3 },
  { productKey: 'bergamot', tier_label: '1玉', quantity: 1, unit_price: 200, display_order: 4 },
]

// 登録内容B: 送料0円のみ（単価は入れない）
const SHIPPING_OVERRIDE_PRODUCT_KEYS: ProductKey[] = ['juice180', 'juice720', 'juice2L', 'bergamot']

// 登録内容C: 2Lパウチの数量割引（5パック以上は¥3,600）。pricing_tier_id は juice2L の '1パック' tier。
const QUANTITY_DISCOUNT = {
  productKey: 'juice2L' as ProductKey,
  tierLabel: '1パック',
  min_cases: 5,
  unit_price: 3600,
}

type DbTierRow = {
  id: string
  product_id: string
  tier_label: string
  quantity: number
  unit_price: number
  display_order: number
  is_active: boolean
  visible_company_id: string | null
}

type DbOverrideRow = {
  id: string
  company_id: string
  scope_type: string
  product_id: string | null
  category: string | null
  pricing_tier_id: string | null
  min_cases: number
  unit_price: number | null
  fixed_shipping_fee: number | null
}

type PlanAction = 'INSERT' | 'UPDATE' | 'SKIP'

type TierPlanItem = {
  spec: TierSpec
  productId: string
  productName: string
  action: PlanAction
  existing: DbTierRow | null
  diff?: string
}

type OverridePlanItem = {
  label: string
  desired: {
    company_id: string
    scope_type: string
    product_id: string | null
    category: string | null
    pricing_tier_id: string | null
    min_cases: number
    unit_price: number | null
    fixed_shipping_fee: number | null
  }
  action: PlanAction
  existing: DbOverrideRow | null
  diff?: string
  pendingTier?: boolean
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.local を確認してください）')
  }
  return createClient(url, key)
}

async function resolveProducts(supabase: ReturnType<typeof getSupabase>) {
  const names = Object.values(PRODUCT_NAMES)
  const { data, error } = await supabase.from('products').select('id, name, unit, category, is_active').in('name', names)
  if (error) {
    console.error('products 取得エラー:', error)
    process.exit(1)
  }

  const byName = new Map((data ?? []).map((p) => [p.name, p]))
  const missing = names.filter((n) => !byName.has(n))

  if (missing.length > 0) {
    console.error('❌ 以下の商品名が完全一致で見つかりませんでした:')
    for (const name of missing) {
      console.error(`  - "${name}"`)
    }
    console.error('\n候補（先頭4文字のLIKE検索）:')
    for (const name of missing) {
      const keyword = name.slice(0, 4)
      const { data: candidates } = await supabase.from('products').select('id, name, unit, is_active').ilike('name', `%${keyword}%`)
      console.error(`  "${name}" に近い候補:`, candidates)
    }
    process.exit(1)
  }

  const products: Record<ProductKey, { id: string; name: string; unit: string; category: string | null; is_active: boolean }> =
    {} as never
  for (const [key, name] of Object.entries(PRODUCT_NAMES) as [ProductKey, string][]) {
    products[key] = byName.get(name)!
  }
  return products
}

function tiersEqual(a: DbTierRow, spec: TierSpec): boolean {
  return (
    a.quantity === spec.quantity &&
    a.unit_price === spec.unit_price &&
    a.display_order === spec.display_order &&
    a.is_active === true &&
    a.visible_company_id === TATSUMI_ID
  )
}

function overridesEqual(a: DbOverrideRow, desired: OverridePlanItem['desired']): boolean {
  return (
    a.scope_type === desired.scope_type &&
    a.product_id === desired.product_id &&
    a.category === desired.category &&
    a.pricing_tier_id === desired.pricing_tier_id &&
    a.min_cases === desired.min_cases &&
    a.unit_price === desired.unit_price &&
    a.fixed_shipping_fee === desired.fixed_shipping_fee
  )
}

function diffTier(a: DbTierRow, spec: TierSpec): string {
  const parts: string[] = []
  if (a.quantity !== spec.quantity) parts.push(`quantity: ${a.quantity} → ${spec.quantity}`)
  if (a.unit_price !== spec.unit_price) parts.push(`unit_price: ${a.unit_price} → ${spec.unit_price}`)
  if (a.display_order !== spec.display_order) parts.push(`display_order: ${a.display_order} → ${spec.display_order}`)
  if (a.is_active !== true) parts.push(`is_active: ${a.is_active} → true`)
  if (a.visible_company_id !== TATSUMI_ID) parts.push(`visible_company_id: ${a.visible_company_id} → ${TATSUMI_ID}`)
  return parts.join(', ')
}

function diffOverride(a: DbOverrideRow, desired: OverridePlanItem['desired']): string {
  const parts: string[] = []
  if (a.pricing_tier_id !== desired.pricing_tier_id) parts.push(`pricing_tier_id: ${a.pricing_tier_id} → ${desired.pricing_tier_id}`)
  if (a.min_cases !== desired.min_cases) parts.push(`min_cases: ${a.min_cases} → ${desired.min_cases}`)
  if (a.unit_price !== desired.unit_price) parts.push(`unit_price: ${a.unit_price} → ${desired.unit_price}`)
  if (a.fixed_shipping_fee !== desired.fixed_shipping_fee) parts.push(`fixed_shipping_fee: ${a.fixed_shipping_fee} → ${desired.fixed_shipping_fee}`)
  return parts.join(', ')
}

async function main() {
  const apply = process.argv.includes('--apply')
  const supabase = getSupabase()

  console.log(`\n=== TATSUMI 見積書登録スクリプト (${apply ? '--apply 実行' : 'dry-run'}) ===\n`)

  const products = await resolveProducts(supabase)
  console.log('商品解決結果:')
  for (const [key, p] of Object.entries(products) as [ProductKey, { id: string; name: string }][]) {
    console.log(`  ${key}: "${p.name}" (${p.id})`)
  }

  // ---- 登録内容A: product_pricing_tiers ----
  const productIds = Object.values(products).map((p) => p.id)
  const { data: existingTiersRaw, error: tiersFetchError } = await supabase
    .from('product_pricing_tiers')
    .select('*')
    .in('product_id', productIds)
    .eq('visible_company_id', TATSUMI_ID)
  if (tiersFetchError) {
    console.error('product_pricing_tiers 取得エラー:', tiersFetchError)
    process.exit(1)
  }
  const existingTiers = (existingTiersRaw ?? []) as DbTierRow[]

  const tierPlan: TierPlanItem[] = TIER_SPECS.map((spec) => {
    const product = products[spec.productKey]
    const existing = existingTiers.find((t) => t.product_id === product.id && t.tier_label === spec.tier_label) ?? null
    if (!existing) {
      return { spec, productId: product.id, productName: product.name, action: 'INSERT', existing: null }
    }
    if (tiersEqual(existing, spec)) {
      return { spec, productId: product.id, productName: product.name, action: 'SKIP', existing }
    }
    return {
      spec,
      productId: product.id,
      productName: product.name,
      action: 'UPDATE',
      existing,
      diff: diffTier(existing, spec),
    }
  })

  console.log('\n--- 登録内容A: product_pricing_tiers（9行） ---')
  console.table(
    tierPlan.map((p) => ({
      product: p.productName,
      tier_label: p.spec.tier_label,
      quantity: p.spec.quantity,
      unit_price: p.spec.unit_price,
      display_order: p.spec.display_order,
      action: p.action,
      diff: p.diff ?? '',
    }))
  )

  // ---- 登録内容B: company_overrides（送料0円のみ、4行） ----
  const { data: existingOverridesRaw, error: overridesFetchError } = await supabase
    .from('company_overrides')
    .select('*')
    .eq('company_id', TATSUMI_ID)
  if (overridesFetchError) {
    console.error('company_overrides 取得エラー:', overridesFetchError)
    process.exit(1)
  }
  const existingOverrides = (existingOverridesRaw ?? []) as DbOverrideRow[]

  const shippingOverridePlan: OverridePlanItem[] = SHIPPING_OVERRIDE_PRODUCT_KEYS.map((key) => {
    const product = products[key]
    const desired = {
      company_id: TATSUMI_ID,
      scope_type: 'product',
      product_id: product.id,
      category: null,
      pricing_tier_id: null,
      min_cases: 1,
      unit_price: null,
      fixed_shipping_fee: 0,
    }
    const existing =
      existingOverrides.find(
        (o) =>
          o.scope_type === desired.scope_type &&
          o.product_id === desired.product_id &&
          o.pricing_tier_id === desired.pricing_tier_id &&
          o.min_cases === desired.min_cases
      ) ?? null
    if (!existing) {
      return { label: `${product.name}（送料0円）`, desired, action: 'INSERT', existing: null }
    }
    if (overridesEqual(existing, desired)) {
      return { label: `${product.name}（送料0円）`, desired, action: 'SKIP', existing }
    }
    return { label: `${product.name}（送料0円）`, desired, action: 'UPDATE', existing, diff: diffOverride(existing, desired) }
  })

  // ---- 登録内容C: company_overrides（2Lパウチ数量割引、1行） ----
  // pricing_tier_id は登録内容Aの '1パック' tier に依存する。dry-run 時点でまだ存在しない場合は
  // pendingTier=true として「新規INSERT」に分類する（apply時にtier作成後の実IDで確定させる）。
  const juice2LTierPlan = tierPlan.find((p) => p.spec.productKey === 'juice2L' && p.spec.tier_label === QUANTITY_DISCOUNT.tierLabel)!
  const juice2LTierId = juice2LTierPlan.existing?.id ?? null

  let quantityDiscountPlan: OverridePlanItem
  {
    const product = products[QUANTITY_DISCOUNT.productKey]
    const desired = {
      company_id: TATSUMI_ID,
      scope_type: 'product',
      product_id: product.id,
      category: null,
      pricing_tier_id: juice2LTierId,
      min_cases: QUANTITY_DISCOUNT.min_cases,
      unit_price: QUANTITY_DISCOUNT.unit_price,
      fixed_shipping_fee: null,
    }
    if (!juice2LTierId) {
      quantityDiscountPlan = {
        label: `${product.name}（数量割引 ${QUANTITY_DISCOUNT.min_cases}パック以上→¥${QUANTITY_DISCOUNT.unit_price}）`,
        desired,
        action: 'INSERT',
        existing: null,
        pendingTier: true,
      }
    } else {
      const existing =
        existingOverrides.find(
          (o) =>
            o.scope_type === desired.scope_type &&
            o.product_id === desired.product_id &&
            o.pricing_tier_id === desired.pricing_tier_id &&
            o.min_cases === desired.min_cases
        ) ?? null
      if (!existing) {
        quantityDiscountPlan = {
          label: `${product.name}（数量割引 ${QUANTITY_DISCOUNT.min_cases}パック以上→¥${QUANTITY_DISCOUNT.unit_price}）`,
          desired,
          action: 'INSERT',
          existing: null,
        }
      } else if (overridesEqual(existing, desired)) {
        quantityDiscountPlan = {
          label: `${product.name}（数量割引 ${QUANTITY_DISCOUNT.min_cases}パック以上→¥${QUANTITY_DISCOUNT.unit_price}）`,
          desired,
          action: 'SKIP',
          existing,
        }
      } else {
        quantityDiscountPlan = {
          label: `${product.name}（数量割引 ${QUANTITY_DISCOUNT.min_cases}パック以上→¥${QUANTITY_DISCOUNT.unit_price}）`,
          desired,
          action: 'UPDATE',
          existing,
          diff: diffOverride(existing, desired),
        }
      }
    }
  }

  const overridePlan = [...shippingOverridePlan, quantityDiscountPlan]

  console.log('\n--- 登録内容B+C: company_overrides（5行） ---')
  console.table(
    overridePlan.map((p) => ({
      label: p.label,
      pricing_tier_id: p.desired.pricing_tier_id ?? (p.pendingTier ? '(tier作成後に確定)' : null),
      min_cases: p.desired.min_cases,
      unit_price: p.desired.unit_price,
      fixed_shipping_fee: p.desired.fixed_shipping_fee,
      action: p.action,
      diff: p.diff ?? '',
    }))
  )

  const tierCounts = { INSERT: 0, UPDATE: 0, SKIP: 0 }
  for (const p of tierPlan) tierCounts[p.action]++
  const overrideCounts = { INSERT: 0, UPDATE: 0, SKIP: 0 }
  for (const p of overridePlan) overrideCounts[p.action]++

  console.log('\n--- サマリー ---')
  console.log(`tier:     INSERT=${tierCounts.INSERT}  UPDATE=${tierCounts.UPDATE}  SKIP=${tierCounts.SKIP}  (計${tierPlan.length}行)`)
  console.log(
    `override: INSERT=${overrideCounts.INSERT}  UPDATE=${overrideCounts.UPDATE}  SKIP=${overrideCounts.SKIP}  (計${overridePlan.length}行)`
  )

  if (!apply) {
    console.log('\n[dry-run] --apply を付けずに実行したため、DBへの書き込みは行っていません。')
    return
  }

  console.log('\n=== --apply: 書き込みを実行します ===')

  // --- tier の適用 ---
  const tierIdByPlanIndex = new Map<number, string>()
  for (let i = 0; i < tierPlan.length; i++) {
    const p = tierPlan[i]
    if (p.action === 'SKIP') {
      tierIdByPlanIndex.set(i, p.existing!.id)
      continue
    }
    if (p.action === 'UPDATE') {
      const { data, error } = await supabase
        .from('product_pricing_tiers')
        .update({
          quantity: p.spec.quantity,
          unit_price: p.spec.unit_price,
          display_order: p.spec.display_order,
          is_active: true,
          visible_company_id: TATSUMI_ID,
        })
        .eq('id', p.existing!.id)
        .select('id')
        .single()
      if (error || !data) {
        console.error(`tier UPDATE失敗 (${p.productName} / ${p.spec.tier_label}):`, error)
        process.exit(1)
      }
      tierIdByPlanIndex.set(i, data.id)
      console.log(`  UPDATE tier: ${p.productName} / ${p.spec.tier_label}`)
      continue
    }
    // INSERT
    const { data, error } = await supabase
      .from('product_pricing_tiers')
      .insert({
        product_id: p.productId,
        tier_label: p.spec.tier_label,
        quantity: p.spec.quantity,
        unit_price: p.spec.unit_price,
        display_order: p.spec.display_order,
        is_active: true,
        visible_company_id: TATSUMI_ID,
      })
      .select('id')
      .single()
    if (error || !data) {
      console.error(`tier INSERT失敗 (${p.productName} / ${p.spec.tier_label}):`, error)
      process.exit(1)
    }
    tierIdByPlanIndex.set(i, data.id)
    console.log(`  INSERT tier: ${p.productName} / ${p.spec.tier_label} → id=${data.id}`)
  }

  // juice2L の '1パック' tier の確定ID（登録内容Cで使う）
  const juice2LTierPlanIndex = tierPlan.indexOf(juice2LTierPlan)
  const resolvedJuice2LTierId = tierIdByPlanIndex.get(juice2LTierPlanIndex)!

  // --- override の適用 ---
  for (const p of overridePlan) {
    const desired = { ...p.desired }
    if (p === quantityDiscountPlan) {
      desired.pricing_tier_id = resolvedJuice2LTierId
    }

    if (p.action === 'SKIP') continue

    if (p.action === 'UPDATE') {
      const { error } = await supabase
        .from('company_overrides')
        .update({
          scope_type: desired.scope_type,
          product_id: desired.product_id,
          category: desired.category,
          pricing_tier_id: desired.pricing_tier_id,
          min_cases: desired.min_cases,
          unit_price: desired.unit_price,
          fixed_shipping_fee: desired.fixed_shipping_fee,
        })
        .eq('id', p.existing!.id)
      if (error) {
        console.error(`override UPDATE失敗 (${p.label}):`, error)
        process.exit(1)
      }
      console.log(`  UPDATE override: ${p.label}`)
      continue
    }

    // INSERT（pendingTierの場合はここで実IDに差し替え済みのdesiredを使う）
    const { error } = await supabase.from('company_overrides').insert(desired)
    if (error) {
      console.error(`override INSERT失敗 (${p.label}):`, error)
      process.exit(1)
    }
    console.log(`  INSERT override: ${p.label}`)
  }

  console.log('\n=== 完了 ===')
}

main().catch((err) => {
  console.error('スクリプト実行エラー:', err)
  process.exit(1)
})
