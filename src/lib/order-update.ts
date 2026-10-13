// 管理画面から注文（orders）の状態・備考などを更新するときの、受け付ける列と値の検証。
// PATCH /api/admin/orders/[id]（1件）と PATCH /api/admin/orders/bulk-update（複数件）で共有する。
//
// 受け付けるのは、管理画面のブラウザがこれまで直接書き込んでいた9列だけ（027 の列単位GRANTと同じ）。
// 金額（total_amount）・取引先（company_id）・業態・支払方法・代引き手数料・請求先などは受け付けない
// （明細・送料・支払方法はそれぞれ専用のAPIで変更する）。
import type { OrderStatus } from '@/types'
import { DELIVERY_TIME_SLOT_OPTIONS } from '@/lib/yamato-csv'

export const ORDER_UPDATE_FIELDS = [
  'status',
  'delivery_note_printed',
  'shipping_label_printed',
  'details_confirmed',
  'notes',
  'notes_replied_at',
  'admin_notes',
  'delivery_date',
  'delivery_time_slot',
] as const

export type OrderUpdateField = (typeof ORDER_UPDATE_FIELDS)[number]
export type OrderUpdateFields = Partial<Record<OrderUpdateField, string | boolean | null>>

const VALID_STATUSES: OrderStatus[] = ['pending', 'shipped', 'done', 'cancelled']
const BOOLEAN_FIELDS: OrderUpdateField[] = ['delivery_note_printed', 'shipping_label_printed', 'details_confirmed']
const TEXT_MAX = 2000

/**
 * リクエストの fields を検証し、保存してよい列だけのオブジェクトを返す。
 * 受け付けない列が含まれている場合は、黙って捨てずにエラーにする。
 */
export function validateOrderUpdate(raw: unknown): { data: OrderUpdateFields } | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: '更新内容の形式が不正です' }
  }
  const input = raw as Record<string, unknown>

  const unknownKeys = Object.keys(input).filter(
    (k) => !(ORDER_UPDATE_FIELDS as readonly string[]).includes(k)
  )
  if (unknownKeys.length > 0) {
    return { error: `この操作では変更できない項目が含まれています: ${unknownKeys.join(', ')}` }
  }

  const data: OrderUpdateFields = {}

  if ('status' in input) {
    if (typeof input.status !== 'string' || !VALID_STATUSES.includes(input.status as OrderStatus)) {
      return { error: `status は ${VALID_STATUSES.join(' / ')} のいずれかです` }
    }
    data.status = input.status
  }

  for (const key of BOOLEAN_FIELDS) {
    if (!(key in input)) continue
    if (typeof input[key] !== 'boolean') return { error: `${key} は true / false で指定してください` }
    data[key] = input[key] as boolean
  }

  for (const key of ['notes', 'admin_notes'] as const) {
    if (!(key in input)) continue
    const v = input[key]
    if (v !== null && typeof v !== 'string') return { error: `${key} は文字列で指定してください` }
    if (typeof v === 'string' && v.length > TEXT_MAX) return { error: `${key} は${TEXT_MAX}文字以内です` }
    data[key] = v as string | null
  }

  if ('notes_replied_at' in input) {
    const v = input.notes_replied_at
    if (v !== null && (typeof v !== 'string' || isNaN(new Date(v).getTime()))) {
      return { error: 'notes_replied_at は日時（ISO形式）または null で指定してください' }
    }
    data.notes_replied_at = v as string | null
  }

  if ('delivery_date' in input) {
    const v = input.delivery_date
    if (v !== null && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v).getTime()))) {
      return { error: 'delivery_date は YYYY-MM-DD または null で指定してください' }
    }
    data.delivery_date = v as string | null
  }

  if ('delivery_time_slot' in input) {
    const v = input.delivery_time_slot
    if (v !== null && (typeof v !== 'string' || !DELIVERY_TIME_SLOT_OPTIONS.some((o) => o.value === v))) {
      return {
        error: `delivery_time_slot は ${DELIVERY_TIME_SLOT_OPTIONS.map((o) => o.value).join(' / ')} または null で指定してください`,
      }
    }
    data.delivery_time_slot = v as string | null
  }

  return { data }
}
