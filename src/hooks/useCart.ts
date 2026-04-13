'use client'

import { useState, useEffect, useCallback } from 'react'
import type { CartItem, CartState } from '@/types'

const CART_STORAGE_KEY = 'zenbee_cart'

function loadCartFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY)
    if (!saved) return []
    return JSON.parse(saved) as CartItem[]
  } catch {
    return []
  }
}

function saveCartToStorage(items: CartItem[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // localStorage が使えない場合は無視
  }
}

function calcTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.subtotal, 0)
}

interface UseCartReturn extends CartState {
  addToCart: (item: Omit<CartItem, 'subtotal'>) => void
  removeFromCart: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
}

export function useCart(): UseCartReturn {
  const [items, setItems] = useState<CartItem[]>([])
  const [initialized, setInitialized] = useState(false)

  // クライアントサイドでのみlocalStorageから読み込み
  useEffect(() => {
    const stored = loadCartFromStorage()
    setItems(stored)
    setInitialized(true)
  }, [])

  // items が変更されたら localStorage に保存
  useEffect(() => {
    if (initialized) {
      saveCartToStorage(items)
    }
  }, [items, initialized])

  const addToCart = useCallback((item: Omit<CartItem, 'subtotal'>) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId)
      if (existing) {
        // 既存のアイテムを更新
        return prev.map((i) => {
          if (i.productId === item.productId) {
            const newQty = i.quantity + item.quantity
            return {
              ...i,
              quantity: newQty,
              subtotal: newQty * i.unitPrice,
            }
          }
          return i
        })
      }
      // 新しいアイテムを追加
      return [
        ...prev,
        {
          ...item,
          subtotal: item.quantity * item.unitPrice,
        },
      ]
    })
  }, [])

  const removeFromCart = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId))
  }, [])

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.productId !== productId))
      return
    }
    setItems((prev) =>
      prev.map((i) => {
        if (i.productId === productId) {
          return {
            ...i,
            quantity,
            subtotal: quantity * i.unitPrice,
          }
        }
        return i
      })
    )
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
  }, [])

  return {
    items,
    total: calcTotal(items),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
  }
}
