'use client'

import { useCallback, useEffect, useState } from 'react'
import type { BusinessType } from '@/types'
import { adminFetch } from '@/lib/admin-fetch'

export interface BusinessTypeProductLink {
  business_type_id: string
  product_id: string
}

// 管理画面用: 業態マスタ（無効も含む・表示順）と業態×商品の紐づけを取得する。
export function useBusinessTypes() {
  const [types, setTypes] = useState<BusinessType[]>([])
  const [productLinks, setProductLinks] = useState<BusinessTypeProductLink[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await adminFetch('/api/admin/business-types')
      const json = (await res.json()) as {
        data?: BusinessType[]
        productLinks?: BusinessTypeProductLink[]
        error?: string
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setTypes(json.data ?? [])
      setProductLinks(json.productLinks ?? [])
    } catch (err) {
      console.error('業態の取得エラー:', err)
      setError('業態の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { types, activeTypes: types.filter((t) => t.is_active), productLinks, isLoading, error, reload }
}
