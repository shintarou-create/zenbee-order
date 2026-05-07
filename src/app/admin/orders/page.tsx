'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import OrderTable from '@/components/admin/OrderTable'
import PendingProductsSummary from '@/components/admin/PendingProductsSummary'
import type { Order } from '@/types'

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'pending', label: '未対応' },
  { value: 'shipped', label: '出荷済' },
  { value: 'done', label: '完了' },
  { value: 'all', label: 'すべて' },
]

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchOrders() // eslint-disable-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchOrders() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      let query = supabase
        .from('orders')
        .select(`
          *,
          company:companies (company_name, representative_name, has_separate_billing),
          order_items (*),
          order_shipping (*)
        `)
        .order('delivery_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (dateFrom) {
        query = query.gte('delivery_date', dateFrom)
      }

      if (dateTo) {
        query = query.lte('delivery_date', dateTo)
      }

      const { data, error } = await query.limit(200)

      if (error) throw error
      setOrders((data || []) as Order[])
    } catch (err) {
      console.error('注文取得エラー:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleUndoDeliveryNotePrinted(orderId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({ delivery_note_printed: false })
      .eq('id', orderId)
    if (error) throw error
    await fetchOrders()
  }

  async function handleUndoShipped(orderId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({ status: 'pending' })
      .eq('id', orderId)
    if (error) throw error
    await fetchOrders()
  }

  async function handleUnmarkLabel(orderId: string) {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('orders')
        .update({ shipping_label_printed: false })
        .eq('id', orderId)
      if (error) throw error
      await fetchOrders()
    } catch (err) {
      console.error('伝票済み解除エラー:', err)
      setMessage({ type: 'error', text: '伝票済みの解除に失敗しました' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">注文管理</h1>
        <span className="text-sm text-gray-500">{orders.length}件</span>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* フィルター */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        {/* ステータスタブ */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 納品日フィルター */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">納品日:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <span className="text-gray-400">〜</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              クリア
            </button>
          )}
        </div>
      </div>

      {/* 注文テーブル */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <OrderTable
            orders={orders}
            onUnmarkLabel={handleUnmarkLabel}
            onUndoDeliveryNotePrinted={handleUndoDeliveryNotePrinted}
            onUndoShipped={handleUndoShipped}
          />
        )}
      </div>

      {/* 未発送商品合計（納品日フィルターと連動） */}
      <PendingProductsSummary dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  )
}
