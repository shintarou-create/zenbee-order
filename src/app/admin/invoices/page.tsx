'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Invoice, Order } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { adminFetch } from '@/lib/admin-fetch'

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [downloadingCsv, setDownloadingCsv] = useState(false)
  const [gmailDraftingId, setGmailDraftingId] = useState<string | null>(null)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 月選択（デフォルト: 先月）
  const now = new Date()
  const defaultMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [selectedMonth, setSelectedMonth] = useState(
    `${defaultMonth.getFullYear()}-${String(defaultMonth.getMonth() + 1).padStart(2, '0')}`
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    fetchInvoices()
  }, [selectedMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchInvoices() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          company:companies (company_name, email, has_separate_billing, billing_name),
          invoice_items (id, order_id, amount)
        `)
        .eq('billing_month', selectedMonth)
        .order('created_at', { ascending: false })

      if (error) throw error
      setInvoices((data || []) as Invoice[])
    } catch (err) {
      console.error('請求書取得エラー:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleGenerateInvoices() {
    setGenerating(true)
    try {
      const supabase = createClient()

      // 対象月の発送済み注文を取得。
      // 月判定は「納品日(delivery_date)ベース」が正。手入力注文は shipping_date が
      // 入らない（NULL）ため、delivery_date があればそれ、無ければ shipping_date に
      // フォールバックして判定する。Supabase の gte/lte では NULL 側が漏れるため、
      // ステータスのみで取得し月範囲はクライアント側でフィルタする（月数十件規模）。
      const [year, month] = selectedMonth.split('-').map(Number)

      const { data: allOrders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies (*)
        `)
        .in('status', ['shipped', 'done'])

      if (ordersError) throw ordersError

      // 請求月判定日 = delivery_date ?? shipping_date。その年月が selectedMonth と一致する注文のみ。
      const orders = (allOrders || []).filter((o) => {
        const basis = (o.delivery_date ?? o.shipping_date) as string | null
        if (!basis) return false
        return basis.slice(0, 7) === selectedMonth
      })

      if (orders.length === 0) {
        setMessage({ type: 'error', text: '対象月に発送済みの注文がありません' })
        setTimeout(() => setMessage(null), 3000)
        return
      }

      // 請求先会社ごとにグループ化
      // 請求先会社ID = 親会社があれば親会社ID、無ければ自社ID（company が取れない場合も自社IDにフォールバック）
      const companyOrders: Record<string, Order[]> = {}
      for (const order of orders) {
        const billingCompanyId = (order as Order).company?.parent_company_id ?? order.company_id
        if (!companyOrders[billingCompanyId]) {
          companyOrders[billingCompanyId] = []
        }
        companyOrders[billingCompanyId].push(order as Order)
      }

      // 請求書を作成
      let created = 0
      for (const [billingCompanyId, compOrders] of Object.entries(companyOrders)) {
        // 既に請求書があるか確認
        const { data: existing } = await supabase
          .from('invoices')
          .select('id')
          .eq('company_id', billingCompanyId)
          .eq('billing_month', selectedMonth)
          .single()

        if (existing) continue // スキップ

        const totalAmount = compOrders.reduce((sum, o) => sum + o.total_amount, 0)
        const taxRate = 0.08
        const taxAmount = Math.floor(totalAmount - totalAmount / (1 + taxRate))

        // 請求番号生成
        const invoiceNumber = `INV-${selectedMonth.replace('-', '')}-${String(created + 1).padStart(3, '0')}`

        // 支払期限: billing_month の翌月末日（例: 2026-06 → 2026-07-31）。
        // new Date(year, month + 1, 0) = 翌月(month+1, 1-indexed)の0日目 = 翌月末日。
        // toISOString は UTC 変換で日付がずれるためローカルで手動フォーマットする。
        const dueDate = new Date(year, month + 1, 0)
        const dueDateStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`

        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invoiceNumber,
            company_id: billingCompanyId,
            billing_month: selectedMonth,
            total_amount: totalAmount,
            tax_amount: taxAmount,
            status: 'draft',
            due_date: dueDateStr,
          })
          .select()
          .single()

        if (invoiceError || !invoice) continue

        // 請求明細を作成
        const { error: itemsError } = await supabase.from('invoice_items').insert(
          compOrders.map((order) => ({
            invoice_id: invoice.id,
            order_id: order.id,
            amount: order.total_amount,
          }))
        )
        if (itemsError) throw itemsError

        created++
      }

      setMessage({ type: 'success', text: `${created}件の請求書を生成しました` })
      await fetchInvoices()
    } catch (err) {
      console.error('請求書生成エラー:', err)
      setMessage({ type: 'error', text: '請求書の生成に失敗しました' })
    } finally {
      setGenerating(false)
      setTimeout(() => setMessage(null), 5000)
    }
  }

  async function handleUpdateStatus(invoiceId: string, newStatus: string) {
    try {
      const supabase = createClient()
      await supabase
        .from('invoices')
        .update({
          status: newStatus,
          paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
        })
        .eq('id', invoiceId)

      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                status: newStatus as Invoice['status'],
                paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
              }
            : inv
        )
      )
    } catch (err) {
      console.error('ステータス更新エラー:', err)
    }
  }

  async function handleUpdateDueDate(invoiceId: string, newDueDate: string) {
    try {
      const supabase = createClient()
      await supabase
        .from('invoices')
        .update({ due_date: newDueDate || null })
        .eq('id', invoiceId)

      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId ? { ...inv, due_date: newDueDate || null } : inv
        )
      )
    } catch (err) {
      console.error('支払期限更新エラー:', err)
    }
  }

  // 請求書を新しいタブで開く（HTML印刷ページ）
  function openInvoicePrint(invoiceId: string) {
    window.open(`/admin/invoices/print?invoiceId=${invoiceId}`, '_blank')
  }

  // 1社分のGmail下書きを作成する共通処理。成功可否とエラー文言を返す。
  // 成功時はローカルstateの gmail_draft_created_at を即時反映（バッジが緑になる）。
  async function createGmailDraftFor(invoice: Invoice): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await adminFetch(`/api/admin/invoices/${invoice.id}/gmail-draft`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, error: json.error || `HTTP ${res.status}` }
      }
      const createdAt = json.gmailDraftCreatedAt || new Date().toISOString()
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoice.id ? { ...inv, gmail_draft_created_at: createdAt } : inv
        )
      )
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // 単体：Gmail下書きを作成（サーバーでPDF生成→Gmail APIで下書き作成・PDF添付）
  async function handleCreateGmailDraft(invoice: Invoice) {
    setGmailDraftingId(invoice.id)
    setMessage({ type: 'success', text: 'PDFを作成しています（初回は準備に30秒ほどかかります）…' })
    const r = await createGmailDraftFor(invoice)
    if (!r.ok) {
      setMessage({ type: 'error', text: r.error || 'Gmail下書きの作成に失敗しました' })
      setTimeout(() => setMessage(null), 12000)
    } else {
      setMessage({
        type: 'success',
        text: 'Gmailの下書きを作成しました。Gmailを開いて送信してください（下記リンク）。',
      })
      setTimeout(() => setMessage(null), 10000)
    }
    setGmailDraftingId(null)
  }

  // 一括：メール登録あり かつ 未作成の請求書を1社ずつ直列で処理（並列禁止）。
  async function handleBulkGmailDraft() {
    const targets = invoices.filter((inv) => {
      const c = inv.company as { email?: string | null } | undefined
      return !!c?.email && !inv.gmail_draft_created_at
    })
    if (targets.length === 0) return
    if (!window.confirm(`${targets.length}社分のGmail下書きを作成します。よろしいですか？`)) return

    setBulkRunning(true)
    const failures: { name: string; error: string }[] = []
    let success = 0
    try {
      for (let i = 0; i < targets.length; i++) {
        const invoice = targets[i]
        setMessage({
          type: 'success',
          text: `Gmail下書きを作成中… ${i + 1} / ${targets.length} 社（初回は準備に30秒ほどかかります）`,
        })
        const r = await createGmailDraftFor(invoice)
        if (r.ok) {
          success++
        } else {
          failures.push({ name: getCompanyView(invoice).displayName, error: r.error || '不明なエラー' })
        }
      }
      const failText =
        failures.length > 0
          ? '（' + failures.map((f) => `${f.name}: ${f.error}`).join(' / ') + '）'
          : '。Gmailの下書きを確認してください。'
      setMessage({
        type: failures.length > 0 ? 'error' : 'success',
        text: `完了：成功${success}社／失敗${failures.length}社${failText}`,
      })
      setTimeout(() => setMessage(null), 15000)
    } finally {
      setBulkRunning(false)
    }
  }

  async function handleDownloadFreeeCsv() {
    setDownloadingCsv(true)
    try {
      const res = await adminFetch('/api/freee-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingMonth: selectedMonth }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        setMessage({ type: 'error', text: error || 'CSV生成に失敗しました' })
        setTimeout(() => setMessage(null), 5000)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `freee_${selectedMonth.replace('-', '')}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('freee CSV ダウンロードエラー:', err)
      setMessage({ type: 'error', text: 'CSV生成に失敗しました' })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setDownloadingCsv(false)
    }
  }

  // 請求先会社の表示情報。has_separate_billing かつ billing_name があれば billing_name を主表示、
  // company_name を「店舗名」として添える。
  function getCompanyView(invoice: Invoice) {
    const c = invoice.company as
      | { company_name?: string; email?: string | null; has_separate_billing?: boolean | null; billing_name?: string | null }
      | undefined
    const useBilling = !!(c?.has_separate_billing && c?.billing_name)
    const displayName = useBilling ? c!.billing_name! : c?.company_name ?? '（会社名未設定）'
    const storeName = useBilling ? c?.company_name ?? '' : ''
    return { email: c?.email ?? null, displayName, storeName }
  }

  // ISO日時 → 日本時間「M/D HH:mm」
  function formatDraftBadge(ts: string): string {
    const jst = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const hh = String(jst.getHours()).padStart(2, '0')
    const mi = String(jst.getMinutes()).padStart(2, '0')
    return `${jst.getMonth() + 1}/${jst.getDate()} ${hh}:${mi}`
  }

  // 一括対象（メール登録あり かつ 未作成）
  const bulkTargetCount = invoices.filter((inv) => {
    const c = inv.company as { email?: string | null } | undefined
    return !!c?.email && !inv.gmail_draft_created_at
  }).length

  // メール未登録の請求書（警告バナー用）
  const noEmailNames = invoices
    .filter((inv) => {
      const c = inv.company as { email?: string | null } | undefined
      return !c?.email
    })
    .map((inv) => getCompanyView(inv).displayName)

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-600',
      sent: 'bg-blue-100 text-blue-700',
      paid: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700',
    }
    return colors[status] || 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">請求管理</h1>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
          {message.type === 'success' && message.text.includes('Gmail') && (
            <>
              {' '}
              <a
                href="https://mail.google.com/mail/u/0/#drafts"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-bold text-green-800 hover:text-green-900"
              >
                Gmailの下書きを開く
              </a>
            </>
          )}
        </div>
      )}

      {/* 月選択と生成ボタン */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">請求月</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
          <button
            onClick={handleGenerateInvoices}
            disabled={generating}
            className="bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {generating ? '生成中...' : '請求書を生成'}
          </button>
          <button
            onClick={handleDownloadFreeeCsv}
            disabled={downloadingCsv || invoices.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {downloadingCsv ? 'ダウンロード中...' : 'freee CSV'}
          </button>
          <button
            onClick={handleBulkGmailDraft}
            disabled={bulkRunning || gmailDraftingId !== null || bulkTargetCount === 0}
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {bulkRunning ? '作成中...' : `全社まとめてGmail下書き作成${bulkTargetCount > 0 ? `（${bulkTargetCount}社）` : ''}`}
          </button>
        </div>
      </div>

      {/* メール未登録の事前警告バナー */}
      {noEmailNames.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-bold">メール未登録の取引先が{noEmailNames.length}社あります：</span>
          {noEmailNames.join('、')}
        </div>
      )}

      {/* 請求書一覧 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{selectedMonth} の請求書</h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            対象月の請求書がありません
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {invoices.map((invoice) => {
              const { email, displayName, storeName } = getCompanyView(invoice)
              const hasEmail = !!email
              const busy = gmailDraftingId !== null || bulkRunning
              return (
                <div key={invoice.id} className="px-4 py-4 flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {/* 会社名（主役） */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-lg font-semibold text-gray-900 truncate">{displayName}</p>
                      {storeName && <span className="text-xs text-gray-400">（店舗名: {storeName}）</span>}
                    </div>
                    {/* 請求書番号・支払期限（小さくグレー・1行） */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-400">
                      <span>{invoice.invoice_number}</span>
                      <span className="text-gray-300">/</span>
                      <span className="flex items-center gap-1">
                        支払期限
                        <input
                          type="date"
                          value={invoice.due_date ?? ''}
                          onChange={(e) => handleUpdateDueDate(invoice.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-green-400"
                        />
                      </span>
                    </div>
                    {/* 状態バッジ */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {invoice.gmail_draft_created_at ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          下書き作成済み {formatDraftBadge(invoice.gmail_draft_created_at)}
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          未作成
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-green-700 text-lg">{formatCurrency(invoice.total_amount)}</p>
                    <p className="text-xs text-gray-400">税額: {formatCurrency(invoice.tax_amount)}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={invoice.status}
                      onChange={(e) => handleUpdateStatus(invoice.id, e.target.value)}
                      className={`text-xs font-bold px-2 py-1 rounded-full border-none cursor-pointer ${getStatusColor(invoice.status)}`}
                    >
                      <option value="draft">下書き</option>
                      <option value="sent">送付済み</option>
                      <option value="paid">入金確認済み</option>
                      <option value="overdue">未払い</option>
                    </select>
                    {invoice.status === 'draft' && (
                      <button
                        onClick={() => handleUpdateStatus(invoice.id, 'sent')}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                      >
                        送信済みにする
                      </button>
                    )}
                  </div>

                  {/* 操作ボタン（請求書を開く・Gmail下書き） */}
                  <div className="flex items-center gap-2 w-full justify-end">
                    <button
                      onClick={() => openInvoicePrint(invoice.id)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                    >
                      請求書を開く
                    </button>
                    {hasEmail ? (
                      <button
                        onClick={() => handleCreateGmailDraft(invoice)}
                        disabled={busy}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 disabled:opacity-50 transition-colors"
                      >
                        {gmailDraftingId === invoice.id ? '作成中...' : 'Gmail下書きを作成'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">メール未登録</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 合計サマリー */}
      {invoices.length > 0 && (
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-green-800">{selectedMonth} 請求合計</span>
            <span className="font-bold text-green-700">
              {formatCurrency(invoices.reduce((sum, inv) => sum + inv.total_amount, 0))}
            </span>
          </div>
          <div className="flex justify-between text-xs text-green-600 mt-1">
            <span>{invoices.length}件の請求書</span>
            <span>
              入金済み: {formatCurrency(
                invoices
                  .filter((inv) => inv.status === 'paid')
                  .reduce((sum, inv) => sum + inv.total_amount, 0)
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
