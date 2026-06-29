'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Order } from '@/types'
import { formatDate, formatCurrency, getOrderStatusLabel, getOrderStatusColor, formatDateWithDay } from '@/lib/utils'
import { formatDeliveryTimeSlot } from '@/lib/yamato-csv'

type SortKey = 'created_at' | 'delivery_date'
type SortDir = 'asc' | 'desc'

interface OrderTableProps {
  orders: Order[]
  onStatusChange?: (orderId: string, status: string) => void
  showCheckbox?: boolean
  selectedIds?: string[]
  onSelectChange?: (ids: string[]) => void
  basePath?: string
  onUnmarkLabel?: (orderId: string) => void
  onUndoDeliveryNotePrinted?: (orderId: string) => Promise<void>
  onUndoShipped?: (orderId: string) => Promise<void>
  detailLinkSuffix?: string
}

function formatItemLabel(item: { product_name: string; quantity: number; unit?: string | null; tier_quantity?: number | null }): string {
  if (item.tier_quantity) return `${item.product_name} ${item.tier_quantity}本入×${item.quantity}`
  if (item.unit) return `${item.product_name} ${item.quantity}${item.unit}`
  return item.product_name
}

function getDisplayStatusLabel(order: Order): string {
  if (order.status === 'pending' && order.delivery_note_printed) return '納品書済'
  return getOrderStatusLabel(order.status)
}

function getDisplayStatusColor(order: Order): string {
  if (order.status === 'pending' && order.delivery_note_printed) return 'bg-purple-100 text-purple-700'
  return getOrderStatusColor(order.status)
}

function LabelBadge({
  order,
  onUnmarkLabel,
}: {
  order: Order
  onUnmarkLabel?: (id: string) => void
}) {
  if (!order.shipping_label_printed) return null
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded${
        onUnmarkLabel ? ' cursor-pointer hover:bg-blue-100 hover:text-blue-800' : ''
      }`}
      onClick={
        onUnmarkLabel
          ? (e) => {
              e.stopPropagation()
              if (window.confirm('伝票印刷済みマークを解除しますか？')) {
                onUnmarkLabel(order.id)
              }
            }
          : undefined
      }
      title={onUnmarkLabel ? 'クリックして解除' : undefined}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
        />
      </svg>
      伝票済
    </span>
  )
}

function StatusBadge({
  order,
  updatingId,
  onUndoDeliveryNotePrinted,
  onUndoShipped,
  onClick,
}: {
  order: Order
  updatingId: string | null
  onUndoDeliveryNotePrinted?: (id: string) => Promise<void>
  onUndoShipped?: (id: string) => Promise<void>
  onClick: (order: Order) => void
}) {
  const isClickable =
    (order.status === 'pending' && order.delivery_note_printed && !!onUndoDeliveryNotePrinted) ||
    (order.status === 'shipped' && !!onUndoShipped)
  const isUpdating = updatingId === order.id
  return (
    <span
      className={`inline-flex text-xs font-bold px-2 py-1 rounded-full transition-opacity whitespace-nowrap ${getDisplayStatusColor(order)}${
        isClickable && !isUpdating ? ' cursor-pointer hover:opacity-75' : ''
      }${isUpdating ? ' opacity-50 cursor-wait' : ''}`}
      onClick={isClickable && !isUpdating ? () => onClick(order) : undefined}
    >
      {isUpdating ? '更新中...' : getDisplayStatusLabel(order)}
    </span>
  )
}

export default function OrderTable({
  orders,
  showCheckbox = false,
  selectedIds = [],
  onSelectChange,
  basePath = '/admin/orders',
  onUnmarkLabel,
  onUndoDeliveryNotePrinted,
  onUndoShipped,
  detailLinkSuffix = '',
}: OrderTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('delivery_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

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

  async function handleStatusBadgeClick(order: Order) {
    if (updatingId) return

    let confirmMsg: string
    let updateFn: () => Promise<void>

    if (order.status === 'pending' && order.delivery_note_printed && onUndoDeliveryNotePrinted) {
      confirmMsg = '納品書印刷済みを取り消しますか？'
      updateFn = () => onUndoDeliveryNotePrinted(order.id)
    } else if (order.status === 'shipped' && onUndoShipped) {
      confirmMsg = '出荷済みを取り消しますか？ステータスが戻ります'
      updateFn = () => onUndoShipped(order.id)
    } else {
      return
    }

    if (!window.confirm(confirmMsg)) return

    setUpdatingId(order.id)
    try {
      await updateFn()
    } catch {
      alert('更新に失敗しました')
    } finally {
      setUpdatingId(null)
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
    <div>
      {/* ===== PC: Table (md+) ===== */}
      <div className="hidden md:block overflow-x-auto">
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
              <th className="px-4 py-3 text-left text-gray-600 font-semibold whitespace-nowrap">お客様</th>
              <th className="px-4 py-3 text-left text-gray-600 font-semibold whitespace-nowrap">注文内容</th>
              <th
                className="px-4 py-3 text-left text-gray-600 font-semibold cursor-pointer select-none hover:text-gray-900 whitespace-nowrap"
                onClick={() => handleSort('delivery_date')}
              >
                納品日
                {sortKey !== 'delivery_date' ? (
                  <span className="ml-1 text-gray-300">↕</span>
                ) : (
                  <span className="ml-1 text-green-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
              <th className="px-4 py-3 text-right text-gray-600 font-semibold whitespace-nowrap">金額</th>
              <th className="px-4 py-3 text-center text-gray-600 font-semibold whitespace-nowrap">ステータス</th>
              <th className="px-4 py-3 text-left text-gray-600 font-semibold whitespace-nowrap">備考</th>
              <th className="px-4 py-3 text-center text-gray-600 font-semibold whitespace-nowrap">詳細</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedOrders.map((order) => {
              const company = order.company as
                | { company_name?: string; representative_name?: string; has_separate_billing?: boolean }
                | undefined
              const shippingTotal = (order.order_shipping ?? []).reduce((sum, s) => sum + s.cost, 0)
              const items = order.order_items ?? []

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

                  {/* お客様 */}
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="font-medium text-base text-gray-900 leading-snug truncate">
                      {company?.company_name || '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {order.order_number}・{formatDate(order.created_at)}
                    </p>
                    {(order.details_confirmed || order.shipping_label_printed) && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {order.details_confirmed && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                            ✓ 確認済
                          </span>
                        )}
                        <LabelBadge order={order} onUnmarkLabel={onUnmarkLabel} />
                      </div>
                    )}
                  </td>

                  {/* 注文内容 */}
                  <td className="px-4 py-3 max-w-[220px]">
                    {items.length === 0 ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {items.slice(0, 3).map((item, i) => (
                          <p key={i} className="text-xs text-gray-600 leading-snug">
                            {formatItemLabel(item)}
                          </p>
                        ))}
                        {items.length > 3 && (
                          <p className="text-xs text-gray-400">ほか{items.length - 3}点</p>
                        )}
                      </div>
                    )}
                  </td>

                  {/* 納品日 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {order.delivery_date ? (
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">
                          {formatDateWithDay(order.delivery_date)}
                        </span>
                        {order.delivery_time_slot && (
                          <span className="text-xs text-gray-500">{formatDeliveryTimeSlot(order.delivery_time_slot)}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>

                  {/* 金額 */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <p className="font-bold text-green-700">{formatCurrency(order.total_amount)}</p>
                    {shippingTotal > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">送料 {formatCurrency(shippingTotal)}</p>
                    )}
                  </td>

                  {/* ステータス */}
                  <td className="px-4 py-3 text-center">
                    <StatusBadge
                      order={order}
                      updatingId={updatingId}
                      onUndoDeliveryNotePrinted={onUndoDeliveryNotePrinted}
                      onUndoShipped={onUndoShipped}
                      onClick={handleStatusBadgeClick}
                    />
                  </td>

                  {/* 備考 */}
                  <td className="px-4 py-3 max-w-[160px]">
                    {order.notes ? (
                      <p className="text-xs text-orange-500 truncate">{order.notes}</p>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>

                  {/* 詳細 */}
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`${basePath}/${order.id}${detailLinkSuffix}`}
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

      {/* ===== Mobile: Cards (< md) ===== */}
      <div className="block md:hidden divide-y divide-gray-100">
        {sortedOrders.map((order) => {
          const company = order.company as { company_name?: string } | undefined
          const shippingTotal = (order.order_shipping ?? []).reduce((sum, s) => sum + s.cost, 0)
          const items = order.order_items ?? []

          return (
            <div key={order.id} className="p-4 space-y-2">
              {/* お客様名 + ステータスバッジ */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  {showCheckbox && (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(order.id)}
                      onChange={(e) => handleSelectOne(order.id, e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0"
                    />
                  )}
                  <p className="font-semibold text-gray-900 text-base leading-snug truncate">
                    {company?.company_name || '—'}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <StatusBadge
                    order={order}
                    updatingId={updatingId}
                    onUndoDeliveryNotePrinted={onUndoDeliveryNotePrinted}
                    onUndoShipped={onUndoShipped}
                    onClick={handleStatusBadgeClick}
                  />
                </div>
              </div>

              {/* 注文番号・発注日 */}
              <p className="text-xs text-gray-400">
                {order.order_number}・{formatDate(order.created_at)}
              </p>

              {/* 確認済・伝票済バッジ */}
              {(order.details_confirmed || order.shipping_label_printed) && (
                <div className="flex items-center gap-1 flex-wrap">
                  {order.details_confirmed && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                      ✓ 確認済
                    </span>
                  )}
                  <LabelBadge order={order} onUnmarkLabel={onUnmarkLabel} />
                </div>
              )}

              {/* 注文内容 */}
              {items.length > 0 && (
                <div className="pt-2 border-t border-gray-100 space-y-0.5">
                  {items.slice(0, 3).map((item, i) => (
                    <p key={i} className="text-xs text-gray-600 leading-snug">
                      {formatItemLabel(item)}
                    </p>
                  ))}
                  {items.length > 3 && (
                    <p className="text-xs text-gray-400">ほか{items.length - 3}点</p>
                  )}
                </div>
              )}

              {/* 納品日・金額 */}
              <div className="flex items-end justify-between pt-1">
                <div>
                  <span className="text-xs text-gray-500">納品日 </span>
                  <span className="text-sm font-medium text-gray-900">
                    {order.delivery_date ? formatDateWithDay(order.delivery_date) : '—'}
                  </span>
                  {order.delivery_time_slot && (
                    <p className="text-xs text-gray-500">{formatDeliveryTimeSlot(order.delivery_time_slot)}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-700">{formatCurrency(order.total_amount)}</p>
                  {shippingTotal > 0 && (
                    <p className="text-xs text-gray-400">送料 {formatCurrency(shippingTotal)}</p>
                  )}
                </div>
              </div>

              {/* 備考 */}
              <p className="text-xs">
                {order.notes ? (
                  <span className="text-orange-500 block truncate">{order.notes}</span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </p>

              {/* 詳細リンク */}
              <div className="flex justify-end pt-1">
                <Link
                  href={`${basePath}/${order.id}${detailLinkSuffix}`}
                  className="text-green-600 hover:text-green-800 font-medium text-sm"
                >
                  詳細を見る →
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
