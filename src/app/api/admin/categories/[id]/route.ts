import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { name, emoji } = await req.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'カテゴリ名が必要です' }, { status: 400 })
    }
    const supabase = createServiceClient()
    const updatePayload: Record<string, string> = { name: name.trim(), updated_at: new Date().toISOString() }
    if (emoji?.trim()) updatePayload.emoji = emoji.trim()
    const { data, error } = await supabase
      .from('categories')
      .update(updatePayload)
      .eq('id', params.id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('categories PATCH error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient()
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', params.id)
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'このカテゴリには商品が紐づいています。先に商品のカテゴリを変更してください。' },
        { status: 400 }
      )
    }
    const { error } = await supabase.from('categories').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ message: '削除しました' })
  } catch (err) {
    console.error('categories DELETE error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
