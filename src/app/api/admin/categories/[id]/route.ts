import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function checkAuth(req: NextRequest): boolean {
  const token = req.headers.get('x-admin-token')
  return !!(token || process.env.NODE_ENV === 'development')
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }
  try {
    const { name } = await req.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'カテゴリ名が必要です' }, { status: 400 })
    }
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('categories')
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }
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
