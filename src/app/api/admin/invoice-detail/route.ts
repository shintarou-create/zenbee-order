import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildInvoiceDetail } from '@/lib/invoice-detail-data'

// 請求書1件の表示用データ（請求書HTML印刷ページ用）を返す。
// 認証は middleware（/api/admin/*）で実施済み。集計は共通ロジック buildInvoiceDetail に委譲する。
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get('invoiceId') ?? undefined
    const companyId = searchParams.get('companyId') ?? undefined
    const billingMonth = searchParams.get('billingMonth') ?? undefined

    if (!invoiceId && !(companyId && billingMonth)) {
      return NextResponse.json(
        { error: 'invoiceId または companyId+billingMonth を指定してください' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const detail = await buildInvoiceDetail(supabase, { invoiceId, companyId, billingMonth })

    if (!detail) {
      return NextResponse.json({ error: '請求書が見つかりません' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (err) {
    console.error('請求書詳細取得エラー:', err)
    return NextResponse.json({ error: '請求書詳細の取得に失敗しました' }, { status: 500 })
  }
}
