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
import OnboardingScreen from '@/components/customer/OnboardingScreen'
import PendingApprovalScreen from '@/components/customer/PendingApprovalScreen'
import type { Company, PriceRank, Category, CartItem } from '@/types'
import { hasSeasonalAndYearRound, getLatestShipStartDate } from '@/lib/delivery-rules'
import { formatShipStartDate } from '@/lib/utils'

const CUSTOM_ITEM_MAX = 5
const CUSTOM_ITEM_MAX_CHARS = 100

type CustomerStatus = 'loading' | 'onboarding' | 'pending' | 'ready' | 'error'

export default function HomePage() {
  const router = useRouter()
  const { userId, accessToken, isLoading: liffLoading, error: liffError } = useLiff()
  const [company, setCompany] = useState<Company | null>(null)
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus>('loading')

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
  const [mixError, setMixError] = useState<string | null>(null)

  const handlePendingChange = useCallback(
    (productId: string, item: Omit<CartItem, 'subtotal'> | null) => {
      setPendingItems((prev) => {
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
    setMixError(null)
    const failed = new Map<string, Omit<CartItem, 'subtotal'>>()
    let hasMixConflict = false
    pendingItems.forEach((item, key) => {
      const ok = addToCart(item)
      if (!ok) {
        hasMixConflict = true
        failed.set(key, item)
      }
    })
    if (hasMixConflict) {
      setMixError('お届け開始時期が異なる商品は一緒にご注文いただけません。お届け時期ごとに分けてご注文をお願いします。カート内の商品をご注文後、改めてお選びください。')
    }
    setPendingItems(failed)
    setResetKey((k) => k + 1)
  }

  const fetchCustomer = useCallback(async () => {
    if (!userId) return
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

      // LEFT JOIN で company も取得（maybeSingle で未紐付けを null で受ける）
      const { data: lineUser } = await supabase
        .from('line_users')
        .select('*, company:companies!left(*)')
        .eq('line_user_id', userId)
        .eq('is_active', true)
        .maybeSingle()

      if (!lineUser || !lineUser.company) {
        // 未紐付け → オンボーディング画面
        setCustomerStatus('onboarding')
        return
      }

      const fetchedCompany = lineUser.company as Company

      if (fetchedCompany.approval_status === 'pending') {
        // 登録申請中 → 承認待ち画面
        setCompany(fetchedCompany)
        setCustomerStatus('pending')
        return
      }

      if (!fetchedCompany.is_active || fetchedCompany.approval_status === 'rejected') {
        setCustomerStatus('error')
        return
      }

      setCompany(fetchedCompany)
      setCustomerStatus('ready')
    } catch {
      setCustomerStatus('error')
    } finally {
      setCustomerLoading(false)
    }
  }, [userId, router])

  useEffect(() => {
    if (!userId) return
    fetchCustomer()
  }, [userId, fetchCustomer])

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

  // 未紐付け → オンボーディング
  if (customerStatus === 'onboarding') {
    return (
      <OnboardingScreen
        accessToken={accessToken}
        onSuccess={fetchCustomer}
      />
    )
  }

  // 承認待ち
  if (customerStatus === 'pending') {
    return <PendingApprovalScreen companyName={company?.company_name} />
  }

  // 無効・却下
  if (customerStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="text-center max-w-sm">
          <p className="text-red-600 font-medium">ご利用いただけません</p>
          <p className="text-red-500 text-sm mt-2">善兵衛農園までお問い合わせください。</p>
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
              onAddCustomItem={addCustomItem}
              customItemCount={customItemCount}
              customItemMax={CUSTOM_ITEM_MAX}
              customItemMaxChars={CUSTOM_ITEM_MAX_CHARS}
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

      {/* 季節+通年混在お知らせ（禁止ではない・黄色）*/}
      {(() => {
        const latest = getLatestShipStartDate(cartItems)
        if (!hasSeasonalAndYearRound(cartItems) || !latest) return null
        return (
          <div className="fixed bottom-20 left-0 right-0 flex justify-center px-4 z-25 pointer-events-none">
            <div className="w-full max-w-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 shadow-lg">
              <p className="text-amber-700 text-xs">
                {`お届け時期の異なる商品が一緒にカートに入っています。このままご注文の場合、発送はいちばん遅い商品（${formatShipStartDate(latest)}〜）に合わせてまとめてお届けします。`}
              </p>
            </div>
          </div>
        )
      })()}

      {/* 混在エラー: pendingCount に依存せず常に表示（フッターとは独立） */}
      {mixError && (
        <div className="fixed bottom-20 left-0 right-0 flex justify-center px-4 z-30">
          <div className="w-full max-w-sm bg-red-50 border border-red-300 rounded-xl px-4 py-3 shadow-lg flex items-start gap-2">
            <p className="text-red-600 text-xs font-medium flex-1">{mixError}</p>
            <button onClick={() => setMixError(null)} className="text-red-400 text-sm leading-none flex-shrink-0">×</button>
          </div>
        </div>
      )}

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
