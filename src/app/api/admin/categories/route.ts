import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true })
    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('categories GET error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'カテゴリ名が必要です' }, { status: 400 })
    }
    const supabase = createServiceClient()
    const { data: maxRow } = await supabase
      .from('categories')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)
      .single()
    const nextOrder = ((maxRow as { display_order: number } | null)?.display_order ?? 0) + 1
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: name.trim(), display_order: nextOrder })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('categories POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
