// 発注画面（LIFF・管理画面プレビュー）に出す商品カタログをサーバー側で組み立てる。
// 価格系テーブル（product_prices / product_pricing_tiers）は公開キーで読めないよう RLS で
// 閉じているため、必ず service role のクライアントで呼び出すこと。
import type { createServiceClient } from '@/lib/supabase/server'
import type { PriceRank, Product } from '@/types'
import { isProductVisible } from '@/lib/utils'
import { filterTiersForCompany } from '@/lib/tier-visibility'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface CatalogOptions {
  priceRank: PriceRank
  // 発注者の company_id。null の場合は全社共通tierのみ（管理画面プレビュー）。
  companyId: string | null
}

/**
 * 有効な商品を、発注者の価格ランクの単価（current_price）と、その会社に見せてよい
 * pricing_tiers だけを付けて返す。他ランクの価格（product_prices）はレスポンスに含めない。
 */
export async function fetchCatalog(supabase: ServiceClient, options: CatalogOptions): Promise<Product[]> {
  const { priceRank, companyId } = options

  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      product_prices (price_rank, price_per_unit),
      category_info:categories (id, name, display_order),
      pricing_tiers:product_pricing_tiers (id, product_id, tier_label, quantity, unit_price, display_order, is_active, visible_company_id)
    `)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) throw error

  const products = ((data ?? []) as unknown as Product[]).filter((p) => isProductVisible(p))

  return products.map((p) => {
    const priceEntry =
      p.product_prices?.find((pp) => pp.price_rank === priceRank) ??
      p.product_prices?.find((pp) => pp.price_rank === 'standard')
    const tiers = filterTiersForCompany(
      (p.pricing_tiers ?? []).filter((t) => t.is_active !== false),
      companyId
    ).sort((a, b) => a.display_order - b.display_order)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { product_prices: _omit, ...rest } = p
    return {
      ...rest,
      current_price: priceEntry?.price_per_unit || 0,
      pricing_tiers: tiers,
    }
  })
}
