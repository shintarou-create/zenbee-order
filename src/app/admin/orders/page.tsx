'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adminFetch } from '@/lib/admin-fetch'
import OrderTable from '@/components/admin/OrderTable'
import PendingProductsSummary from '@/components/admin/PendingProductsSummary'
import type { Order } from '@/types'
import { formatCurrency } from '@/lib/utils'

const PAGE_SIZE = 50

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'pending', label: '未対応' },
  { value: 'shipped', label: '出荷済' },
  { value: 'done', label: '完了' },
  { value: 'all', label: 'すべて' },
]

interface DeleteModalProps {
  orders: Order[]
  onConfirm: () => Promise<void>
  onCancel: () => void
  isDeleting: boolean
  errorMsg: string | null
}

function DeleteConfirmModal({ orders, onConfirm, onCancel, isDeleting, errorMsg }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">注文の完全削除</h2>
          <p className="text-sm text-gray-500 mt-1">
            この {orders.length} 件を完全に削除します。元に戻せません。よろしいですか？
          </p>
        </div>

        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
          {orders.map((order) => (
            <div key={order.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div>
                <span className="text-sm font-medium text-gray-900">{order.order_number}</span>
                <span className="text-sm text-gray-500 ml-2">
                  {order.company?.company_name ?? '—'}
                </span>
              </div>
              <span className="text-sm font-medium text-gray-700 flex-shrink-0">
                {formatCurrency(order.total_amount)}
              </span>
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="p-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isDeleting && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            削除する
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    fetchOrders(0) // eslint-disable-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchOrders(fromOffset: number) {
    const isReset = fromOffset === 0
    if (isReset) {
      setIsLoading(true)
    } else {
      setIsLoadingMore(true)
    }
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

      const { data, error } = await query.range(fromOffset, fromOffset + PAGE_SIZE - 1)

      if (error) throw error

      const newData = (data || []) as Order[]
      if (isReset) {
        setOrders(newData)
        setSelectedIds([])
      } else {
        setOrders(prev => [...prev, ...newData])
      }
      setNextOffset(fromOffset + PAGE_SIZE)
      setHasMore(newData.length === PAGE_SIZE)
    } catch (err) {
      console.error('注文取得エラー:', err)
    } finally {
      if (isReset) {
        setIsLoading(false)
      } else {
        setIsLoadingMore(false)
      }
    }
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  async function handleUndoDeliveryNotePrinted(orderId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({ delivery_note_printed: false })
      .eq('id', orderId)
    if (error) throw error
    await fetchOrders(0)
  }

  async function handleUndoShipped(orderId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({ status: 'pending' })
      .eq('id', orderId)
    if (error) throw error
    await fetchOrders(0)
  }

  async function handleUnmarkLabel(orderId: string) {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('orders')
        .update({ shipping_label_printed: false })
        .eq('id', orderId)
      if (error) throw error
      await fetchOrders(0)
    } catch (err) {
      console.error('伝票済み解除エラー:', err)
      showMsg('error', '伝票済みの解除に失敗しました')
    }
  }

  async function handleDeleteConfirm() {
    if (selectedIds.length === 0) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await adminFetch('/api/admin/orders/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedIds }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '削除に失敗しました')
      setShowDeleteModal(false)
      setSelectedIds([])
      showMsg('success', `${json.deletedCount}件を削除しました`)
      await fetchOrders(0)
    } catch (err) {
      console.error('削除エラー:', err)
      setDeleteError(err instanceof Error ? err.message : '削除に失敗しました')
    } finally {
      setIsDeleting(false)
    }
  }

  const selectedOrders = orders.filter((o) => selectedIds.includes(o.id))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">注文管理</h1>
        <span className="text-sm text-gray-500">{orders.length}件表示中</span>
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

      {/* 選択バナー */}
      {selectedIds.length > 0 && (
        <div className="bg-red-50 rounded-xl border border-red-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-red-800 font-medium text-sm">{selectedIds.length}件選択中</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              選択解除
            </button>
            <button
              onClick={() => { setDeleteError(null); setShowDeleteModal(true) }}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition-colors"
            >
              選択した注文を削除
            </button>
          </div>
        </div>
      )}

      {/* 注文テーブル */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <OrderTable
            orders={orders}
            showCheckbox={true}
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
            onUnmarkLabel={handleUnmarkLabel}
            onUndoDeliveryNotePrinted={handleUndoDeliveryNotePrinted}
            onUndoShipped={handleUndoShipped}
          />
        )}
      </div>

      {/* もっと見るボタン */}
      {!isLoading && hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchOrders(nextOffset)}
            disabled={isLoadingMore}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isLoadingMore && (
              <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            )}
            {isLoadingMore ? '読み込み中...' : 'もっと見る'}
          </button>
        </div>
      )}

      {/* 未発送商品合計（納品日フィルターと連動） */}
      <PendingProductsSummary dateFrom={dateFrom} dateTo={dateTo} />

      {/* 削除確認モーダル */}
      {showDeleteModal && (
        <DeleteConfirmModal
          orders={selectedOrders}
          onConfirm={handleDeleteConfirm}
          onCancel={() => { if (!isDeleting) setShowDeleteModal(false) }}
          isDeleting={isDeleting}
          errorMsg={deleteError}
        />
      )}
    </div>
  )
}
