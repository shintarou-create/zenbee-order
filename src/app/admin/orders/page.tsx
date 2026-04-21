'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import OrderTable from '@/components/admin/OrderTable'
import type { Order, OrderStatus } from '@/types'
import { formatDateForInput, getNextBusinessDay } from '@/lib/utils'

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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [shipDate, setShipDate] = useState(formatDateForInput(getNextBusinessDay(new Date())))
  const [csvExporting, setCsvExporting] = useState(false)
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

  async function handleBulkStatusChange(newStatus: OrderStatus) {
    if (selectedIds.length === 0) return
    setBulkUpdating(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .in('id', selectedIds)

      if (error) throw error

      const statusLabels: Record<string, string> = {
        pending: '未対応',
        shipped: '出荷済',
        done: '完了',
      }
      setMessage({ type: 'success', text: `${selectedIds.length}件を「${statusLabels[newStatus] || newStatus}」にしました` })
      setSelectedIds([])
      await fetchOrders()
    } catch (err) {
      console.error('一括更新エラー:', err)
      setMessage({ type: 'error', text: '一括更新に失敗しました' })
    } finally {
      setBulkUpdating(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  async function handleYamatoCSV() {
    if (selectedIds.length === 0) return
    setCsvExporting(true)
    try {
      const response = await fetch('/api/shipping-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': 'admin',
        },
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

      setMessage({ type: 'success', text: `${selectedIds.length}件のヤマトCSVを出力し、発送済みに更新しました` })
      setSelectedIds([])
      await fetchOrders()
    } catch (err) {
      console.error('CSV出力エラー:', err)
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'CSV出力に失敗しました' })
    } finally {
      setCsvExporting(false)
      setTimeout(() => setMessage(null), 5000)
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

      {/* 一括操作 */}
      {selectedIds.length > 0 && (
        <div className="bg-green-50 rounded-xl border border-green-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-green-800 font-medium text-sm">
            {selectedIds.length}件選択中
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={shipDate}
              onChange={(e) => setShipDate(e.target.value)}
              className="border border-green-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            />
            <button
              onClick={handleYamatoCSV}
              disabled={csvExporting || bulkUpdating}
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {csvExporting ? 'CSV生成中...' : 'ヤマトCSV出力'}
            </button>
            {statusFilter === 'pending' && (
              <button
                onClick={() => handleBulkStatusChange('shipped')}
                disabled={bulkUpdating || csvExporting}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
              >
                出荷済みにする
              </button>
            )}
            {statusFilter === 'shipped' && (
              <button
                onClick={() => handleBulkStatusChange('done')}
                disabled={bulkUpdating || csvExporting}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
              >
                完了にする
              </button>
            )}
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
          />
        )}
      </div>
    </div>
  )
}
