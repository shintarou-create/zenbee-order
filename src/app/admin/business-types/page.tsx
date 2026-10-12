'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/admin-fetch'
import { useBusinessTypes } from '@/hooks/useBusinessTypes'
import type { BusinessType } from '@/types'

type ProductRow = { id: string; name: string; category: string; is_active: boolean; display_order: number }

// 業態マスタの管理（追加・名称変更・並び替え・有効/無効）と、業態ごとに見せる商品の設定。
export default function BusinessTypesPage() {
  const { types, productLinks, isLoading, error, reload } = useBusinessTypes()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  // 商品の紐づけ編集
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [checkedProductIds, setCheckedProductIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    adminFetch('/api/admin/products')
      .then((r) => r.json())
      .then((json: { data?: ProductRow[] }) => setProducts(json.data ?? []))
      .catch((err) => console.error('商品の取得エラー:', err))
  }, [])

  // 業態一覧が読めたら、最初の業態を選択状態にする
  useEffect(() => {
    if (!selectedTypeId && types.length > 0) setSelectedTypeId(types[0].id)
  }, [types, selectedTypeId])

  // 選択中の業態の紐づけをチェック状態に反映（保存後の再読込でも同期する）
  useEffect(() => {
    if (!selectedTypeId) return
    setCheckedProductIds(
      new Set(productLinks.filter((l) => l.business_type_id === selectedTypeId).map((l) => l.product_id))
    )
  }, [selectedTypeId, productLinks])

  const savedIds = useMemo(
    () => new Set(productLinks.filter((l) => l.business_type_id === selectedTypeId).map((l) => l.product_id)),
    [productLinks, selectedTypeId]
  )
  const isDirty =
    savedIds.size !== checkedProductIds.size || Array.from(checkedProductIds).some((id) => !savedIds.has(id))

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  async function request(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true)
    try {
      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showMsg('error', json.error || '保存に失敗しました')
        return false
      }
      await reload()
      return true
    } catch {
      showMsg('error', '通信エラーが発生しました')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return
    if (await request('/api/admin/business-types', 'POST', { name: newName })) {
      setNewName('')
      showMsg('success', '業態を追加しました')
    }
  }

  async function handleRename(t: BusinessType) {
    if (!editingName.trim() || editingName.trim() === t.name) {
      setEditingId(null)
      return
    }
    if (await request(`/api/admin/business-types/${t.id}`, 'PATCH', { name: editingName })) {
      setEditingId(null)
      showMsg('success', '業態名を変更しました')
    }
  }

  // 隣の業態と表示順を入れ替える
  async function handleMove(index: number, dir: -1 | 1) {
    const a = types[index]
    const b = types[index + dir]
    if (!a || !b) return
    const ok =
      (await request(`/api/admin/business-types/${a.id}`, 'PATCH', { display_order: b.display_order })) &&
      (await request(`/api/admin/business-types/${b.id}`, 'PATCH', { display_order: a.display_order }))
    if (!ok) await reload()
  }

  async function handleToggleActive(t: BusinessType) {
    if (await request(`/api/admin/business-types/${t.id}`, 'PATCH', { is_active: !t.is_active })) {
      showMsg('success', t.is_active ? `${t.name} を無効にしました` : `${t.name} を有効にしました`)
    }
  }

  async function handleSaveProducts() {
    if (!selectedTypeId) return
    if (
      await request(`/api/admin/business-types/${selectedTypeId}/products`, 'PUT', {
        productIds: Array.from(checkedProductIds),
      })
    ) {
      showMsg('success', '表示する商品を保存しました')
    }
  }

  function toggleProduct(id: string) {
    setCheckedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedType = types.find((t) => t.id === selectedTypeId) ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">業態の設定</h1>
        <Link href="/admin/customers" className="text-sm text-gray-500 hover:text-gray-700">
          顧客管理に戻る
        </Link>
      </div>

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}
      {error && <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-red-700">{error}</div>}

      {/* 業態マスタ */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <h2 className="font-bold text-gray-900">業態</h2>
        {isLoading ? (
          <p className="text-sm text-gray-400">読み込み中...</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {types.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2 py-2 flex-wrap">
                {editingId === t.id ? (
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    maxLength={50}
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                    autoFocus
                  />
                ) : (
                  <span className={`flex-1 min-w-0 text-sm font-medium ${t.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                    {t.name}
                    {!t.is_active && <span className="ml-1 text-xs">（無効）</span>}
                    <span className="ml-2 text-xs text-gray-400">
                      商品{productLinks.filter((l) => l.business_type_id === t.id).length}件
                    </span>
                  </span>
                )}
                <div className="flex items-center gap-1">
                  {editingId === t.id ? (
                    <>
                      <button onClick={() => handleRename(t)} disabled={busy} className="text-xs font-bold px-2 py-1 rounded bg-green-600 text-white disabled:opacity-50">
                        保存
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 text-gray-500">
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(t.id)
                        setEditingName(t.name)
                      }}
                      className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      名称変更
                    </button>
                  )}
                  <button onClick={() => handleMove(i, -1)} disabled={busy || i === 0} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-30" aria-label="上へ">
                    ↑
                  </button>
                  <button onClick={() => handleMove(i, 1)} disabled={busy || i === types.length - 1} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-30" aria-label="下へ">
                    ↓
                  </button>
                  <button onClick={() => handleToggleActive(t)} disabled={busy} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                    {t.is_active ? '無効にする' : '有効にする'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新しい業態名"
            maxLength={50}
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={handleAdd} disabled={busy || !newName.trim()} className="px-4 py-2 rounded-lg text-sm font-bold bg-green-600 text-white disabled:opacity-50">
            追加
          </button>
        </div>
        <p className="text-xs text-gray-400">
          無効にした業態は、承認・業態変更の選択肢に出なくなります（設定済みの取引先・過去の売上はそのまま）。
          業態は取引先・注文から参照されるため削除できません。
        </p>
      </section>

      {/* 業態ごとに見せる商品 */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <h2 className="font-bold text-gray-900">業態ごとに見せる商品</h2>
        <div className="flex gap-1.5 overflow-x-auto">
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTypeId(t.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap ${
                selectedTypeId === t.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
        {selectedType && (
          <>
            <p className="text-xs text-gray-500">
              チェックした商品だけが「{selectedType.name}」の取引先のLINE発注画面に表示されます（無効な商品は業態に関係なく表示されません）。
            </p>
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {products.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checkedProductIds.has(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="w-4 h-4 accent-green-600"
                    />
                    <span className={`text-sm ${p.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                      {p.name}
                      {!p.is_active && <span className="ml-1 text-xs">（無効）</span>}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">{p.category}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                onClick={handleSaveProducts}
                disabled={busy || !isDirty}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-green-600 text-white disabled:opacity-50"
              >
                {busy ? '保存中...' : `表示する商品を保存（${checkedProductIds.size}件）`}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
