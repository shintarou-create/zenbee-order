'use client'

import type { Product } from '@/types'
import { isProductPreorder, formatShipStartDate } from '@/lib/utils'
import { linkifyText } from '@/lib/linkify'

interface ProductDetailModalProps {
  product: Product
  open: boolean
  onClose: () => void
}

export default function ProductDetailModal({ product, open, onClose }: ProductDetailModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 閉じるボタン付きヘッダー帯 */}
        <div className="sticky top-0 bg-green-50 px-4 py-3 flex items-center justify-between rounded-t-2xl z-10">
          <span className="font-bold text-gray-900 text-base truncate pr-2">{product.name}</span>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="閉じる"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 商品画像 */}
        {product.image_url && (
          <div className="w-full h-56 overflow-hidden bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* 予約バッジ */}
          {isProductPreorder(product) && (
            <span className="inline-block text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              予約受付中・発送は{formatShipStartDate(product.ship_start_date!)}から
            </span>
          )}

          {/* 説明文全文 */}
          {product.description && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {linkifyText(product.description)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
