import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { orderedIds } = await req.json() as { orderedIds: string[] }
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'orderedIds が必要です' }, { status: 400 })
    }
    const supabase = createServiceClient()
    await Promise.all(
      orderedIds.map((id, index) =>
        supabase
          .from('categories')
          .update({ display_order: index + 1, updated_at: new Date().toISOString() })
          .eq('id', id)
      )
    )
    return NextResponse.json({ message: '更新しました' })
  } catch (err) {
    console.error('categories reorder error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
