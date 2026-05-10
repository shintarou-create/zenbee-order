'use client'

import { useState } from 'react'
import type { Product, Category, CartItem } from '@/types'
import ProductCard from './ProductCard'

const CATEGORY_EMOJI: Record<string, string> = {
  柑橘: '🍊',
  びわ: '🫐',
  ジュース: '🥤',
  その他: '📦',
}

interface CategoryAccordionProps {
  categories: Array<Category & { products: Product[] }>
  cartItems: CartItem[]
  onAddToCart: (item: Omit<CartItem, 'subtotal'>) => void
}

export default function CategoryAccordion({ categories, cartItems, onAddToCart }: CategoryAccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="space-y-2">
      {categories.map((cat) => {
        const isOpen = openIds.has(cat.id)
        const emoji = CATEGORY_EMOJI[cat.name] || '📁'
        const cartCount = cartItems.filter((ci) =>
          cat.products.some((p) => p.id === ci.productId)
        ).length

        return (
          <div key={cat.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => toggle(cat.id)}
              className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{emoji}</span>
                <div>
                  <span className="font-bold text-gray-900">{cat.name}</span>
                  <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {cat.products.length}品目
                  </span>
                  {cartCount > 0 && (
                    <span className="ml-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      カート{cartCount}種
                    </span>
                  )}
                </div>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 border-t border-gray-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                  {cat.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={onAddToCart}
                      cartItem={cartItems.find((ci) => ci.productId === product.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
