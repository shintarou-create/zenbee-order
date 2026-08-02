'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Invoice, Order, Company } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { adminFetch } from '@/lib/admin-fetch'

type TabKey = 'all' | 'draft' | 'sent'

// 請求管理から編集できる顧客情報フォーム項目（顧客管理の編集フォームと同じフルセット）
const initialCompanyFormData: Partial<Company> = {
  company_name: '',
  representative_name: '',
  postal_code: '',
  prefecture: '',
  city: '',
  address: '',
  building: '',
  phone: '',
  email: '',
  notes: '',
  has_separate_billing: false,
  billing_name: '',
  billing_postal_code: '',
  billing_prefecture: '',
  billing_city: '',
  billing_address: '',
  billing_building: '',
}

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

  // 顧客情報の編集（請求先会社 = invoice.company_id）
  const [showCompanyModal, setShowCompanyModal] = useState(false)
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null)
  const [companyFormData, setCompanyFormData] = useState<Partial<Company>>(initialCompanyFormData)
  const [companyLoading, setCompanyLoading] = useState(false)
  const [companySaving, setCompanySaving] = useState(false)

  // 請求書の削除（確認モーダル）
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState(false)

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
          company:companies (company_name, email, has_separate_billing, billing_name, invoice_delivery_method),
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
      // 今回新規作成した請求書に紐づく注文ID（ループ後に一括で done に更新する）
      const completedOrderIds: string[] = []
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

        // このグループの注文は請求書発行済み → 後で done にする
        completedOrderIds.push(...compOrders.map((o) => o.id))
        created++
      }

      // 新規作成した請求書に紐づく注文を一括で「完了(done)」に更新する。
      // 出荷済=未請求 / 完了=請求書発行済み、という工程の再定義に対応。
      // .update() はゼロ行マッチや RLS で沈黙失敗するため error を必ず確認する。
      let completeFailed = false
      if (completedOrderIds.length > 0) {
        const { error: completeError } = await supabase
          .from('orders')
          .update({ status: 'done' })
          .in('id', completedOrderIds)
        if (completeError) {
          console.error('注文の完了更新エラー:', completeError)
          completeFailed = true
        }
      }

      if (completeFailed) {
        // 請求書生成自体は成功として扱い、ロールバックはしない。
        setMessage({
          type: 'error',
          text: `${created}件の請求書を生成しましたが、対象注文の完了更新に失敗しました（注文管理で手動で完了にしてください）`,
        })
      } else {
        setMessage({
          type: 'success',
          text: `${created}件の請求書を生成し、対象の注文${completedOrderIds.length}件を完了にしました`,
        })
      }
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

  // 顧客情報編集モーダルを開く。編集対象は「その請求書の請求先会社」=invoice.company_id
  // （請求書生成時に親会社まとめの場合は親会社IDが入っているため、既存のグルーピングと整合する）。
  async function handleEditCompany(invoice: Invoice) {
    setEditingCompanyId(invoice.company_id)
    setCompanyFormData(initialCompanyFormData)
    setShowCompanyModal(true)
    setCompanyLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', invoice.company_id)
        .single()
      if (error) throw error
      setCompanyFormData(data as Partial<Company>)
    } catch (err) {
      console.error('顧客情報取得エラー:', err)
      setMessage({ type: 'error', text: '顧客情報の取得に失敗しました' })
      setTimeout(() => setMessage(null), 5000)
      setShowCompanyModal(false)
    } finally {
      setCompanyLoading(false)
    }
  }

  // 郵便番号→住所自動補完（zipcloud）。顧客管理画面と同じロジック。
  async function handleCompanyPostalLookup(rawZip: string, prefix: '' | 'billing_') {
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
        setCompanyFormData((p) => ({ ...p, billing_prefecture: address1, billing_city: address2, billing_address: address3 }))
      } else {
        setCompanyFormData((p) => ({ ...p, prefecture: address1, city: address2, address: address3 }))
      }
    } catch (err) {
      console.error('郵便番号検索エラー:', err)
    }
  }

  // 顧客情報を保存（companies を直接 .update()。顧客管理の handleSave と同じパターンのため、
  // 顧客管理側にも自動反映される）。保存後は請求一覧を再フェッチして最新化する。
  async function handleSaveCompany() {
    if (!editingCompanyId || !companyFormData.company_name?.trim()) return
    setCompanySaving(true)
    try {
      const supabase = createClient()
      const companyData = {
        company_name: companyFormData.company_name,
        representative_name: companyFormData.representative_name || null,
        postal_code: companyFormData.postal_code || null,
        prefecture: companyFormData.prefecture || null,
        city: companyFormData.city || null,
        address: companyFormData.address || null,
        building: companyFormData.building || null,
        phone: companyFormData.phone || null,
        email: companyFormData.email || null,
        notes: companyFormData.notes || null,
        has_separate_billing: companyFormData.has_separate_billing ?? false,
        billing_name: companyFormData.has_separate_billing ? (companyFormData.billing_name || null) : null,
        billing_postal_code: companyFormData.has_separate_billing
          ? (companyFormData.billing_postal_code || null)
          : null,
        billing_prefecture: companyFormData.has_separate_billing
          ? (companyFormData.billing_prefecture || null)
          : null,
        billing_city: companyFormData.has_separate_billing ? (companyFormData.billing_city || null) : null,
        billing_address: companyFormData.has_separate_billing ? (companyFormData.billing_address || null) : null,
        billing_building: companyFormData.has_separate_billing
          ? (companyFormData.billing_building || null)
          : null,
      }

      const { error } = await supabase.from('companies').update(companyData).eq('id', editingCompanyId)
      if (error) throw error

      setMessage({ type: 'success', text: '顧客情報を更新しました' })
      setShowCompanyModal(false)
      await fetchInvoices()
    } catch (err) {
      console.error('顧客情報保存エラー:', err)
      setMessage({ type: 'error', text: '顧客情報の保存に失敗しました' })
    } finally {
      setCompanySaving(false)
      setTimeout(() => setMessage(null), 4000)
    }
  }

  // 請求書を削除する。紐づく注文は「出荷済（未請求）」に戻る（サーバー側で処理）。
  async function handleDeleteInvoice() {
    if (!deletingInvoice) return
    setDeleting(true)
    try {
      const res = await adminFetch(`/api/admin/invoices/${deletingInvoice.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || '請求書の削除に失敗しました' })
        setTimeout(() => setMessage(null), 8000)
        return
      }
      setMessage({ type: 'success', text: '請求書を削除しました。対象の注文は出荷済（未請求）に戻りました。' })
      setTimeout(() => setMessage(null), 6000)
      setDeletingInvoice(null)
      await fetchInvoices()
    } catch (err) {
      console.error('請求書削除エラー:', err)
      setMessage({ type: 'error', text: '通信エラーが発生しました' })
      setTimeout(() => setMessage(null), 8000)
    } finally {
      setDeleting(false)
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

  // 一括：選択中のうち「メール送付 かつ メール登録あり」を1社ずつ直列で処理（並列禁止）。
  // 郵送・その他（メール以外の送付）、およびメール未登録はスキップし、内訳を confirm に提示する。
  // 下書き作成済みが含まれる場合は再作成の内訳も提示し、OK なら再作成する。
  async function handleBulkGmailDraft() {
    const sel = invoices.filter((inv) => selectedIds.has(inv.id))
    // 作成対象 = メール送付 かつ メールあり（未作成・作成済みの両方）。
    const targets = sel.filter((inv) => {
      const { email, deliveryMethod } = getCompanyView(inv)
      return deliveryMethod === 'email' && !!email
    })
    // スキップ内訳: 郵送・その他（送付方法がメール以外）／メール未登録（メール送付だがメール無し）
    const nonEmailMethodN = sel.filter((inv) => getCompanyView(inv).deliveryMethod !== 'email').length
    const noEmailN = sel.filter((inv) => {
      const { email, deliveryMethod } = getCompanyView(inv)
      return deliveryMethod === 'email' && !email
    }).length
    const skipParts: string[] = []
    if (nonEmailMethodN > 0) skipParts.push(`郵送・メール以外の送付のため${nonEmailMethodN}件`)
    if (noEmailN > 0) skipParts.push(`メール未登録のため${noEmailN}件`)
    const skipText = skipParts.length > 0 ? `${skipParts.join('、')}をスキップします。` : ''
    const alreadyCreatedN = targets.filter((inv) => inv.gmail_draft_created_at).length

    if (targets.length === 0) {
      setMessage({ type: 'error', text: '対象がありません（メール送付でメール登録ありの取引先のみ作成できます）' })
      setTimeout(() => setMessage(null), 5000)
      return
    }

    if (alreadyCreatedN > 0) {
      // 作成済みが混ざる場合：再作成の内訳を提示
      const confirmText =
        `選択中 ${targets.length}件のうち ${alreadyCreatedN}件は下書き作成済みです。\n` +
        `再作成すると新しい下書きが追加されます（Gmailに残っている古い下書きは自動削除されません。不要なら手動で削除してください）。\n` +
        (skipText ? `${skipText}\n` : '') +
        `続行しますか？`
      if (!window.confirm(confirmText)) return
    } else {
      // 全て未作成：確認フロー
      if (
        !window.confirm(
          `${targets.length}社分のGmail下書きを作成します。よろしいですか？` +
            (skipText ? `\n（${skipText}）` : '')
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

  // 一括：送信済みにする。選択中の全idを送り、サーバー側で条件再検証（未送信のみ更新）。
  // 入金工程は freee 側で完結する運用のため、当画面からは撤去済み。
  async function handleBulkStatus(status: 'sent') {
    const sel = invoices.filter((inv) => selectedIds.has(inv.id))
    if (sel.length === 0) return
    const targets = sel.filter((i) => i.status === 'draft')
    const skipN = sel.length - targets.length
    const skipReason = '既に送信済みのため'

    if (targets.length === 0) {
      setMessage({ type: 'error', text: '対象がありません（未送信のみ送信済みにできます）' })
      setTimeout(() => setMessage(null), 5000)
      return
    }
    if (
      !window.confirm(
        `${targets.length}件を送信済みにします。よろしいですか？` +
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
      | {
          company_name?: string
          email?: string | null
          has_separate_billing?: boolean | null
          billing_name?: string | null
          invoice_delivery_method?: 'email' | 'postal' | 'other' | null
        }
      | undefined
    const useBilling = !!(c?.has_separate_billing && c?.billing_name)
    const displayName = useBilling ? c!.billing_name! : c?.company_name ?? '（会社名未設定）'
    const storeName = useBilling ? c?.company_name ?? '' : ''
    const deliveryMethod = c?.invoice_delivery_method ?? 'email'
    return { email: c?.email ?? null, displayName, storeName, deliveryMethod }
  }

  // ISO日時 → 日本時間「M/D HH:mm」
  function formatDraftBadge(ts: string): string {
    const jst = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const hh = String(jst.getHours()).padStart(2, '0')
    const mi = String(jst.getMinutes()).padStart(2, '0')
    return `${jst.getMonth() + 1}/${jst.getDate()} ${hh}:${mi}`
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
      paid: 'bg-green-100 text-green-700', // 既存の入金済みデータ表示用（新規設定は不可）
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
  }
  // 請求合計（選択中の請求月・全件）
  const totalSum = invoices.reduce((s, i) => s + i.total_amount, 0)

  // メール送付の取引先でメール未登録の請求のみ警告対象（郵送・その他は対象外）
  const noEmailNames = invoices
    .filter((inv) => {
      const { email, deliveryMethod } = getCompanyView(inv)
      return deliveryMethod === 'email' && !email
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

      {/* 上部サマリー（請求合計 1カード） */}
      {invoices.length > 0 && (
        <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4">
          <p className="text-xs font-medium text-green-700">{selectedMonth} 請求合計</p>
          <p className="text-2xl font-bold text-green-800 mt-1">{formatCurrency(totalSum)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{invoices.length}件</p>
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
                const { email, displayName, storeName, deliveryMethod } = getCompanyView(invoice)
                const hasEmail = !!email
                const isEmailMethod = deliveryMethod === 'email'
                const canGmail = isEmailMethod && hasEmail
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
                        {isEmailMethod ? (
                          invoice.gmail_draft_created_at ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              下書き作成済み {formatDraftBadge(invoice.gmail_draft_created_at)}
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">未作成</span>
                          )
                        ) : deliveryMethod === 'postal' ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">郵送</span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">メール以外の送付</span>
                        )}
                        {isEmailMethod && !hasEmail && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">メール未登録</span>
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
                        {canGmail && !invoice.gmail_draft_created_at && (
                          <button
                            onClick={() => handleCreateGmailDraft(invoice)}
                            disabled={anyBusy}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 disabled:opacity-50 transition-colors"
                          >
                            {gmailDraftingId === invoice.id ? '作成中...' : 'Gmail下書き作成'}
                          </button>
                        )}
                        <button
                          onClick={() => handleEditCompany(invoice)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                        >
                          顧客情報を編集
                        </button>
                        {/* 訂正用ステータスプルダウン（工程は未送信⇔送信済み。入金工程は freee 側で完結のため撤去）。
                            既存の入金済み/未払いデータは表示崩れ防止のため、その行に限り「（過去の状態）」として表示する。 */}
                        <select
                          value={invoice.status}
                          onChange={(e) => handleUpdateStatus(invoice.id, e.target.value)}
                          className={`text-xs font-bold px-2 py-1 rounded-full border-none cursor-pointer ${getStatusColor(invoice.status)}`}
                        >
                          <option value="draft">未送信</option>
                          <option value="sent">送信済み</option>
                          {(invoice.status === 'paid' || invoice.status === 'overdue') && (
                            <option value={invoice.status}>{statusLabel(invoice.status)}（過去の状態）</option>
                          )}
                        </select>
                        {/* 削除は誤操作防止のため控えめな配置（末尾・地味な文字リンク）＋確認モーダル必須 */}
                        <button
                          onClick={() => setDeletingInvoice(invoice)}
                          className="ml-auto text-xs text-gray-400 hover:text-red-600 transition-colors"
                        >
                          削除
                        </button>
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

      {/* 顧客情報 編集モーダル（編集対象＝その請求書の請求先会社。companies を直接更新するため顧客管理側にも反映される） */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCompanyModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">顧客情報を編集</h2>
              <button onClick={() => setShowCompanyModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {companyLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      店名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={companyFormData.company_name || ''}
                      onChange={(e) => setCompanyFormData((p) => ({ ...p, company_name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">担当者名</label>
                    <input
                      type="text"
                      value={companyFormData.representative_name || ''}
                      onChange={(e) => setCompanyFormData((p) => ({ ...p, representative_name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号</label>
                      <input
                        type="text"
                        value={companyFormData.postal_code || ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setCompanyFormData((p) => ({ ...p, postal_code: v }))
                          handleCompanyPostalLookup(v, '')
                        }}
                        placeholder="000-0000"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">都道府県</label>
                      <input
                        type="text"
                        value={companyFormData.prefecture || ''}
                        onChange={(e) => setCompanyFormData((p) => ({ ...p, prefecture: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">市区町村</label>
                    <input
                      type="text"
                      value={companyFormData.city || ''}
                      onChange={(e) => setCompanyFormData((p) => ({ ...p, city: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
                    <input
                      type="text"
                      value={companyFormData.address || ''}
                      onChange={(e) => setCompanyFormData((p) => ({ ...p, address: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">建物名・部屋番号</label>
                    <input
                      type="text"
                      value={companyFormData.building || ''}
                      onChange={(e) => setCompanyFormData((p) => ({ ...p, building: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                      <input
                        type="tel"
                        value={companyFormData.phone || ''}
                        onChange={(e) => setCompanyFormData((p) => ({ ...p, phone: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                      <input
                        type="email"
                        value={companyFormData.email || ''}
                        onChange={(e) => setCompanyFormData((p) => ({ ...p, email: e.target.value }))}
                        placeholder="example@example.com"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                  </div>

                  {/* 請求先トグル */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        id="inv_has_separate_billing"
                        checked={companyFormData.has_separate_billing ?? false}
                        onChange={(e) => setCompanyFormData((p) => ({ ...p, has_separate_billing: e.target.checked }))}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <label htmlFor="inv_has_separate_billing" className="text-sm font-medium text-gray-700">
                        請求先が納品先と異なる
                      </label>
                    </div>

                    {companyFormData.has_separate_billing && (
                      <div className="ml-6 space-y-2 border-l-2 border-green-200 pl-3">
                        <input
                          type="text"
                          value={companyFormData.billing_name || ''}
                          onChange={(e) => setCompanyFormData((p) => ({ ...p, billing_name: e.target.value }))}
                          placeholder="請求先名"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={companyFormData.billing_postal_code || ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setCompanyFormData((p) => ({ ...p, billing_postal_code: v }))
                              handleCompanyPostalLookup(v, 'billing_')
                            }}
                            placeholder="郵便番号"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                          />
                          <input
                            type="text"
                            value={companyFormData.billing_prefecture || ''}
                            onChange={(e) => setCompanyFormData((p) => ({ ...p, billing_prefecture: e.target.value }))}
                            placeholder="都道府県"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                          />
                        </div>
                        <input
                          type="text"
                          value={companyFormData.billing_city || ''}
                          onChange={(e) => setCompanyFormData((p) => ({ ...p, billing_city: e.target.value }))}
                          placeholder="市区町村"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <input
                          type="text"
                          value={companyFormData.billing_address || ''}
                          onChange={(e) => setCompanyFormData((p) => ({ ...p, billing_address: e.target.value }))}
                          placeholder="住所"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <input
                          type="text"
                          value={companyFormData.billing_building || ''}
                          onChange={(e) => setCompanyFormData((p) => ({ ...p, billing_building: e.target.value }))}
                          placeholder="建物名"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
                    <textarea
                      value={companyFormData.notes || ''}
                      onChange={(e) => setCompanyFormData((p) => ({ ...p, notes: e.target.value }))}
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                    />
                  </div>
                </div>

                <div className="p-4 border-t border-gray-100 flex gap-3">
                  <button
                    onClick={handleSaveCompany}
                    disabled={companySaving || !companyFormData.company_name?.trim()}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
                  >
                    {companySaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={() => setShowCompanyModal(false)}
                    className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-6 py-2 rounded-lg text-sm transition-colors"
                  >
                    キャンセル
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 請求書削除の確認モーダル */}
      {deletingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !deleting && setDeletingInvoice(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">請求書を削除しますか？</h2>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <p className="font-bold text-gray-900">{getCompanyView(deletingInvoice).displayName}</p>
                <p className="text-gray-500 text-xs mt-0.5">{deletingInvoice.invoice_number}</p>
                <p className="text-gray-900 font-bold mt-1">{formatCurrency(deletingInvoice.total_amount)}</p>
              </div>
              <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                この請求書を削除します。紐づく注文は「出荷済（未請求）」に戻ります。元に戻せません。
              </p>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={handleDeleteInvoice}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {deleting ? '削除中...' : '削除する'}
              </button>
              <button
                onClick={() => setDeletingInvoice(null)}
                disabled={deleting}
                className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-6 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
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
