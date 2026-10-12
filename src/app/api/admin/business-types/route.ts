import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// 業態マスタの一覧（無効も含む）と、業態×商品の紐づけ一覧。
// 認証: middleware が /api/admin/* を保護済み
export async function GET() {
  try {
    const supabase = createServiceClient()
    const [typesRes, linksRes] = await Promise.all([
      supabase.from('business_types').select('*').order('display_order', { ascending: true }),
      supabase.from('business_type_products').select('business_type_id, product_id'),
    ])
    if (typesRes.error) throw typesRes.error
    if (linksRes.error) throw linksRes.error
    return NextResponse.json({ data: typesRes.data ?? [], productLinks: linksRes.data ?? [] })
  } catch (err) {
    console.error('business-types GET error:', err)
    return NextResponse.json({ error: '業態の取得に失敗しました' }, { status: 500 })
  }
}

// 業態の追加。表示順は末尾。
export async function POST(req: NextRequest) {
  try {
    const { name } = (await req.json()) as { name?: string }
    const trimmed = (name ?? '').trim()
    if (!trimmed) return NextResponse.json({ error: '業態名を入力してください' }, { status: 400 })
    if (trimmed.length > 50) return NextResponse.json({ error: '業態名は50文字以内です' }, { status: 400 })

    const supabase = createServiceClient()
    const { data: last } = await supabase
      .from('business_types')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await supabase
      .from('business_types')
      .insert({ name: trimmed, display_order: (last?.display_order ?? 0) + 1 })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: '同じ名前の業態が既にあります' }, { status: 409 })
      throw error
    }
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('business-types POST error:', err)
    return NextResponse.json({ error: '業態の追加に失敗しました' }, { status: 500 })
  }
}
