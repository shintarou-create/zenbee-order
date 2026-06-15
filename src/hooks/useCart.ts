'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { CartItem, CartState } from '@/types'
import { hasMixedShipStart } from '@/lib/delivery-rules'

const CART_STORAGE_KEY = 'zenbee_cart'
const CART_VERSION = 2
const CART_VERSION_KEY = 'zenbee_cart_version'

function loadCartFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    localStorage.removeItem(CART_STORAGE_KEY)
    const ver = sessionStorage.getItem(CART_VERSION_KEY)
    if (ver !== String(CART_VERSION)) {
      sessionStorage.removeItem(CART_STORAGE_KEY)
      sessionStorage.removeItem(CART_VERSION_KEY)
      return []
    }
    const saved = sessionStorage.getItem(CART_STORAGE_KEY)
    if (!saved) return []
    return JSON.parse(saved) as CartItem[]
  } catch {
    return []
  }
}

function saveCartToStorage(items: CartItem[]): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    sessionStorage.setItem(CART_VERSION_KEY, String(CART_VERSION))
  } catch {
    // sessionStorage が使えない場合は無視
  }
}

function calcSubtotal(item: Omit<CartItem, 'subtotal'>): number {
  return item.unitPrice * (item.tierQuantity ?? 1) * item.quantity
}

function calcTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.subtotal, 0)
}

interface UseCartReturn extends CartState {
  addToCart: (item: Omit<CartItem, 'subtotal'>) => boolean
  addCustomItem: (text: string) => void
  removeFromCart: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  customItemCount: number
}

export function useCart(): UseCartReturn {
  const [items, setItems] = useState<CartItem[]>([])
  const [initialized, setInitialized] = useState(false)
  // 最新のカート状態を同期的に参照するための ref（addToCart の連続呼び出し対応）
  const itemsRef = useRef<CartItem[]>([])

  // クライアントサイドでのみsessionStorageから読み込み（LIFFを閉じて開き直すと空になる）
  useEffect(() => {
    const stored = loadCartFromStorage()
    setItems(stored)
    itemsRef.current = stored
    setInitialized(true)
  }, [])

  // items が変更されたら sessionStorage に保存・ref を同期
  useEffect(() => {
    if (initialized) {
      saveCartToStorage(items)
      itemsRef.current = items
    }
  }, [items, initialized])

  const addToCart = useCallback((item: Omit<CartItem, 'subtotal'>): boolean => {
    const prev = itemsRef.current
    const existing = prev.find((i) => i.productId === item.productId)

    if (existing) {
      // 既存商品の数量加算・tier差し替えは ship_start_date が増えないので混在チェック不要
      let next: CartItem[]
      if (item.pricingTierId != null) {
        if (existing.pricingTierId === item.pricingTierId) {
          next = prev.map((i) => {
            if (i.productId === item.productId) {
              const newQty = i.quantity + item.quantity
              return { ...i, quantity: newQty, subtotal: i.unitPrice * (i.tierQuantity ?? 1) * newQty }
            }
            return i
          })
        } else {
          next = prev.map((i) =>
            i.productId === item.productId
              ? { ...item, subtotal: calcSubtotal(item) }
              : i
          )
        }
      } else {
        next = prev.map((i) => {
          if (i.productId === item.productId) {
            const newQty = i.quantity + item.quantity
            return { ...i, quantity: newQty, subtotal: newQty * i.unitPrice }
          }
          return i
        })
      }
      itemsRef.current = next
      setItems(next)
      return true
    }

    // 新規商品: 追加後に混在する場合は拒否
    if (hasMixedShipStart([...prev, item])) {
      return false
    }
    const next = [...prev, { ...item, subtotal: calcSubtotal(item) }]
    itemsRef.current = next
    setItems(next)
    return true
  }, [])

  const addCustomItem = useCallback((text: string) => {
    const id = `__custom__${Date.now()}_${Math.random().toString(36).slice(2)}`
    const item: CartItem = {
      productId: id,
      productName: text,
      quantity: 1,
      unit: '',
      unitPrice: 0,
      subtotal: 0,
      coolType: 0,
      stepQty: 1,
      minOrderQty: 1,
      isCustom: true,
    }
    setItems((prev) => [...prev, item])
  }, [])

  const removeFromCart = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId))
  }, [])

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity < 0) return
    setItems((prev) =>
      prev.map((i) => {
        if (i.productId === productId) {
          return {
            ...i,
            quantity,
            subtotal: i.unitPrice * (i.tierQuantity ?? 1) * quantity,
          }
        }
        return i
      })
    )
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
  }, [])

  const customItemCount = items.filter((i) => i.isCustom).length

  return {
    items,
    total: calcTotal(items),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    addToCart,
    addCustomItem,
    removeFromCart,
    updateQuantity,
    clearCart,
    customItemCount,
  }
}
