'use client'

import { useState, useEffect, useRef } from 'react'
import type { Product, CartItem, CoolType, ProductPricingTier } from '@/types'
import { isProductPreorder, formatShipStartDate } from '@/lib/utils'
import ProductDetailModal from './ProductDetailModal'

interface ProductCardProps {
  product: Product
  onPendingChange: (productId: string, item: Omit<CartItem, 'subtotal'> | null) => void
  cartItem?: CartItem
  resetKey?: number
}

export default function ProductCard({ product, onPendingChange, cartItem, resetKey }: ProductCardProps) {
  const [quantity, setQuantity] = useState<number>(0)
  const [selectedTier, setSelectedTier] = useState<ProductPricingTier | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  const tiers = product.pricing_tiers ?? []
  const hasTiers = tiers.length > 0

  const isUnavailable = product.stock_status === 'cross'
  const isLowStock = product.stock_status === 'triangle'
  const currentPrice = product.current_price || 0

  // resetKey が変わったらカード状態をリセット（初回は無視）
  const prevResetKey = useRef(resetKey ?? 0)
  useEffect(() => {
    if (prevResetKey.current === (resetKey ?? 0)) return
    prevResetKey.current = resetKey ?? 0
    setQuantity(0)
    setSelectedTier(null)
  }, [resetKey])

  // onPendingChange を ref 経由で保持し、effect deps から除外
  const onPendingChangeRef = useRef(onPendingChange)
  onPendingChangeRef.current = onPendingChange

  // quantity / selectedTier / product が変わったら親に保留状態を通知
  useEffect(() => {
    const cb = onPendingChangeRef.current
    if (isUnavailable) {
      cb(product.id, null)
      return
    }
    if (hasTiers) {
      if (selectedTier && quantity >= 1) {
        cb(product.id, {
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
        cb(product.id, null)
      }
    } else {
      if (quantity >= 1) {
        cb(product.id, {
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
      } else {
        cb(product.id, null)
      }
    }
  }, [quantity, selectedTier, product, hasTiers, isUnavailable, currentPrice])

  function handleQuantityChange(value: number) {
    if (value <= 0) {
      setQuantity(0)
      return
    }
    if (hasTiers) {
      setQuantity(Math.min(999, Math.floor(value)))
    } else {
      const clamped = Math.max(product.min_order_qty, Math.min(product.max_order_qty, value))
      const stepped = Math.round(clamped / product.step_qty) * product.step_qty
      setQuantity(parseFloat(stepped.toFixed(2)))
    }
  }

  function handleDecrement() {
    if (quantity <= 0) return
    if (hasTiers) {
      handleQuantityChange(quantity - 1)
    } else {
      // min_order_qty から1step下がると 0（未選択）になる
      handleQuantityChange(quantity <= product.min_order_qty ? 0 : quantity - product.step_qty)
    }
  }

  function handleIncrement() {
    if (hasTiers) {
      handleQuantityChange(quantity === 0 ? 1 : quantity + 1)
    } else {
      // 0 からの最初の増加は min_order_qty へジャンプ
      handleQuantityChange(quantity === 0 ? product.min_order_qty : quantity + product.step_qty)
    }
  }

  const tierTotalBottles = hasTiers && selectedTier && quantity >= 1
    ? selectedTier.quantity * quantity
    : null

  const isPending = hasTiers ? (selectedTier !== null && quantity >= 1) : quantity >= 1

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden border-2 transition-colors ${
      isUnavailable ? 'opacity-60 border-transparent' : isPending ? 'border-kincha' : 'border-transparent'
    }`}>
      {/* 商品画像 */}
      {product.image_url && (
        <div
          className="w-full h-32 overflow-hidden bg-gray-50 cursor-pointer"
          onClick={() => setShowDetail(true)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        </div>
      )}

      {/* 商品ヘッダー */}
      <div className="bg-kinari px-4 py-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {isProductPreorder(product) && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                予約受付中・発送は{formatShipStartDate(product.ship_start_date!)}から
              </span>
            )}
            {product.cool_type === 1 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">冷蔵</span>
            )}
            {product.cool_type === 2 && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">冷凍</span>
            )}
          </div>
          <h3 className="font-bold text-fukamidori mt-1 text-base leading-tight font-serif">{product.name}</h3>
        </div>
        {isUnavailable ? (
          <span className="flex-shrink-0 bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">在庫なし</span>
        ) : isLowStock ? (
          <span className="flex-shrink-0 bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-1 rounded-full">残りわずか</span>
        ) : null}
      </div>

      <div className="p-4">
        {product.description && (
          <p className="text-xs text-gray-500 mb-1 line-clamp-2">{product.description}</p>
        )}
        {(product.image_url || product.description) && (
          <button
            onClick={() => setShowDetail(true)}
            className="text-xs text-kincha mb-2 hover:underline"
          >
            詳しく見る ›
          </button>
        )}

        {cartItem && (
          <div className="mb-2 text-xs text-fukamidori bg-kinari rounded-lg px-2 py-1">
            {cartItem.tierLabel
              ? `カート: ${cartItem.tierLabel} × ${cartItem.quantity}ケース（${(cartItem.tierQuantity ?? 1) * cartItem.quantity}本）`
              : `カート: ${cartItem.quantity}${cartItem.unit}`}
          </div>
        )}

        {!isUnavailable && (
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
                          ? 'border-kincha bg-kinari'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`tier-${product.id}`}
                        value={tier.id}
                        checked={selectedTier?.id === tier.id}
                        onClick={() => { if (selectedTier?.id === tier.id) setSelectedTier(null) }}
                        onChange={() => setSelectedTier(tier)}
                        className="accent-fukamidori"
                      />
                      <span className="text-sm font-medium text-gray-800">{tier.tier_label}</span>
                    </label>
                  ))}
                </div>
                {selectedTier && (
                  <p className="text-xs text-gray-400 mt-1">選択中の段階をタップで解除</p>
                )}
              </div>
            )}

            {/* 数量入力 */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={handleDecrement}
                disabled={quantity <= 0}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg font-bold transition-colors"
              >
                −
              </button>
              <div className="flex-1 flex items-center justify-center gap-1">
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (isNaN(v) || v <= 0) { setQuantity(0); return }
                    handleQuantityChange(v)
                  }}
                  min={0}
                  step={hasTiers ? 1 : product.step_qty}
                  className={`w-20 text-center text-lg font-bold border rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-fukamidori transition-colors ${
                    quantity === 0
                      ? 'text-gray-300 border-gray-200 bg-gray-50'
                      : 'border-gray-200'
                  }`}
                />
                <span className={`text-sm transition-colors ${quantity === 0 ? 'text-gray-300' : 'text-gray-500'}`}>
                  {hasTiers ? 'ケース' : product.unit}
                </span>
              </div>
              <button
                onClick={handleIncrement}
                disabled={!hasTiers && quantity > 0 && quantity >= product.max_order_qty}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg font-bold transition-colors"
              >
                ＋
              </button>
            </div>

            {/* 段階ありの本数表示 */}
            {hasTiers && selectedTier && tierTotalBottles !== null && (
              <div className="mb-2 bg-white border-t border-kincha rounded-lg px-3 py-2 text-sm">
                <div className="text-gray-600">
                  {selectedTier.quantity}本入 × {quantity}ケース = <strong>{tierTotalBottles}本</strong>
                </div>
              </div>
            )}
          </>
        )}

        {isUnavailable && (
          <div className="w-full py-3 rounded-xl bg-gray-100 text-gray-400 text-sm font-bold text-center">
            現在在庫がありません
          </div>
        )}
      </div>

      <ProductDetailModal
        product={product}
        open={showDetail}
        onClose={() => setShowDetail(false)}
      />
    </div>
  )
}
