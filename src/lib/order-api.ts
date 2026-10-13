// 管理画面から注文の状態・備考などを更新するクライアント側ヘルパー。
// orders への書き込みはブラウザの公開キーではなく、管理API（service role）経由で行う。
// 失敗時は API のエラー文言を持つ Error を投げる（呼び出し側の catch で従来どおりの表示をする）。
import { adminFetch } from '@/lib/admin-fetch'
import type { OrderUpdateFields } from '@/lib/order-update'

async function readError(res: Response, fallback: string): Promise<Error> {
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  return new Error(json.error || fallback)
}

/** 注文1件を更新する。 */
export async function updateOrder(orderId: string, fields: OrderUpdateFields): Promise<void> {
  const res = await adminFetch(`/api/admin/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw await readError(res, '注文の更新に失敗しました')
}

/** 複数の注文に同じ更新をかける。更新した件数を返す。 */
export async function updateOrders(orderIds: string[], fields: OrderUpdateFields): Promise<number> {
  const res = await adminFetch('/api/admin/orders/bulk-update', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds, fields }),
  })
  if (!res.ok) throw await readError(res, '注文の更新に失敗しました')
  const json = (await res.json()) as { data?: { updated?: number } }
  return json.data?.updated ?? 0
}
