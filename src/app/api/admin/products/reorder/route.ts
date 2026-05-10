import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-admin-token')
  if (!token && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }
  try {
    const { categoryId, orderedIds } = await req.json() as { categoryId: string; orderedIds: string[] }
    if (!categoryId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'categoryId と orderedIds が必要です' }, { status: 400 })
    }
    const supabase = createServiceClient()
    await Promise.all(
      orderedIds.map((id, index) =>
        supabase
          .from('products')
          .update({ display_order: index + 1, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('category_id', categoryId)
      )
    )
    return NextResponse.json({ message: '更新しました' })
  } catch (err) {
    console.error('products reorder error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
