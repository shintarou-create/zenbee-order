'use client'

import { useState, useEffect } from 'react'
import type { Product } from '@/types'
import { adminFetch } from '@/lib/admin-fetch'

// 発注画面の商品カタログ取得。価格系テーブルは公開キーで読めないため、サーバーAPI経由で取得する。
// - mode='customer': /api/products（LINEアクセストークンで取引先を特定。価格ランク・専用tier・
//   承認状態の判定はすべてサーバー側で行う）
// - mode='preview': /api/admin/products/catalog（管理画面プレビュー。standard価格・共通tierのみ）
interface UseProductsOptions {
  mode: 'customer' | 'preview'
  // mode='customer' のときの LIFF アクセストークン（開発環境では null でも可）
  accessToken?: string | null
  // false の間は取得しない（取引先の承認状態が確定するまで商品データを取りに行かないため）
  enabled?: boolean
}

interface UseProductsReturn {
  products: Product[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useProducts(options: UseProductsOptions): UseProductsReturn {
  const { mode, accessToken = null, enabled = true } = options
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchTrigger, setFetchTrigger] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let mounted = true

    async function fetchProducts() {
      setIsLoading(true)
      setError(null)

      try {
        const res =
          mode === 'preview'
            ? await adminFetch('/api/admin/products/catalog')
            : await fetch('/api/products', {
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
              })
        const json = (await res.json()) as { data?: Product[]; error?: string }
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        if (mounted) setProducts(json.data ?? [])
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
  }, [mode, accessToken, enabled, fetchTrigger])

  const refetch = () => setFetchTrigger((n) => n + 1)

  return { products, isLoading, error, refetch }
}
