import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tierId: string } }
) {
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
  _req: NextRequest,
  { params }: { params: { id: string; tierId: string } }
) {
  try {
    const supabase = createServiceClient()
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
