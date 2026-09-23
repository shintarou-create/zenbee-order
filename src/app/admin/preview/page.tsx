'use client'

import { useProducts } from '@/hooks/useProducts'
import ProductBrowser from '@/components/customer/ProductBrowser'
import PreviewHeader from '@/components/customer/PreviewHeader'
import { CART_STORAGE_KEY_PREVIEW } from '@/lib/cart-storage'

// 管理画面から取引先向けLIFF発注画面のプレビューを見るための画面。
// 取引先ごとの切替は行わず、priceRank='standard'・companyId未指定（=会社専用の
// pricing_tiers/company_overridesは一切適用されない）で全商品を表示する。
export default function AdminPreviewPage() {
  const { products, isLoading: productsLoading } = useProducts({
    priceRank: 'standard',
    withTiers: true,
  })

  return (
    <ProductBrowser
      headerSlot={<PreviewHeader />}
      products={products}
      productsLoading={productsLoading}
      cartStorageKey={CART_STORAGE_KEY_PREVIEW}
      cartHref="/admin/preview/cart"
    />
  )
}
