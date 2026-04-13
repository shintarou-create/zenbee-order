'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLiff } from '@/hooks/useLiff'
import type { Order } from '@/types'
import { formatDate, formatCurrency, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'

export default function OrderDetailPage() {
  const params = useParams()
  const orderId = params.id as string
  const { userId, isLoading: liffLoading } = useLiff()
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  useEffect(() => {
    if (!userId || !orderId) return

    async function fetchOrder() {
      setIsLoading(true)
      try {
        const supabase = createClient()

        // まず顧客IDを確認
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('line_user_id', userId)
          .single()

        if (!customer) {
          setError('顧客情報が見つかりません')
          return
        }

        const { data, error: fetchError } = await supabase
          .from('orders')
          .select(`
            *,
            customer:customers (*),
            order_items (*)
          `)
          .eq('id', orderId)
          .eq('customer_id', customer.id)
          .single()

        if (fetchError || !data) {
          setError('注文が見つかりません')
          return
        }

        setOrder(data as Order)
      } catch (err) {
        console.error('注文取得エラー:', err)
        setError('注文詳細の取得に失敗しました')
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrder()
  }, [userId, orderId])

  async function handleDownloadPdf() {
    if (!order) return
    setDownloadingPdf(true)
    try {
      const { generateInvoicePDF } = await import('@/lib/invoice-pdf')
      generateInvoicePDF(order)
    } catch (err) {
      console.error('PDF生成エラー:', err)
      alert('PDFの生成に失敗しました')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (liffLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto pt-8 text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <Link href="/orders" className="mt-4 inline-block text-green-600 font-bold">
            注文履歴に戻る
          </Link>
        </div>
      </div>
    )
  }

  if (!order) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-green-700 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/orders" className="text-green-200 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold">注文詳細</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* 注文ヘッダー */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <p className="font-bold text-gray-900 text-lg">{order.order_number}</p>
              <p className="text-gray-500 text-sm">{formatDate(order.created_at)}</p>
            </div>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${getOrderStatusColor(order.status)}`}>
              {getOrderStatusLabel(order.status)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {order.shipping_date && (
              <div>
                <p className="text-gray-500">発送日</p>
                <p className="font-medium">{formatDate(order.shipping_date)}</p>
              </div>
            )}
            {order.delivery_date && (
              <div>
                <p className="text-gray-500">お届け予定日</p>
                <p className="font-medium">{formatDate(order.delivery_date)}</p>
              </div>
            )}
          </div>

          {order.notes && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-gray-500 text-xs">備考</p>
              <p className="text-sm mt-0.5">{order.notes}</p>
            </div>
          )}
        </div>

        {/* 注文明細 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">注文明細</h2>
          </div>

          <div className="divide-y divide-gray-50">
            {(order.order_items || []).map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{item.product_name}</p>
                  <p className="text-sm text-gray-500">
                    {item.quantity}{item.unit} × {formatCurrency(item.unit_price)}
                  </p>
                </div>
                <p className="font-bold text-green-700">{formatCurrency(item.subtotal)}</p>
              </div>
            ))}
          </div>

          <div className="p-4 bg-green-50 flex items-center justify-between">
            <span className="font-bold text-gray-900">合計</span>
            <span className="text-xl font-bold text-green-700">{formatCurrency(order.total_amount)}</span>
          </div>
        </div>

        {/* PDFダウンロードボタン */}
        <button
          onClick={handleDownloadPdf}
          disabled={downloadingPdf}
          className="w-full bg-white border border-green-600 text-green-600 hover:bg-green-50 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {downloadingPdf ? '生成中...' : '納品書PDFをダウンロード'}
        </button>
      </main>
    </div>
  )
}
