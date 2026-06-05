'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLiff } from '@/hooks/useLiff'
import { useProducts } from '@/hooks/useProducts'
import { useCart } from '@/hooks/useCart'
import { createClient } from '@/lib/supabase/client'
import CategoryAccordion from '@/components/customer/CategoryAccordion'
import ProductCard from '@/components/customer/ProductCard'
import type { Company, PriceRank, Category, CartItem } from '@/types'

export default function HomePage() {
  const router = useRouter()
  const { userId, isLoading: liffLoading, error: liffError } = useLiff()
  const [company, setCompany] = useState<Company | null>(null)
  const [customerLoading, setCustomerLoading] = useState(false)

  const priceRank: PriceRank = company?.price_rank || 'standard'
  const { products, isLoading: productsLoading } = useProducts({
    priceRank,
    withTiers: true,
  })
  const { items: cartItems, addToCart, itemCount } = useCart()

  // 各商品カードの保留状態（数量入力済みだがまだカートに入れていない）
  const [pendingItems, setPendingItems] = useState<Map<string, Omit<CartItem, 'subtotal'>>>(new Map())
  // 一括追加後にカードをリセットするためのキー
  const [resetKey, setResetKey] = useState(0)

  const handlePendingChange = useCallback(
    (productId: string, item: Omit<CartItem, 'subtotal'> | null) => {
      setPendingItems((prev) => {
        // 変更がない場合は同一参照を返してレンダリングを抑制
        if (item === null && !prev.has(productId)) return prev
        const next = new Map(prev)
        if (item === null) {
          next.delete(productId)
        } else {
          next.set(productId, item)
        }
        return next
      })
    },
    []
  )

  function handleAddAllToCart() {
    pendingItems.forEach((item) => {
      addToCart(item)
    })
    setResetKey((k) => k + 1)
    setPendingItems(new Map())
  }

  useEffect(() => {
    if (!userId) return

    async function fetchCustomer() {
      setCustomerLoading(true)
      try {
        const supabase = createClient()

        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('id')
          .eq('line_user_id', userId)
          .single()

        if (adminUser) {
          router.push('/admin')
          return
        }

        const { data: lineUser, error } = await supabase
          .from('line_users')
          .select('*, company:companies (*)')
          .eq('line_user_id', userId)
          .eq('is_active', true)
          .single()

        if (error || !lineUser || !lineUser.company) {
          router.push('/not-registered')
          return
        }

        setCompany(lineUser.company as Company)
      } catch {
        router.push('/not-registered')
      } finally {
        setCustomerLoading(false)
      }
    }

    fetchCustomer()
  }, [userId, router])

  // カテゴリ×商品のグループを構築
  const categorizedProducts = useMemo(() => {
    const categoryMap = new Map<string, Category & { products: typeof products }>()

    for (const p of products) {
      if (p.category_info) {
        const info = p.category_info
        if (!categoryMap.has(info.id)) {
          categoryMap.set(info.id, { ...info, products: [] })
        }
        categoryMap.get(info.id)!.products.push(p)
      }
    }

    return Array.from(categoryMap.values()).sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    )
  }, [products])

  const hasCategories = categorizedProducts.length > 0
  const uncategorized = products.filter((p) => !p.category_info)

  const pendingCount = pendingItems.size

  if (liffLoading || customerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-green-800 font-medium">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (liffError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="text-center max-w-sm">
          <p className="text-red-600 font-medium">エラーが発生しました</p>
          <p className="text-red-500 text-sm mt-2">{liffError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-green-700 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">善兵衛農園</h1>
            {company && (
              <p className="text-green-200 text-xs">{company.company_name}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/orders" className="text-green-100 text-sm hover:text-white">
              注文履歴
            </Link>
            <Link
              href="/cart"
              className="relative bg-white text-green-700 rounded-full px-4 py-2 text-sm font-bold flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-4H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              カート
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {cartItems.length > 99 ? '99+' : cartItems.length}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* 商品一覧 */}
      <main className="max-w-2xl mx-auto px-4 py-4 pb-24">
        {productsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : hasCategories ? (
          <>
            <CategoryAccordion
              categories={categorizedProducts}
              cartItems={cartItems}
              onPendingChange={handlePendingChange}
              resetKey={resetKey}
            />
            {uncategorized.length > 0 && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* カテゴリ未設定商品はそのまま表示 */}
              </div>
            )}
          </>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">この時期の商品はありません</p>
            <p className="text-sm mt-2">しばらくお待ちください</p>
          </div>
        ) : (
          // DBマイグレーション前フォールバック: 全商品をカテゴリタブなしで表示
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onPendingChange={handlePendingChange}
                cartItem={cartItems.find((i) => i.productId === product.id)}
                resetKey={resetKey}
              />
            ))}
          </div>
        )}
      </main>

      {/* 固定フッター：保留品あり→一括追加ボタン、なしでカートあり→カートを見るボタン */}
      {pendingCount > 0 ? (
        <div className="fixed bottom-4 left-0 right-0 flex justify-center px-4 z-20">
          <button
            onClick={handleAddAllToCart}
            className="w-full max-w-sm bg-green-600 hover:bg-green-700 active:scale-95 text-white font-bold py-4 px-6 rounded-full shadow-lg flex items-center justify-between transition-all"
          >
            <span className="bg-green-500 rounded-full px-2 py-0.5 text-sm">
              {pendingCount}品
            </span>
            <span>カートに追加</span>
            <svg className="w-5 h-5 text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-4H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
        </div>
      ) : itemCount > 0 ? (
        <div className="fixed bottom-4 left-0 right-0 flex justify-center px-4 z-20">
          <Link
            href="/cart"
            className="w-full max-w-sm bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-full shadow-lg flex items-center justify-between transition-colors"
          >
            <span className="bg-green-500 rounded-full px-2 py-0.5 text-sm">
              {cartItems.length}種類
            </span>
            <span>カートを見る</span>
            <span className="text-green-200">→</span>
          </Link>
        </div>
      ) : null}
    </div>
  )
}
