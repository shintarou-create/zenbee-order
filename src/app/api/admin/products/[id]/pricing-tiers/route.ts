import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('product_pricing_tiers')
      .select('*')
      .eq('product_id', params.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('pricing-tiers GET error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tier_label, quantity, unit_price } = await req.json()
    if (!tier_label?.trim() || !quantity || !unit_price) {
      return NextResponse.json({ error: 'tier_label, quantity, unit_price が必要です' }, { status: 400 })
    }
    const supabase = createServiceClient()
    const { data: maxRow } = await supabase
      .from('product_pricing_tiers')
      .select('display_order')
      .eq('product_id', params.id)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()
    const nextOrder = ((maxRow as { display_order: number } | null)?.display_order ?? 0) + 1
    const { data, error } = await supabase
      .from('product_pricing_tiers')
      .insert({
        product_id: params.id,
        tier_label: tier_label.trim(),
        quantity: Number(quantity),
        unit_price: Number(unit_price),
        display_order: nextOrder,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('pricing-tiers POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
