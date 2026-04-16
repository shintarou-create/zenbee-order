'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLiff } from '@/hooks/useLiff'
import type { Order } from '@/types'
import { formatDate, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'

function OrdersContent() {
  const searchParams = useSearchParams()
  const success = searchParams.get('success')
  const orderNumber = searchParams.get('orderNumber')
  const { userId, isLoading: liffLoading } = useLiff()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [, setCompanyId] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return

    async function fetchOrders() {
      setIsLoading(true)
      try {
        const supabase = createClient()

        // line_users → companies で会社IDを取得
        const { data: lineUser } = await supabase
          .from('line_users')
          .select('company_id')
          .eq('line_user_id', userId)
          .single()

        if (!lineUser || !lineUser.company_id) {
          setError('顧客情報が見つかりません')
          return
        }

        setCompanyId(lineUser.company_id)

        // 注文一覧を取得
        const { data, error: fetchError } = await supabase
          .from('orders')
          .select(`
            *,
            order_items (*)
          `)
          .eq('company_id', lineUser.company_id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (fetchError) throw fetchError
        setOrders((data || []) as Order[])
      } catch (err) {
        console.error('注文取得エラー:', err)
        setError('注文履歴の取得に失敗しました')
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrders()
  }, [userId])

  if (liffLoading || isLoading) {
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
          <h1 className="text-lg font-bold">注文履歴</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4">
        {/* 発注完了メッセージ */}
        {success && orderNumber && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <p className="text-green-800 font-bold">発注が完了しました</p>
                <p className="text-green-700 text-sm mt-1">注文番号: {orderNumber}</p>
                <p className="text-green-600 text-xs mt-1">
                  ご注文内容を確認次第、LINEにてご連絡いたします。
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {orders.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 text-lg font-medium">注文履歴がありません</p>
            <Link href="/" className="mt-4 inline-block text-green-600 font-bold">
              商品を注文する
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-green-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{order.order_number}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{formatDate(order.created_at)}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getOrderStatusColor(order.status)}`}>
                    {getOrderStatusLabel(order.status)}
                  </span>
                </div>

                {order.order_items && order.order_items.length > 0 && (
                  <div className="mt-2 text-sm text-gray-600">
                    {order.order_items.length}品目
                  </div>
                )}

                {order.delivery_date && (
                  <p className="text-xs text-gray-500 mt-1">
                    お届け予定: {formatDate(order.delivery_date)}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OrdersContent />
    </Suspense>
  )
}
