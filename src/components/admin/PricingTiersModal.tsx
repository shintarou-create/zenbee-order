'use client'

import { useState, useEffect } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Product, ProductPricingTier } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface PricingTiersModalProps {
  product: Product
  onClose: () => void
}

interface TierFormState {
  tier_label: string
  quantity: string
  unit_price: string
}

function SortableTierRow({
  tier,
  onEdit,
  onDelete,
}: {
  tier: ProductPricingTier
  onEdit: (tier: ProductPricingTier) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tier.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
      <span
        {...attributes}
        {...listeners}
        className="text-gray-300 cursor-grab active:cursor-grabbing select-none touch-none"
      >
        ≡
      </span>
      <div className="flex-1 text-sm">
        <span className="font-medium text-gray-800">{tier.tier_label}</span>
        <span className="text-gray-500 ml-2">
          （{tier.quantity}本 {formatCurrency(tier.unit_price)}/本）
        </span>
      </div>
      <button onClick={() => onEdit(tier)} className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded">
        編集
      </button>
      <button
        onClick={() => onDelete(tier.id)}
        className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded"
      >
        削除
      </button>
    </div>
  )
}

export default function PricingTiersModal({ product, onClose }: PricingTiersModalProps) {
  const [tiers, setTiers] = useState<ProductPricingTier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingTier, setEditingTier] = useState<ProductPricingTier | null>(null)
  const [form, setForm] = useState<TierFormState>({ tier_label: '', quantity: '', unit_price: '' })
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    fetchTiers()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTiers() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/products/${product.id}/pricing-tiers`, {
        headers: { 'x-admin-token': '1' },
      })
      const json = await res.json()
      setTiers(json.data || [])
    } catch {
      setError('取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!form.tier_label.trim() || !form.quantity || !form.unit_price) return
    setSaving(true)
    setError(null)
    try {
      if (editingTier) {
        const res = await fetch(`/api/admin/products/${product.id}/pricing-tiers/${editingTier.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': '1' },
          body: JSON.stringify({
            tier_label: form.tier_label.trim(),
            quantity: Number(form.quantity),
            unit_price: Number(form.unit_price),
          }),
        })
        if (!res.ok) {
          const j = await res.json()
          throw new Error(j.error)
        }
      } else {
        const res = await fetch(`/api/admin/products/${product.id}/pricing-tiers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': '1' },
          body: JSON.stringify({
            tier_label: form.tier_label.trim(),
            quantity: Number(form.quantity),
            unit_price: Number(form.unit_price),
          }),
        })
        if (!res.ok) {
          const j = await res.json()
          throw new Error(j.error)
        }
      }
      await fetchTiers()
      setShowForm(false)
      setEditingTier(null)
      setForm({ tier_label: '', quantity: '', unit_price: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(tierId: string) {
    if (!window.confirm('この価格段階を削除しますか？')) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/products/${product.id}/pricing-tiers/${tierId}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': '1' },
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error)
      }
      await fetchTiers()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = tiers.findIndex((t) => t.id === active.id)
    const newIndex = tiers.findIndex((t) => t.id === over.id)
    const reordered = arrayMove(tiers, oldIndex, newIndex)
    setTiers(reordered)
    try {
      await Promise.all(
        reordered.map((t, i) =>
          fetch(`/api/admin/products/${product.id}/pricing-tiers/${t.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': '1' },
            body: JSON.stringify({ display_order: i + 1 }),
          })
        )
      )
    } catch {
      await fetchTiers()
    }
  }

  function openEdit(tier: ProductPricingTier) {
    setEditingTier(tier)
    setForm({
      tier_label: tier.tier_label,
      quantity: String(tier.quantity),
      unit_price: String(tier.unit_price),
    })
    setShowForm(true)
  }

  function openNew() {
    setEditingTier(null)
    setForm({ tier_label: '', quantity: '', unit_price: '' })
    setShowForm(true)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">価格段階</h2>
            <p className="text-xs text-gray-500 mt-0.5">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={tiers.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {tiers.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">価格段階が設定されていません</p>
                  )}
                  {tiers.map((tier) => (
                    <SortableTierRow key={tier.id} tier={tier} onEdit={openEdit} onDelete={handleDelete} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* 追加/編集フォーム */}
          {showForm && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
              <h3 className="text-sm font-bold text-gray-700">
                {editingTier ? '段階を編集' : '新規段階を追加'}
              </h3>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ラベル（例: 12本）</label>
                <input
                  type="text"
                  value={form.tier_label}
                  onChange={(e) => setForm((f) => ({ ...f, tier_label: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">本数</label>
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    min={1}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">単価（円/本）</label>
                  <input
                    type="number"
                    value={form.unit_price}
                    onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
                    min={0}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !form.tier_label.trim() || !form.quantity || !form.unit_price}
                  className="flex-1 bg-green-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => { setShowForm(false); setEditingTier(null) }}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {!showForm && (
            <button
              onClick={openNew}
              className="w-full border-2 border-dashed border-gray-200 text-gray-500 text-sm py-3 rounded-xl hover:border-green-400 hover:text-green-600 transition-colors"
            >
              ＋ 新規段階を追加
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
