import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function checkAuth(req: NextRequest): boolean {
  const token = req.headers.get('x-admin-token')
  return !!(token || process.env.NODE_ENV === 'development')
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tierId: string } }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.tier_label !== undefined) updates.tier_label = body.tier_label
    if (body.quantity !== undefined) updates.quantity = Number(body.quantity)
    if (body.unit_price !== undefined) updates.unit_price = Number(body.unit_price)
    if (body.display_order !== undefined) updates.display_order = Number(body.display_order)

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('product_pricing_tiers')
      .update(updates)
      .eq('id', params.tierId)
      .eq('product_id', params.id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('pricing-tiers PATCH error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; tierId: string } }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }
  try {
    const supabase = createServiceClient()
    // 過去のorder_itemsのFK参照をNULLクリアしてからハード削除（スナップショット列tier_label/tier_quantityは残る）
    await supabase
      .from('order_items')
      .update({ pricing_tier_id: null })
      .eq('pricing_tier_id', params.tierId)
    const { error } = await supabase
      .from('product_pricing_tiers')
      .delete()
      .eq('id', params.tierId)
      .eq('product_id', params.id)
    if (error) throw error
    return NextResponse.json({ message: '削除しました' })
  } catch (err) {
    console.error('pricing-tiers DELETE error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
