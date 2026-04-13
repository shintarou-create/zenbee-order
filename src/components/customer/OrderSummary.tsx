'use client'

import type { CartItem } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface OrderSummaryProps {
  items: CartItem[]
  total: number
}

export default function OrderSummary({ items, total }: OrderSummaryProps) {
  const taxRate = 0.08
  const taxExcluded = Math.floor(total / (1 + taxRate))
  const taxAmount = total - taxExcluded

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="font-bold text-gray-900 mb-3 text-base">注文内容</h3>

      <div className="space-y-2 mb-4">
        {items.map((item) => (
          <div key={item.productId} className="flex items-center justify-between text-sm">
            <span className="text-gray-700 flex-1 truncate mr-2">{item.productName}</span>
            <span className="text-gray-500 flex-shrink-0">
              {item.quantity}{item.unit} × {formatCurrency(item.unitPrice)}
            </span>
            <span className="font-medium text-gray-900 ml-2 flex-shrink-0">
              {formatCurrency(item.subtotal)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-1.5">
        <div className="flex justify-between text-sm text-gray-600">
          <span>小計（税抜）</span>
          <span>{formatCurrency(taxExcluded)}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>消費税（8%）</span>
          <span>{formatCurrency(taxAmount)}</span>
        </div>
        <div className="flex justify-between font-bold text-green-700 text-lg pt-1 border-t border-gray-100">
          <span>合計（税込）</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  )
}
