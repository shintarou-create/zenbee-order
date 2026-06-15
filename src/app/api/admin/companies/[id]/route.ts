import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushMessage } from '@/lib/line-messaging'

const VALID_APPROVAL_STATUSES = ['approved', 'pending', 'rejected'] as const
type ApprovalStatus = (typeof VALID_APPROVAL_STATUSES)[number]

const APPROVAL_NOTIFICATION = `ご登録ありがとうございます、善兵衛農園です。
お取引の登録が完了しました。
メニューの「発注する」ボタン、または前回のURLから、いつでもご注文いただけます。
よろしくお願いいたします。`

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

    // 承認時のみ、紐づく全 line_users に通知（失敗しても承認はロールバックしない）
    if (approval_status === 'approved') {
      try {
        const { data: lineUsers } = await supabase
          .from('line_users')
          .select('line_user_id')
          .eq('company_id', params.id)
          .eq('is_active', true)

        for (const lu of lineUsers ?? []) {
          await sendPushMessage(lu.line_user_id, APPROVAL_NOTIFICATION).catch((err) => {
            console.error(`LINE Push 通知エラー（承認）line_user_id=${lu.line_user_id}:`, err)
          })
        }
      } catch (notifyErr) {
        console.error('LINE Push 通知エラー（承認・line_users 取得）:', notifyErr)
      }
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('companies PATCH error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
