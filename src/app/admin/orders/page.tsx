'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { adminFetch } from '@/lib/admin-fetch'
import OrderTable from '@/components/admin/OrderTable'
import PendingProductsSummary from '@/components/admin/PendingProductsSummary'
import type { Order } from '@/types'
import { formatCurrency, formatDateForInput, getNextBusinessDay } from '@/lib/utils'

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
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        if (isDeleting) return
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Escape') {
        if (isDeleting) return
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onConfirm, onCancel, isDeleting])

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

function AdminOrdersContent() {
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'pending')
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('to') || '')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [shipDate, setShipDate] = useState(formatDateForInput(getNextBusinessDay(new Date())))
  const [csvExporting, setCsvExporting] = useState(false)
  const [markingShipped, setMarkingShipped] = useState(false)

  useEffect(() => {
    fetchOrders(0) // eslint-disable-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  // 選択中の注文の最も早い delivery_date を shipDate に自動セット
  useEffect(() => {
    if (selectedIds.length === 0) return
    const selectedOrders = orders.filter((o) => selectedIds.includes(o.id))
    const dates = selectedOrders
      .map((o) => o.delivery_date)
      .filter(Boolean)
      .sort() as string[]
    if (dates.length > 0) {
      setShipDate(dates[0])
    }
  }, [selectedIds, orders]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleYamatoCSV() {
    if (selectedIds.length === 0) return
    setCsvExporting(true)
    try {
      const response = await adminFetch('/api/shipping-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedIds, shipDate }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'CSV生成に失敗しました')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `yamato_b2_${shipDate.replace(/-/g, '')}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      showMsg('success', `${selectedIds.length}件のヤマトCSVを出力しました（伝票印刷済みにマーク）`)
      setSelectedIds([])
      await fetchOrders(0)
    } catch (err) {
      console.error('CSV出力エラー:', err)
      showMsg('error', err instanceof Error ? err.message : 'CSV出力に失敗しました')
    } finally {
      setCsvExporting(false)
    }
  }

  async function handleMarkShipped() {
    if (selectedIds.length === 0) return
    if (!window.confirm(`選択した${selectedIds.length}件を出荷済みにします。よろしいですか？`)) return
    setMarkingShipped(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('orders')
        .update({ status: 'shipped' })
        .in('id', selectedIds)
      if (error) throw error
      showMsg('success', `${selectedIds.length}件を出荷済みにしました`)
      setSelectedIds([])
      await fetchOrders(0)
    } catch (err) {
      console.error('出荷済み更新エラー:', err)
      showMsg('error', '出荷済みの更新に失敗しました')
    } finally {
      setMarkingShipped(false)
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

  const detailQuery = new URLSearchParams()
  if (statusFilter) detailQuery.set('status', statusFilter)
  if (dateFrom) detailQuery.set('from', dateFrom)
  if (dateTo) detailQuery.set('to', dateTo)
  const detailLinkSuffix = detailQuery.toString() ? `?${detailQuery.toString()}` : ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">注文管理</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{orders.length}件表示中</span>
          <Link
            href="/admin/orders/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            手動で注文を入力
          </Link>
        </div>
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
      {selectedIds.length > 0 && statusFilter === 'pending' && (
        <div className="bg-green-50 rounded-xl border border-green-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-green-800 font-medium text-sm">{selectedIds.length}件選択中</span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedIds([])}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              選択解除
            </button>
            <button
              onClick={() => window.open(`/admin/orders/bulk-print?ids=${selectedIds.join(',')}`, '_blank')}
              disabled={csvExporting || markingShipped}
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              納品書印刷
            </button>
            <span
              className="text-sm text-gray-700 whitespace-nowrap"
              title="前日に印刷する場合は、この発送日を実際に発送する日に設定してください"
            >
              発送日（出荷予定日）:
            </span>
            <input
              type="date"
              value={shipDate}
              onChange={(e) => setShipDate(e.target.value)}
              title="前日に印刷する場合は、この発送日を実際に発送する日に設定してください"
              className="border border-green-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            />
            <button
              onClick={handleYamatoCSV}
              disabled={csvExporting || markingShipped}
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {csvExporting ? 'CSV生成中...' : 'ヤマトCSV出力'}
            </button>
            <button
              onClick={handleMarkShipped}
              disabled={csvExporting || markingShipped}
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {markingShipped ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              )}
              {markingShipped ? '更新中...' : '出荷済みにする'}
            </button>
            <button
              onClick={() => { setDeleteError(null); setShowDeleteModal(true) }}
              disabled={csvExporting || markingShipped}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              選択した注文を削除
            </button>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && statusFilter !== 'pending' && (
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
            detailLinkSuffix={detailLinkSuffix}
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

      {/* 未発送商品合計（未対応タブのみ表示） */}
      {statusFilter === 'pending' && (
        <PendingProductsSummary dateFrom={dateFrom} dateTo={dateTo} />
      )}

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

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AdminOrdersContent />
    </Suspense>
  )
}
