'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { adminFetch } from '@/lib/admin-fetch'
import type { Order, OrderItem, OrderStatus, OrderShippingLine, Company, PriceRank } from '@/types'
import { formatDate, formatCurrency, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'
import { formatDeliveryTimeSlot } from '@/lib/yamato-csv'

interface EditableOrderItem {
  product_id: string | null
  product_name: string
  quantity: number
  unit: string
  unit_price: number
  subtotal: number
  pricing_tier_id: string | null
  tier_label: string | null
  tier_quantity: number | null
  is_custom: boolean
}

interface ProductForSelector {
  id: string
  name: string
  unit: string
  product_pricing_tiers: Array<{ id: string; tier_label: string; quantity: number; unit_price: number; is_active: boolean }>
  product_prices: Array<{ price_rank: string; price_per_unit: number }>
}

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: '未対応' },
  { value: 'shipped', label: '出荷済' },
  { value: 'done', label: '完了' },
  { value: 'cancelled', label: 'キャンセル' },
]

export default function AdminOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<OrderStatus>('pending')
  const [adminNotes, setAdminNotes] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [detailsConfirmed, setDetailsConfirmed] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [shippingLines, setShippingLines] = useState<{ id?: string; label: string; cost: number }[]>([])
  const [savingShipping, setSavingShipping] = useState(false)
  const [shippingTemplates, setShippingTemplates] = useState<{ label: string; cost: number }[]>([])
  const [calcingShipping, setCalcingShipping] = useState(false)

  // 取引先編集
  const [showCompanyEditModal, setShowCompanyEditModal] = useState(false)
  const [companyForm, setCompanyForm] = useState<Partial<Company>>({})
  const [savingCompany, setSavingCompany] = useState(false)

  // 明細編集
  const [editItems, setEditItems] = useState<EditableOrderItem[]>([])
  const [availableProducts, setAvailableProducts] = useState<ProductForSelector[]>([])
  const [savingItems, setSavingItems] = useState(false)
  const [addProductId, setAddProductId] = useState('')
  const [addTierId, setAddTierId] = useState('')
  const [addQuantity, setAddQuantity] = useState(1)

  useEffect(() => {
    if (!orderId) return

    async function fetchOrder() {
      setIsLoading(true)
      try {
        const supabase = createClient()
        const { data, error: fetchError } = await supabase
          .from('orders')
          .select(`
            *,
            company:companies (*),
            order_items (*),
            order_shipping (*)
          `)
          .eq('id', orderId)
          .single()

        if (fetchError || !data) {
          setError('注文が見つかりません')
          return
        }

        setOrder(data as Order)
        setStatus(data.status as OrderStatus)
        setAdminNotes(data.admin_notes || '')
        setDeliveryDate(data.delivery_date || '')
        setDetailsConfirmed(data.details_confirmed ?? false)
        setShippingLines(
          ((data.order_shipping ?? []) as OrderShippingLine[]).map((line) => ({
            id: line.id,
            label: line.label,
            cost: line.cost,
          }))
        )
        setEditItems(
          ((data.order_items ?? []) as OrderItem[]).map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
            pricing_tier_id: item.pricing_tier_id ?? null,
            tier_label: item.tier_label ?? null,
            tier_quantity: item.tier_quantity ?? null,
            is_custom: item.is_custom ?? false,
          }))
        )
      } catch (err) {
        console.error('注文取得エラー:', err)
        setError('注文の取得に失敗しました')
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrder()
  }, [orderId])

  // 送料テンプレート（箱）を取得（「テンプレートから追加」プルダウン用）
  useEffect(() => {
    async function fetchTemplates() {
      const supabase = createClient()
      const { data } = await supabase
        .from('shipping_box_templates')
        .select('label, cost')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (data) setShippingTemplates(data as { label: string; cost: number }[])
    }
    fetchTemplates()
  }, [])

  // pending 注文のときだけ商品一覧を取得（商品追加セレクタ用）
  useEffect(() => {
    if (!order || order.status !== 'pending') return

    async function fetchProducts() {
      const supabase = createClient()
      const { data } = await supabase
        .from('products')
        .select('id, name, unit, product_pricing_tiers(id, tier_label, quantity, unit_price, is_active), product_prices(price_rank, price_per_unit)')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      setAvailableProducts((data ?? []) as ProductForSelector[])
    }

    fetchProducts()
  }, [order?.id])

  function handleItemQuantityChange(index: number, newQty: number) {
    const quantity = Math.max(1, Math.floor(newQty) || 1)
    setEditItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const subtotal = item.is_custom || !item.tier_quantity
          ? item.unit_price * quantity
          : item.unit_price * item.tier_quantity * quantity
        return { ...item, quantity, subtotal }
      })
    )
  }

  function handleCustomItemFieldChange(index: number, field: 'product_name' | 'unit' | 'unit_price', value: string) {
    setEditItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        if (field === 'unit_price') {
          const unitPrice = Math.max(0, parseFloat(value) || 0)
          return { ...item, unit_price: unitPrice, subtotal: unitPrice * item.quantity }
        }
        return { ...item, [field]: value }
      })
    )
  }

  function handleAddCustomItemRow() {
    setEditItems((prev) => [
      ...prev,
      {
        product_id: null,
        product_name: '',
        quantity: 1,
        unit: '',
        unit_price: 0,
        subtotal: 0,
        pricing_tier_id: null,
        tier_label: null,
        tier_quantity: null,
        is_custom: true,
      },
    ])
  }

  function handleItemDelete(index: number) {
    setEditItems((prev) => prev.filter((_, i) => i !== index))
  }

  function handleAddProduct() {
    const product = availableProducts.find((p) => p.id === addProductId)
    if (!product || addQuantity < 1) return

    let unitPrice = 0
    let tierLabel: string | null = null
    let tierQuantity: number | null = null
    let pricingTierId: string | null = null

    if (addTierId) {
      const tier = product.product_pricing_tiers.find((t) => t.id === addTierId && t.is_active)
      if (tier) {
        unitPrice = tier.unit_price
        tierLabel = tier.tier_label
        tierQuantity = tier.quantity
        pricingTierId = tier.id
      }
    } else {
      const priceRank = order?.company?.price_rank ?? 'standard'
      const priceEntry =
        product.product_prices.find((pp) => pp.price_rank === priceRank) ??
        product.product_prices.find((pp) => pp.price_rank === 'standard')
      unitPrice = priceEntry?.price_per_unit ?? 0
    }

    const qty = Math.max(1, Math.floor(addQuantity))
    const subtotal = tierQuantity ? unitPrice * tierQuantity * qty : unitPrice * qty

    setEditItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit: product.unit,
        unit_price: unitPrice,
        subtotal,
        pricing_tier_id: pricingTierId,
        tier_label: tierLabel,
        tier_quantity: tierQuantity,
        is_custom: false,
      },
    ])
    setAddProductId('')
    setAddTierId('')
    setAddQuantity(1)
  }

  async function handleSaveItems() {
    if (!order) return
    setSavingItems(true)
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editItems.map((item) =>
            item.is_custom
              ? {
                  is_custom: true,
                  product_name: item.product_name,
                  unit: item.unit,
                  unit_price: item.unit_price,
                  quantity: item.quantity,
                }
              : {
                  product_id: item.product_id,
                  pricing_tier_id: item.pricing_tier_id,
                  quantity: item.quantity,
                }
          ),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || '明細の保存に失敗しました' })
      } else {
        const newItems: EditableOrderItem[] = (json.order_items as OrderItem[]).map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          pricing_tier_id: item.pricing_tier_id ?? null,
          tier_label: item.tier_label ?? null,
          tier_quantity: item.tier_quantity ?? null,
          is_custom: item.is_custom ?? false,
        }))
        setEditItems(newItems)
        setOrder((prev) =>
          prev ? { ...prev, order_items: json.order_items, total_amount: json.total_amount } : null
        )
        setMessage({ type: 'success', text: '明細を保存しました' })
      }
    } catch (err) {
      console.error('明細保存エラー:', err)
      setMessage({ type: 'error', text: '明細の保存に失敗しました' })
    } finally {
      setSavingItems(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  async function handleToggleConfirmed() {
    if (!order) return
    const newValue = !detailsConfirmed
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('orders')
        .update({ details_confirmed: newValue })
        .eq('id', order.id)
      if (updateError) throw updateError
      setDetailsConfirmed(newValue)
      setOrder((prev) => prev ? { ...prev, details_confirmed: newValue } : null)

      if (newValue) {
        const qs = searchParams.toString()
        router.push(`/admin/orders${qs ? `?${qs}` : ''}`)
      }
    } catch (err) {
      console.error('確認済み更新エラー:', err)
      setMessage({ type: 'error', text: '更新に失敗しました' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  async function handleSaveShipping() {
    if (!order) return
    setSavingShipping(true)
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: shippingLines }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || '送料の保存に失敗しました' })
      } else {
        setOrder((prev) => (prev ? { ...prev, total_amount: json.total_amount } : null))
        setMessage({ type: 'success', text: '送料を保存しました' })
      }
    } catch (err) {
      console.error('送料保存エラー:', err)
      setMessage({ type: 'error', text: '送料の保存に失敗しました' })
    } finally {
      setSavingShipping(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  async function handleCalcShipping() {
    if (!order) return
    if (!window.confirm('現在の送料行を自動計算の結果で置き換えます。よろしいですか？')) return
    setCalcingShipping(true)
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}/calc-shipping`)
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || '送料の自動計算に失敗しました' })
        return
      }
      const lines = (json.lines as { label: string; cost: number }[]) ?? []
      // 自動計算結果で全置き換え（追加ではなくリセット）。
      setShippingLines(lines.map((l) => ({ label: l.label, cost: l.cost })))
      const warnings = (json.warnings as string[]) ?? []
      if (warnings.length > 0) {
        setMessage({
          type: 'success',
          text: `自動計算しました。ただし手入力が必要な商品があります: ${warnings.join('、')}`,
        })
      } else {
        setMessage({ type: 'success', text: '送料を自動計算しました。内容を確認して「送料を保存」を押してください。' })
      }
    } catch (err) {
      console.error('送料自動計算エラー:', err)
      setMessage({ type: 'error', text: '送料の自動計算に失敗しました' })
    } finally {
      setCalcingShipping(false)
      setTimeout(() => setMessage(null), 6000)
    }
  }

  async function handlePostalLookupCompany(rawZip: string, prefix: '' | 'billing_') {
    const digits = rawZip
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[^0-9]/g, '')
    if (digits.length !== 7) return
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`)
      const json = (await res.json()) as {
        status: number
        results: { address1: string; address2: string; address3: string }[] | null
      }
      if (json.status !== 200 || !json.results) return
      const { address1, address2, address3 } = json.results[0]
      if (prefix === 'billing_') {
        setCompanyForm((p) => ({ ...p, billing_prefecture: address1, billing_city: address2, billing_address: address3 }))
      } else {
        setCompanyForm((p) => ({ ...p, prefecture: address1, city: address2, address: address3 }))
      }
    } catch (err) {
      console.error('郵便番号検索エラー:', err)
    }
  }

  async function handleSaveCompany() {
    if (!company || !companyForm.company_name?.trim()) return
    setSavingCompany(true)
    try {
      const supabase = createClient()
      const companyData = {
        company_name: companyForm.company_name,
        representative_name: companyForm.representative_name || null,
        postal_code: companyForm.postal_code || null,
        prefecture: companyForm.prefecture || null,
        city: companyForm.city || null,
        address: companyForm.address || null,
        building: companyForm.building || null,
        phone: companyForm.phone || null,
        email: companyForm.email || null,
        price_rank: (companyForm.price_rank || 'standard') as PriceRank,
        notes: companyForm.notes || null,
        is_active: companyForm.is_active ?? true,
        has_separate_billing: companyForm.has_separate_billing ?? false,
        billing_name: companyForm.has_separate_billing ? (companyForm.billing_name || null) : null,
        billing_postal_code: companyForm.has_separate_billing ? (companyForm.billing_postal_code || null) : null,
        billing_prefecture: companyForm.has_separate_billing ? (companyForm.billing_prefecture || null) : null,
        billing_city: companyForm.has_separate_billing ? (companyForm.billing_city || null) : null,
        billing_address: companyForm.has_separate_billing ? (companyForm.billing_address || null) : null,
        billing_building: companyForm.has_separate_billing ? (companyForm.billing_building || null) : null,
      }
      const { error } = await supabase
        .from('companies')
        .update(companyData)
        .eq('id', company.id)
      if (error) throw error

      // 最新 company データを画面に反映
      const { data: refreshed } = await supabase
        .from('orders')
        .select('*, company:companies(*), order_items(*), order_shipping(*)')
        .eq('id', orderId)
        .single()
      if (refreshed) setOrder(refreshed as Order)

      setShowCompanyEditModal(false)
      setMessage({ type: 'success', text: '取引先情報を更新しました' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error('取引先更新エラー:', err)
      setMessage({ type: 'error', text: '更新に失敗しました' })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setSavingCompany(false)
    }
  }

  async function handleUpdate() {
    if (!order) return
    setUpdating(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status,
          admin_notes: adminNotes || null,
          delivery_date: deliveryDate || null,
        })
        .eq('id', order.id)

      if (updateError) throw updateError

      setOrder((prev) => prev ? { ...prev, status, admin_notes: adminNotes } : null)
      setMessage({ type: 'success', text: '注文を更新しました' })
      router.push('/admin/orders')
    } catch (err) {
      console.error('注文更新エラー:', err)
      setMessage({ type: 'error', text: '更新に失敗しました' })
    } finally {
      setUpdating(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error || '注文が見つかりません'}</p>
        <Link href="/admin/orders" className="mt-4 inline-block text-green-600 font-bold">
          注文一覧に戻る
        </Link>
      </div>
    )
  }

  const company = order.company
  const isShippingEditable = order.status === 'pending' || order.status === 'shipped'
  const isItemsEditable = order.status === 'pending'
  const selectedProductForAdd = availableProducts.find((p) => p.id === addProductId)

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/admin/orders" className="text-gray-500 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">{order.order_number}</h1>
        <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${getOrderStatusColor(order.status)}`}>
          {getOrderStatusLabel(order.status)}
        </span>
        <button
          onClick={handleToggleConfirmed}
          className={`text-sm font-bold px-3 py-1 rounded-lg transition-colors ${
            detailsConfirmed
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'border border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          {detailsConfirmed ? '✓ 確認済み' : '確認済みにする'}
        </button>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* 注文情報 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h2 className="font-bold text-gray-900 mb-3">注文情報</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">注文日</span>
              <span>{formatDate(order.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">発送日</span>
              <span>{order.shipping_date ? formatDate(order.shipping_date) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">お届け予定日</span>
              <span>{order.delivery_date ? formatDate(order.delivery_date) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">配達時間帯</span>
              <span>{order.delivery_time_slot ? formatDeliveryTimeSlot(order.delivery_time_slot) : '指定なし'}</span>
            </div>
            {order.notes && (
              <div>
                <span className="text-gray-500">備考</span>
                <p className="mt-1 text-gray-700 bg-gray-50 rounded p-2">{order.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* お客様情報 */}
        {company && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-900">お客様情報</h2>
              <button
                type="button"
                onClick={() => { setCompanyForm({ ...company }); setShowCompanyEditModal(true) }}
                className="text-xs text-green-600 hover:text-green-800 font-medium border border-green-200 px-2.5 py-1 rounded-lg transition-colors"
              >
                編集
              </button>
            </div>
            <div className="space-y-1.5 text-sm">
              <p className="font-medium text-gray-900">{company.company_name}</p>
              {company.representative_name && (
                <p className="text-gray-600">{company.representative_name}</p>
              )}
              <p className="text-gray-600">
                〒{company.postal_code} {company.prefecture}{company.city}{company.address}
              </p>
              {company.building && <p className="text-gray-600">{company.building}</p>}
              {company.phone && <p className="text-gray-600">TEL: {company.phone}</p>}
              {company.email && <p className="text-gray-600">{company.email}</p>}
            </div>
          </div>
        )}
      </div>

      {/* 注文明細 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">注文明細</h2>
          {isItemsEditable && (
            <span className="text-xs text-blue-600 font-medium">編集中（未対応）</span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-gray-600 font-semibold">商品名</th>
              <th className="px-4 py-2 text-right text-gray-600 font-semibold">数量</th>
              <th className="px-4 py-2 text-right text-gray-600 font-semibold">単価</th>
              <th className="px-4 py-2 text-right text-gray-600 font-semibold">小計</th>
              {isItemsEditable && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isItemsEditable
              ? editItems.map((item, idx) => {
                  if (item.is_custom) {
                    return (
                      <tr key={idx} className="bg-amber-50/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">自由記入</span>
                            <input
                              type="text"
                              value={item.product_name}
                              onChange={(e) => handleCustomItemFieldChange(idx, 'product_name', e.target.value)}
                              placeholder="商品名・内容"
                              className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              value={item.quantity}
                              min={1}
                              max={9999}
                              onChange={(e) => handleItemQuantityChange(idx, parseInt(e.target.value, 10) || 1)}
                              className="w-16 text-right border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => handleCustomItemFieldChange(idx, 'unit', e.target.value)}
                              placeholder="単位"
                              className="w-14 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            value={item.unit_price}
                            min={0}
                            onChange={(e) => handleCustomItemFieldChange(idx, 'unit_price', e.target.value)}
                            className="w-24 text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-500">
                          {item.unit_price > 0 ? formatCurrency(item.subtotal) : '—'}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <button type="button" onClick={() => handleItemDelete(idx)} className="text-red-400 hover:text-red-600 text-xs font-medium">
                            削除
                          </button>
                        </td>
                      </tr>
                    )
                  }
                  const hasTier = !!item.tier_quantity
                  const realBottles = hasTier ? item.quantity * item.tier_quantity! : null
                  return (
                    <tr key={idx}>
                      <td className="px-4 py-3 text-gray-900">
                        {item.product_name}
                        {item.tier_label && (
                          <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            {item.tier_label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            value={item.quantity}
                            min={1}
                            max={9999}
                            onChange={(e) =>
                              handleItemQuantityChange(idx, parseInt(e.target.value, 10) || 1)
                            }
                            className="w-16 text-right border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <span className="text-gray-500 whitespace-nowrap">
                            {hasTier ? `ケース（${realBottles}本）` : item.unit}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                      <td className="px-2 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleItemDelete(idx)}
                          className="text-red-400 hover:text-red-600 text-xs font-medium"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  )
                })
              : (order.order_items || []).map((item) => {
                  if (item.is_custom) {
                    return (
                      <tr key={item.id} className="bg-amber-50/40">
                        <td className="px-4 py-3 text-gray-900">
                          <span className="mr-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">自由記入</span>
                          {item.product_name}
                        </td>
                        <td className="px-4 py-3 text-right">{item.quantity}{item.unit}</td>
                        <td className="px-4 py-3 text-right text-gray-400 text-sm">
                          {item.unit_price > 0 ? formatCurrency(item.unit_price) : '未確定'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {item.subtotal > 0 ? formatCurrency(item.subtotal) : '—'}
                        </td>
                      </tr>
                    )
                  }
                  const hasTier = !!item.tier_quantity
                  const realBottles = hasTier ? item.quantity * item.tier_quantity! : null
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-gray-900">
                        {item.product_name}
                        {item.tier_label && (
                          <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            {item.tier_label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasTier
                          ? `${item.quantity}ケース（${realBottles}本）`
                          : `${item.quantity}${item.unit}`}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
        {/* 商品追加 UI（pending のみ） */}
        {isItemsEditable && (
          <div className="border-t border-gray-100 px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">商品を追加</p>
            <div className="flex flex-wrap gap-2 items-end">
              <select
                value={addProductId}
                onChange={(e) => { setAddProductId(e.target.value); setAddTierId('') }}
                className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">商品を選択</option>
                {availableProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedProductForAdd && selectedProductForAdd.product_pricing_tiers.filter((t) => t.is_active).length > 0 && (
                <select
                  value={addTierId}
                  onChange={(e) => setAddTierId(e.target.value)}
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">価格段階を選択</option>
                  {selectedProductForAdd.product_pricing_tiers
                    .filter((t) => t.is_active)
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.tier_label}</option>
                    ))}
                </select>
              )}
              <input
                type="number"
                value={addQuantity}
                min={1}
                max={9999}
                onChange={(e) => setAddQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-20 border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={handleAddProduct}
                disabled={!addProductId}
                className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
              >
                ＋ 追加
              </button>
            </div>
            <div>
              <button
                type="button"
                onClick={handleAddCustomItemRow}
                className="text-sm bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                ＋ 自由記入行を追加
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSaveItems}
                disabled={savingItems || editItems.length === 0}
                className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {savingItems ? '保存中...' : '明細を保存'}
              </button>
            </div>
          </div>
        )}
        {/* 送料明細（編集可能） */}
        <div className="border-t border-gray-100">
          <div className="px-4 py-2 bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500">送料</span>
            {isShippingEditable && (
              <div className="flex items-center gap-2 flex-wrap">
                {/* テンプレートから追加 */}
                <select
                  value=""
                  onChange={(e) => {
                    const tpl = shippingTemplates.find((t) => t.label === e.target.value)
                    if (tpl) setShippingLines((prev) => [...prev, { label: tpl.label, cost: tpl.cost }])
                    e.target.value = ''
                  }}
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                >
                  <option value="">テンプレートから追加…</option>
                  {shippingTemplates.map((t) => (
                    <option key={t.label} value={t.label}>
                      {t.label}（{formatCurrency(t.cost)}）
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleCalcShipping}
                  disabled={calcingShipping}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                >
                  {calcingShipping ? '計算中...' : '送料を自動計算'}
                </button>
                <button
                  type="button"
                  onClick={() => setShippingLines((prev) => [...prev, { label: '', cost: 0 }])}
                  className="text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  ＋ 送料行を追加
                </button>
              </div>
            )}
          </div>
          {shippingLines.length === 0 && (
            <div className="px-4 py-2 text-sm text-gray-400">送料なし</div>
          )}
          {shippingLines.map((line, idx) =>
            isShippingEditable ? (
              <div key={idx} className="flex items-center gap-2 px-4 py-2 border-t border-gray-50">
                <input
                  type="text"
                  value={line.label}
                  onChange={(e) => {
                    const next = [...shippingLines]
                    next[idx] = { ...next[idx], label: e.target.value }
                    setShippingLines(next)
                  }}
                  placeholder="ラベル（例：常温送料）"
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
                />
                <input
                  type="number"
                  value={line.cost}
                  min={0}
                  max={1000000}
                  onChange={(e) => {
                    const next = [...shippingLines]
                    next[idx] = { ...next[idx], cost: Math.max(0, parseInt(e.target.value, 10) || 0) }
                    setShippingLines(next)
                  }}
                  className="w-28 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-green-400"
                />
                <span className="text-sm text-gray-500">円</span>
                <button
                  type="button"
                  onClick={() => setShippingLines((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-red-400 hover:text-red-600 text-sm px-1"
                >
                  削除
                </button>
              </div>
            ) : (
              <div key={line.id ?? idx} className="flex justify-between px-4 py-2 text-sm border-t border-gray-50">
                <span className="text-gray-600">{line.label}</span>
                <span className="font-medium">{formatCurrency(line.cost)}</span>
              </div>
            )
          )}
          {isShippingEditable && (
            <div className="px-4 py-3 border-t border-gray-50 flex justify-end">
              <button
                type="button"
                onClick={handleSaveShipping}
                disabled={savingShipping}
                className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {savingShipping ? '保存中...' : '送料を保存'}
              </button>
            </div>
          )}
        </div>
        <div className="bg-green-50 px-4 py-3 flex justify-between">
          <span className="font-bold">合計</span>
          <span className="font-bold text-green-700 text-lg">{formatCurrency(order.total_amount)}</span>
        </div>
      </div>

      {/* 取引先編集モーダル */}
      {showCompanyEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCompanyEditModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">取引先情報を編集</h2>
              <button onClick={() => setShowCompanyEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  店名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={companyForm.company_name || ''}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, company_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">担当者名</label>
                <input
                  type="text"
                  value={companyForm.representative_name || ''}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, representative_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号</label>
                  <input
                    type="text"
                    value={companyForm.postal_code || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setCompanyForm((p) => ({ ...p, postal_code: v }))
                      handlePostalLookupCompany(v, '')
                    }}
                    placeholder="000-0000"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">都道府県</label>
                  <input
                    type="text"
                    value={companyForm.prefecture || ''}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, prefecture: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">市区町村</label>
                <input
                  type="text"
                  value={companyForm.city || ''}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, city: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
                <input
                  type="text"
                  value={companyForm.address || ''}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">建物名・部屋番号</label>
                <input
                  type="text"
                  value={companyForm.building || ''}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, building: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                  <input
                    type="tel"
                    value={companyForm.phone || ''}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">価格帯</label>
                  <select
                    value={companyForm.price_rank || 'standard'}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, price_rank: e.target.value as PriceRank }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="standard">既存取引先</option>
                    <option value="premium">新規取引先</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={companyForm.email || ''}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              {/* 請求先トグル */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="company_edit_has_separate_billing"
                    checked={companyForm.has_separate_billing ?? false}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, has_separate_billing: e.target.checked }))}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <label htmlFor="company_edit_has_separate_billing" className="text-sm font-medium text-gray-700">
                    請求先が納品先と異なる
                  </label>
                </div>

                {companyForm.has_separate_billing && (
                  <div className="ml-6 space-y-2 border-l-2 border-green-200 pl-3">
                    <input
                      type="text"
                      value={companyForm.billing_name || ''}
                      onChange={(e) => setCompanyForm((p) => ({ ...p, billing_name: e.target.value }))}
                      placeholder="請求先名"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={companyForm.billing_postal_code || ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setCompanyForm((p) => ({ ...p, billing_postal_code: v }))
                          handlePostalLookupCompany(v, 'billing_')
                        }}
                        placeholder="郵便番号"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                      <input
                        type="text"
                        value={companyForm.billing_prefecture || ''}
                        onChange={(e) => setCompanyForm((p) => ({ ...p, billing_prefecture: e.target.value }))}
                        placeholder="都道府県"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                    <input
                      type="text"
                      value={companyForm.billing_city || ''}
                      onChange={(e) => setCompanyForm((p) => ({ ...p, billing_city: e.target.value }))}
                      placeholder="市区町村"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <input
                      type="text"
                      value={companyForm.billing_address || ''}
                      onChange={(e) => setCompanyForm((p) => ({ ...p, billing_address: e.target.value }))}
                      placeholder="住所"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <input
                      type="text"
                      value={companyForm.billing_building || ''}
                      onChange={(e) => setCompanyForm((p) => ({ ...p, billing_building: e.target.value }))}
                      placeholder="建物名"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
                <textarea
                  value={companyForm.notes || ''}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="company_edit_is_active"
                  checked={companyForm.is_active ?? true}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="company_edit_is_active" className="text-sm font-medium text-gray-700">
                  有効（発注可能）
                </label>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={handleSaveCompany}
                disabled={savingCompany || !companyForm.company_name?.trim()}
                className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {savingCompany ? '保存中...' : '保存'}
              </button>
              <button
                onClick={() => setShowCompanyEditModal(false)}
                className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-6 py-2 rounded-lg text-sm transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ステータス変更・管理メモ */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h2 className="font-bold text-gray-900 mb-4">管理操作</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ステータス変更</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="w-full md:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">納品希望日</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full md:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">管理メモ</label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="内部管理用メモ（お客様には表示されません）"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
            >
              {updating ? '更新中...' : '更新する'}
            </button>
            <Link
              href={`/admin/orders/${orderId}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-green-600 text-green-600 hover:bg-green-50 font-bold px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              納品書を印刷
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
