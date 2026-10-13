// 管理画面から取引先（companies）の基本情報を保存するときの、受け付ける列と値の検証。
// POST /api/admin/companies（事前登録）と PATCH /api/admin/companies/[id]（編集）で共有する。
//
// 受け付けるのは、管理画面のブラウザがこれまで直接書き込んでいた列だけ（027 の列単位GRANTと同じ25列）。
// 承認状態（approval_status）・業態（business_type_id）・freee登録（freee_partner_registered）・
// 登録コード（registration_code）は受け付けない（承認・業態は専用の操作でのみ変更する）。

export const COMPANY_PROFILE_FIELDS = [
  'company_name',
  'representative_name',
  'postal_code',
  'prefecture',
  'city',
  'address',
  'building',
  'phone',
  'email',
  'price_rank',
  'delivery_method',
  'price_tax_type',
  'notes',
  'is_active',
  'has_separate_billing',
  'billing_name',
  'billing_postal_code',
  'billing_prefecture',
  'billing_city',
  'billing_address',
  'billing_building',
  'parent_company_id',
  'invoice_delivery_method',
  'invoice_delivery_note',
  'internal_memo',
] as const

export type CompanyProfileField = (typeof COMPANY_PROFILE_FIELDS)[number]
export type CompanyProfile = Partial<Record<CompanyProfileField, string | boolean | null>>

const TEXT_FIELDS: CompanyProfileField[] = [
  'representative_name',
  'postal_code',
  'prefecture',
  'city',
  'address',
  'building',
  'phone',
  'email',
  'billing_name',
  'billing_postal_code',
  'billing_prefecture',
  'billing_city',
  'billing_address',
  'billing_building',
  'invoice_delivery_note',
]
const LONG_TEXT_FIELDS: CompanyProfileField[] = ['notes', 'internal_memo']
const BOOLEAN_FIELDS: CompanyProfileField[] = ['is_active', 'has_separate_billing']
const ENUM_FIELDS: Partial<Record<CompanyProfileField, readonly string[]>> = {
  price_rank: ['standard', 'premium', 'vip'],
  delivery_method: ['yamato', 'direct_delivery', 'pickup'],
  price_tax_type: ['inclusive', 'exclusive'],
  invoice_delivery_method: ['email', 'postal', 'other'],
}

const TEXT_MAX = 500
const LONG_TEXT_MAX = 10000

/**
 * リクエストの profile を検証し、保存してよい列だけのオブジェクトを返す。
 * 受け付けない列が含まれている場合は、黙って捨てずにエラーにする（画面側の不具合に気づけるように）。
 */
export function validateCompanyProfile(
  raw: unknown,
  options: { requireName: boolean; selfId?: string }
): { data: CompanyProfile } | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: '取引先情報の形式が不正です' }
  }
  const input = raw as Record<string, unknown>

  const unknownKeys = Object.keys(input).filter(
    (k) => !(COMPANY_PROFILE_FIELDS as readonly string[]).includes(k)
  )
  if (unknownKeys.length > 0) {
    return { error: `この操作では変更できない項目が含まれています: ${unknownKeys.join(', ')}` }
  }

  const data: CompanyProfile = {}

  if ('company_name' in input) {
    if (typeof input.company_name !== 'string' || !input.company_name.trim()) {
      return { error: '店名は必須です' }
    }
    if (input.company_name.length > TEXT_MAX) return { error: `店名は${TEXT_MAX}文字以内です` }
    data.company_name = input.company_name
  } else if (options.requireName) {
    return { error: '店名は必須です' }
  }

  for (const key of [...TEXT_FIELDS, ...LONG_TEXT_FIELDS]) {
    if (!(key in input)) continue
    const v = input[key]
    if (v === null) {
      data[key] = null
      continue
    }
    if (typeof v !== 'string') return { error: `${key} は文字列で指定してください` }
    const max = LONG_TEXT_FIELDS.includes(key) ? LONG_TEXT_MAX : TEXT_MAX
    if (v.length > max) return { error: `${key} は${max}文字以内です` }
    data[key] = v
  }

  for (const key of BOOLEAN_FIELDS) {
    if (!(key in input)) continue
    if (typeof input[key] !== 'boolean') return { error: `${key} は true / false で指定してください` }
    data[key] = input[key] as boolean
  }

  for (const [key, allowed] of Object.entries(ENUM_FIELDS) as [CompanyProfileField, readonly string[]][]) {
    if (!(key in input)) continue
    const v = input[key]
    if (typeof v !== 'string' || !allowed.includes(v)) {
      return { error: `${key} は ${allowed.join(' / ')} のいずれかです` }
    }
    data[key] = v
  }

  if ('parent_company_id' in input) {
    const v = input.parent_company_id
    if (v !== null && (typeof v !== 'string' || !v)) {
      return { error: '親会社の指定が不正です' }
    }
    if (v && options.selfId && v === options.selfId) {
      return { error: '親会社に自分自身は指定できません' }
    }
    data.parent_company_id = (v as string | null) ?? null
  }

  return { data }
}
