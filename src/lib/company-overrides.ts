import type { CompanyOverride } from '@/types'

// 取引先別の個別単価・固定送料特例（company_overrides）を適用するための純粋関数群。
// 顧客側API・管理画面側APIの両方で同じロジックを共有する。

export type CaseAggregation = {
  byProduct: Map<string, number>
  byCategory: Map<string, number>
}

/**
 * 注文の通常行（is_custom除外）から、商品単位・カテゴリ単位の「合計ケース数」を集計する。
 * このシステムでは order_item の quantity = ケース数（180ml/720mlジュース含む）。
 * category は items には無いので、product_id→category の対応表から解決する。
 */
export function aggregateCases(
  items: Array<{ productId: string; quantity: number; isCustom?: boolean }>,
  productCategory: Map<string, string>
): CaseAggregation {
  const byProduct = new Map<string, number>()
  const byCategory = new Map<string, number>()
  for (const item of items) {
    if (item.isCustom) continue
    if (!item.productId) continue
    byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity)
    const category = productCategory.get(item.productId)
    if (category) {
      byCategory.set(category, (byCategory.get(category) ?? 0) + item.quantity)
    }
  }
  return { byProduct, byCategory }
}

/**
 * min_cases 条件を満たして発動する override だけを残す。
 * pricing_tier_id による行レベルの絞り込みは適用時（resolveUnitPriceOverride）に行う。
 */
export function getActiveOverrides(
  overrides: CompanyOverride[],
  agg: CaseAggregation
): CompanyOverride[] {
  return overrides.filter((o) => {
    if (o.scope_type === 'product') {
      if (!o.product_id) return false
      return (agg.byProduct.get(o.product_id) ?? 0) >= o.min_cases
    }
    if (o.scope_type === 'category') {
      if (!o.category) return false
      return (agg.byCategory.get(o.category) ?? 0) >= o.min_cases
    }
    return false
  })
}

/**
 * 1注文行にマッチする有効 override の個別単価を返す（無ければ null）。
 * - scope='product': override.product_id === item.productId
 * - scope='category': override.category === その商品の category
 * - override.pricing_tier_id が非nullなら item.pricingTierId とも一致が必要（nullなら入数問わず）
 * 複数該当する場合は min_cases が大きい（＝より厳しい条件）方を優先。
 */
export function resolveUnitPriceOverride(
  activeOverrides: CompanyOverride[],
  item: { productId: string; pricingTierId: string | null; category: string | null }
): number | null {
  const matches = activeOverrides.filter((o) => {
    if (o.unit_price == null) return false
    const scopeMatch =
      (o.scope_type === 'product' && o.product_id === item.productId) ||
      (o.scope_type === 'category' && o.category != null && o.category === item.category)
    if (!scopeMatch) return false
    if (o.pricing_tier_id != null && o.pricing_tier_id !== item.pricingTierId) return false
    return true
  })
  if (matches.length === 0) return null
  matches.sort((a, b) => b.min_cases - a.min_cases)
  return matches[0].unit_price
}

/**
 * 有効 override のうち固定送料（fixed_shipping_fee 非null）を返す（無ければ null）。
 * 複数あれば min_cases が大きい方を優先。
 */
export function resolveFixedShippingFee(activeOverrides: CompanyOverride[]): number | null {
  const matches = activeOverrides.filter((o) => o.fixed_shipping_fee != null)
  if (matches.length === 0) return null
  matches.sort((a, b) => b.min_cases - a.min_cases)
  return matches[0].fixed_shipping_fee
}
