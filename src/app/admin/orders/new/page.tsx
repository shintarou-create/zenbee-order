'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { adminFetch } from '@/lib/admin-fetch'

type PricingTier = {
  id: string
  tier_label: string
  quantity: number
  unit_price: number
  display_order: number
  is_active: boolean
}

type ProductRow = {
  id: string
  name: string
  unit: string
  stock_status: string
  ship_start_date: string | null
  cool_type: number
  step_qty: number
  min_order_qty: number
  product_prices: { price_rank: string; price_per_unit: number }[]
  pricing_tiers: PricingTier[]
}

type CompanyRow = {
  id: string
  company_name: string
  price_rank: string
}

type OrderItem = {
  key: string
  isCustom: false
  productId: string
  productName: string
  unit: string
  quantity: number
  pricingTierId: string | null
  tierLabel: string | null
  tierQuantity: number | null
}

type CustomItem = {
  key: string
  isCustom: true
  customText: string
}

type AnyItem = OrderItem | CustomItem

let keyCounter = 0
function nextKey() {
  return String(++keyCounter)
}

export default function AdminOrderNewPage() {
  const router = useRouter()

  const [products, setProducts] = useState<ProductRow[]>([])
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // 取引先
  const [companyMode, setCompanyMode] = useState<'existing' | 'new'>('existing')
  const [companyId, setCompanyId] = useState('')
  const [newCompanyName, setNewCompanyName] = useState('')

  // 商品追加フォーム
  const [addProductId, setAddProductId] = useState('')
  const [addQuantity, setAddQuantity] = useState(1)
  const [addTierId, setAddTierId] = useState('')

  // 追加済みアイテム
  const [items, setItems] = useState<AnyItem[]>([])

  // 注文情報
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')

  // 送信
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todayStr = new Date().toLocaleDateString('sv-SE')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [productsRes, companiesRes] = await Promise.all([
        supabase
          .from('products')
          .select(`
            id, name, unit, stock_status, ship_start_date, cool_type, step_qty, min_order_qty,
            product_prices (price_rank, price_per_unit),
            pricing_tiers:product_pricing_tiers (id, tier_label, quantity, unit_price, display_order, is_active)
          `)
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
        supabase
          .from('companies')
          .select('id, company_name, price_rank')
          .eq('is_active', true)
          .eq('approval_status', 'approved')
          .order('company_name', { ascending: true }),
      ])
      if (productsRes.data) setProducts(productsRes.data as unknown as ProductRow[])
      if (companiesRes.data) setCompanies(companiesRes.data as CompanyRow[])
      setLoadingData(false)
    }
    load()
  }, [])

  // 商品が変わったらtierをリセット
  useEffect(() => {
    setAddTierId('')
    setAddQuantity(1)
  }, [addProductId])

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === addProductId),
    [products, addProductId]
  )
  const activeTiers = useMemo(
    () => selectedProduct?.pricing_tiers.filter((t) => t.is_active).sort((a, b) => a.display_order - b.display_order) ?? [],
    [selectedProduct]
  )
  const hasTiers = activeTiers.length > 0

  const handleAddProduct = useCallback(() => {
    if (!selectedProduct) return
    if (addQuantity < 1) return
    if (hasTiers && !addTierId) return

    const tier = hasTiers ? activeTiers.find((t) => t.id === addTierId) ?? null : null

    const newItem: OrderItem = {
      key: nextKey(),
      isCustom: false,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      unit: selectedProduct.unit,
      quantity: addQuantity,
      pricingTierId: tier?.id ?? null,
      tierLabel: tier?.tier_label ?? null,
      tierQuantity: tier?.quantity ?? null,
    }
    setItems((prev) => [...prev, newItem])
    setAddProductId('')
    setAddQuantity(1)
    setAddTierId('')
  }, [selectedProduct, addQuantity, addTierId, hasTiers, activeTiers])

  const handleAddCustom = useCallback(() => {
    const customCount = items.filter((i) => i.isCustom).length
    if (customCount >= 5) return
    const newItem: CustomItem = {
      key: nextKey(),
      isCustom: true,
      customText: '',
    }
    setItems((prev) => [...prev, newItem])
  }, [items])

  const handleRemoveItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key))
  }, [])

  const handleCustomTextChange = useCallback((key: string, text: string) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key && i.isCustom ? { ...i, customText: text } : i))
    )
  }, [])

  const handleQuantityChange = useCallback((key: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key && !i.isCustom ? { ...i, quantity: qty } : i))
    )
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // クライアント側簡易チェック
    if (companyMode === 'existing' && !companyId) {
      setError('取引先を選択してください')
      return
    }
    if (companyMode === 'new' && !newCompanyName.trim()) {
      setError('新規取引先名を入力してください')
      return
    }
    if (items.length === 0) {
      setError('商品を1件以上追加してください')
      return
    }
    const payload = {
      ...(companyMode === 'existing' ? { companyId } : { newCompanyName: newCompanyName.trim() }),
      items: items.map((item) =>
        item.isCustom
          ? { isCustom: true, customText: item.customText }
          : {
              isCustom: false,
              productId: item.productId,
              quantity: item.quantity,
              pricingTierId: item.pricingTierId ?? null,
            }
      ),
      deliveryDate: deliveryDate || null,
      notes: notes || null,
    }

    setSubmitting(true)
    try {
      const res = await adminFetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '登録に失敗しました')
        return
      }
      router.push('/admin/orders')
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingData) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const customItemCount = items.filter((i) => i.isCustom).length

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/orders"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          注文一覧
        </Link>
        <h1 className="text-xl font-bold text-gray-900">注文を手動入力</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 取引先 */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-900">取引先</h2>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCompanyMode('existing')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                companyMode === 'existing'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              既存から選ぶ
            </button>
            <button
              type="button"
              onClick={() => setCompanyMode('new')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                companyMode === 'new'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              新規で入力
            </button>
          </div>

          {companyMode === 'existing' ? (
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              <option value="">取引先を選択...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-1">
              <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="取引先名を入力"
                maxLength={200}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <p className="text-xs text-gray-500">
                同名の取引先が既に存在する場合は既存の取引先を使用します。
                新規作成の場合は price_rank=standard で登録されます。
              </p>
            </div>
          )}
        </section>

        {/* 商品 */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-900">商品</h2>

          {/* 商品追加フォーム */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={addProductId}
                onChange={(e) => setAddProductId(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">商品を選択...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.stock_status === 'cross'}>
                    {p.name}{p.stock_status === 'cross' ? '（在庫なし）' : ''}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={addQuantity}
                onChange={(e) => setAddQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={9999}
                className="w-24 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>

            {hasTiers && (
              <select
                value={addTierId}
                onChange={(e) => setAddTierId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">価格段階を選択...</option>
                {activeTiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.tier_label}（{t.quantity}本 × ¥{t.unit_price.toLocaleString()}）
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={handleAddProduct}
              disabled={!addProductId || (hasTiers && !addTierId)}
              className="w-full sm:w-auto px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40"
            >
              追加
            </button>
          </div>

          {/* 追加済みアイテム */}
          {items.length > 0 && (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
              {items.map((item) =>
                item.isCustom ? (
                  <div key={item.key} className="flex items-center gap-2 p-3">
                    <span className="text-xs font-medium text-orange-600 shrink-0 bg-orange-50 px-2 py-0.5 rounded">
                      自由記入
                    </span>
                    <input
                      type="text"
                      value={item.customText}
                      onChange={(e) => handleCustomTextChange(item.key, e.target.value)}
                      placeholder="内容を入力（例：みかん 特選品 3kg×5箱）"
                      maxLength={100}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.key)}
                      className="shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                      aria-label="削除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div key={item.key} className="flex items-center gap-2 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.productName}</p>
                      {item.tierLabel && (
                        <p className="text-xs text-gray-500">{item.tierLabel}</p>
                      )}
                    </div>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(item.key, Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      max={9999}
                      className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <span className="text-xs text-gray-500 shrink-0">{item.unit}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.key)}
                      className="shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                      aria-label="削除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {/* 自由記入追加ボタン */}
          <button
            type="button"
            onClick={handleAddCustom}
            disabled={customItemCount >= 5}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            自由記入行を追加（{customItemCount}/5）
          </button>
        </section>

        {/* 納品希望日 */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="text-base font-bold text-gray-900">納品希望日</h2>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            min={todayStr}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <p className="text-xs text-gray-500">
            本日以降で指定できます（任意）
          </p>
        </section>

        {/* 備考 */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="text-base font-bold text-gray-900">備考</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="連絡事項など（500文字以内）"
            maxLength={500}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
          />
        </section>

        {/* エラー */}
        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* 送信ボタン */}
        <div className="flex gap-3">
          <Link
            href="/admin/orders"
            className="flex-1 text-center py-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            キャンセル
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-3 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {submitting ? '登録中...' : 'この内容で登録する'}
          </button>
        </div>
      </form>
    </div>
  )
}
