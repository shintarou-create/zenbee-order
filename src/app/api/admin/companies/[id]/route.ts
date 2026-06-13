import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const VALID_APPROVAL_STATUSES = ['approved', 'pending', 'rejected'] as const
type ApprovalStatus = (typeof VALID_APPROVAL_STATUSES)[number]

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // 認証: middleware が /api/admin/* を保護済み
  try {
    const body = await req.json()
    const { approval_status } = body as { approval_status?: string }

    if (!approval_status || !VALID_APPROVAL_STATUSES.includes(approval_status as ApprovalStatus)) {
      return NextResponse.json(
        { error: 'approval_status は approved / pending / rejected のいずれかです' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('companies')
      .update({ approval_status })
      .eq('id', params.id)
      .select('id, approval_status')
      .single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: '会社が見つかりません' }, { status: 404 })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('companies PATCH error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
