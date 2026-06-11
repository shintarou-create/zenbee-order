'use client'

import type { CartItem } from '@/types'

interface OrderSummaryProps {
  items: CartItem[]
  total: number
}

export default function OrderSummary({ items }: OrderSummaryProps) {
  const normalItems = items.filter((i) => !i.isCustom)
  const customItems = items.filter((i) => i.isCustom)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="font-bold text-gray-900 mb-3 text-base">注文内容</h3>

      <div className="space-y-2">
        {normalItems.map((item) => (
          <div key={item.productId} className="flex items-center justify-between text-sm">
            <span className="text-gray-700 flex-1 truncate mr-2">{item.productName}</span>
            <span className="text-gray-500 flex-shrink-0">
              {item.tierQuantity != null
                ? `${item.quantity}ケース（${item.tierQuantity * item.quantity}本）`
                : `${item.quantity}${item.unit}`}
            </span>
          </div>
        ))}

        {customItems.length > 0 && (
          <>
            {normalItems.length > 0 && <div className="border-t border-gray-100 my-1" />}
            {customItems.map((item) => (
              <div key={item.productId} className="flex items-start justify-between text-sm gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex-shrink-0">自由記入</span>
                  <span className="text-gray-700 truncate">{item.productName}</span>
                </div>
                <span className="text-amber-600 text-xs flex-shrink-0 font-medium">金額未確定</span>
              </div>
            ))}
            <p className="text-xs text-amber-600 mt-1">
              ※自由記入分の金額は含まれていません
            </p>
          </>
        )}
      </div>
    </div>
  )
}
