'use client'

import { useState, useEffect, useCallback } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import ProductForm from '@/components/admin/ProductForm'
import CategorySection from '@/components/admin/CategorySection'
import CategoryManageModal from '@/components/admin/CategoryManageModal'
import PricingTiersModal from '@/components/admin/PricingTiersModal'
import type { Product, Category, PriceRank, StockStatus } from '@/types'
import { adminFetch } from '@/lib/admin-fetch'


function SortableCategoryWrapper({
  category,
  products,
  onProductReorder,
  onEdit,
  onToggleActive,
  onPricingTiers,
  onStockStatusToggle,
}: {
  category: Category
  products: Product[]
  onProductReorder: (categoryId: string, reordered: Product[]) => void
  onEdit: (p: Product) => void
  onToggleActive: (p: Product) => void
  onPricingTiers: (p: Product) => void
  onStockStatusToggle: (p: Product) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <CategorySection
        category={category}
        products={products}
        dragHandle={{ attributes, listeners }}
        onProductReorder={onProductReorder}
        onEdit={onEdit}
        onToggleActive={onToggleActive}
        onPricingTiers={onPricingTiers}
        onStockStatusToggle={onStockStatusToggle}
      />
    </div>
  )
}

export default function AdminProductsPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [pricingTiersProduct, setPricingTiersProduct] = useState<Product | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const [catRes, prodRes] = await Promise.all([
        adminFetch('/api/admin/categories').then((r) => r.json()),
        supabase.from('products').select(`
          *,
          product_prices (id, product_id, price_rank, price_per_unit),
          pricing_tiers:product_pricing_tiers (id, product_id, tier_label, quantity, unit_price, display_order, is_active)
        `).order('display_order', { ascending: true }),
      ])
      setCategories(catRes.data || [])
      setProducts((prodRes.data || []) as Product[])
    } catch (err) {
      console.error('データ取得エラー:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // カテゴリ別に商品をグループ化
  function getProductsByCategory(categoryId: string) {
    return products
      .filter((p) => p.category_id === categoryId)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  }

  // カテゴリに紐づかない商品
  const uncategorizedProducts = products.filter((p) => !p.category_id)

  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = categories.findIndex((c) => c.id === active.id)
    const newIndex = categories.findIndex((c) => c.id === over.id)
    const reordered = arrayMove(categories, oldIndex, newIndex)
    setCategories(reordered)
    try {
      await adminFetch('/api/admin/categories/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map((c) => c.id) }),
      })
    } catch {
      fetchData()
    }
  }

  async function handleProductReorder(categoryId: string, reordered: Product[]) {
    setProducts((prev) => {
      const others = prev.filter((p) => p.category_id !== categoryId)
      const updated = reordered.map((p, i) => ({ ...p, display_order: i + 1 }))
      return [...others, ...updated]
    })
    try {
      await adminFetch('/api/admin/products/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, orderedIds: reordered.map((p) => p.id) }),
      })
    } catch {
      fetchData()
    }
  }

  async function handleSubmit(productData: Partial<Product>, prices: Record<PriceRank, number>) {
    try {
      if (editingProduct) {
        const res = await adminFetch(`/api/admin/products/${editingProduct.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...productData, prices }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || '更新に失敗しました')
        showMsg('success', '商品を更新しました')
      } else {
        const res = await adminFetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...productData, prices }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || '作成に失敗しました')
        showMsg('success', '商品を追加しました')
      }
      setShowForm(false)
      setEditingProduct(null)
      await fetchData()
    } catch (err) {
      console.error('保存エラー:', err)
      const msg = err instanceof Error ? err.message : '保存に失敗しました'
      showMsg('error', msg)
    }
  }

  async function handleToggleActive(product: Product) {
    try {
      const res = await adminFetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !product.is_active }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: !product.is_active } : p))
      )
    } catch (err) {
      console.error('トグルエラー:', err)
      showMsg('error', '表示切り替えに失敗しました')
    }
  }

  async function handleStockStatusToggle(product: Product) {
    let next: StockStatus
    switch (product.stock_status) {
      case 'circle': next = 'triangle'; break
      case 'triangle': next = 'cross'; break
      default: next = 'circle'
    }
    try {
      const res = await adminFetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_status: next }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, stock_status: next } : p))
      )
    } catch (err) {
      console.error('在庫ステータス更新エラー:', err)
      showMsg('error', '在庫ステータスの更新に失敗しました')
    }
  }

  // カテゴリ管理コールバック
  async function handleCategoryAdd(name: string) {
    const res = await adminFetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    await fetchData()
  }

  async function handleCategoryRename(id: string, name: string) {
    const res = await adminFetch(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    await fetchData()
  }

  async function handleCategoryDelete(id: string) {
    const res = await adminFetch(`/api/admin/categories/${id}`, {
      method: 'DELETE',
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    await fetchData()
  }

  if (showForm) {
    return (
      <div className="max-w-2xl space-y-4">
        {message && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button onClick={() => { setShowForm(false); setEditingProduct(null) }} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {editingProduct ? '商品を編集' : '商品を追加'}
          </h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <ProductForm
            product={editingProduct || undefined}
            categories={categories}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingProduct(null) }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">商品管理</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            カテゴリ管理
          </button>
          <button
            onClick={() => { setEditingProduct(null); setShowForm(true) }}
            className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            商品を追加
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
            <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {categories.map((cat) => (
                <SortableCategoryWrapper
                  key={cat.id}
                  category={cat}
                  products={getProductsByCategory(cat.id)}
                  onProductReorder={handleProductReorder}
                  onEdit={(p) => { setEditingProduct(p); setShowForm(true) }}
                  onToggleActive={handleToggleActive}
                  onPricingTiers={(p) => setPricingTiersProduct(p)}
                  onStockStatusToggle={handleStockStatusToggle}
                />
              ))}
            </SortableContext>
          </DndContext>

          {uncategorizedProducts.length > 0 && (
            <div className="bg-white rounded-xl border border-orange-200 p-4">
              <h3 className="text-sm font-bold text-orange-600 mb-2">
                ⚠ カテゴリ未設定の商品（{uncategorizedProducts.length}件）
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                DBのカテゴリ移行後に自動解消されます。手動で設定する場合は「編集」から更新してください。
              </p>
              <div className="space-y-2">
                {uncategorizedProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">{p.name}</span>
                    <button
                      onClick={() => { setEditingProduct(p); setShowForm(true) }}
                      className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 px-2 py-1 rounded"
                    >
                      編集
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showCategoryModal && (
        <CategoryManageModal
          categories={categories}
          onClose={() => setShowCategoryModal(false)}
          onAdd={handleCategoryAdd}
          onRename={handleCategoryRename}
          onDelete={handleCategoryDelete}
        />
      )}

      {pricingTiersProduct && (
        <PricingTiersModal
          product={pricingTiersProduct}
          onClose={() => { setPricingTiersProduct(null); fetchData() }}
        />
      )}
    </div>
  )
}
