'use client'

import Link from 'next/link'
import type { Order } from '@/types'
import { formatDate, formatCurrency, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'

interface OrderTableProps {
  orders: Order[]
  onStatusChange?: (orderId: string, status: string) => void
  showCheckbox?: boolean
  selectedIds?: string[]
  onSelectChange?: (ids: string[]) => void
  basePath?: string
}

export default function OrderTable({
  orders,
  showCheckbox = false,
  selectedIds = [],
  onSelectChange,
  basePath = '/admin/orders',
}: OrderTableProps) {
  function handleSelectAll(checked: boolean) {
    if (!onSelectChange) return
    onSelectChange(checked ? orders.map((o) => o.id) : [])
  }

  function handleSelectOne(orderId: string, checked: boolean) {
    if (!onSelectChange) return
    if (checked) {
      onSelectChange([...selectedIds, orderId])
    } else {
      onSelectChange(selectedIds.filter((id) => id !== orderId))
    }
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
            <th className="px-4 py-3 text-left text-gray-600 font-semibold hidden md:table-cell">発注日</th>
            <th className="px-4 py-3 text-right text-gray-600 font-semibold">金額</th>
            <th className="px-4 py-3 text-center text-gray-600 font-semibold">ステータス</th>
            <th className="px-4 py-3 text-center text-gray-600 font-semibold">詳細</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map((order) => {
            const customer = order.customer as { company_name?: string; representative_name?: string } | undefined
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
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900">{order.order_number}</span>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {customer?.company_name || '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                  {formatDate(order.created_at)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-green-700">
                  {formatCurrency(order.total_amount)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex text-xs font-bold px-2 py-1 rounded-full ${getOrderStatusColor(order.status)}`}>
                    {getOrderStatusLabel(order.status)}
                  </span>
                </td>
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
