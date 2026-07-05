'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { adminFetch } from '@/lib/admin-fetch'
import CustomerTable from '@/components/admin/CustomerTable'
import type { Company, PriceRank, DeliveryMethod, CompanyOverride } from '@/types'

const PRICE_RANKS: { value: string; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'standard', label: '既存取引先' },
  { value: 'premium', label: '新規取引先' },
  { value: 'vip', label: 'VIP' },
]

const LINE_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'linked', label: '紐づけ済み' },
  { value: 'unlinked', label: '未紐づけ' },
] as const

const ADDRESS_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'has', label: '住所あり' },
  { value: 'missing', label: '住所未取得' },
] as const

type Stage = '稼働中' | '連携済み' | '未着手'

const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/

const DELIVERY_METHODS: { value: DeliveryMethod; label: string }[] = [
  { value: 'yamato', label: 'ヤマト発送' },
  { value: 'direct_delivery', label: '直接配達（送料¥0）' },
  { value: 'pickup', label: '来店引取り（送料¥0）' },
]

// products.category の実値（日本語）
const OVERRIDE_CATEGORIES = [
  '柑橘',
  'ジュース720ml',
  'ジュース180ml',
  'ジュース2Lパック',
  '冷凍ジュース20L',
  '枇杷',
  'その他',
]

type ProductForOverride = {
  id: string
  name: string
  category: string
  pricing_tiers: { id: string; tier_label: string; quantity: number; is_active: boolean }[]
}

type OverrideForm = {
  scope_type: 'product' | 'category'
  product_id: string
  category: string
  pricing_tier_id: string
  min_cases: string
  unit_price: string
  fixed_shipping_fee: string
}

const initialOverrideForm: OverrideForm = {
  scope_type: 'product',
  product_id: '',
  category: '',
  pricing_tier_id: '',
  min_cases: '1',
  unit_price: '',
  fixed_shipping_fee: '',
}

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
  delivery_method: 'yamato',
  notes: '',
  is_active: true,
  has_separate_billing: false,
  billing_name: '',
  billing_postal_code: '',
  billing_prefecture: '',
  billing_city: '',
  billing_address: '',
  billing_building: '',
  parent_company_id: null,
}

export default function AdminCustomersPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [priceRankFilter, setPriceRankFilter] = useState('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [lineFilter, setLineFilter] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [addressFilter, setAddressFilter] = useState<'all' | 'has' | 'missing'>('all')
  // ステージタブ（承認待ち / 未着手 / 連携済み / 稼働中 / すべて）
  const [stageTab, setStageTab] = useState<'pending' | Stage | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [formData, setFormData] = useState<Partial<Company>>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [generatingCodeId, setGeneratingCodeId] = useState<string | null>(null)

  // 個別単価・送料特例
  const [products, setProducts] = useState<ProductForOverride[]>([])
  const [overrides, setOverrides] = useState<CompanyOverride[]>([])
  const [overridesLoading, setOverridesLoading] = useState(false)
  const [overrideForm, setOverrideForm] = useState<OverrideForm>(initialOverrideForm)
  const [editingOverrideId, setEditingOverrideId] = useState<string | null>(null)
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)

  // LINE 紐づけモーダル
  const [linkingCompany, setLinkingCompany] = useState<Company | null>(null)
  const [linkLineUserId, setLinkLineUserId] = useState('')
  const [linkDisplayName, setLinkDisplayName] = useState('')
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    fetchCompanies()
    fetchProducts()
    // URL 互換: ?stage=... 優先、旧 ?approval=pending は承認待ちタブへ
    const params = new URLSearchParams(window.location.search)
    const stageParam = params.get('stage')
    const approvalParam = params.get('approval')
    if (stageParam && ['pending', '未着手', '連携済み', '稼働中', 'all'].includes(stageParam)) {
      setStageTab(stageParam as 'pending' | Stage | 'all')
    } else if (approvalParam === 'pending') {
      setStageTab('pending')
    } else if (approvalParam === 'approved') {
      setStageTab('all')
    }
  }, [])

  async function fetchProducts() {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category, pricing_tiers:product_pricing_tiers (id, tier_label, quantity, is_active)')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      if (error) throw error
      setProducts((data ?? []) as unknown as ProductForOverride[])
    } catch (err) {
      console.error('商品取得エラー:', err)
    }
  }

  async function fetchOverrides(companyId: string) {
    setOverridesLoading(true)
    try {
      const res = await adminFetch(`/api/admin/companies/${companyId}/overrides`)
      const json = (await res.json()) as { data?: CompanyOverride[]; error?: string }
      if (res.ok) {
        setOverrides(json.data ?? [])
      } else {
        console.error('特例取得エラー:', json.error)
        setOverrides([])
      }
    } catch (err) {
      console.error('特例取得エラー:', err)
      setOverrides([])
    } finally {
      setOverridesLoading(false)
    }
  }

  async function fetchCompanies() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const [companiesRes, ordersRes] = await Promise.all([
        supabase
          .from('companies')
          .select('*, line_users (id, line_user_id, display_name, is_active)')
          .order('created_at', { ascending: false }),
        supabase.from('orders').select('company_id'),
      ])

      if (companiesRes.error) throw companiesRes.error

      const companiesWithOrders = new Set(
        (ordersRes.data || []).map((o) => o.company_id)
      )

      const withStage = (companiesRes.data || []).map((c) => {
        let stage: Stage
        if (companiesWithOrders.has(c.id)) {
          stage = '稼働中'
        } else if (c.line_users && c.line_users.length > 0) {
          stage = '連携済み'
        } else {
          stage = '未着手'
        }
        return { ...c, stage }
      })

      setCompanies(withStage as Company[])
    } catch (err) {
      console.error('顧客取得エラー:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // 検索一致（店名・担当者名・電話番号・メール）。件数と一覧の基準を揃える。
  function matchesSearch(c: Company): boolean {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      c.company_name.toLowerCase().includes(q) ||
      (c.representative_name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    )
  }

  // タブ判定（承認待ちは approval_status、他はステージ）
  function matchesTab(c: Company, tab: 'pending' | Stage | 'all'): boolean {
    if (tab === 'all') return true
    if (tab === 'pending') return c.approval_status === 'pending'
    return c.stage === tab
  }

  // タブ件数バッジ（検索を反映）
  const searchBase = companies.filter(matchesSearch)
  const tabCounts: Record<'pending' | Stage | 'all', number> = {
    pending: searchBase.filter((c) => c.approval_status === 'pending').length,
    '未着手': searchBase.filter((c) => c.stage === '未着手').length,
    '連携済み': searchBase.filter((c) => c.stage === '連携済み').length,
    '稼働中': searchBase.filter((c) => c.stage === '稼働中').length,
    all: searchBase.length,
  }

  // 検索は CustomerTable 側で適用するため、ここではタブ＋絞り込みのみ。
  const filteredCompanies = companies.filter((c) => {
    if (!matchesTab(c, stageTab)) return false
    if (priceRankFilter !== 'all' && c.price_rank !== priceRankFilter) return false
    if (activeFilter === 'active' && !c.is_active) return false
    if (activeFilter === 'inactive' && c.is_active) return false
    if (lineFilter === 'linked' && !(c.line_users && c.line_users.length > 0)) return false
    if (lineFilter === 'unlinked' && c.line_users && c.line_users.length > 0) return false
    if (addressFilter === 'has' && !c.postal_code && !c.address) return false
    if (addressFilter === 'missing' && (c.postal_code || c.address)) return false
    return true
  })

  // 絞り込み（価格帯/有効/LINE/住所）の適用中件数
  const activeFilterCount =
    (priceRankFilter !== 'all' ? 1 : 0) +
    (activeFilter !== 'all' ? 1 : 0) +
    (lineFilter !== 'all' ? 1 : 0) +
    (addressFilter !== 'all' ? 1 : 0)

  const CUSTOMER_TABS: { value: 'pending' | Stage | 'all'; label: string }[] = [
    { value: 'pending', label: '承認待ち' },
    { value: '未着手', label: '未着手' },
    { value: '連携済み', label: '連携済み' },
    { value: '稼働中', label: '稼働中' },
    { value: 'all', label: 'すべて' },
  ]

  function handleEdit(company: Company) {
    setEditingCompany(company)
    setFormData({ ...company })
    setOverrides([])
    setOverrideForm(initialOverrideForm)
    setEditingOverrideId(null)
    setOverrideError(null)
    fetchOverrides(company.id)
    setShowModal(true)
  }

  function handleAddNew() {
    setEditingCompany(null)
    setFormData(initialFormData)
    setOverrides([])
    setOverrideForm(initialOverrideForm)
    setEditingOverrideId(null)
    setOverrideError(null)
    setShowModal(true)
  }

  function handleLinkLine(company: Company) {
    setLinkingCompany(company)
    setLinkLineUserId('')
    setLinkDisplayName('')
    setLinkError(null)
  }

  async function handlePostalLookup(rawZip: string, prefix: '' | 'billing_') {
    const digits = rawZip
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[^0-9]/g, '')
    if (digits.length !== 7) return
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`)
      const json = (await res.json()) as {
        status: number
        results: { address1: string; address2: string; address3: string }[] | null
      }
      if (json.status !== 200 || !json.results) return
      const { address1, address2, address3 } = json.results[0]
      if (prefix === 'billing_') {
        setFormData((p) => ({ ...p, billing_prefecture: address1, billing_city: address2, billing_address: address3 }))
      } else {
        setFormData((p) => ({ ...p, prefecture: address1, city: address2, address: address3 }))
      }
    } catch (err) {
      console.error('郵便番号検索エラー:', err)
    }
  }

  async function handleSave() {
    if (!formData.company_name?.trim()) return
    // 親会社に自分自身は指定不可（DB側のCHECK制約とも整合。UIでも除外済みだが二重ガード）
    if (editingCompany && formData.parent_company_id === editingCompany.id) {
      setMessage({ type: 'error', text: '親会社に自分自身は指定できません' })
      setTimeout(() => setMessage(null), 3000)
      return
    }
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
        delivery_method: formData.delivery_method || 'yamato',
        notes: formData.notes || null,
        is_active: formData.is_active ?? true,
        has_separate_billing: formData.has_separate_billing ?? false,
        billing_name: formData.has_separate_billing ? (formData.billing_name || null) : null,
        billing_postal_code: formData.has_separate_billing
          ? (formData.billing_postal_code || null)
          : null,
        billing_prefecture: formData.has_separate_billing
          ? (formData.billing_prefecture || null)
          : null,
        billing_city: formData.has_separate_billing ? (formData.billing_city || null) : null,
        billing_address: formData.has_separate_billing ? (formData.billing_address || null) : null,
        billing_building: formData.has_separate_billing
          ? (formData.billing_building || null)
          : null,
        // 親会社（請求まとめ先）。空選択時は null。
        parent_company_id: formData.parent_company_id || null,
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

  async function handleApprove(company: Company) {
    setApprovingId(company.id)
    try {
      const res = await adminFetch(`/api/admin/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: 'approved' }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || '承認に失敗しました' })
      } else {
        setMessage({ type: 'success', text: `${company.company_name} を承認しました` })
        await fetchCompanies()
      }
    } catch {
      setMessage({ type: 'error', text: '通信エラーが発生しました' })
    } finally {
      setApprovingId(null)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  async function handleGenerateCode(company: Company) {
    setGeneratingCodeId(company.id)
    try {
      const res = await adminFetch('/api/admin/registration-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: company.id }),
      })
      const json = (await res.json()) as { code?: string; error?: string }
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || 'コード生成に失敗しました' })
      } else {
        setMessage({ type: 'success', text: `${company.company_name} の登録コードを生成しました: ${json.code}` })
        await fetchCompanies()
      }
    } catch {
      setMessage({ type: 'error', text: '通信エラーが発生しました' })
    } finally {
      setGeneratingCodeId(null)
      setTimeout(() => setMessage(null), 5000)
    }
  }

  async function handleChangePriceRank(company: Company, newRank: string) {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('companies')
        .update({ price_rank: newRank })
        .eq('id', company.id)
      if (error) throw error
      setCompanies((prev) =>
        prev.map((c) => (c.id === company.id ? { ...c, price_rank: newRank as Company['price_rank'] } : c))
      )
      setMessage({ type: 'success', text: '価格帯を変更しました' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error('価格帯変更エラー:', err)
      setMessage({ type: 'error', text: '価格帯の変更に失敗しました' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  async function handleLinkSubmit() {
    if (!linkingCompany) return
    setLinkError(null)

    const trimmed = linkLineUserId.trim()
    if (!LINE_USER_ID_RE.test(trimmed)) {
      setLinkError('LINE User ID の形式が不正です（U + 32桁小文字英数字）')
      return
    }

    setLinking(true)
    try {
      const res = await adminFetch('/api/admin/line-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: linkingCompany.id,
          line_user_id: trimmed,
          display_name: linkDisplayName.trim() || undefined,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setLinkError(json.error || 'エラーが発生しました')
        return
      }
      setMessage({ type: 'success', text: `${linkingCompany.company_name} に LINE を紐づけました` })
      setLinkingCompany(null)
      await fetchCompanies()
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setLinkError('通信エラーが発生しました')
    } finally {
      setLinking(false)
    }
  }

  function handleEditOverride(o: CompanyOverride) {
    setEditingOverrideId(o.id)
    setOverrideForm({
      scope_type: o.scope_type,
      product_id: o.product_id ?? '',
      category: o.category ?? '',
      pricing_tier_id: o.pricing_tier_id ?? '',
      min_cases: String(o.min_cases),
      unit_price: o.unit_price != null ? String(o.unit_price) : '',
      fixed_shipping_fee: o.fixed_shipping_fee != null ? String(o.fixed_shipping_fee) : '',
    })
    setOverrideError(null)
  }

  function handleCancelOverrideEdit() {
    setEditingOverrideId(null)
    setOverrideForm(initialOverrideForm)
    setOverrideError(null)
  }

  async function handleSaveOverride() {
    if (!editingCompany) return
    setOverrideError(null)

    if (overrideForm.scope_type === 'product' && !overrideForm.product_id) {
      setOverrideError('商品を選択してください')
      return
    }
    if (overrideForm.scope_type === 'category' && !overrideForm.category) {
      setOverrideError('カテゴリを選択してください')
      return
    }

    const payload = {
      scope_type: overrideForm.scope_type,
      product_id: overrideForm.scope_type === 'product' ? overrideForm.product_id : null,
      category: overrideForm.scope_type === 'category' ? overrideForm.category : null,
      pricing_tier_id: overrideForm.pricing_tier_id || null,
      min_cases: overrideForm.min_cases || '1',
      unit_price: overrideForm.unit_price,
      fixed_shipping_fee: overrideForm.fixed_shipping_fee,
    }

    setOverrideSaving(true)
    try {
      const url = editingOverrideId
        ? `/api/admin/companies/${editingCompany.id}/overrides/${editingOverrideId}`
        : `/api/admin/companies/${editingCompany.id}/overrides`
      const res = await adminFetch(url, {
        method: editingOverrideId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setOverrideError(json.error || '保存に失敗しました')
        return
      }
      setOverrideForm(initialOverrideForm)
      setEditingOverrideId(null)
      await fetchOverrides(editingCompany.id)
    } catch {
      setOverrideError('通信エラーが発生しました')
    } finally {
      setOverrideSaving(false)
    }
  }

  async function handleDeleteOverride(overrideId: string) {
    if (!editingCompany) return
    try {
      const res = await adminFetch(
        `/api/admin/companies/${editingCompany.id}/overrides/${overrideId}`,
        { method: 'DELETE' }
      )
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setOverrideError(json.error || '削除に失敗しました')
        return
      }
      if (editingOverrideId === overrideId) handleCancelOverrideEdit()
      await fetchOverrides(editingCompany.id)
    } catch {
      setOverrideError('通信エラーが発生しました')
    }
  }

  function overrideTargetLabel(o: CompanyOverride): string {
    if (o.scope_type === 'product') {
      return products.find((p) => p.id === o.product_id)?.name ?? '（不明な商品）'
    }
    return o.category ?? '（カテゴリ未設定）'
  }

  const overrideFormProduct = products.find((p) => p.id === overrideForm.product_id)
  // 数量段階は商品スコープでのみ指定（カテゴリスコープは品種横断のため入数問わず＝空）
  const overrideTierOptions = (overrideFormProduct?.pricing_tiers ?? []).filter((t) => t.is_active)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">顧客管理</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/customers/import"
            className="border border-green-600 text-green-600 hover:bg-green-50 font-medium px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            CSVインポート
          </Link>
          <button
            onClick={handleAddNew}
            className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            事前登録
          </button>
        </div>
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

      {/* 検索ボックス（最上部） */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="店名・担当者名・電話番号で検索"
          className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"
            aria-label="検索をクリア"
          >
            ✕
          </button>
        )}
      </div>

      {/* ステージタブ（横スクロールチップ・件数バッジ） */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
        {CUSTOMER_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStageTab(t.value)}
            className={`flex items-center gap-1.5 px-3 min-h-[44px] rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
              stageTab === t.value ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 rounded-full ${stageTab === t.value ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
              {tabCounts[t.value]}
            </span>
          </button>
        ))}
      </div>

      {/* 絞り込み（折りたたみ・デフォルト閉） */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="w-full px-4 py-3 min-h-[44px] flex items-center justify-between text-sm font-medium text-gray-700"
        >
          <span>絞り込み{activeFilterCount > 0 ? `（${activeFilterCount}）` : ''}</span>
          <svg className={`w-5 h-5 flex-shrink-0 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {filtersOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
            {/* 価格帯 */}
            <div className="flex flex-wrap gap-2">
              {PRICE_RANKS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setPriceRankFilter(r.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    priceRankFilter === r.value ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {/* 有効 / 無効 */}
            <div className="flex gap-2">
              {(['all', 'active', 'inactive'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeFilter === f ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f === 'all' ? 'すべて' : f === 'active' ? '有効のみ' : '無効のみ'}
                </button>
              ))}
            </div>
            {/* LINE 紐づけ */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium w-14">LINE</span>
              {LINE_FILTER_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setLineFilter(f.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    lineFilter === f.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* 住所 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium w-14">住所</span>
              {ADDRESS_FILTER_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setAddressFilter(f.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    addressFilter === f.value ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 顧客テーブル */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <CustomerTable
            customers={filteredCompanies}
            parentNameById={Object.fromEntries(companies.map((c) => [c.id, c.company_name]))}
            onEdit={handleEdit}
            onLinkLine={handleLinkLine}
            onApprove={handleApprove}
            onGenerateCode={handleGenerateCode}
            approvingId={approvingId}
            generatingCodeId={generatingCodeId}
            onChangePriceRank={handleChangePriceRank}
            search={search}
            onSearchChange={setSearch}
          />
        )}
      </div>

      {/* 編集モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingCompany ? '顧客を編集' : '顧客を事前登録'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
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
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, representative_name: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号</label>
                  <input
                    type="text"
                    value={formData.postal_code || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setFormData((p) => ({ ...p, postal_code: v }))
                      handlePostalLookup(v, '')
                    }}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  建物名・部屋番号
                </label>
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
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, price_rank: e.target.value as PriceRank }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="standard">既存取引先</option>
                    <option value="premium">新規取引先</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  placeholder="example@example.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  請求書のメール送信などに使用します。
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">発送方法</label>
                <select
                  value={formData.delivery_method || 'yamato'}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, delivery_method: e.target.value as DeliveryMethod }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  {DELIVERY_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  直接配達・来店引取りは送料一律¥0で計算されます。
                </p>
              </div>

              {/* 請求先トグル */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="has_separate_billing"
                    checked={formData.has_separate_billing ?? false}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, has_separate_billing: e.target.checked }))
                    }
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
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, billing_name: e.target.value }))
                      }
                      placeholder="請求先名"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={formData.billing_postal_code || ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setFormData((p) => ({ ...p, billing_postal_code: v }))
                          handlePostalLookup(v, 'billing_')
                        }}
                        placeholder="郵便番号"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                      <input
                        type="text"
                        value={formData.billing_prefecture || ''}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, billing_prefecture: e.target.value }))
                        }
                        placeholder="都道府県"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                    <input
                      type="text"
                      value={formData.billing_city || ''}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, billing_city: e.target.value }))
                      }
                      placeholder="市区町村"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <input
                      type="text"
                      value={formData.billing_address || ''}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, billing_address: e.target.value }))
                      }
                      placeholder="住所"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <input
                      type="text"
                      value={formData.billing_building || ''}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, billing_building: e.target.value }))
                      }
                      placeholder="建物名"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                )}
              </div>

              {/* 親会社（請求まとめ先） */}
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  親会社（請求まとめ先）
                </label>
                <select
                  value={formData.parent_company_id || ''}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, parent_company_id: e.target.value || null }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  <option value="">（なし＝この会社単位で請求）</option>
                  {companies
                    .filter((c) => c.id !== editingCompany?.id)
                    .slice()
                    .sort((a, b) => a.company_name.localeCompare(b.company_name, 'ja'))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  この店舗の請求を別の親会社にまとめる場合に選択します。「なし」なら従来どおりこの会社単位で請求します。
                </p>
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

              {/* 個別単価・送料特例（既存取引先のみ） */}
              {editingCompany && (
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <h3 className="text-sm font-bold text-gray-900">個別単価・送料特例</h3>

                  {/* 一覧 */}
                  {overridesLoading ? (
                    <p className="text-xs text-gray-400">読み込み中...</p>
                  ) : overrides.length === 0 ? (
                    <p className="text-xs text-gray-400">登録された特例はありません。</p>
                  ) : (
                    <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                      {overrides.map((o) => (
                        <div key={o.id} className="flex items-start gap-2 p-2.5 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900">
                              {o.scope_type === 'product' ? '商品' : 'カテゴリ'}：{overrideTargetLabel(o)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {o.min_cases}ケース以上
                              {o.pricing_tier_id ? '・入数指定あり' : ''}
                              {o.unit_price != null ? `・単価¥${o.unit_price.toLocaleString()}` : ''}
                              {o.fixed_shipping_fee != null ? `・固定送料¥${o.fixed_shipping_fee.toLocaleString()}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEditOverride(o)}
                            className="text-xs text-blue-600 hover:text-blue-700 shrink-0"
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOverride(o.id)}
                            className="text-xs text-red-500 hover:text-red-600 shrink-0"
                          >
                            削除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 追加・編集フォーム */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-600">
                      {editingOverrideId ? '特例を編集' : '特例を追加'}
                    </p>

                    <div className="flex gap-2">
                      {(['product', 'category'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setOverrideForm((p) => ({
                              ...p,
                              scope_type: s,
                              product_id: '',
                              category: '',
                              pricing_tier_id: '',
                            }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            overrideForm.scope_type === s
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          {s === 'product' ? '商品単位' : 'カテゴリ単位'}
                        </button>
                      ))}
                    </div>

                    {overrideForm.scope_type === 'product' ? (
                      <select
                        value={overrideForm.product_id}
                        onChange={(e) =>
                          setOverrideForm((p) => ({ ...p, product_id: e.target.value, pricing_tier_id: '' }))
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      >
                        <option value="">商品を選択...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={overrideForm.category}
                        onChange={(e) => setOverrideForm((p) => ({ ...p, category: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      >
                        <option value="">カテゴリを選択...</option>
                        {OVERRIDE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}

                    {overrideForm.scope_type === 'product' && overrideTierOptions.length > 0 && (
                      <select
                        value={overrideForm.pricing_tier_id}
                        onChange={(e) => setOverrideForm((p) => ({ ...p, pricing_tier_id: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      >
                        <option value="">入数：指定なし（全段階対象）</option>
                        {overrideTierOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.tier_label}（{t.quantity}本）
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">最小ケース数</label>
                        <input
                          type="number"
                          min={1}
                          value={overrideForm.min_cases}
                          onChange={(e) => setOverrideForm((p) => ({ ...p, min_cases: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">個別単価</label>
                        <input
                          type="number"
                          value={overrideForm.unit_price}
                          onChange={(e) => setOverrideForm((p) => ({ ...p, unit_price: e.target.value }))}
                          placeholder="通常価格"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">固定送料</label>
                        <input
                          type="number"
                          value={overrideForm.fixed_shipping_fee}
                          onChange={(e) =>
                            setOverrideForm((p) => ({ ...p, fixed_shipping_fee: e.target.value }))
                          }
                          placeholder="通常計算"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                      </div>
                    </div>

                    {overrideError && <p className="text-xs text-red-600">{overrideError}</p>}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveOverride}
                        disabled={overrideSaving}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs disabled:opacity-50 transition-colors"
                      >
                        {overrideSaving ? '保存中...' : editingOverrideId ? '更新' : '追加'}
                      </button>
                      {editingOverrideId && (
                        <button
                          type="button"
                          onClick={handleCancelOverrideEdit}
                          className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-1.5 rounded-lg text-xs transition-colors"
                        >
                          キャンセル
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
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

      {/* LINE 紐づけモーダル */}
      {linkingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setLinkingCompany(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">LINE User ID 紐づけ</h2>
              <button
                onClick={() => setLinkingCompany(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{linkingCompany.company_name}</span>{' '}
                に紐づける LINE User ID を入力してください。
              </p>

              {linkingCompany.line_users && linkingCompany.line_users.length > 0 && (
                <div className="bg-yellow-50 rounded-lg px-3 py-2 text-sm text-yellow-700">
                  この会社にはすでに {linkingCompany.line_users.length} 名の担当者が登録されています。
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  LINE User ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={linkLineUserId}
                  onChange={(e) => {
                    setLinkLineUserId(e.target.value)
                    setLinkError(null)
                  }}
                  placeholder="U0000000000000000000000000000000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  取引先の /not-registered 画面に表示される ID（U + 32桁）
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  担当者名（任意）
                </label>
                <input
                  type="text"
                  value={linkDisplayName}
                  onChange={(e) => setLinkDisplayName(e.target.value)}
                  placeholder="山田 太郎"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {linkError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{linkError}</p>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={handleLinkSubmit}
                disabled={linking || !linkLineUserId.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {linking ? '紐づけ中...' : '紐づける'}
              </button>
              <button
                onClick={() => setLinkingCompany(null)}
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
