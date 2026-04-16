'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLiff } from '@/hooks/useLiff'
import { useProducts } from '@/hooks/useProducts'
import { useCart } from '@/hooks/useCart'
import { createClient } from '@/lib/supabase/client'
import ProductCard from '@/components/customer/ProductCard'
import type { Company, PriceRank } from '@/types'

const CATEGORIES = ['全商品', '柑橘', 'びわ', 'ジュース', 'その他']

export default function HomePage() {
  const router = useRouter()
  const { userId, isLoading: liffLoading, error: liffError } = useLiff()
  const [company, setCompany] = useState<Company | null>(null)
  const [customerLoading, setCustomerLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('全商品')

  const priceRank: PriceRank = company?.price_rank || 'standard'
  const { products, isLoading: productsLoading } = useProducts({
    priceRank,
    category: selectedCategory,
  })
  const { items: cartItems, addToCart, itemCount } = useCart()

  // 顧客情報の取得
  useEffect(() => {
    if (!userId) return

    async function fetchCustomer() {
      setCustomerLoading(true)
      try {
        const supabase = createClient()
        // line_users → companies で会社情報を取得
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
                  {itemCount > 99 ? '99+' : Math.floor(itemCount)}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* カテゴリタブ */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex overflow-x-auto gap-1 py-2 scrollbar-hide">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 商品一覧 */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {productsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">この時期の商品はありません</p>
            <p className="text-sm mt-2">他のカテゴリをご確認ください</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={addToCart}
                cartItem={cartItems.find((i) => i.productId === product.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* カートボタン（下部固定） */}
      {itemCount > 0 && (
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
      )}
    </div>
  )
}
