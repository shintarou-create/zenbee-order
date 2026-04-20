'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Order } from '@/types'
import { formatDate, formatCurrency, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'

type SortKey = 'created_at' | 'delivery_date'
type SortDir = 'asc' | 'desc'

interface OrderTableProps {
  orders: Order[]
  onStatusChange?: (orderId: string, status: string) => void
  showCheckbox?: boolean
  selectedIds?: string[]
  onSelectChange?: (ids: string[]) => void
  basePath?: string
}

function buildItemSummary(order: Order): string {
  const items = order.order_items ?? []
  if (items.length === 0) return ''
  return items
    .map((item) => `${item.product_name} × ${item.quantity}`)
    .join(', ')
}

export default function OrderTable({
  orders,
  showCheckbox = false,
  selectedIds = [],
  onSelectChange,
  basePath = '/admin/orders',
}: OrderTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('delivery_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'delivery_date' ? 'asc' : 'desc')
    }
  }

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aVal = sortKey === 'created_at' ? a.created_at : (a.delivery_date ?? '')
      const bVal = sortKey === 'created_at' ? b.created_at : (b.delivery_date ?? '')
      if (!aVal && !bVal) return 0
      if (!aVal) return 1
      if (!bVal) return -1
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [orders, sortKey, sortDir])

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-gray-300">↕</span>
    return <span className="ml-1 text-green-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function handleSelectAll(checked: boolean) {
    if (!onSelectChange) return
    onSelectChange(checked ? orders.map((o) => o.id) : [])
  }

  function handleSelectOne(orderId: string, checked: boolean) {
    if (!onSelectChange) return
    onSelectChange(
      checked ? [...selectedIds, orderId] : selectedIds.filter((id) => id !== orderId)
    )
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p>注文がありません</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {showCheckbox && (
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.length === orders.length && orders.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
              </th>
            )}
            <th className="px-4 py-3 text-left text-gray-600 font-semibold">注文番号</th>
            <th className="px-4 py-3 text-left text-gray-600 font-semibold">お客様</th>
            <th
              className="px-4 py-3 text-left text-gray-600 font-semibold hidden md:table-cell cursor-pointer select-none hover:text-gray-900 whitespace-nowrap"
              onClick={() => handleSort('delivery_date')}
            >
              納品日<SortIcon col="delivery_date" />
            </th>
            <th
              className="px-4 py-3 text-left text-gray-600 font-semibold hidden md:table-cell cursor-pointer select-none hover:text-gray-900 whitespace-nowrap"
              onClick={() => handleSort('created_at')}
            >
              発注日<SortIcon col="created_at" />
            </th>
            <th className="px-4 py-3 text-right text-gray-600 font-semibold">金額</th>
            <th className="px-4 py-3 text-center text-gray-600 font-semibold">ステータス</th>
            <th className="px-4 py-3 text-center text-gray-600 font-semibold">詳細</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sortedOrders.map((order) => {
            const company = order.company as { company_name?: string; representative_name?: string; has_separate_billing?: boolean } | undefined
            const itemSummary = buildItemSummary(order)
            const shippingTotal = (order.order_shipping ?? []).reduce((sum, s) => sum + s.cost, 0)

            return (
              <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                {showCheckbox && (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(order.id)}
                      onChange={(e) => handleSelectOne(order.id, e.target.checked)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                  </td>
                )}

                {/* 注文番号 + 備考 */}
                <td className="px-4 py-3 max-w-[160px]">
                  <span className="font-medium text-gray-900">{order.order_number}</span>
                  {order.notes && (
                    <p className="text-xs text-orange-500 truncate mt-0.5">{order.notes}</p>
                  )}
                </td>

                {/* お客様 + 商品サマリー */}
                <td className="px-4 py-3 max-w-[240px]">
                  <p className="font-medium text-gray-900 truncate">
                    {company?.company_name || '—'}
                  </p>
                  {itemSummary && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{itemSummary}</p>
                  )}
                </td>

                {/* 納品日 */}
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell whitespace-nowrap">
                  {order.delivery_date ? formatDate(order.delivery_date) : '—'}
                </td>

                {/* 発注日 */}
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell whitespace-nowrap">
                  {formatDate(order.created_at)}
                </td>

                {/* 金額 + 送料 */}
                <td className="px-4 py-3 text-right">
                  <p className="font-bold text-green-700">{formatCurrency(order.total_amount)}</p>
                  {shippingTotal > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      送料 {formatCurrency(shippingTotal)}
                    </p>
                  )}
                </td>

                {/* ステータス */}
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex text-xs font-bold px-2 py-1 rounded-full ${getOrderStatusColor(order.status)}`}>
                    {getOrderStatusLabel(order.status)}
                  </span>
                </td>

                {/* 詳細リンク */}
                <td className="px-4 py-3 text-center">
                  <Link
                    href={`${basePath}/${order.id}`}
                    className="text-green-600 hover:text-green-800 font-medium text-xs"
                  >
                    詳細
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
