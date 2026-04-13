'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import OrderTable from '@/components/admin/OrderTable'
import type { Order, OrderStatus } from '@/types'

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'pending', label: '確認待ち' },
  { value: 'confirmed', label: '確認済み' },
  { value: 'shipped', label: '発送済み' },
  { value: 'delivered', label: 'お届け済み' },
]

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkUpdating, setBulkUpdating] = useState(false)
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
          customer:customers (company_name, representative_name)
        `)
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (dateFrom) {
        query = query.gte('created_at', `${dateFrom}T00:00:00`)
      }

      if (dateTo) {
        query = query.lte('created_at', `${dateTo}T23:59:59`)
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

  async function handleBulkConfirm() {
    if (selectedIds.length === 0) return
    setBulkUpdating(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('orders')
        .update({ status: 'confirmed' as OrderStatus })
        .in('id', selectedIds)
        .eq('status', 'pending')

      if (error) throw error

      setMessage({ type: 'success', text: `${selectedIds.length}件の注文を確認済みにしました` })
      setSelectedIds([])
      await fetchOrders()
    } catch (err) {
      console.error('一括確認エラー:', err)
      setMessage({ type: 'error', text: '一括確認に失敗しました' })
    } finally {
      setBulkUpdating(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">受注一覧</h1>
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

        {/* 日付フィルター */}
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* 一括操作 */}
      {selectedIds.length > 0 && (
        <div className="bg-green-50 rounded-xl border border-green-200 px-4 py-3 flex items-center justify-between">
          <span className="text-green-800 font-medium text-sm">
            {selectedIds.length}件選択中
          </span>
          <button
            onClick={handleBulkConfirm}
            disabled={bulkUpdating}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {bulkUpdating ? '処理中...' : '確認済みにする'}
          </button>
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
          />
        )}
      </div>
    </div>
  )
}
