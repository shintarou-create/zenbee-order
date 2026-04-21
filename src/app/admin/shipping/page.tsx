'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import OrderTable from '@/components/admin/OrderTable'
import PendingProductsSummary from '@/components/admin/PendingProductsSummary'
import type { Order } from '@/types'
import { formatDateForInput, getNextBusinessDay } from '@/lib/utils'

export default function AdminShippingPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [shipDate, setShipDate] = useState(formatDateForInput(getNextBusinessDay(new Date())))
  const [csvExporting, setCsvExporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchOrders() // eslint-disable-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

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
        .eq('status', 'pending')
        .order('delivery_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (dateFrom) query = query.gte('delivery_date', dateFrom)
      if (dateTo)   query = query.lte('delivery_date', dateTo)

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

      setMessage({ type: 'success', text: `${selectedIds.length}件のヤマトCSVを出力しました（伝票印刷済みにマーク）` })
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
      <h1 className="text-xl font-bold text-gray-900">出荷管理</h1>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* 納品日フィルター */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
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

      {/* 未発送商品合計 */}
      <PendingProductsSummary dateFrom={dateFrom} dateTo={dateTo} />

      {/* 選択バナー */}
      {selectedIds.length > 0 && (
        <div className="bg-green-50 rounded-xl border border-green-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-green-800 font-medium text-sm">{selectedIds.length}件選択中</span>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={shipDate}
              onChange={(e) => setShipDate(e.target.value)}
              className="border border-green-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            />
            <button
              onClick={() => window.open(`/admin/orders/bulk-print?ids=${selectedIds.join(',')}`, '_blank')}
              disabled={csvExporting}
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              納品書印刷
            </button>
            <button
              onClick={handleYamatoCSV}
              disabled={csvExporting}
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {csvExporting ? 'CSV生成中...' : 'ヤマトCSV出力'}
            </button>
          </div>
        </div>
      )}

      {/* 未発送の注文一覧 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">未発送の注文</h2>
          <span className="text-sm text-gray-500">{orders.length}件</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <OrderTable
            orders={orders}
            showCheckbox={true}
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
            onUndoDeliveryNotePrinted={handleUndoDeliveryNotePrinted}
            onUndoShipped={handleUndoShipped}
          />
        )}
      </div>
    </div>
  )
}
