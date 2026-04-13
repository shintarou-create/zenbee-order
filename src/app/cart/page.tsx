'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/hooks/useCart'
import { useLiff } from '@/hooks/useLiff'
import CartItemComponent from '@/components/customer/CartItem'
import OrderSummary from '@/components/customer/OrderSummary'
import { formatCurrency } from '@/lib/utils'

function getMinDeliveryDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  return d.toISOString().split('T')[0]
}

function getDefaultDeliveryDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 5)
  return d.toISOString().split('T')[0]
}

export default function CartPage() {
  const router = useRouter()
  const { items, total, updateQuantity, removeFromCart, clearCart } = useCart()
  const { userId, isLoading: liffLoading } = useLiff()
  const [notes, setNotes] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(getDefaultDeliveryDate())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOrder() {
    if (items.length === 0) return
    if (!userId) {
      setError('ログインが必要です。ページを再読み込みしてください。')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      // LIFF アクセストークンを取得
      let accessToken: string | null = null
      try {
        const liffModule = await import('@line/liff')
        const liff = liffModule.default
        accessToken = liff.getAccessToken()
      } catch {
        console.warn('LIFF アクセストークン取得失敗')
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          notes,
          deliveryDate,
          liffAccessToken: accessToken || '',
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '発注に失敗しました')
      }

      clearCart()
      router.push(`/orders?success=true&orderNumber=${result.data.orderNumber}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '発注処理でエラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (liffLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-green-700 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-green-200 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold">カート</h1>
          {items.length > 0 && (
            <span className="ml-auto text-green-200 text-sm">
              {items.length}種類
            </span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-32">
        {items.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-4H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-gray-500 text-lg font-medium">カートが空です</p>
            <Link href="/" className="mt-4 inline-block text-green-600 font-bold">
              商品一覧に戻る
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* カートアイテム */}
            <div className="space-y-3">
              {items.map((item) => (
                <CartItemComponent
                  key={item.productId}
                  item={item}
                  onUpdateQuantity={updateQuantity}
                  onRemove={removeFromCart}
                />
              ))}
            </div>

            {/* 注文内容確認 */}
            <OrderSummary items={items} total={total} />

            {/* 納品希望日 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <label className="block font-bold text-gray-900 mb-2 text-base">
                納品希望日
              </label>
              <input
                type="date"
                value={deliveryDate}
                min={getMinDeliveryDate()}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <p className="mt-1 text-xs text-gray-500">※ご注文日の3日後以降でご指定ください</p>
            </div>

            {/* 備考欄 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <label className="block font-bold text-gray-900 mb-2 text-base">
                備考・ご要望
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="配送に関するご要望など、ご自由にご記入ください"
                rows={3}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
              />
            </div>

            {/* エラー表示 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 発注ボタン（下部固定） */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-20">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">合計金額</span>
              <span className="text-xl font-bold text-green-700">{formatCurrency(total)}</span>
            </div>
            <button
              onClick={handleOrder}
              disabled={submitting || items.length === 0}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                submitting
                  ? 'bg-green-400 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white active:scale-98'
              }`}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  発注処理中...
                </span>
              ) : (
                '発注する'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
