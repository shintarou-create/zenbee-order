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
import CustomerHeader from '@/components/customer/CustomerHeader'
import type { Company, PriceRank, Category, CartItem } from '@/types'

const CUSTOM_ITEM_MAX = 5
const CUSTOM_ITEM_MAX_CHARS = 200

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
  const { items: cartItems, addToCart, addCustomItem, itemCount, customItemCount } = useCart()

  // 各商品カードの保留状態（数量入力済みだがまだカートに入れていない）
  const [pendingItems, setPendingItems] = useState<Map<string, Omit<CartItem, 'subtotal'>>>(new Map())
  // 一括追加後にカードをリセットするためのキー
  const [resetKey, setResetKey] = useState(0)

  // 自由記入
  const [customText, setCustomText] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)

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

  function handleAddCustomItem() {
    const text = customText.trim()
    setCustomError(null)
    if (!text) {
      setCustomError('内容を入力してください')
      return
    }
    if (text.length > CUSTOM_ITEM_MAX_CHARS) {
      setCustomError(`${CUSTOM_ITEM_MAX_CHARS}文字以内で入力してください`)
      return
    }
    if (customItemCount >= CUSTOM_ITEM_MAX) {
      setCustomError(`自由記入は1注文${CUSTOM_ITEM_MAX}件まです`)
      return
    }
    addCustomItem(text)
    setCustomText('')
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
      <div className="min-h-screen flex items-center justify-center bg-kinari">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-fukamidori border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-fukamidori font-medium">読み込み中...</p>
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
    <div className="min-h-screen bg-kinari">
      <CustomerHeader />

      {/* 商品一覧 */}
      <main className="max-w-2xl mx-auto px-4 py-4 pb-24">
        {productsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-fukamidori border-t-transparent rounded-full animate-spin" />
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

        {/* その他・自由記入枠 */}
        {!productsLoading && (
          <div className="mt-6 bg-amber-50 rounded-xl border border-amber-200 p-4">
            <h2 className="font-bold text-gray-900 text-base mb-1">その他（自由記入）</h2>
            <p className="text-xs text-gray-500 mb-3">リストにない商品を文章でご記入ください。金額は農園が確認後にご連絡します。</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customText}
                onChange={(e) => { setCustomText(e.target.value); setCustomError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomItem() } }}
                placeholder={`例：柚子1kg（最大${CUSTOM_ITEM_MAX_CHARS}文字）`}
                maxLength={CUSTOM_ITEM_MAX_CHARS}
                className="flex-1 border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              />
              <button
                type="button"
                onClick={handleAddCustomItem}
                disabled={customItemCount >= CUSTOM_ITEM_MAX}
                className="text-sm font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
              >
                追加
              </button>
            </div>
            {customError && <p className="text-xs text-red-600 mt-1">{customError}</p>}
            {customItemCount >= CUSTOM_ITEM_MAX && (
              <p className="text-xs text-amber-700 mt-1">自由記入は1注文{CUSTOM_ITEM_MAX}件まです（カートを確認してください）</p>
            )}
          </div>
        )}
      </main>

      {/* 固定フッター：保留品あり→一括追加ボタン、なしでカートあり→カートを見るボタン */}
      {pendingCount > 0 ? (
        <div className="fixed bottom-4 left-0 right-0 flex justify-center px-4 z-20">
          <button
            onClick={handleAddAllToCart}
            className="w-full max-w-sm bg-fukamidori hover:bg-fukamidori-dark active:scale-95 text-white font-bold py-4 px-6 rounded-full shadow-lg flex items-center justify-between transition-all"
          >
            <span className="bg-fukamidori-dark rounded-full px-2 py-0.5 text-sm">
              {pendingCount}品
            </span>
            <span>カートに追加</span>
            <svg className="w-5 h-5 text-kinari" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-4H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
        </div>
      ) : itemCount > 0 ? (
        <div className="fixed bottom-4 left-0 right-0 flex justify-center px-4 z-20">
          <Link
            href="/cart"
            className="w-full max-w-sm bg-fukamidori hover:bg-fukamidori-dark text-white font-bold py-4 px-6 rounded-full shadow-lg flex items-center justify-between transition-colors"
          >
            <span className="bg-fukamidori-dark rounded-full px-2 py-0.5 text-sm">
              {cartItems.length}種類
            </span>
            <span>カートを見る</span>
            <span className="text-kinari">→</span>
          </Link>
        </div>
      ) : null}
    </div>
  )
}
