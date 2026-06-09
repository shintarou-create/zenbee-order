'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { adminFetch } from '@/lib/admin-fetch'
import type { Order, OrderItem, OrderStatus, OrderShippingLine } from '@/types'
import { formatDate, formatCurrency, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'

interface EditableOrderItem {
  product_id: string
  product_name: string
  quantity: number
  unit: string
  unit_price: number
  subtotal: number
  pricing_tier_id: string | null
  tier_label: string | null
  tier_quantity: number | null
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
        const subtotal = item.tier_quantity
          ? item.unit_price * item.tier_quantity * quantity
          : item.unit_price * quantity
        return { ...item, quantity, subtotal }
      })
    )
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
          items: editItems.map((item) => ({
            product_id: item.product_id,
            pricing_tier_id: item.pricing_tier_id,
            quantity: item.quantity,
          })),
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
      const from = searchParams.get('from')
      if (from === 'shipping') {
        router.push('/admin/shipping')
      } else {
        router.push('/admin/orders')
      }
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
        <Link href={searchParams.get('from') === 'shipping' ? '/admin/shipping' : '/admin/orders'} className="text-gray-500 hover:text-gray-700">
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
            <h2 className="font-bold text-gray-900 mb-3">お客様情報</h2>
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
          <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">送料</span>
            {isShippingEditable && (
              <button
                type="button"
                onClick={() => setShippingLines((prev) => [...prev, { label: '', cost: 0 }])}
                className="text-xs text-green-600 hover:text-green-700 font-medium"
              >
                ＋ 送料行を追加
              </button>
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
