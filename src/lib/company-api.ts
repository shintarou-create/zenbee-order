// 管理画面から取引先の基本情報を保存するクライアント側ヘルパー。
// companies への書き込みはブラウザの公開キーではなく、必ず管理API（service role）経由で行う。
// 失敗時は API のエラー文言を持つ Error を投げる（呼び出し側の catch で従来どおりの表示をする）。
import { adminFetch } from '@/lib/admin-fetch'
import type { CompanyProfile } from '@/lib/company-profile'

async function readError(res: Response, fallback: string): Promise<Error> {
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  return new Error(json.error || fallback)
}

/** 事前登録。作成した取引先の id を返す。 */
export async function createCompanyProfile(profile: CompanyProfile): Promise<string> {
  const res = await adminFetch('/api/admin/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  })
  if (!res.ok) throw await readError(res, '取引先の登録に失敗しました')
  const json = (await res.json()) as { data?: { id: string } }
  if (!json.data?.id) throw new Error('取引先の登録に失敗しました')
  return json.data.id
}

/** 基本情報の更新（指定した列だけ）。 */
export async function updateCompanyProfile(companyId: string, profile: CompanyProfile): Promise<void> {
  const res = await adminFetch(`/api/admin/companies/${companyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  })
  if (!res.ok) throw await readError(res, '取引先情報の更新に失敗しました')
}
