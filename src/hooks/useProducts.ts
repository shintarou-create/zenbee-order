'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product, PriceRank } from '@/types'
import { isProductVisible } from '@/lib/utils'
import { filterTiersForCompany } from '@/lib/tier-visibility'

interface UseProductsOptions {
  priceRank?: PriceRank
  withTiers?: boolean
  // 発注者の company_id。pricing_tiers の絞り込み（visible_company_id IS NULL
  // OR = companyId）に使う。未確定（未ログイン等）の間は null 扱いで、
  // 全社共通tier（visible_company_id IS NULL）のみを返す。
  companyId?: string | null
}

interface UseProductsReturn {
  products: Product[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useProducts(options: UseProductsOptions = {}): UseProductsReturn {
  const { priceRank = 'standard', withTiers = false, companyId = null } = options
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchTrigger, setFetchTrigger] = useState(0)

  useEffect(() => {
    let mounted = true

    async function fetchProducts() {
      setIsLoading(true)
      setError(null)

      try {
        const supabase = createClient()

        const tiersSelect = withTiers
          ? `, pricing_tiers:product_pricing_tiers(id, product_id, tier_label, quantity, unit_price, display_order, is_active, visible_company_id)`
          : ''

        let query = supabase
          .from('products')
          .select(`
            *,
            product_prices (
              id,
              product_id,
              price_rank,
              price_per_unit
            ),
            category_info:categories (id, name, display_order)
            ${tiersSelect}
          `)
          .eq('is_active', true)
          .order('display_order', { ascending: true })

        // pricing_tiers の絞り込み（サーバー側＝PostgREST の埋め込みリソースフィルタで実施。
        // 他社の専用tierはこの時点でクライアントに一切届かない＝漏洩しない）。
        // company_id が未確定の間は全社共通tier（visible_company_id IS NULL）のみを返す。
        // このOR条件だけでは「専用tierがある商品の全社共通tierを隠す」表現ができないため、
        // その絞り込みは下の filterTiersForCompany（商品ごとのグルーピング判定）で行う。
        if (withTiers) {
          query = query.or(
            companyId
              ? `visible_company_id.is.null,visible_company_id.eq.${companyId}`
              : 'visible_company_id.is.null',
            { referencedTable: 'pricing_tiers' }
          )
        }

        const { data, error: fetchError } = await query

        if (fetchError) throw fetchError

        if (mounted && data) {
          const filtered = (data as unknown as Product[]).filter((p) => isProductVisible(p))

          // 価格段階ありの場合、is_activeなものだけ残してdisplay_order順に並べる
          const productsWithPrice = filtered.map((p) => {
            const priceEntry = p.product_prices?.find((pp) => pp.price_rank === priceRank)
              ?? p.product_prices?.find((pp) => pp.price_rank === 'standard')
            const activeTiers = withTiers
              ? filterTiersForCompany(
                  (p.pricing_tiers ?? []).filter((t) => t.is_active !== false),
                  companyId
                ).sort((a, b) => a.display_order - b.display_order)
              : undefined
            return {
              ...p,
              current_price: priceEntry?.price_per_unit || 0,
              pricing_tiers: activeTiers,
            }
          })

          setProducts(productsWithPrice)
        }
      } catch (err) {
        console.error('商品取得エラー:', err)
        if (mounted) {
          setError('商品情報の取得に失敗しました')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchProducts()

    return () => {
      mounted = false
    }
  }, [priceRank, withTiers, companyId, fetchTrigger])

  const refetch = () => setFetchTrigger((n) => n + 1)

  return { products, isLoading, error, refetch }
}
