'use client'

import CartScreen from '@/components/customer/CartScreen'
import PreviewHeader from '@/components/customer/PreviewHeader'
import { CART_STORAGE_KEY_PREVIEW } from '@/lib/cart-storage'

// 発注画面プレビューのカート画面。mode="preview" のため注文確定ボタンは無効化され、
// 押しても /api/orders は一切呼ばれない（CartScreen 側の isPreview ガードによる）。
export default function AdminPreviewCartPage() {
  return (
    <CartScreen
      headerSlot={<PreviewHeader />}
      cartStorageKey={CART_STORAGE_KEY_PREVIEW}
      mode="preview"
      backHref="/admin/preview"
    />
  )
}
