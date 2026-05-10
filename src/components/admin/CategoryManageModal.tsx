'use client'

import { useState } from 'react'
import type { Category } from '@/types'

interface CategoryManageModalProps {
  categories: Category[]
  onClose: () => void
  onAdd: (name: string, emoji: string) => Promise<void>
  onRename: (id: string, name: string, emoji: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export default function CategoryManageModal({
  categories,
  onClose,
  onAdd,
  onRename,
  onDelete,
}: CategoryManageModalProps) {
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingEmoji, setEditingEmoji] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!newName.trim() || !newEmoji.trim()) return
    setLoading(true)
    setError(null)
    try {
      await onAdd(newName.trim(), newEmoji.trim())
      setNewName('')
      setNewEmoji('')
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
      await onRename(id, editingName.trim(), editingEmoji.trim())
      setEditingId(null)
      setEditingName('')
      setEditingEmoji('')
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

          {/* カテゴリ一覧 */}
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="bg-gray-50 rounded-lg px-3 py-2">
                {editingId === cat.id ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-3xl leading-none">{editingEmoji || '📦'}</span>
                        <input
                          type="text"
                          value={editingEmoji}
                          onChange={(e) => setEditingEmoji(e.target.value)}
                          maxLength={4}
                          placeholder="🍊"
                          className="w-14 border border-gray-200 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                      </div>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename(cat.id)}
                        className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        autoFocus
                      />
                    </div>
                    <p className="text-xs text-gray-400">Cmd+Ctrl+Space で絵文字パレット（mac）</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRename(cat.id)}
                        disabled={loading}
                        className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setEditingName(''); setEditingEmoji('') }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{cat.emoji || '📦'}</span>
                    <span className="flex-1 text-sm font-medium text-gray-800">{cat.name}</span>
                    <button
                      onClick={() => { setEditingId(cat.id); setEditingName(cat.name); setEditingEmoji(cat.emoji || '') }}
                      className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id, cat.name)}
                      disabled={loading}
                      className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded disabled:opacity-50"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 新規追加 */}
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-3xl leading-none">{newEmoji || '📦'}</span>
                <input
                  type="text"
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  maxLength={4}
                  placeholder="🍊"
                  className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
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
                disabled={loading || !newName.trim() || !newEmoji.trim()}
                className="bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                追加
              </button>
            </div>
            <p className="text-xs text-gray-400">Cmd+Ctrl+Space で絵文字パレット（mac）</p>
          </div>
        </div>
      </div>
    </div>
  )
}
