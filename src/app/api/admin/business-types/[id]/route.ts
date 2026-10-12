import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 業態の名称変更・表示順変更・有効/無効の切り替え。削除は取引先・注文から参照されるため提供しない。
// 認証: middleware が /api/admin/* を保護済み
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json()) as { name?: string; display_order?: number; is_active?: boolean }
    const updates: { name?: string; display_order?: number; is_active?: boolean } = {}

    if (body.name !== undefined) {
      const trimmed = body.name.trim()
      if (!trimmed) return NextResponse.json({ error: '業態名を入力してください' }, { status: 400 })
      if (trimmed.length > 50) return NextResponse.json({ error: '業態名は50文字以内です' }, { status: 400 })
      updates.name = trimmed
    }
    if (body.display_order !== undefined) {
      if (!Number.isInteger(body.display_order)) {
        return NextResponse.json({ error: '表示順は整数で指定してください' }, { status: 400 })
      }
      updates.display_order = body.display_order
    }
    if (body.is_active !== undefined) updates.is_active = !!body.is_active

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '変更内容を指定してください' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('business_types')
      .update(updates)
      .eq('id', params.id)
      .select()
      .maybeSingle()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: '同じ名前の業態が既にあります' }, { status: 409 })
      throw error
    }
    if (!data) return NextResponse.json({ error: '業態が見つかりません' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('business-types PATCH error:', err)
    return NextResponse.json({ error: '業態の更新に失敗しました' }, { status: 500 })
  }
}
