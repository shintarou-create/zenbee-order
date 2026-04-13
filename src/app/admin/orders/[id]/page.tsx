'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Order, OrderStatus } from '@/types'
import { formatDate, formatCurrency, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: '確認待ち' },
  { value: 'confirmed', label: '確認済み' },
  { value: 'shipped', label: '発送済み' },
  { value: 'delivered', label: 'お届け済み' },
  { value: 'cancelled', label: 'キャンセル' },
]

export default function AdminOrderDetailPage() {
  const params = useParams()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<OrderStatus>('pending')
  const [adminNotes, setAdminNotes] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  useEffect(() => {
    if (!orderId) return

    async function fetchOrder() {
      setIsLoading(true)
      try {
        const supabase = createClient()
        const { data, error: fetchError } = await supabase
          .from('orders')
          .select(`
            *,
            customer:customers (*),
            order_items (*)
          `)
          .eq('id', orderId)
          .single()

        if (fetchError || !data) {
          setError('注文が見つかりません')
          return
        }

        setOrder(data as Order)
        setStatus(data.status as OrderStatus)
        setAdminNotes(data.admin_notes || '')
        setDeliveryDate(data.delivery_date || '')
      } catch (err) {
        console.error('注文取得エラー:', err)
        setError('注文の取得に失敗しました')
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrder()
  }, [orderId])

  async function handleUpdate() {
    if (!order) return
    setUpdating(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status,
          admin_notes: adminNotes || null,
          delivery_date: deliveryDate || null,
        })
        .eq('id', order.id)

      if (updateError) throw updateError

      setOrder((prev) => prev ? { ...prev, status, admin_notes: adminNotes } : null)
      setMessage({ type: 'success', text: '注文を更新しました' })

      // 発送済みに変更した場合はLINE通知
      if (status === 'shipped' && order.status !== 'shipped') {
        const customer = order.customer
        if (customer) {
          try {
            await fetch('/api/line-notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: customer.line_user_id,
                message: `【善兵衛農園】ご注文品を発送いたしました。\n\n注文番号: ${order.order_number}\n\nお届けまでしばらくお待ちください。`,
              }),
            })
          } catch {
            // 通知失敗は無視
          }
        }
      }
    } catch (err) {
      console.error('注文更新エラー:', err)
      setMessage({ type: 'error', text: '更新に失敗しました' })
    } finally {
      setUpdating(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  async function handleDownloadPdf() {
    if (!order) return
    setDownloadingPdf(true)
    try {
      const { generateInvoicePDF } = await import('@/lib/invoice-pdf')
      generateInvoicePDF(order)
    } catch {
      alert('PDFの生成に失敗しました')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error || '注文が見つかりません'}</p>
        <Link href="/admin/orders" className="mt-4 inline-block text-green-600 font-bold">
          注文一覧に戻る
        </Link>
      </div>
    )
  }

  const customer = order.customer

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/orders" className="text-gray-500 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">{order.order_number}</h1>
        <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${getOrderStatusColor(order.status)}`}>
          {getOrderStatusLabel(order.status)}
        </span>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* 注文情報 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h2 className="font-bold text-gray-900 mb-3">注文情報</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">注文日</span>
              <span>{formatDate(order.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">発送日</span>
              <span>{order.shipping_date ? formatDate(order.shipping_date) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">お届け予定日</span>
              <span>{order.delivery_date ? formatDate(order.delivery_date) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">温度管理</span>
              <span>{order.cool_type === 1 ? '冷蔵' : '常温'}</span>
            </div>
            {order.notes && (
              <div>
                <span className="text-gray-500">備考</span>
                <p className="mt-1 text-gray-700 bg-gray-50 rounded p-2">{order.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* お客様情報 */}
        {customer && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h2 className="font-bold text-gray-900 mb-3">お客様情報</h2>
            <div className="space-y-1.5 text-sm">
              <p className="font-medium text-gray-900">{customer.company_name}</p>
              {customer.representative_name && (
                <p className="text-gray-600">{customer.representative_name}</p>
              )}
              <p className="text-gray-600">
                〒{customer.postal_code} {customer.prefecture}{customer.city}{customer.address}
              </p>
              {customer.building && <p className="text-gray-600">{customer.building}</p>}
              {customer.phone && <p className="text-gray-600">TEL: {customer.phone}</p>}
              {customer.email && <p className="text-gray-600">{customer.email}</p>}
            </div>
          </div>
        )}
      </div>

      {/* 注文明細 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">注文明細</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-gray-600 font-semibold">商品名</th>
              <th className="px-4 py-2 text-right text-gray-600 font-semibold">数量</th>
              <th className="px-4 py-2 text-right text-gray-600 font-semibold">単価</th>
              <th className="px-4 py-2 text-right text-gray-600 font-semibold">小計</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(order.order_items || []).map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-gray-900">{item.product_name}</td>
                <td className="px-4 py-3 text-right">{item.quantity}{item.unit}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.unit_price)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-green-50">
            <tr>
              <td colSpan={3} className="px-4 py-3 font-bold text-right">合計</td>
              <td className="px-4 py-3 font-bold text-right text-green-700 text-lg">
                {formatCurrency(order.total_amount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ステータス変更・管理メモ */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h2 className="font-bold text-gray-900 mb-4">管理操作</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ステータス変更</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="w-full md:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">納品希望日</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full md:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">管理メモ</label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="内部管理用メモ（お客様には表示されません）"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
            >
              {updating ? '更新中...' : '更新する'}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="border border-green-600 text-green-600 hover:bg-green-50 font-bold px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {downloadingPdf ? '生成中...' : '納品書PDF出力'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
