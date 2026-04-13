'use client'

import type { CartItem } from '@/types'

interface OrderSummaryProps {
  items: CartItem[]
  total: number
}

export default function OrderSummary({ items }: OrderSummaryProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="font-bold text-gray-900 mb-3 text-base">注文内容</h3>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.productId} className="flex items-center justify-between text-sm">
            <span className="text-gray-700 flex-1 truncate mr-2">{item.productName}</span>
            <span className="text-gray-500 flex-shrink-0">
              {item.quantity}{item.unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
