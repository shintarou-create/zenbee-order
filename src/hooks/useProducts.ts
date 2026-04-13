'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product, PriceRank } from '@/types'
import { isInSeason } from '@/lib/utils'

interface UseProductsOptions {
  priceRank?: PriceRank
  category?: string
}

interface UseProductsReturn {
  products: Product[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useProducts(options: UseProductsOptions = {}): UseProductsReturn {
  const { priceRank = 'standard', category } = options
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

        let query = supabase
          .from('products')
          .select(`
            *,
            product_prices!inner (
              id,
              product_id,
              price_rank,
              price_per_unit
            ),
            inventory (
              id,
              product_id,
              available_qty,
              reserved_qty,
              updated_at
            )
          `)
          .eq('is_active', true)
          .eq('product_prices.price_rank', priceRank)
          .order('sort_order', { ascending: true })

        if (category && category !== '全商品') {
          query = query.eq('category', category)
        }

        const { data, error: fetchError } = await query

        if (fetchError) throw fetchError

        if (mounted && data) {
          // 旬の商品フィルタリング
          const filteredProducts = (data as Product[]).filter((p) => isInSeason(p))

          // current_price を設定
          const productsWithPrice = filteredProducts.map((p) => {
            const priceEntry = p.product_prices?.find((pp) => pp.price_rank === priceRank)
            return {
              ...p,
              current_price: priceEntry?.price_per_unit || 0,
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
  }, [priceRank, category, fetchTrigger])

  const refetch = () => setFetchTrigger((n) => n + 1)

  return { products, isLoading, error, refetch }
}
