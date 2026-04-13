'use client'

import { useState } from 'react'
import type { Product, CartItem, CoolType } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface ProductCardProps {
  product: Product
  onAddToCart: (item: Omit<CartItem, 'subtotal'>) => void
  cartItem?: CartItem
}

export default function ProductCard({ product, onAddToCart, cartItem }: ProductCardProps) {
  const [quantity, setQuantity] = useState<number>(product.min_order_qty)
  const [adding, setAdding] = useState(false)

  const inventory = product.inventory
  const availableQty = inventory ? inventory.available_qty - inventory.reserved_qty : 0
  const isSoldOut = availableQty <= 0
  const isLowStock = !isSoldOut && availableQty < 10
  const currentPrice = product.current_price || 0

  function handleQuantityChange(value: number) {
    const clamped = Math.max(
      product.min_order_qty,
      Math.min(product.max_order_qty, value)
    )
    // step に合わせて丸める
    const stepped = Math.round(clamped / product.step_qty) * product.step_qty
    setQuantity(parseFloat(stepped.toFixed(2)))
  }

  function handleDecrement() {
    handleQuantityChange(quantity - product.step_qty)
  }

  function handleIncrement() {
    handleQuantityChange(quantity + product.step_qty)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value)
    if (!isNaN(val)) {
      handleQuantityChange(val)
    }
  }

  async function handleAddToCart() {
    if (isSoldOut || !currentPrice) return
    setAdding(true)
    try {
      onAddToCart({
        productId: product.id,
        productName: product.name,
        quantity,
        unit: product.unit,
        unitPrice: currentPrice,
        coolType: product.cool_type as CoolType,
      })
      // カート追加後に数量をリセット
      setQuantity(product.min_order_qty)
    } finally {
      setTimeout(() => setAdding(false), 500)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 商品ヘッダー */}
      <div className="bg-green-50 px-4 py-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {product.category}
            </span>
            {product.is_seasonal && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                旬
              </span>
            )}
            {product.cool_type === 1 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                冷蔵
              </span>
            )}
          </div>
          <h3 className="font-bold text-gray-900 mt-1 text-base leading-tight">
            {product.name}
          </h3>
        </div>

        {/* 在庫状況バッジ */}
        {isSoldOut ? (
          <span className="flex-shrink-0 bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
            売切
          </span>
        ) : isLowStock ? (
          <span className="flex-shrink-0 bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-1 rounded-full">
            残りわずか
          </span>
        ) : (
          <span className="flex-shrink-0 bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">
            在庫あり
          </span>
        )}
      </div>

      <div className="p-4">
        {/* 価格 */}
        <div className="flex items-baseline gap-1 mb-3">
          <span className="text-2xl font-bold text-green-700">
            {formatCurrency(currentPrice)}
          </span>
          <span className="text-sm text-gray-500">/{product.unit}</span>
        </div>

        {/* 説明 */}
        {product.description && (
          <p className="text-xs text-gray-500 mb-3 line-clamp-2">{product.description}</p>
        )}

        {/* カートに入っている場合の表示 */}
        {cartItem && (
          <div className="mb-2 text-xs text-green-600 bg-green-50 rounded-lg px-2 py-1">
            カート: {cartItem.quantity}{product.unit} ({formatCurrency(cartItem.subtotal)})
          </div>
        )}

        {/* 数量入力 */}
        {!isSoldOut && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={handleDecrement}
                disabled={quantity <= product.min_order_qty}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg font-bold transition-colors"
              >
                −
              </button>
              <div className="flex-1 flex items-center justify-center gap-1">
                <input
                  type="number"
                  value={quantity}
                  onChange={handleInputChange}
                  min={product.min_order_qty}
                  max={product.max_order_qty}
                  step={product.step_qty}
                  className="w-20 text-center text-lg font-bold border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <span className="text-sm text-gray-500">{product.unit}</span>
              </div>
              <button
                onClick={handleIncrement}
                disabled={quantity >= product.max_order_qty}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg font-bold transition-colors"
              >
                ＋
              </button>
            </div>

            {/* 小計 */}
            <div className="text-right text-sm text-gray-500 mb-3">
              小計: <span className="font-bold text-gray-900">{formatCurrency(quantity * currentPrice)}</span>
            </div>

            {/* カートに追加ボタン */}
            <button
              onClick={handleAddToCart}
              disabled={adding}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                adding
                  ? 'bg-green-400 text-white scale-95'
                  : 'bg-green-600 hover:bg-green-700 text-white active:scale-95'
              }`}
            >
              {adding ? '追加しました ✓' : 'カートに追加'}
            </button>
          </>
        )}

        {isSoldOut && (
          <div className="w-full py-3 rounded-xl bg-gray-100 text-gray-400 text-sm font-bold text-center">
            現在品切れ中
          </div>
        )}
      </div>
    </div>
  )
}
