// 商品ごとの「見せる業態」（business_type_products）を扱うサーバー側の共通処理。
// 商品登録・編集API（/api/admin/products, /api/admin/products/[id]）で共有する。
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

/** リクエストの businessTypeIds を検証する。不正ならエラー文言、正常なら重複を除いた配列を返す。 */
export async function validateBusinessTypeIds(
  supabase: ServiceClient,
  raw: unknown
): Promise<{ ids: string[] } | { error: string }> {
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string' || !id)) {
    return { error: '見せる業態の指定が不正です' }
  }
  const ids = Array.from(new Set(raw as string[]))
  if (ids.length === 0) return { error: '見せる業態を1つ以上選択してください' }

  const { data, error } = await supabase.from('business_types').select('id').in('id', ids)
  if (error) return { error: '業態の確認に失敗しました' }
  if ((data ?? []).length !== ids.length) return { error: '存在しない業態が指定されています' }
  return { ids }
}

/** 商品に紐づく業態を ids に揃える（差分だけ追加・削除）。 */
export async function syncProductBusinessTypes(
  supabase: ServiceClient,
  productId: string,
  ids: string[]
): Promise<string | null> {
  const { data: current, error: curError } = await supabase
    .from('business_type_products')
    .select('business_type_id')
    .eq('product_id', productId)
  if (curError) return '見せる業態の取得に失敗しました'

  const currentIds = new Set((current ?? []).map((r) => r.business_type_id as string))
  const toAdd = ids.filter((id) => !currentIds.has(id))
  const toRemove = Array.from(currentIds).filter((id) => !ids.includes(id))

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('business_type_products')
      .insert(toAdd.map((business_type_id) => ({ business_type_id, product_id: productId })))
    if (error) return '見せる業態の保存に失敗しました'
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('business_type_products')
      .delete()
      .eq('product_id', productId)
      .in('business_type_id', toRemove)
    if (error) return '見せる業態の保存に失敗しました'
  }
  return null
}
