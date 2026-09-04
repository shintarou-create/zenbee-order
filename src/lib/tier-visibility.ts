// 取引先別の価格段階（product_pricing_tiers）の表示絞り込みを行う純粋関数。
// 客側LIFF・管理画面側の両方で同じロジックを共有する（company-overrides.ts と同じ設計）。

export type TierVisibility = {
  product_id: string
  visible_company_id: string | null
}

/**
 * ある商品にその会社専用のtier（visible_company_id = companyId）が1件でも存在する場合、
 * その商品については全社共通tier（visible_company_id IS NULL）を返さない。
 * 専用tierが1件も無い商品は従来どおり全社共通tierを返す。
 * companyId が未確定（null）の間は全社共通tierのみを返す。
 * 他社専用のtier（visible_company_id が companyId と異なる非null値）は常に除外する。
 */
export function filterTiersForCompany<T extends TierVisibility>(
  tiers: T[],
  companyId: string | null
): T[] {
  if (!companyId) {
    return tiers.filter((t) => t.visible_company_id == null)
  }

  const productIdsWithOwnTier = new Set(
    tiers.filter((t) => t.visible_company_id === companyId).map((t) => t.product_id)
  )

  return tiers.filter((t) => {
    if (t.visible_company_id === companyId) return true
    if (t.visible_company_id == null) return !productIdsWithOwnTier.has(t.product_id)
    return false
  })
}
