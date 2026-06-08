'use client'

import { useState, useEffect } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Category } from '@/types'
import { adminFetch } from '@/lib/admin-fetch'

interface CategoryManageModalProps {
  categories: Category[]
  onClose: () => void
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder?: () => void
}

function SortableCategoryRow({
  cat,
  editingId,
  editingName,
  loading,
  onStartEdit,
  onEditNameChange,
  onSaveRename,
  onCancelEdit,
  onDelete,
}: {
  cat: Category
  editingId: string | null
  editingName: string
  loading: boolean
  onStartEdit: (id: string, name: string) => void
  onEditNameChange: (name: string) => void
  onSaveRename: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string, name: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="bg-gray-50 rounded-lg px-3 py-2">
      {editingId === cat.id ? (
        <div className="space-y-2">
          <input
            type="text"
            value={editingName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSaveRename(cat.id)}
            className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => onSaveRename(cat.id)}
              disabled={loading}
              className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
            >
              保存
            </button>
            <button
              onClick={onCancelEdit}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {/* ドラッグハンドル */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 -ml-1 touch-none"
            aria-label="ドラッグで並び替え"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </button>
          <span className="flex-1 text-sm font-medium text-gray-800">{cat.name}</span>
          <button
            onClick={() => onStartEdit(cat.id, cat.name)}
            className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded"
          >
            編集
          </button>
          <button
            onClick={() => onDelete(cat.id, cat.name)}
            disabled={loading}
            className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded disabled:opacity-50"
          >
            削除
          </button>
        </div>
      )}
    </div>
  )
}

export default function CategoryManageModal({
  categories,
  onClose,
  onAdd,
  onRename,
  onDelete,
  onReorder,
}: CategoryManageModalProps) {
  const [sortedCategories, setSortedCategories] = useState<Category[]>(categories)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // props が変化したときにローカル順序を同期
  useEffect(() => {
    setSortedCategories(categories)
  }, [categories])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortedCategories.findIndex((c) => c.id === active.id)
    const newIndex = sortedCategories.findIndex((c) => c.id === over.id)
    const reordered = arrayMove(sortedCategories, oldIndex, newIndex)
    setSortedCategories(reordered)
    setError(null)
    try {
      await adminFetch('/api/admin/categories/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map((c) => c.id) }),
      })
      onReorder?.()
    } catch {
      setSortedCategories(sortedCategories)
      setError('並び替えの保存に失敗しました')
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return
    setLoading(true)
    setError(null)
    try {
      await onAdd(newName.trim())
      setNewName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return
    setLoading(true)
    setError(null)
    try {
      await onRename(id, editingName.trim())
      setEditingId(null)
      setEditingName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`「${name}」を削除しますか？\n（このカテゴリに商品が紐づいている場合は削除できません）`)) return
    setLoading(true)
    setError(null)
    try {
      await onDelete(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">カテゴリ管理</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          {/* カテゴリ一覧（ドラッグ並び替え対応） */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedCategories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {sortedCategories.map((cat) => (
                  <SortableCategoryRow
                    key={cat.id}
                    cat={cat}
                    editingId={editingId}
                    editingName={editingName}
                    loading={loading}
                    onStartEdit={(id, name) => { setEditingId(id); setEditingName(name) }}
                    onEditNameChange={setEditingName}
                    onSaveRename={handleRename}
                    onCancelEdit={() => { setEditingId(null); setEditingName('') }}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* 新規追加 */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="新規カテゴリ名"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <button
                onClick={handleAdd}
                disabled={loading || !newName.trim()}
                className="bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                追加
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
