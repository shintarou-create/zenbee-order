'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import CustomerTable from '@/components/admin/CustomerTable'
import type { Company, PriceRank } from '@/types'

const PRICE_RANKS: { value: string; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'standard', label: '既存取引先' },
  { value: 'premium', label: '新規取引先' },
  { value: 'vip', label: 'VIP' },
]

const initialFormData: Partial<Company> = {
  company_name: '',
  representative_name: '',
  postal_code: '',
  prefecture: '',
  city: '',
  address: '',
  building: '',
  phone: '',
  email: '',
  price_rank: 'standard',
  notes: '',
  is_active: true,
  has_separate_billing: false,
  billing_name: '',
  billing_postal_code: '',
  billing_prefecture: '',
  billing_city: '',
  billing_address: '',
  billing_building: '',
}

export default function AdminCustomersPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [priceRankFilter, setPriceRankFilter] = useState('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [formData, setFormData] = useState<Partial<Company>>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchCompanies()
  }, [])

  async function fetchCompanies() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('companies')
        .select('*, line_users (id, line_user_id, display_name, is_active)')
        .order('created_at', { ascending: false })

      if (error) throw error
      setCompanies((data || []) as Company[])
    } catch (err) {
      console.error('顧客取得エラー:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredCompanies = companies.filter((c) => {
    if (priceRankFilter !== 'all' && c.price_rank !== priceRankFilter) return false
    if (activeFilter === 'active' && !c.is_active) return false
    if (activeFilter === 'inactive' && c.is_active) return false
    return true
  })

  function handleEdit(company: Company) {
    setEditingCompany(company)
    setFormData({ ...company })
    setShowModal(true)
  }

  function handleAddNew() {
    setEditingCompany(null)
    setFormData(initialFormData)
    setShowModal(true)
  }

  async function handleSave() {
    if (!formData.company_name?.trim()) return
    setSaving(true)
    try {
      const supabase = createClient()

      const companyData = {
        company_name: formData.company_name,
        representative_name: formData.representative_name || null,
        postal_code: formData.postal_code || null,
        prefecture: formData.prefecture || null,
        city: formData.city || null,
        address: formData.address || null,
        building: formData.building || null,
        phone: formData.phone || null,
        email: formData.email || null,
        price_rank: formData.price_rank || 'standard',
        notes: formData.notes || null,
        is_active: formData.is_active ?? true,
        has_separate_billing: formData.has_separate_billing ?? false,
        billing_name: formData.has_separate_billing ? (formData.billing_name || null) : null,
        billing_postal_code: formData.has_separate_billing ? (formData.billing_postal_code || null) : null,
        billing_prefecture: formData.has_separate_billing ? (formData.billing_prefecture || null) : null,
        billing_city: formData.has_separate_billing ? (formData.billing_city || null) : null,
        billing_address: formData.has_separate_billing ? (formData.billing_address || null) : null,
        billing_building: formData.has_separate_billing ? (formData.billing_building || null) : null,
      }

      if (editingCompany) {
        const { error } = await supabase
          .from('companies')
          .update(companyData)
          .eq('id', editingCompany.id)

        if (error) throw error
        setMessage({ type: 'success', text: '顧客情報を更新しました' })
      } else {
        const { error } = await supabase.from('companies').insert(companyData)
        if (error) throw error
        setMessage({ type: 'success', text: '顧客を追加しました' })
      }

      setShowModal(false)
      await fetchCompanies()
    } catch (err) {
      console.error('顧客保存エラー:', err)
      setMessage({ type: 'error', text: '保存に失敗しました' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">顧客管理</h1>
        <button
          onClick={handleAddNew}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          事前登録
        </button>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* フィルター */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRICE_RANKS.map((r) => (
            <button
              key={r.value}
              onClick={() => setPriceRankFilter(r.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                priceRankFilter === r.value
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeFilter === f
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'すべて' : f === 'active' ? '有効のみ' : '無効のみ'}
            </button>
          ))}
        </div>
      </div>

      {/* 顧客テーブル */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <CustomerTable customers={filteredCompanies} onEdit={handleEdit} />
        )}
      </div>

      {/* モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingCompany ? '顧客を編集' : '顧客を事前登録'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  店名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.company_name || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, company_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">担当者名</label>
                <input
                  type="text"
                  value={formData.representative_name || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, representative_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号</label>
                  <input
                    type="text"
                    value={formData.postal_code || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, postal_code: e.target.value }))}
                    placeholder="000-0000"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">都道府県</label>
                  <input
                    type="text"
                    value={formData.prefecture || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, prefecture: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">市区町村</label>
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">建物名・部屋番号</label>
                <input
                  type="text"
                  value={formData.building || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, building: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">価格帯</label>
                  <select
                    value={formData.price_rank || 'standard'}
                    onChange={(e) => setFormData((p) => ({ ...p, price_rank: e.target.value as PriceRank }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="standard">既存取引先</option>
                    <option value="premium">新規取引先</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
              </div>

              {/* 請求先トグル */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="has_separate_billing"
                    checked={formData.has_separate_billing ?? false}
                    onChange={(e) => setFormData((p) => ({ ...p, has_separate_billing: e.target.checked }))}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <label htmlFor="has_separate_billing" className="text-sm font-medium text-gray-700">
                    請求先が納品先と異なる
                  </label>
                </div>

                {formData.has_separate_billing && (
                  <div className="ml-6 space-y-2 border-l-2 border-green-200 pl-3">
                    <input
                      type="text"
                      value={formData.billing_name || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, billing_name: e.target.value }))}
                      placeholder="請求先名"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={formData.billing_postal_code || ''}
                        onChange={(e) => setFormData((p) => ({ ...p, billing_postal_code: e.target.value }))}
                        placeholder="郵便番号"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                      <input
                        type="text"
                        value={formData.billing_prefecture || ''}
                        onChange={(e) => setFormData((p) => ({ ...p, billing_prefecture: e.target.value }))}
                        placeholder="都道府県"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                    <input
                      type="text"
                      value={formData.billing_city || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, billing_city: e.target.value }))}
                      placeholder="市区町村"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <input
                      type="text"
                      value={formData.billing_address || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, billing_address: e.target.value }))}
                      placeholder="住所"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <input
                      type="text"
                      value={formData.billing_building || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, billing_building: e.target.value }))}
                      placeholder="建物名"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active ?? true}
                  onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  有効（発注可能）
                </label>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !formData.company_name?.trim()}
                className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-6 py-2 rounded-lg text-sm transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
