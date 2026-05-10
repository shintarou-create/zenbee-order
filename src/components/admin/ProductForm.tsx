'use client'

import { useState, useEffect, useRef } from 'react'
import type { Product, PriceRank, Category } from '@/types'

interface ProductFormProps {
  product?: Product
  categories?: Category[]
  onSubmit: (
    product: Partial<Product>,
    prices: Record<PriceRank, number>
  ) => Promise<void>
  onCancel: () => void
}

const UNITS = ['kg', '本', '個', '箱', '袋', 'パック', 'L', 'ml']
const PRICE_RANKS: { value: PriceRank; label: string }[] = [
  { value: 'standard', label: 'スタンダード' },
  { value: 'premium', label: 'プレミアム' },
  { value: 'vip', label: 'VIP' },
]

export default function ProductForm({ product, categories = [], onSubmit, onCancel }: ProductFormProps) {
  const [name, setName] = useState(product?.name || '')
  const [category, setCategory] = useState(product?.category || (categories[0]?.name ?? ''))
  const [categoryId, setCategoryId] = useState<string | null>(product?.category_id ?? null)
  const [unit, setUnit] = useState(product?.unit || 'kg')
  const [minOrderQty, setMinOrderQty] = useState(product?.min_order_qty || 0.1)
  const [maxOrderQty, setMaxOrderQty] = useState(product?.max_order_qty || 200)
  const [stepQty, setStepQty] = useState(product?.step_qty || 0.1)
  const [coolType, setCoolType] = useState(product?.cool_type || 0)
  const [isSeasonal, setIsSeasonal] = useState(product?.is_seasonal || false)
  const [seasonStart, setSeasonStart] = useState(product?.season_start || '')
  const [seasonEnd, setSeasonEnd] = useState(product?.season_end || '')
  const [sortOrder, setSortOrder] = useState(product?.sort_order ?? 0)
  const [description, setDescription] = useState(product?.description || '')
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url || null)
  const [prices, setPrices] = useState<Record<PriceRank, number>>({
    standard: 0,
    premium: 0,
    vip: 0,
  })
  const [submitting, setSubmitting] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [hasFile, setHasFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (product?.product_prices) {
      const priceMap: Record<PriceRank, number> = { standard: 0, premium: 0, vip: 0 }
      for (const pp of product.product_prices) {
        priceMap[pp.price_rank] = pp.price_per_unit
      }
      setPrices(priceMap)
    }
  }, [product])

  async function handleImageUpload() {
    const file = fileInputRef.current?.files?.[0]
    if (!file || !product?.id) return

    setImageUploading(true)
    setImageError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/admin/products/${product.id}/image`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (!res.ok) {
        setImageError(json.error || 'アップロードに失敗しました')
        return
      }

      setImageUrl(json.image_url)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
        setHasFile(false)
      }
    } catch {
      setImageError('アップロードに失敗しました')
    } finally {
      setImageUploading(false)
    }
  }

  async function handleImageDelete() {
    if (!product?.id) return
    if (!window.confirm('画像を削除しますか？')) return

    setImageUploading(true)
    setImageError(null)
    try {
      const res = await fetch(`/api/admin/products/${product.id}/image`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json()
        setImageError(json.error || '削除に失敗しました')
        return
      }
      setImageUrl(null)
    } catch {
      setImageError('削除に失敗しました')
    } finally {
      setImageUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      await onSubmit(
        {
          name: name.trim(),
          category,
          category_id: categoryId,
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
          image_url: imageUrl,
        },
        prices
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 商品画像 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">商品画像</label>
        {!product?.id ? (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            商品を保存してから画像をアップロードできます
          </p>
        ) : (
          <div className="flex items-start gap-4">
            <div className="w-40 h-40 flex-shrink-0 border border-gray-200 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="商品画像" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-400 text-xs">画像未設定</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg"
                onChange={(e) => setHasFile(!!e.target.files?.length)}
                className="w-full text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:text-xs file:font-medium file:text-gray-600 file:bg-white hover:file:bg-gray-50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleImageUpload}
                  disabled={imageUploading || !hasFile}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {imageUploading ? 'アップロード中...' : 'アップロード'}
                </button>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={handleImageDelete}
                    disabled={imageUploading}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    削除
                  </button>
                )}
              </div>
              {imageError && <p className="text-xs text-red-600">{imageError}</p>}
              <p className="text-xs text-gray-400">JPEG のみ・最大 5MB</p>
            </div>
          </div>
        )}
      </div>

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
            value={categoryId ?? ''}
            onChange={(e) => {
              const selected = categories.find((c) => c.id === e.target.value)
              setCategoryId(e.target.value || null)
              setCategory(selected?.name ?? e.target.value)
            }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <option value="">-- 未設定 --</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
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
