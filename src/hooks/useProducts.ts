'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product, PriceRank } from '@/types'
import { isProductVisible } from '@/lib/utils'

interface UseProductsOptions {
  priceRank?: PriceRank
  withTiers?: boolean
}

interface UseProductsReturn {
  products: Product[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useProducts(options: UseProductsOptions = {}): UseProductsReturn {
  const { priceRank = 'standard', withTiers = false } = options
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
          ? `, pricing_tiers:product_pricing_tiers(id, product_id, tier_label, quantity, unit_price, display_order, is_active)`
          : ''

        const { data, error: fetchError } = await supabase
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

        if (fetchError) {
          // display_order カラムがまだない場合は sort_order でフォールバック
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('products')
            .select(`
              *,
              product_prices (id, product_id, price_rank, price_per_unit)
            `)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })

          if (fallbackError) throw fallbackError

          if (mounted && fallbackData) {
            const filtered = (fallbackData as Product[]).filter((p) => isProductVisible(p))
            setProducts(filtered.map((p) => ({
              ...p,
              current_price: (p.product_prices?.find((pp) => pp.price_rank === priceRank) ?? p.product_prices?.find((pp) => pp.price_rank === 'standard'))?.price_per_unit || 0,
            })))
          }
          return
        }

        if (mounted && data) {
          const filtered = (data as unknown as Product[]).filter((p) => isProductVisible(p))

          // 価格段階ありの場合、is_activeなものだけ残してdisplay_order順に並べる
          const productsWithPrice = filtered.map((p) => {
            const priceEntry = p.product_prices?.find((pp) => pp.price_rank === priceRank)
              ?? p.product_prices?.find((pp) => pp.price_rank === 'standard')
            const activeTiers = withTiers
              ? (p.pricing_tiers ?? [])
                  .filter((t) => t.is_active !== false)
                  .sort((a, b) => a.display_order - b.display_order)
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
  }, [priceRank, withTiers, fetchTrigger])

  const refetch = () => setFetchTrigger((n) => n + 1)

  return { products, isLoading, error, refetch }
}
