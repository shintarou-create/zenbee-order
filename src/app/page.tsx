'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLiff } from '@/hooks/useLiff'
import { useProducts } from '@/hooks/useProducts'
import { createClient } from '@/lib/supabase/client'
import CustomerHeader from '@/components/customer/CustomerHeader'
import OnboardingScreen from '@/components/customer/OnboardingScreen'
import PendingApprovalScreen from '@/components/customer/PendingApprovalScreen'
import ProductBrowser from '@/components/customer/ProductBrowser'
import { CART_STORAGE_KEY_LIVE } from '@/lib/cart-storage'
import type { Company, PriceRank } from '@/types'

type CustomerStatus = 'loading' | 'onboarding' | 'pending' | 'ready' | 'error'

export default function HomePage() {
  const router = useRouter()
  const { userId, accessToken, isLoading: liffLoading, error: liffError } = useLiff()
  const [company, setCompany] = useState<Company | null>(null)
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus>('loading')

  const priceRank: PriceRank = company?.price_rank || 'standard'
  const { products, isLoading: productsLoading } = useProducts({
    priceRank,
    withTiers: true,
    companyId: company?.id,
  })

  const fetchCustomer = useCallback(async () => {
    if (!userId) return
    setCustomerLoading(true)
    try {
      const supabase = createClient()

      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id')
        .eq('line_user_id', userId)
        .single()

      if (adminUser) {
        router.push('/admin')
        return
      }

      // LEFT JOIN で company も取得（maybeSingle で未紐付けを null で受ける）
      const { data: lineUser } = await supabase
        .from('line_users')
        .select('*, company:companies!left(*)')
        .eq('line_user_id', userId)
        .eq('is_active', true)
        .maybeSingle()

      if (!lineUser || !lineUser.company) {
        // 未紐付け → オンボーディング画面
        setCustomerStatus('onboarding')
        return
      }

      const fetchedCompany = lineUser.company as Company

      if (fetchedCompany.approval_status === 'pending') {
        // 登録申請中 → 承認待ち画面
        setCompany(fetchedCompany)
        setCustomerStatus('pending')
        return
      }

      if (!fetchedCompany.is_active || fetchedCompany.approval_status === 'rejected') {
        setCustomerStatus('error')
        return
      }

      setCompany(fetchedCompany)
      setCustomerStatus('ready')
    } catch {
      setCustomerStatus('error')
    } finally {
      setCustomerLoading(false)
    }
  }, [userId, router])

  useEffect(() => {
    if (!userId) return
    fetchCustomer()
  }, [userId, fetchCustomer])

  if (liffLoading || customerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kinari">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-fukamidori border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-fukamidori font-medium">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (liffError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="text-center max-w-sm">
          <p className="text-red-600 font-medium">エラーが発生しました</p>
          <p className="text-red-500 text-sm mt-2">{liffError}</p>
        </div>
      </div>
    )
  }

  // 未紐付け → オンボーディング
  if (customerStatus === 'onboarding') {
    return (
      <OnboardingScreen
        accessToken={accessToken}
        onSuccess={fetchCustomer}
      />
    )
  }

  // 承認待ち
  if (customerStatus === 'pending') {
    return <PendingApprovalScreen companyName={company?.company_name} />
  }

  // 無効・却下
  if (customerStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="text-center max-w-sm">
          <p className="text-red-600 font-medium">ご利用いただけません</p>
          <p className="text-red-500 text-sm mt-2">善兵衛農園までお問い合わせください。</p>
        </div>
      </div>
    )
  }

  return (
    <ProductBrowser
      headerSlot={<CustomerHeader />}
      products={products}
      productsLoading={productsLoading}
      cartStorageKey={CART_STORAGE_KEY_LIVE}
      cartHref="/cart"
    />
  )
}
