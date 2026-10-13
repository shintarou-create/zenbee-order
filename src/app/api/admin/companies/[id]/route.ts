import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushMessage } from '@/lib/line-messaging'
import { getAdminIdentity, verifyAdmin } from '@/lib/admin-auth'
import { validateCompanyProfile } from '@/lib/company-profile'

const VALID_APPROVAL_STATUSES = ['approved', 'pending', 'rejected'] as const
type ApprovalStatus = (typeof VALID_APPROVAL_STATUSES)[number]

const VALID_DELIVERY_METHODS = ['yamato', 'direct_delivery', 'pickup'] as const
type DeliveryMethodValue = (typeof VALID_DELIVERY_METHODS)[number]

const APPROVAL_NOTIFICATION = `ご登録ありがとうございます、善兵衛農園です。
お取引の登録が完了しました。
メニューの「発注する」ボタン、または前回のURLから、いつでもご注文いただけます。
よろしくお願いいたします。`

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // 認証: middleware が /api/admin/* を保護済み
  try {
    const body = await req.json()

    // 基本情報の編集（顧客管理の編集・価格ランク変更、請求管理・注文詳細の取引先情報編集）。
    // { profile: {...} } で受け、承認・業態の変更とは同時に受け付けない。
    if (body && typeof body === 'object' && 'profile' in body) {
      return await updateProfile(req, params.id, body as Record<string, unknown>)
    }

    const { approval_status, delivery_method, business_type_id } = body as {
      approval_status?: string
      delivery_method?: string
      business_type_id?: string | null
    }

    // approval_status / delivery_method / business_type_id のいずれかは必須。指定されたものだけ更新する。
    const updates: {
      approval_status?: ApprovalStatus
      delivery_method?: DeliveryMethodValue
      business_type_id?: string
    } = {}

    if (approval_status !== undefined) {
      if (!VALID_APPROVAL_STATUSES.includes(approval_status as ApprovalStatus)) {
        return NextResponse.json(
          { error: 'approval_status は approved / pending / rejected のいずれかです' },
          { status: 400 }
        )
      }
      updates.approval_status = approval_status as ApprovalStatus
    }

    if (delivery_method !== undefined) {
      if (!VALID_DELIVERY_METHODS.includes(delivery_method as DeliveryMethodValue)) {
        return NextResponse.json(
          { error: 'delivery_method は yamato / direct_delivery / pickup のいずれかです' },
          { status: 400 }
        )
      }
      updates.delivery_method = delivery_method as DeliveryMethodValue
    }

    const supabase = createServiceClient()

    // 業態（未設定に戻すことはできない。選べるのは有効な業態のみ）
    if (business_type_id !== undefined) {
      if (typeof business_type_id !== 'string' || !business_type_id) {
        return NextResponse.json({ error: '業態を選択してください' }, { status: 400 })
      }
      const { data: bt } = await supabase
        .from('business_types')
        .select('id, is_active')
        .eq('id', business_type_id)
        .maybeSingle()
      if (!bt || !bt.is_active) {
        return NextResponse.json({ error: '指定された業態が見つからないか、無効になっています' }, { status: 400 })
      }
      updates.business_type_id = business_type_id
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'approval_status / delivery_method / business_type_id のいずれかを指定してください' },
        { status: 400 }
      )
    }

    const { data: before } = await supabase
      .from('companies')
      .select('id, business_type_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!before) return NextResponse.json({ error: '会社が見つかりません' }, { status: 404 })

    // 承認には業態の割り当てが必須（今回指定するか、既に設定済みであること）
    if (updates.approval_status === 'approved' && !(updates.business_type_id ?? before.business_type_id)) {
      return NextResponse.json({ error: '業態を選択してから承認してください' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', params.id)
      .select('id, approval_status, delivery_method, business_type_id')
      .single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: '会社が見つかりません' }, { status: 404 })

    // 業態が変わった場合は変更履歴を残す（失敗しても更新自体はロールバックしない）
    if (updates.business_type_id && updates.business_type_id !== before.business_type_id) {
      const admin = await getAdminIdentity(req)
      const { error: logError } = await supabase.from('company_business_type_logs').insert({
        company_id: params.id,
        from_business_type_id: before.business_type_id ?? null,
        to_business_type_id: updates.business_type_id,
        changed_by: admin?.name ?? null,
      })
      if (logError) console.error('業態変更履歴の記録エラー:', logError)
    }

    // 承認時のみ、紐づく全 line_users に通知（失敗しても承認はロールバックしない）
    if (updates.approval_status === 'approved') {
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

// 基本情報の更新。受け付ける列は src/lib/company-profile.ts の25列のみ
// （承認状態・業態・freee登録・登録コードは不可）。
async function updateProfile(req: NextRequest, id: string, body: Record<string, unknown>) {
  const role = await verifyAdmin(req)
  if (!role) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
  }

  const otherKeys = Object.keys(body).filter((k) => k !== 'profile')
  if (otherKeys.length > 0) {
    return NextResponse.json(
      { error: `基本情報の編集と同時に指定できない項目があります: ${otherKeys.join(', ')}` },
      { status: 400 }
    )
  }

  const result = validateCompanyProfile(body.profile, { requireName: false, selfId: id })
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  if (Object.keys(result.data).length === 0) {
    return NextResponse.json({ error: '変更する項目を指定してください' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('companies')
      .update(result.data)
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '同じ店名の取引先が既に登録されています' }, { status: 409 })
      }
      throw error
    }
    if (!data) return NextResponse.json({ error: '会社が見つかりません' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('companies PATCH (profile) error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
