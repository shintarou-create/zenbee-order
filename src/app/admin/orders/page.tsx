'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { adminFetch } from '@/lib/admin-fetch'
import OrderTable from '@/components/admin/OrderTable'
import PendingProductsSummary from '@/components/admin/PendingProductsSummary'
import type { Order } from '@/types'
import { formatCurrency, formatDateForInput } from '@/lib/utils'

const PAGE_SIZE = 50

type TabKey = 'unconfirmed' | 'preparing' | 'shipped' | 'done' | 'all'
const TAB_ORDER: TabKey[] = ['unconfirmed', 'preparing', 'shipped', 'done', 'all']
const TAB_LABELS: Record<TabKey, string> = {
  unconfirmed: '未確認',
  preparing: '出荷準備',
  shipped: '出荷済',
  done: '完了',
  all: 'すべて',
}

interface DeleteModalProps {
  orders: Order[]
  onConfirm: () => Promise<void>
  onCancel: () => void
  isDeleting: boolean
  errorMsg: string | null
}

function DeleteConfirmModal({ orders, onConfirm, onCancel, isDeleting, errorMsg }: DeleteModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        if (isDeleting) return
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Escape') {
        if (isDeleting) return
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onConfirm, onCancel, isDeleting])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">注文の完全削除</h2>
          <p className="text-sm text-gray-500 mt-1">
            この {orders.length} 件を完全に削除します。元に戻せません。よろしいですか？
          </p>
        </div>

        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
          {orders.map((order) => (
            <div key={order.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div>
                <span className="text-sm font-medium text-gray-900">{order.order_number}</span>
                <span className="text-sm text-gray-500 ml-2">{order.company?.company_name ?? '—'}</span>
              </div>
              <span className="text-sm font-medium text-gray-700 flex-shrink-0">
                {formatCurrency(order.total_amount)}
              </span>
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</div>
        )}

        <div className="p-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isDeleting && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            削除する
          </button>
        </div>
      </div>
    </div>
  )
}

function AdminOrdersContent() {
  const searchParams = useSearchParams()

  // URL パラメータ → 初期タブ（?tab 優先、無ければ旧 ?status を互換解釈）
  function initialTab(): TabKey {
    const tabP = searchParams.get('tab')
    if (tabP && (TAB_ORDER as string[]).includes(tabP)) return tabP as TabKey
    const st = searchParams.get('status')
    if (st === 'pending') return 'preparing'
    if (st === 'shipped') return 'shipped'
    if (st === 'done') return 'done'
    if (st === 'all') return 'all'
    return 'unconfirmed'
  }

  const [orders, setOrders] = useState<Order[]>([])
  const [counts, setCounts] = useState<Record<TabKey, number>>({
    unconfirmed: 0, preparing: 0, shipped: 0, done: 0, all: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('to') || '')
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '')
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // ヤマトCSVの発送日。初期値=今日。選択操作では自動上書きせず、変えたいときだけ手動変更する。
  const [shipDate, setShipDate] = useState(formatDateForInput(new Date()))
  const [csvExporting, setCsvExporting] = useState(false)
  const [markingShipped, setMarkingShipped] = useState(false)
  const [markingConfirmed, setMarkingConfirmed] = useState(false)
  const [markingDone, setMarkingDone] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  // 検索のデバウンス（300ms）
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    fetchOrders(0)
    fetchCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dateFrom, dateTo, search])

  // タブ・日付・検索フィルタをクエリに適用（返り値は変更後のクエリ）
  function applyTabAndFilters<T extends { gte: (...a: unknown[]) => T; lte: (...a: unknown[]) => T; ilike: (...a: unknown[]) => T; eq: (...a: unknown[]) => T; neq: (...a: unknown[]) => T; or: (...a: unknown[]) => T }>(q: T, tab: TabKey): T {
    if (dateFrom) q = q.gte('delivery_date', dateFrom)
    if (dateTo) q = q.lte('delivery_date', dateTo)
    if (search.trim()) q = q.ilike('company.company_name', `%${search.trim()}%`)
    switch (tab) {
      case 'unconfirmed':
        return q.eq('status', 'pending').or('details_confirmed.is.null,details_confirmed.eq.false')
      case 'preparing':
        return q.eq('status', 'pending').eq('details_confirmed', true)
      case 'shipped':
        return q.eq('status', 'shipped')
      case 'done':
        return q.eq('status', 'done')
      case 'all':
        return q.neq('status', 'cancelled')
    }
  }

  async function fetchOrders(fromOffset: number) {
    const isReset = fromOffset === 0
    if (isReset) setIsLoading(true)
    else setIsLoadingMore(true)
    try {
      const supabase = createClient()
      const companyEmbed = search.trim()
        ? 'company:companies!inner(company_name, representative_name, has_separate_billing)'
        : 'company:companies(company_name, representative_name, has_separate_billing)'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('orders')
        .select(`*, ${companyEmbed}, order_items (*), order_shipping (*)`)
        .order('delivery_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      query = applyTabAndFilters(query, activeTab)

      const { data, error } = await query.range(fromOffset, fromOffset + PAGE_SIZE - 1)
      if (error) throw error

      const newData = (data || []) as Order[]
      if (isReset) {
        setOrders(newData)
        setSelectedIds([])
      } else {
        setOrders((prev) => [...prev, ...newData])
      }
      setNextOffset(fromOffset + PAGE_SIZE)
      setHasMore(newData.length === PAGE_SIZE)
    } catch (err) {
      console.error('注文取得エラー:', err)
    } finally {
      if (isReset) setIsLoading(false)
      else setIsLoadingMore(false)
    }
  }

  async function fetchCounts() {
    try {
      const supabase = createClient()
      const countSelect = search.trim() ? 'id, company:companies!inner(company_name)' : 'id'
      const results = await Promise.all(
        TAB_ORDER.map(async (t) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = supabase.from('orders').select(countSelect, { count: 'exact', head: true })
          q = applyTabAndFilters(q, t)
          const { count } = await q
          return [t, count ?? 0] as const
        })
      )
      setCounts(Object.fromEntries(results) as Record<TabKey, number>)
    } catch (err) {
      console.error('件数取得エラー:', err)
    }
  }

  async function refresh() {
    await Promise.all([fetchOrders(0), fetchCounts()])
  }

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  function changeTab(tab: TabKey) {
    setShowMoreMenu(false)
    setSelectedIds([])
    setActiveTab(tab)
  }

  async function handleUndoDeliveryNotePrinted(orderId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('orders').update({ delivery_note_printed: false }).eq('id', orderId)
    if (error) throw error
    await refresh()
  }

  async function handleUndoShipped(orderId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('orders').update({ status: 'pending' }).eq('id', orderId)
    if (error) throw error
    await refresh()
  }

  async function handleUnmarkLabel(orderId: string) {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('orders').update({ shipping_label_printed: false }).eq('id', orderId)
      if (error) throw error
      await refresh()
    } catch (err) {
      console.error('伝票済み解除エラー:', err)
      showMsg('error', '伝票済みの解除に失敗しました')
    }
  }

  async function handleMarkConfirmed() {
    if (selectedIds.length === 0) return
    if (!window.confirm(`選択した${selectedIds.length}件を確認済みにします。よろしいですか？`)) return
    setMarkingConfirmed(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('orders').update({ details_confirmed: true }).in('id', selectedIds)
      if (error) throw error
      showMsg('success', `${selectedIds.length}件を確認済みにしました`)
      setSelectedIds([])
      await refresh()
    } catch (err) {
      console.error('確認済み更新エラー:', err)
      showMsg('error', '確認済みの更新に失敗しました')
    } finally {
      setMarkingConfirmed(false)
    }
  }

  async function handleMarkDone() {
    if (selectedIds.length === 0) return
    if (!window.confirm(`選択した${selectedIds.length}件を完了にします。よろしいですか？`)) return
    setMarkingDone(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('orders').update({ status: 'done' }).in('id', selectedIds)
      if (error) throw error
      showMsg('success', `${selectedIds.length}件を完了にしました`)
      setSelectedIds([])
      await refresh()
    } catch (err) {
      console.error('完了更新エラー:', err)
      showMsg('error', '完了の更新に失敗しました')
    } finally {
      setMarkingDone(false)
    }
  }

  async function handleYamatoCSV() {
    if (selectedIds.length === 0) return
    setCsvExporting(true)
    try {
      const response = await adminFetch('/api/shipping-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedIds, shipDate }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'CSV生成に失敗しました')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `yamato_b2_${shipDate.replace(/-/g, '')}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      showMsg('success', `${selectedIds.length}件のヤマトCSVを出力しました（伝票印刷済みにマーク）`)
      setSelectedIds([])
      await refresh()
    } catch (err) {
      console.error('CSV出力エラー:', err)
      showMsg('error', err instanceof Error ? err.message : 'CSV出力に失敗しました')
    } finally {
      setCsvExporting(false)
    }
  }

  async function handleMarkShipped() {
    if (selectedIds.length === 0) return
    if (!window.confirm(`選択した${selectedIds.length}件を出荷済みにします。よろしいですか？`)) return
    setMarkingShipped(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('orders').update({ status: 'shipped' }).in('id', selectedIds)
      if (error) throw error
      showMsg('success', `${selectedIds.length}件を出荷済みにしました`)
      setSelectedIds([])
      await refresh()
    } catch (err) {
      console.error('出荷済み更新エラー:', err)
      showMsg('error', '出荷済みの更新に失敗しました')
    } finally {
      setMarkingShipped(false)
    }
  }

  async function handleDeleteConfirm() {
    if (selectedIds.length === 0) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await adminFetch('/api/admin/orders/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedIds }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '削除に失敗しました')
      setShowDeleteModal(false)
      setSelectedIds([])
      showMsg('success', `${json.deletedCount}件を削除しました`)
      await refresh()
    } catch (err) {
      console.error('削除エラー:', err)
      setDeleteError(err instanceof Error ? err.message : '削除に失敗しました')
    } finally {
      setIsDeleting(false)
    }
  }

  const selectedOrders = orders.filter((o) => selectedIds.includes(o.id))
  const busy = csvExporting || markingShipped || markingConfirmed || markingDone

  const detailQuery = new URLSearchParams()
  detailQuery.set('tab', activeTab)
  if (dateFrom) detailQuery.set('from', dateFrom)
  if (dateTo) detailQuery.set('to', dateTo)
  if (search.trim()) detailQuery.set('q', search.trim())
  const detailLinkSuffix = `?${detailQuery.toString()}`

  // 出荷準備タブで期間内に未確認がある場合の注意バナー
  const showUnconfirmedBanner =
    activeTab === 'preparing' && (!!dateFrom || !!dateTo) && counts.unconfirmed > 0

  return (
    <div className="space-y-4" style={{ paddingBottom: selectedIds.length > 0 ? '140px' : undefined }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">注文管理</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{orders.length}件表示中</span>
          <Link
            href="/admin/orders/new"
            className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            手動で注文を入力
          </Link>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* 工程タブ（横スクロール可能なチップ列） */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            onClick={() => changeTab(t)}
            className={`flex items-center gap-1.5 px-3 min-h-[44px] rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === t ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {TAB_LABELS[t]}
            <span className={`text-xs px-1.5 rounded-full ${activeTab === t ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* 取引先名検索 */}
      <div className="relative">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="取引先名で検索"
          className="w-full border border-gray-200 rounded-lg pl-3 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600"
            aria-label="検索をクリア"
          >
            ✕
          </button>
        )}
      </div>

      {/* 納品日フィルター */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">納品日:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <span className="text-gray-400">〜</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-sm text-gray-500 hover:text-gray-700">
              クリア
            </button>
          )}
        </div>
      </div>

      {/* 未確認バナー（出荷準備タブで期間内に未確認がある場合） */}
      {showUnconfirmedBanner && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-2 flex-wrap">
          <span>この期間に未確認の注文が {counts.unconfirmed}件 あります</span>
          <button onClick={() => changeTab('unconfirmed')} className="font-bold underline whitespace-nowrap">
            未確認タブで見る →
          </button>
        </div>
      )}

      {/* 注文テーブル */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <OrderTable
            orders={orders}
            showCheckbox={true}
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
            onUnmarkLabel={handleUnmarkLabel}
            onUndoDeliveryNotePrinted={handleUndoDeliveryNotePrinted}
            onUndoShipped={handleUndoShipped}
            detailLinkSuffix={detailLinkSuffix}
            groupByDeliveryDate={true}
          />
        )}
      </div>

      {/* 完了タブの補足（工程の意味） */}
      {!isLoading && activeTab === 'done' && (
        <p className="text-xs text-gray-400 px-1">
          「完了」は請求書を発行した注文です。請求書を発行した注文はここに移動します。
        </p>
      )}

      {/* もっと見るボタン */}
      {!isLoading && hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchOrders(nextOffset)}
            disabled={isLoadingMore}
            className="flex items-center gap-2 px-6 py-2.5 min-h-[44px] text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isLoadingMore && (
              <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            )}
            {isLoadingMore ? '読み込み中...' : 'もっと見る'}
          </button>
        </div>
      )}

      {/* 未発送商品合計（未確認・出荷準備タブのみ表示） */}
      {(activeTab === 'unconfirmed' || activeTab === 'preparing') && (
        <PendingProductsSummary dateFrom={dateFrom} dateTo={dateTo} />
      )}

      {/* 削除確認モーダル */}
      {showDeleteModal && (
        <DeleteConfirmModal
          orders={selectedOrders}
          onConfirm={handleDeleteConfirm}
          onCancel={() => { if (!isDeleting) setShowDeleteModal(false) }}
          isDeleting={isDeleting}
          errorMsg={deleteError}
        />
      )}

      {/* 画面下固定の一括アクションバー */}
      {selectedIds.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="px-3 py-2 space-y-2">
            {/* 1段目: 件数 + 選択解除 + … */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">{selectedIds.length}件選択</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds([])}
                  className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] px-2"
                >
                  選択解除
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowMoreMenu((v) => !v)}
                    className="min-h-[44px] min-w-[44px] px-3 rounded-lg border border-gray-200 text-gray-600 font-bold"
                    aria-label="その他"
                  >
                    …
                  </button>
                  {showMoreMenu && (
                    <div className="absolute right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      <button
                        onClick={() => { setShowMoreMenu(false); setDeleteError(null); setShowDeleteModal(true) }}
                        className="block w-full text-left px-4 py-3 text-sm text-red-600 font-medium whitespace-nowrap hover:bg-red-50"
                      >
                        選択した注文を削除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2段目: タブ別 主アクション */}
            {activeTab === 'unconfirmed' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleMarkConfirmed}
                  disabled={busy}
                  className="flex-1 min-h-[44px] rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold disabled:opacity-50 transition-colors"
                >
                  {markingConfirmed ? '更新中...' : `${selectedIds.length}件を確認済みにする`}
                </button>
              </div>
            )}

            {activeTab === 'preparing' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => window.open(`/admin/orders/bulk-print?ids=${selectedIds.join(',')}`, '_blank')}
                  disabled={busy}
                  className="min-h-[44px] px-3 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-bold disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  納品書
                </button>
                <button
                  onClick={handleMarkShipped}
                  disabled={busy}
                  className="min-h-[44px] px-3 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-bold disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {markingShipped ? '更新中...' : '出荷済'}
                </button>
                <div className="flex items-center gap-1.5 basis-full">
                  <input
                    type="date"
                    value={shipDate}
                    onChange={(e) => setShipDate(e.target.value)}
                    title="前日に印刷する場合は、この発送日を実際に発送する日に設定してください"
                    className="border border-orange-300 rounded-lg px-2 py-1.5 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                  />
                  <button
                    onClick={handleYamatoCSV}
                    disabled={busy}
                    className="flex-1 min-h-[44px] px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {csvExporting ? 'CSV生成中...' : 'ヤマトCSV'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'shipped' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleMarkDone}
                  disabled={busy}
                  className="flex-1 min-h-[44px] rounded-lg bg-gray-900 hover:bg-black text-white text-sm font-bold disabled:opacity-50 transition-colors"
                >
                  {markingDone ? '更新中...' : `${selectedIds.length}件を完了にする`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AdminOrdersContent />
    </Suspense>
  )
}
