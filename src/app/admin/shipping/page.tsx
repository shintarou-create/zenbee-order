'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import OrderTable from '@/components/admin/OrderTable'
import type { Order } from '@/types'
import { formatDateForInput, getNextBusinessDay } from '@/lib/utils'

export default function AdminShippingPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [shipDate, setShipDate] = useState(formatDateForInput(getNextBusinessDay(new Date())))
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchConfirmedOrders()
  }, [])

  async function fetchConfirmedOrders() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies (company_name, representative_name, phone, postal_code, prefecture, city, address, building)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (error) throw error
      setOrders((data || []) as Order[])
    } catch (err) {
      console.error('注文取得エラー:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleExportCSV() {
    if (selectedIds.length === 0) {
      setMessage({ type: 'error', text: '出荷する注文を選択してください' })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    setExporting(true)
    try {
      const response = await fetch('/api/shipping-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': 'admin', // 実際の本番では適切なトークンを使用
        },
        body: JSON.stringify({
          orderIds: selectedIds,
          shipDate,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'CSV生成に失敗しました')
      }

      // ファイルダウンロード
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `yamato_b2_${shipDate.replace(/-/g, '')}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setMessage({ type: 'success', text: `${selectedIds.length}件のCSVを出力し、発送済みに更新しました` })
      setSelectedIds([])
      await fetchConfirmedOrders()
    } catch (err) {
      console.error('CSV出力エラー:', err)
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'CSV出力に失敗しました' })
    } finally {
      setExporting(false)
      setTimeout(() => setMessage(null), 5000)
    }
  }

  const selectedOrders = orders.filter((o) => selectedIds.includes(o.id))

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

      {/* 発送日設定 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">発送日</label>
            <input
              type="date"
              value={shipDate}
              onChange={(e) => setShipDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
          <div className="text-sm text-gray-500 pt-5">
            ※ 確認済みの注文のみ表示されます
          </div>
        </div>
      </div>

      {/* 注文一覧（チェックボックス付き） */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">確認済み注文一覧</h2>
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
          />
        )}
      </div>

      {/* 選択した注文のプレビュー */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <h3 className="font-bold text-blue-800 mb-2">選択中の注文（{selectedIds.length}件）</h3>
          <div className="space-y-1.5">
            {selectedOrders.map((order) => {
              const company = order.company as { company_name?: string } | undefined
              return (
                <div key={order.id} className="flex items-center justify-between text-sm">
                  <span className="text-blue-700">{order.order_number}</span>
                  <span className="text-blue-600">{company?.company_name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CSV出力ボタン */}
      <div className="flex justify-end">
        <button
          onClick={handleExportCSV}
          disabled={exporting || selectedIds.length === 0}
          className={`flex items-center gap-2 font-bold px-6 py-3 rounded-xl text-sm transition-all ${
            selectedIds.length === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : exporting
              ? 'bg-green-400 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? 'CSV生成中...' : `CSV出力（${selectedIds.length}件）`}
        </button>
      </div>
    </div>
  )
}
