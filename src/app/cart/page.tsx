'use client'

import { useLiff } from '@/hooks/useLiff'
import CustomerHeader from '@/components/customer/CustomerHeader'
import CartScreen from '@/components/customer/CartScreen'
import { CART_STORAGE_KEY_LIVE } from '@/lib/cart-storage'

export default function CartPage() {
  const { userId, isLoading: liffLoading } = useLiff()

  return (
    <CartScreen
      headerSlot={<CustomerHeader />}
      cartStorageKey={CART_STORAGE_KEY_LIVE}
      mode="live"
      backHref="/"
      userId={userId}
      isAuthLoading={liffLoading}
    />
  )
}
