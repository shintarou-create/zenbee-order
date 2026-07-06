'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Invoice, Order } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { adminFetch } from '@/lib/admin-fetch'

type TabKey = 'all' | 'draft' | 'sent' | 'paid'

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [downloadingCsv, setDownloadingCsv] = useState(false)
  const [gmailDraftingId, setGmailDraftingId] = useState<string | null>(null)
  const [pdfDownloadingId, setPdfDownloadingId] = useState<string | null>(null)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkStatusRunning, setBulkStatusRunning] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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
      setSelectedIds(new Set())
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

  // ステータス訂正（プルダウン）。paid_at 規則は一括APIと統一:
  //   → 'paid': paid_at が null なら now()、既にあれば維持。
  //   → 'paid' 以外: paid_at を null に戻す。
  async function handleUpdateStatus(invoiceId: string, newStatus: string) {
    const current = invoices.find((i) => i.id === invoiceId)
    const newPaidAt = newStatus === 'paid' ? current?.paid_at ?? new Date().toISOString() : null
    try {
      const supabase = createClient()
      await supabase
        .from('invoices')
        .update({ status: newStatus, paid_at: newPaidAt })
        .eq('id', invoiceId)

      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, status: newStatus as Invoice['status'], paid_at: newPaidAt }
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

  // PDFを保存（郵送用）。fetch→blob→<a download>、失敗時は window.open フォールバック。
  async function handleDownloadPdf(invoice: Invoice) {
    setPdfDownloadingId(invoice.id)
    setMessage({ type: 'success', text: 'PDF作成中…（初回は準備に30秒ほどかかります）' })
    try {
      const res = await adminFetch(`/api/admin/invoices/${invoice.id}/pdf`, { method: 'POST' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setMessage({ type: 'error', text: json.error || 'PDF生成に失敗しました' })
        setTimeout(() => setMessage(null), 12000)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const c = invoice.company as { company_name?: string } | undefined
      const fileCompany = c?.company_name || getCompanyView(invoice).displayName
      const filename = `請求書_${fileCompany}_${invoice.billing_month}.pdf`
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } catch {
        // ダウンロード発火に失敗する環境向けフォールバック
        window.open(url, '_blank')
      }
      setMessage({ type: 'success', text: 'PDFを保存しました' })
      setTimeout(() => setMessage(null), 4000)
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (err) {
      setMessage({ type: 'error', text: `PDF生成に失敗: ${err instanceof Error ? err.message : String(err)}` })
      setTimeout(() => setMessage(null), 12000)
    } finally {
      setPdfDownloadingId(null)
    }
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

  // 一括：選択中のうち メール登録あり を1社ずつ直列で処理（並列禁止）。
  // 下書き作成済みが含まれる場合は内訳を confirm で提示し、OK なら再作成する。
  // メール未登録は従来どおり対象外（除外＋警告）。
  async function handleBulkGmailDraft() {
    const sel = invoices.filter((inv) => selectedIds.has(inv.id))
    const hasEmail = (inv: Invoice) => {
      const c = inv.company as { email?: string | null } | undefined
      return !!c?.email
    }
    // メール登録あり = 作成対象（未作成・作成済みの両方）。メール未登録は対象外。
    const targets = sel.filter(hasEmail)
    const noEmailN = sel.length - targets.length
    const alreadyCreatedN = targets.filter((inv) => inv.gmail_draft_created_at).length

    if (targets.length === 0) {
      setMessage({ type: 'error', text: '対象がありません（メール登録ありの取引先のみ作成できます）' })
      setTimeout(() => setMessage(null), 5000)
      return
    }

    if (alreadyCreatedN > 0) {
      // 作成済みが混ざる場合：再作成の内訳を提示
      const confirmText =
        `選択中 ${targets.length}件のうち ${alreadyCreatedN}件は下書き作成済みです。\n` +
        `再作成すると新しい下書きが追加されます（Gmailに残っている古い下書きは自動削除されません。不要なら手動で削除してください）。\n` +
        (noEmailN > 0 ? `メール未登録の ${noEmailN}件 は対象外です。\n` : '') +
        `続行しますか？`
      if (!window.confirm(confirmText)) return
    } else {
      // 全て未作成：従来どおりの確認フロー
      if (
        !window.confirm(
          `${targets.length}社分のGmail下書きを作成します。よろしいですか？` +
            (noEmailN > 0 ? `\n（対象${targets.length}件・スキップ${noEmailN}件：メール未登録）` : '')
        )
      )
        return
    }

    setBulkRunning(true)
    const failures: { name: string; error: string }[] = []
    let success = 0
    try {
      for (let i = 0; i < targets.length; i++) {
        setMessage({
          type: 'success',
          text: `Gmail下書きを作成中… ${i + 1} / ${targets.length} 社（初回は準備に30秒ほどかかります）`,
        })
        const r = await createGmailDraftFor(targets[i])
        if (r.ok) success++
        else failures.push({ name: getCompanyView(targets[i]).displayName, error: r.error || '不明なエラー' })
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
      setSelectedIds(new Set())
    } finally {
      setBulkRunning(false)
    }
  }

  // 一括：ステータス更新（送信済み / 入金済み）。選択中の全idを送り、サーバー側で条件再検証。
  async function handleBulkStatus(status: 'sent' | 'paid') {
    const sel = invoices.filter((inv) => selectedIds.has(inv.id))
    if (sel.length === 0) return
    const isTarget = status === 'sent' ? (i: Invoice) => i.status === 'draft' : (i: Invoice) => i.status !== 'paid'
    const targets = sel.filter(isTarget)
    const skipN = sel.length - targets.length
    const label = status === 'sent' ? '送信済み' : '入金済み'
    const skipReason = status === 'sent' ? '既に送信済み/入金済みのため' : '既に入金済みのため'

    if (targets.length === 0) {
      setMessage({
        type: 'error',
        text: status === 'sent' ? '対象がありません（未送信のみ送信済みにできます）' : '対象がありません（入金済み以外が対象です）',
      })
      setTimeout(() => setMessage(null), 5000)
      return
    }
    if (
      !window.confirm(
        `${targets.length}件を${label}にします。よろしいですか？` +
          (skipN > 0 ? `\n（対象${targets.length}件・スキップ${skipN}件：${skipReason}）` : '')
      )
    )
      return

    setBulkStatusRunning(true)
    try {
      const res = await adminFetch('/api/admin/invoices/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: sel.map((s) => s.id), status }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || '一括更新に失敗しました' })
        setTimeout(() => setMessage(null), 10000)
        return
      }
      const updated = (json.updated as string[] | undefined)?.length ?? 0
      const skipped = (json.skipped as unknown[] | undefined)?.length ?? 0
      setMessage({
        type: 'success',
        text: `${updated}件更新しました${skipped > 0 ? `。${skipped}件スキップ（${skipReason}）` : ''}`,
      })
      setTimeout(() => setMessage(null), 8000)
      await fetchInvoices()
    } catch (err) {
      setMessage({ type: 'error', text: `一括更新に失敗: ${err instanceof Error ? err.message : String(err)}` })
      setTimeout(() => setMessage(null), 10000)
    } finally {
      setBulkStatusRunning(false)
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

  // ISO日時 → 日本時間「M/D」
  function formatPaidBadge(ts: string): string {
    const jst = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    return `${jst.getMonth() + 1}/${jst.getDate()}`
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllTab() {
    const ids = invoices.filter((inv) => activeTab === 'all' || inv.status === activeTab).map((i) => i.id)
    setSelectedIds((prev) => {
      const allSel = ids.length > 0 && ids.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSel) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  function changeTab(tab: TabKey) {
    setActiveTab(tab)
    setSelectedIds(new Set())
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-600',
      sent: 'bg-blue-100 text-blue-700',
      paid: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700',
    }
    return colors[status] || 'bg-gray-100 text-gray-600'
  }
  const statusLabel = (status: string) =>
    ({ draft: '未送信', sent: '送信済み', paid: '入金済み', overdue: '未払い' } as Record<string, string>)[status] || status

  // 派生値
  const tabInvoices = invoices.filter((inv) => activeTab === 'all' || inv.status === activeTab)
  const tabCounts = {
    all: invoices.length,
    draft: invoices.filter((i) => i.status === 'draft').length,
    sent: invoices.filter((i) => i.status === 'sent').length,
    paid: invoices.filter((i) => i.status === 'paid').length,
  }
  const unpaidList = invoices.filter((i) => i.status !== 'paid')
  const paidList = invoices.filter((i) => i.status === 'paid')
  const unpaidSum = unpaidList.reduce((s, i) => s + i.total_amount, 0)
  const paidSum = paidList.reduce((s, i) => s + i.total_amount, 0)

  const noEmailNames = invoices
    .filter((inv) => {
      const c = inv.company as { email?: string | null } | undefined
      return !c?.email
    })
    .map((inv) => getCompanyView(inv).displayName)

  const selectedCount = selectedIds.size
  const allTabSelected = tabInvoices.length > 0 && tabInvoices.every((i) => selectedIds.has(i.id))
  const anyBusy = bulkRunning || bulkStatusRunning || gmailDraftingId !== null || pdfDownloadingId !== null
  const todayStr = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD（ローカル）

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'all', label: 'すべて', count: tabCounts.all },
    { key: 'draft', label: '未送信', count: tabCounts.draft },
    { key: 'sent', label: '送信済み', count: tabCounts.sent },
    { key: 'paid', label: '入金済み', count: tabCounts.paid },
  ]

  return (
    <div className="space-y-4" style={{ paddingBottom: selectedCount > 0 ? '96px' : undefined }}>
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
        </div>
      </div>

      {/* 上部サマリー（未入金 / 入金済み） */}
      {invoices.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">
            {selectedMonth} 合計 ¥{(unpaidSum + paidSum).toLocaleString('ja-JP')}（{invoices.length}件）
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
              <p className="text-xs font-medium text-amber-700">未入金</p>
              <p className="text-lg font-bold text-amber-800 mt-1">¥{unpaidSum.toLocaleString('ja-JP')}</p>
              <p className="text-xs text-gray-400">{unpaidList.length}件</p>
            </div>
            <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4">
              <p className="text-xs font-medium text-green-700">入金済み</p>
              <p className="text-lg font-bold text-green-800 mt-1">¥{paidSum.toLocaleString('ja-JP')}</p>
              <p className="text-xs text-gray-400">{paidList.length}件</p>
            </div>
          </div>
        </div>
      )}

      {/* メール未登録の事前警告バナー */}
      {noEmailNames.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-bold">メール未登録の取引先が{noEmailNames.length}社あります：</span>
          {noEmailNames.join('、')}
        </div>
      )}

      {/* ステータスタブ */}
      <div className="flex gap-1.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => changeTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === t.key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 rounded-full ${activeTab === t.key ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* 請求書一覧 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tabInvoices.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            {invoices.length === 0 ? '対象月の請求書がありません' : 'このタブの請求書はありません'}
          </div>
        ) : (
          <>
            {/* このタブをすべて選択 */}
            <label className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 cursor-pointer bg-gray-50">
              <input
                type="checkbox"
                checked={allTabSelected}
                onChange={toggleSelectAllTab}
                className="w-5 h-5 accent-green-600"
              />
              <span className="text-xs font-medium text-gray-600">このタブの{tabInvoices.length}社をすべて選択</span>
            </label>

            <div className="divide-y divide-gray-100">
              {tabInvoices.map((invoice) => {
                const { email, displayName, storeName } = getCompanyView(invoice)
                const hasEmail = !!email
                const isOverdue = !!invoice.due_date && invoice.status !== 'paid' && invoice.due_date < todayStr
                const checked = selectedIds.has(invoice.id)
                return (
                  <div key={invoice.id} className="flex items-start gap-1 px-2 py-3">
                    {/* チェックボックス（タップ領域44px以上） */}
                    <label className="flex items-center justify-center min-w-[44px] min-h-[44px] cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(invoice.id)}
                        className="w-5 h-5 accent-green-600"
                      />
                    </label>

                    <div className="flex-1 min-w-0 pr-2">
                      {/* 1段目: 会社名（左） / 金額（右・大） */}
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-base font-semibold text-gray-900">{displayName}</span>
                          {storeName && <span className="ml-1 text-xs text-gray-400">（店舗名: {storeName}）</span>}
                        </div>
                        <span className="font-bold text-gray-900 text-lg flex-shrink-0">{formatCurrency(invoice.total_amount)}</span>
                      </div>

                      {/* 2段目: 請求書番号・支払期限（超過は赤字） */}
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                        <span>{invoice.invoice_number}</span>
                        <span className="text-gray-300">/</span>
                        <span className="flex items-center gap-1">
                          <span className={isOverdue ? 'text-red-600 font-bold' : ''}>支払期限</span>
                          <input
                            type="date"
                            value={invoice.due_date ?? ''}
                            onChange={(e) => handleUpdateDueDate(invoice.id, e.target.value)}
                            className={`text-xs border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-green-400 ${
                              isOverdue ? 'border-red-300 text-red-600' : 'border-gray-200 text-gray-600'
                            }`}
                          />
                          {isOverdue && <span className="text-red-600 font-bold">超過</span>}
                        </span>
                      </div>

                      {/* バッジ行 */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getStatusColor(invoice.status)}`}>
                          {statusLabel(invoice.status)}
                        </span>
                        {activeTab !== 'paid' &&
                          (invoice.gmail_draft_created_at ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              下書き作成済み {formatDraftBadge(invoice.gmail_draft_created_at)}
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">未作成</span>
                          ))}
                        {!hasEmail && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">メール未登録</span>
                        )}
                        {invoice.paid_at && (
                          <span className="text-xs text-gray-400">入金 {formatPaidBadge(invoice.paid_at)}</span>
                        )}
                      </div>

                      {/* 行アクション */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <button
                          onClick={() => openInvoicePrint(invoice.id)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                        >
                          請求書を開く
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(invoice)}
                          disabled={pdfDownloadingId === invoice.id}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 transition-colors"
                        >
                          {pdfDownloadingId === invoice.id ? 'PDF作成中...' : 'PDF保存'}
                        </button>
                        {hasEmail && !invoice.gmail_draft_created_at && (
                          <button
                            onClick={() => handleCreateGmailDraft(invoice)}
                            disabled={anyBusy}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 disabled:opacity-50 transition-colors"
                          >
                            {gmailDraftingId === invoice.id ? '作成中...' : 'Gmail下書き作成'}
                          </button>
                        )}
                        {/* 訂正用ステータスプルダウン */}
                        <select
                          value={invoice.status}
                          onChange={(e) => handleUpdateStatus(invoice.id, e.target.value)}
                          className={`text-xs font-bold px-2 py-1 rounded-full border-none cursor-pointer ${getStatusColor(invoice.status)}`}
                        >
                          <option value="draft">未送信</option>
                          <option value="sent">送信済み</option>
                          <option value="paid">入金済み</option>
                          <option value="overdue">未払い</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* 一括アクションバー（選択1件以上で固定表示） */}
      {selectedCount > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gray-900">{selectedCount}件選択</span>
            <div className="flex items-center gap-2 flex-wrap ml-auto">
              <button
                onClick={handleBulkGmailDraft}
                disabled={anyBusy}
                className="text-sm font-bold px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
              >
                {bulkRunning ? '作成中...' : '下書き作成'}
              </button>
              <button
                onClick={() => handleBulkStatus('sent')}
                disabled={anyBusy}
                className="text-sm font-bold px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
              >
                {bulkStatusRunning ? '更新中...' : '送信済み'}
              </button>
              <button
                onClick={() => handleBulkStatus('paid')}
                disabled={anyBusy}
                className="text-sm font-bold px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors"
              >
                {bulkStatusRunning ? '更新中...' : '入金済み'}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                disabled={anyBusy}
                className="text-sm font-medium px-3 py-2 rounded-lg text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                選択解除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
