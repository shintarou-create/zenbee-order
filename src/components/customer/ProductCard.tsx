'use client'

import { useState } from 'react'
import type { Product, CartItem, CoolType, ProductPricingTier } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface ProductCardProps {
  product: Product
  onAddToCart: (item: Omit<CartItem, 'subtotal'>) => void
  cartItem?: CartItem
}

export default function ProductCard({ product, onAddToCart, cartItem }: ProductCardProps) {
  const [quantity, setQuantity] = useState<number>(1)
  const [selectedTier, setSelectedTier] = useState<ProductPricingTier | null>(null)
  const [adding, setAdding] = useState(false)

  const tiers = product.pricing_tiers ?? []
  const hasTiers = tiers.length > 0

  const inventory = product.inventory
  const availableQty = inventory ? inventory.available_qty - inventory.reserved_qty : 0
  const isSoldOut = availableQty <= 0
  const isLowStock = !isSoldOut && availableQty < 10
  const currentPrice = product.current_price || 0

  function handleQuantityChange(value: number) {
    const min = hasTiers ? 1 : product.min_order_qty
    const max = hasTiers ? 999 : product.max_order_qty
    const step = hasTiers ? 1 : product.step_qty
    const clamped = Math.max(min, Math.min(max, value))
    const stepped = Math.round(clamped / step) * step
    setQuantity(hasTiers ? Math.max(1, Math.floor(stepped)) : parseFloat(stepped.toFixed(2)))
  }

  async function handleAddToCart() {
    if (isSoldOut) return
    if (hasTiers && !selectedTier) return
    if (!hasTiers && !currentPrice) return

    setAdding(true)
    try {
      if (hasTiers && selectedTier) {
        onAddToCart({
          productId: product.id,
          productName: product.name,
          quantity,
          unit: product.unit,
          unitPrice: selectedTier.unit_price,
          coolType: product.cool_type as CoolType,
          stepQty: 1,
          minOrderQty: 1,
          imageUrl: product.image_url,
          pricingTierId: selectedTier.id,
          tierLabel: selectedTier.tier_label,
          tierQuantity: selectedTier.quantity,
        })
      } else {
        onAddToCart({
          productId: product.id,
          productName: product.name,
          quantity,
          unit: product.unit,
          unitPrice: currentPrice,
          coolType: product.cool_type as CoolType,
          stepQty: product.step_qty,
          minOrderQty: product.min_order_qty,
          imageUrl: product.image_url,
        })
      }
      setQuantity(hasTiers ? 1 : product.min_order_qty)
    } finally {
      setTimeout(() => setAdding(false), 500)
    }
  }

  // 段階あり商品の小計
  const tierSubtotal = hasTiers && selectedTier
    ? selectedTier.unit_price * selectedTier.quantity * quantity
    : null
  const tierTotalBottles = hasTiers && selectedTier ? selectedTier.quantity * quantity : null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 商品画像 */}
      {product.image_url && (
        <div className="w-full h-32 overflow-hidden bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        </div>
      )}

      {/* 商品ヘッダー */}
      <div className="bg-green-50 px-4 py-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {product.is_seasonal && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">旬</span>
            )}
            {product.cool_type === 1 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">冷蔵</span>
            )}
          </div>
          <h3 className="font-bold text-gray-900 mt-1 text-base leading-tight">{product.name}</h3>
        </div>
        {isSoldOut ? (
          <span className="flex-shrink-0 bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">売切</span>
        ) : isLowStock ? (
          <span className="flex-shrink-0 bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-1 rounded-full">残りわずか</span>
        ) : (
          <span className="flex-shrink-0 bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">在庫あり</span>
        )}
      </div>

      <div className="p-4">
        {product.description && (
          <p className="text-xs text-gray-500 mb-3 line-clamp-2">{product.description}</p>
        )}

        {cartItem && (
          <div className="mb-2 text-xs text-green-600 bg-green-50 rounded-lg px-2 py-1">
            {cartItem.tierLabel
              ? `カート: ${cartItem.tierLabel} × ${cartItem.quantity}ケース（${(cartItem.tierQuantity ?? 1) * cartItem.quantity}本）`
              : `カート: ${cartItem.quantity}${cartItem.unit}`}
          </div>
        )}

        {!isSoldOut && (
          <>
            {/* 価格段階ラジオ */}
            {hasTiers && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-600 mb-1.5">価格段階を選択：</p>
                <div className="space-y-1.5">
                  {tiers.map((tier) => (
                    <label
                      key={tier.id}
                      className={`flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 border transition-colors ${
                        selectedTier?.id === tier.id
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`tier-${product.id}`}
                        value={tier.id}
                        checked={selectedTier?.id === tier.id}
                        onChange={() => setSelectedTier(tier)}
                        className="accent-green-600"
                      />
                      <span className="text-sm font-medium text-gray-800">{tier.tier_label}</span>
                      <span className="text-xs text-gray-500 ml-auto">
                        {tier.quantity}本入 {formatCurrency(tier.unit_price)}/本
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 数量入力 */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => handleQuantityChange(quantity - (hasTiers ? 1 : product.step_qty))}
                disabled={quantity <= (hasTiers ? 1 : product.min_order_qty)}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg font-bold transition-colors"
              >
                −
              </button>
              <div className="flex-1 flex items-center justify-center gap-1">
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => handleQuantityChange(parseFloat(e.target.value) || 1)}
                  min={hasTiers ? 1 : product.min_order_qty}
                  step={hasTiers ? 1 : product.step_qty}
                  className="w-20 text-center text-lg font-bold border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <span className="text-sm text-gray-500">
                  {hasTiers ? 'ケース' : product.unit}
                </span>
              </div>
              <button
                onClick={() => handleQuantityChange(quantity + (hasTiers ? 1 : product.step_qty))}
                disabled={!hasTiers && quantity >= product.max_order_qty}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg font-bold transition-colors"
              >
                ＋
              </button>
            </div>

            {/* 段階ありの合計表示 */}
            {hasTiers && selectedTier && tierSubtotal !== null && tierTotalBottles !== null && (
              <div className="mb-3 bg-green-50 rounded-lg px-3 py-2 text-sm">
                <div className="text-gray-600">
                  {selectedTier.quantity}本入 × {quantity}ケース = <strong>{tierTotalBottles}本</strong>
                </div>
                <div className="font-bold text-green-800 text-base mt-0.5">
                  合計 {formatCurrency(tierSubtotal)}
                </div>
              </div>
            )}

            {/* 段階なしの価格表示 */}
            {!hasTiers && currentPrice > 0 && (
              <div className="mb-3 text-sm text-gray-600">
                {formatCurrency(currentPrice)}/{product.unit}
              </div>
            )}

            {/* カートに追加ボタン */}
            <button
              onClick={handleAddToCart}
              disabled={adding || (hasTiers && !selectedTier)}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                adding
                  ? 'bg-green-400 text-white scale-95'
                  : hasTiers && !selectedTier
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white active:scale-95'
              }`}
            >
              {adding ? '追加しました ✓' : hasTiers && !selectedTier ? '段階を選択してください' : 'カートに追加'}
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
