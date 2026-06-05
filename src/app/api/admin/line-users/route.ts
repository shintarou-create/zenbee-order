import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/

export async function POST(req: NextRequest) {
  try {
    const { company_id, line_user_id, display_name } = (await req.json()) as {
      company_id: string
      line_user_id: string
      display_name?: string
    }

    if (!company_id) {
      return NextResponse.json({ error: 'company_id が必要です' }, { status: 400 })
    }
    if (!line_user_id || !LINE_USER_ID_RE.test(line_user_id)) {
      return NextResponse.json(
        { error: 'LINE User ID の形式が不正です（U + 32桁小文字英数字）' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    const { data: existing, error: checkError } = await supabase
      .from('line_users')
      .select('id, company_id')
      .eq('line_user_id', line_user_id)
      .maybeSingle()

    if (checkError) throw checkError

    if (existing) {
      return NextResponse.json(
        { error: 'この LINE User ID は既に登録されています' },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('line_users')
      .insert({
        company_id,
        line_user_id,
        display_name: display_name?.trim() || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('line-users POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
