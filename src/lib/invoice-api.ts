// 請求管理から請求書を作成・更新するクライアント側ヘルパー。
// invoices・invoice_items・orders（請求書作成時の注文完了）への書き込みは、ブラウザの公開キーではなく
// 管理API（service role）経由で行う。
import { adminFetch } from '@/lib/admin-fetch'

export type CreateInvoiceResult =
  | { status: 'created'; invoiceId: string; invoiceNumber: string; orderIds: string[] }
  | { status: 'already_exists'; invoiceNumber: string }
  | { status: 'error'; error: string }

/**
 * 請求先会社1社分の請求書を作成する（請求書・明細・対象注文の完了をサーバーでまとめて行う）。
 * 途中で失敗した場合、サーバー側で作成途中の請求書は取り消される。
 */
export async function createInvoice(
  billingMonth: string,
  companyId: string,
  orderIds: string[]
): Promise<CreateInvoiceResult> {
  const res = await adminFetch('/api/admin/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billingMonth, companyId, orderIds }),
  })
  const json = (await res.json().catch(() => ({}))) as {
    data?: { invoiceId: string; invoiceNumber: string; orderIds: string[] }
    code?: string
    invoiceNumber?: string
    error?: string
  }
  if (res.ok && json.data) {
    return { status: 'created', ...json.data }
  }
  if (json.code === 'already_exists' && json.invoiceNumber) {
    return { status: 'already_exists', invoiceNumber: json.invoiceNumber }
  }
  return { status: 'error', error: json.error || `請求書の作成に失敗しました（HTTP ${res.status}）` }
}

/** 請求書の送信ステータス・支払済み日時・支払期限を更新する（指定した列だけ）。 */
export async function updateInvoice(
  invoiceId: string,
  fields: { status?: string; paid_at?: string | null; due_date?: string | null }
): Promise<void> {
  const res = await adminFetch(`/api/admin/invoices/${invoiceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(json.error || '請求書の更新に失敗しました')
  }
}
