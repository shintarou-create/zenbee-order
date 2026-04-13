'use client'

import { useState, useEffect } from 'react'
import type { Product, PriceRank } from '@/types'

interface ProductFormProps {
  product?: Product
  onSubmit: (
    product: Partial<Product>,
    prices: Record<PriceRank, number>
  ) => Promise<void>
  onCancel: () => void
}

const CATEGORIES = ['みかん', 'びわ', 'レモン', 'ジュース', 'その他']
const UNITS = ['kg', '個', '箱', '袋', 'L', 'ml']
const PRICE_RANKS: { value: PriceRank; label: string }[] = [
  { value: 'standard', label: 'スタンダード' },
  { value: 'premium', label: 'プレミアム' },
  { value: 'vip', label: 'VIP' },
]

export default function ProductForm({ product, onSubmit, onCancel }: ProductFormProps) {
  const [name, setName] = useState(product?.name || '')
  const [category, setCategory] = useState(product?.category || 'みかん')
  const [unit, setUnit] = useState(product?.unit || 'kg')
  const [minOrderQty, setMinOrderQty] = useState(product?.min_order_qty || 0.1)
  const [maxOrderQty, setMaxOrderQty] = useState(product?.max_order_qty || 200)
  const [stepQty, setStepQty] = useState(product?.step_qty || 0.1)
  const [coolType, setCoolType] = useState(product?.cool_type || 0)
  const [isSeasonal, setIsSeasonal] = useState(product?.is_seasonal || false)
  const [seasonStart, setSeasonStart] = useState(product?.season_start || '')
  const [seasonEnd, setSeasonEnd] = useState(product?.season_end || '')
  const [sortOrder, setSortOrder] = useState(product?.sort_order || 0)
  const [description, setDescription] = useState(product?.description || '')
  const [prices, setPrices] = useState<Record<PriceRank, number>>({
    standard: 0,
    premium: 0,
    vip: 0,
  })
  const [submitting, setSubmitting] = useState(false)

  // 既存の価格を設定
  useEffect(() => {
    if (product?.product_prices) {
      const priceMap: Record<PriceRank, number> = { standard: 0, premium: 0, vip: 0 }
      for (const pp of product.product_prices) {
        priceMap[pp.price_rank] = pp.price_per_unit
      }
      setPrices(priceMap)
    }
  }, [product])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      await onSubmit(
        {
          name: name.trim(),
          category,
          unit,
          min_order_qty: minOrderQty,
          max_order_qty: maxOrderQty,
          step_qty: stepQty,
          cool_type: coolType as 0 | 1,
          is_seasonal: isSeasonal,
          season_start: isSeasonal ? seasonStart : null,
          season_end: isSeasonal ? seasonEnd : null,
          sort_order: sortOrder,
          description: description.trim() || null,
          is_active: product?.is_active ?? true,
          image_url: product?.image_url || null,
        },
        prices
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 商品名 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          商品名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>

      {/* カテゴリ・単位 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">単位</label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 数量設定 */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">最小注文</label>
          <input
            type="number"
            value={minOrderQty}
            onChange={(e) => setMinOrderQty(parseFloat(e.target.value))}
            min={0.1}
            step={0.1}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">最大注文</label>
          <input
            type="number"
            value={maxOrderQty}
            onChange={(e) => setMaxOrderQty(parseFloat(e.target.value))}
            min={1}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ステップ</label>
          <input
            type="number"
            value={stepQty}
            onChange={(e) => setStepQty(parseFloat(e.target.value))}
            min={0.1}
            step={0.1}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
      </div>

      {/* 温度管理 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">温度管理</label>
        <select
          value={coolType}
          onChange={(e) => setCoolType(parseInt(e.target.value))}
          className="w-full md:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value={0}>通常</option>
          <option value={1}>冷蔵</option>
        </select>
      </div>

      {/* 季節商品 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            id="is_seasonal"
            checked={isSeasonal}
            onChange={(e) => setIsSeasonal(e.target.checked)}
            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          <label htmlFor="is_seasonal" className="text-sm font-medium text-gray-700">
            季節商品
          </label>
        </div>
        {isSeasonal && (
          <div className="grid grid-cols-2 gap-3 ml-6">
            <div>
              <label className="block text-xs text-gray-500 mb-1">解禁日 (MM-DD)</label>
              <input
                type="text"
                value={seasonStart}
                onChange={(e) => setSeasonStart(e.target.value)}
                placeholder="11-01"
                pattern="\d{2}-\d{2}"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">終了日 (MM-DD)</label>
              <input
                type="text"
                value={seasonEnd}
                onChange={(e) => setSeasonEnd(e.target.value)}
                placeholder="01-31"
                pattern="\d{2}-\d{2}"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* 価格設定 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">価格（税抜）</label>
        <div className="space-y-2">
          {PRICE_RANKS.map((rank) => (
            <div key={rank.value} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-24 flex-shrink-0">{rank.label}</span>
              <div className="flex items-center gap-1">
                <span className="text-gray-500 text-sm">¥</span>
                <input
                  type="number"
                  value={prices[rank.value]}
                  onChange={(e) =>
                    setPrices((prev) => ({ ...prev, [rank.value]: parseFloat(e.target.value) || 0 }))
                  }
                  min={0}
                  step={1}
                  className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <span className="text-gray-500 text-sm">/{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 並び順 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">並び順</label>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(parseInt(e.target.value))}
          className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>

      {/* 説明 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
        />
      </div>

      {/* ボタン */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
        >
          {submitting ? '保存中...' : product ? '更新する' : '追加する'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-6 py-2 rounded-lg text-sm transition-colors"
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}
