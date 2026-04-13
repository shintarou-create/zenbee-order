'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ProductForm from '@/components/admin/ProductForm'
import type { Product, PriceRank } from '@/types'
import { formatCurrency } from '@/lib/utils'

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [inventoryEditing, setInventoryEditing] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          product_prices (id, product_id, price_rank, price_per_unit),
          inventory (id, product_id, available_qty, reserved_qty, updated_at)
        `)
        .order('sort_order', { ascending: true })

      if (error) throw error
      setProducts((data || []) as Product[])
    } catch (err) {
      console.error('商品取得エラー:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSubmit(
    productData: Partial<Product>,
    prices: Record<PriceRank, number>
  ) {
    try {
      const supabase = createClient()

      if (editingProduct) {
        // 更新
        const { error: updateError } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)

        if (updateError) throw updateError

        // 価格を更新
        for (const [rank, price] of Object.entries(prices)) {
          await supabase
            .from('product_prices')
            .upsert({
              product_id: editingProduct.id,
              price_rank: rank,
              price_per_unit: price,
            })
        }

        setMessage({ type: 'success', text: '商品を更新しました' })
      } else {
        // 新規作成
        const { data: newProduct, error: insertError } = await supabase
          .from('products')
          .insert(productData)
          .select()
          .single()

        if (insertError || !newProduct) throw insertError || new Error('作成失敗')

        // 価格を作成
        await supabase.from('product_prices').insert(
          Object.entries(prices).map(([rank, price]) => ({
            product_id: newProduct.id,
            price_rank: rank,
            price_per_unit: price,
          }))
        )

        // 在庫レコードを作成
        await supabase.from('inventory').insert({
          product_id: newProduct.id,
          available_qty: 0,
          reserved_qty: 0,
        })

        setMessage({ type: 'success', text: '商品を追加しました' })
      }

      setShowForm(false)
      setEditingProduct(null)
      await fetchProducts()
    } catch (err) {
      console.error('商品保存エラー:', err)
      setMessage({ type: 'error', text: '保存に失敗しました' })
    } finally {
      setTimeout(() => setMessage(null), 3000)
    }
  }

  async function handleToggleActive(product: Product) {
    try {
      const supabase = createClient()
      await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id)

      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: !product.is_active } : p))
      )
    } catch (err) {
      console.error('トグルエラー:', err)
    }
  }

  async function handleInventoryUpdate(productId: string) {
    const newQty = parseFloat(inventoryEditing[productId] || '0')
    if (isNaN(newQty)) return

    try {
      const supabase = createClient()
      await supabase
        .from('inventory')
        .update({ available_qty: newQty })
        .eq('product_id', productId)

      setProducts((prev) =>
        prev.map((p) => {
          if (p.id === productId && p.inventory) {
            const inv = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory
            return { ...p, inventory: { ...inv, available_qty: newQty } }
          }
          return p
        })
      )

      setInventoryEditing((prev) => {
        const next = { ...prev }
        delete next[productId]
        return next
      })

      setMessage({ type: 'success', text: '在庫を更新しました' })
      setTimeout(() => setMessage(null), 2000)
    } catch (err) {
      console.error('在庫更新エラー:', err)
    }
  }

  function handleEdit(product: Product) {
    setEditingProduct(product)
    setShowForm(true)
  }

  function handleAddNew() {
    setEditingProduct(null)
    setShowForm(true)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingProduct(null)
  }

  if (showForm) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={handleCancel} className="text-gray-500 hover:text-gray-700">
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
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">商品管理</h1>
        <button
          onClick={handleAddNew}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          商品を追加
        </button>
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
          {products.map((product) => {
            const inv = Array.isArray(product.inventory) ? product.inventory[0] : product.inventory
            const netQty = inv ? inv.available_qty - inv.reserved_qty : 0
            const standardPrice = product.product_prices?.find((pp) => pp.price_rank === 'standard')

            return (
              <div key={product.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        product.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {product.is_active ? '販売中' : '非表示'}
                      </span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {product.category}
                      </span>
                      {product.cool_type === 1 && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">冷蔵</span>
                      )}
                      {product.is_seasonal && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                          発送時期 ({product.season_start}〜{product.season_end})
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-gray-900 mt-1">{product.name}</h3>
                    {standardPrice && (
                      <p className="text-sm text-green-700 font-medium">
                        {formatCurrency(standardPrice.price_per_unit)}/{product.unit}〜
                      </p>
                    )}
                  </div>

                  {/* 操作ボタン */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(product)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                        product.is_active
                          ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          : 'border-green-200 text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {product.is_active ? '非表示' : '表示'}
                    </button>
                    <button
                      onClick={() => handleEdit(product)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      編集
                    </button>
                  </div>
                </div>

                {/* 在庫管理 */}
                <div className="mt-3 flex items-center gap-3 pt-3 border-t border-gray-50">
                  <span className="text-xs text-gray-500">在庫:</span>
                  <span className={`text-sm font-bold ${
                    netQty <= 0 ? 'text-red-600' : netQty < 10 ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {netQty}{product.unit}
                  </span>
                  <span className="text-xs text-gray-400">(引当済: {inv?.reserved_qty || 0}{product.unit})</span>

                  <div className="flex items-center gap-1 ml-auto">
                    <input
                      type="number"
                      value={inventoryEditing[product.id] ?? inv?.available_qty ?? 0}
                      onChange={(e) =>
                        setInventoryEditing((prev) => ({ ...prev, [product.id]: e.target.value }))
                      }
                      className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <span className="text-xs text-gray-500">{product.unit}</span>
                    {product.id in inventoryEditing && (
                      <button
                        onClick={() => handleInventoryUpdate(product.id)}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition-colors"
                      >
                        更新
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
