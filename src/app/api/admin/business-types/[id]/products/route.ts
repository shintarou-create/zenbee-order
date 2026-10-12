import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// その業態に見せる商品を、指定した商品IDの一覧で置き換える。
// 認証: middleware が /api/admin/* を保護済み
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { productIds } = (await req.json()) as { productIds?: unknown }
    if (!Array.isArray(productIds) || productIds.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'productIds は文字列の配列で指定してください' }, { status: 400 })
    }
    const ids = Array.from(new Set(productIds as string[]))

    const supabase = createServiceClient()
    const { data: type } = await supabase.from('business_types').select('id').eq('id', params.id).maybeSingle()
    if (!type) return NextResponse.json({ error: '業態が見つかりません' }, { status: 404 })

    // 追加分・削除分の差分だけを反映する（全削除→再挿入だと途中失敗時に全商品が消えるため）
    const { data: current, error: curError } = await supabase
      .from('business_type_products')
      .select('product_id')
      .eq('business_type_id', params.id)
    if (curError) throw curError
    const currentIds = new Set((current ?? []).map((r) => r.product_id as string))
    const toAdd = ids.filter((id) => !currentIds.has(id))
    const toRemove = Array.from(currentIds).filter((id) => !ids.includes(id))

    if (toAdd.length > 0) {
      const { error } = await supabase
        .from('business_type_products')
        .insert(toAdd.map((product_id) => ({ business_type_id: params.id, product_id })))
      if (error) throw error
    }
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('business_type_products')
        .delete()
        .eq('business_type_id', params.id)
        .in('product_id', toRemove)
      if (error) throw error
    }
    return NextResponse.json({ data: { added: toAdd.length, removed: toRemove.length } })
  } catch (err) {
    console.error('business-types products PUT error:', err)
    return NextResponse.json({ error: '商品の紐づけの保存に失敗しました' }, { status: 500 })
  }
}
