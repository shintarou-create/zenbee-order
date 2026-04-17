'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Invoice, Order } from '@/types'
import { formatDate, formatCurrency } from '@/lib/utils'

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [downloadingCsv, setDownloadingCsv] = useState(false)
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
          company:companies (company_name),
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

      // 対象月の発送済み注文を取得
      const [year, month] = selectedMonth.split('-').map(Number)
      const monthStart = new Date(year, month - 1, 1).toISOString()
      const monthEnd = new Date(year, month, 0, 23, 59, 59).toISOString()

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies (*)
        `)
        .in('status', ['shipped', 'done'])
        .gte('shipping_date', monthStart.split('T')[0])
        .lte('shipping_date', monthEnd.split('T')[0])

      if (ordersError) throw ordersError

      if (!orders || orders.length === 0) {
        setMessage({ type: 'error', text: '対象月に発送済みの注文がありません' })
        setTimeout(() => setMessage(null), 3000)
        return
      }

      // 顧客ごとにグループ化
      const companyOrders: Record<string, Order[]> = {}
      for (const order of orders) {
        const companyId = order.company_id
        if (!companyOrders[companyId]) {
          companyOrders[companyId] = []
        }
        companyOrders[companyId].push(order as Order)
      }

      // 請求書を作成
      let created = 0
      for (const [companyId, compOrders] of Object.entries(companyOrders)) {
        // 既に請求書があるか確認
        const { data: existing } = await supabase
          .from('invoices')
          .select('id')
          .eq('company_id', companyId)
          .eq('billing_month', selectedMonth)
          .single()

        if (existing) continue // スキップ

        const totalAmount = compOrders.reduce((sum, o) => sum + o.total_amount, 0)
        const taxRate = 0.08
        const taxAmount = Math.floor(totalAmount - totalAmount / (1 + taxRate))

        // 請求番号生成
        const invoiceNumber = `INV-${selectedMonth.replace('-', '')}-${String(created + 1).padStart(3, '0')}`

        // 支払期限: 翌月末
        const dueDate = new Date(year, month, 0)
        dueDate.setMonth(dueDate.getMonth() + 1)
        const dueDateStr = dueDate.toISOString().split('T')[0]

        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invoiceNumber,
            company_id: companyId,
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
        await supabase.from('invoice_items').insert(
          compOrders.map((order) => ({
            invoice_id: invoice.id,
            order_id: order.id,
            amount: order.total_amount,
          }))
        )

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

  async function handleDownloadFreeeCsv() {
    setDownloadingCsv(true)
    try {
      const res = await fetch('/api/freee-csv', {
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
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('freee CSV ダウンロードエラー:', err)
      setMessage({ type: 'error', text: 'CSV生成に失敗しました' })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setDownloadingCsv(false)
    }
  }

  async function handleDownloadPdf(invoice: Invoice) {
    // 請求書PDF生成（簡易版）
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()

    doc.setFontSize(16)
    doc.text('Invoice / \u8acb\u6c42\u66f8', 105, 20, { align: 'center' })

    doc.setFontSize(10)
    doc.text(`\u8acb\u6c42\u66f8\u756a\u53f7: ${invoice.invoice_number}`, 20, 40)
    doc.text(`\u8acb\u6c42\u6708: ${invoice.billing_month}`, 20, 48)

    const company = invoice.company as { company_name?: string } | undefined
    doc.text(`\u8acb\u6c42\u5148: ${company?.company_name || ''}`, 20, 56)

    doc.text(`\u5408\u8a08\u91d1\u984d: ${formatCurrency(invoice.total_amount)}`, 20, 70)
    doc.text(`\u6d88\u8cbb\u7a0e: ${formatCurrency(invoice.tax_amount)}`, 20, 78)
    doc.text(`\u652f\u6255\u671f\u9650: ${invoice.due_date ? formatDate(invoice.due_date) : ''}`, 20, 86)

    doc.save(`invoice_${invoice.invoice_number}.pdf`)
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">請求管理</h1>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
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
              const company = invoice.company as { company_name?: string } | undefined
              return (
                <div key={invoice.id} className="px-4 py-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{invoice.invoice_number}</p>
                    <p className="text-sm text-gray-600">{company?.company_name}</p>
                    {invoice.due_date && (
                      <p className="text-xs text-gray-400">支払期限: {formatDate(invoice.due_date)}</p>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-green-700">{formatCurrency(invoice.total_amount)}</p>
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

                    <button
                      onClick={() => handleDownloadPdf(invoice)}
                      className="text-green-600 hover:text-green-800 text-xs font-medium"
                      title="PDFダウンロード"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>
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
