// 登録コード（companies.registration_code）の正規化と照合。
//
// 経緯: 2026-06 に Supabase Studio 等で大文字16進8桁のコードが一括発行された一方、自動発行
// （/api/admin/registration-code）は小文字のみを作るため、照合を大文字化（87dbb4d）・小文字化
// （e2911e4）と切り替えるたびにどちらかが通らなくなっていた。
// → 保存は常に小文字、照合は大文字小文字を区別しない（ilike）ことで、DBに大文字が残っていても通す。
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

// 英小文字と数字の8文字（ilike のワイルドカード % と _ を含めないための検査も兼ねる）
const CODE_PATTERN = /^[a-z0-9]{8}$/

/** 入力を trim・小文字化し、8文字の英数字でなければ null を返す。保存時の正規化にも使う。 */
export function normalizeRegistrationCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const code = input.trim().toLowerCase()
  return CODE_PATTERN.test(code) ? code : null
}

export type CompanyByCode = {
  id: string
  company_name: string
  approval_status: string | null
  is_active: boolean
}

/**
 * 登録コードで取引先を探す（大文字小文字を区別しない）。見つからない・不正な形式・複数一致なら null。
 * code は normalizeRegistrationCode 済みの値を渡すこと（% や _ を含まないことが前提）。
 */
export async function findCompanyByRegistrationCode(
  supabase: ServiceClient,
  code: string
): Promise<CompanyByCode | null> {
  if (!CODE_PATTERN.test(code)) return null
  const { data, error } = await supabase
    .from('companies')
    .select('id, company_name, approval_status, is_active')
    .ilike('registration_code', code)
    .limit(2)
  if (error) throw error
  const rows = (data ?? []) as CompanyByCode[]
  if (rows.length > 1) {
    // 大文字小文字違いの重複コード。どちらの会社か決められないため紐付けない
    console.error(`[registration-code] 大文字小文字違いで重複するコードがあります（${rows.length}件）`)
    return null
  }
  return rows[0] ?? null
}
