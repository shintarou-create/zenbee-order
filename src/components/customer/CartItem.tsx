'use client'

import type { CartItem as CartItemType } from '@/types'

interface CartItemProps {
  item: CartItemType
  onUpdateQuantity: (productId: string, quantity: number) => void
  onRemove: (productId: string) => void
}

export default function CartItem({ item, onUpdateQuantity, onRemove }: CartItemProps) {
  function handleDecrement() {
    onUpdateQuantity(item.productId, Math.max(0, item.quantity - 1))
  }

  function handleIncrement() {
    onUpdateQuantity(item.productId, item.quantity + 1)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value)
    if (!isNaN(val) && val > 0) {
      onUpdateQuantity(item.productId, val)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 text-base">{item.productName}</h3>
            {item.coolType === 1 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                冷蔵
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onRemove(item.productId)}
          className="text-gray-400 hover:text-red-500 transition-colors p-1"
          aria-label="削除"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between mt-3">
        {/* 数量調整 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDecrement}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-lg font-bold transition-colors"
          >
            −
          </button>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={item.quantity}
              onChange={handleChange}
              min={0.1}
              step={0.1}
              className="w-16 text-center font-bold border border-gray-200 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <span className="text-sm text-gray-500">{item.unit}</span>
          </div>
          <button
            onClick={handleIncrement}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-lg font-bold transition-colors"
          >
            ＋
          </button>
        </div>

      </div>
    </div>
  )
}
