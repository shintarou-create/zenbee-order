import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateFreeePartnerCSV } from '@/lib/freee-partner-csv'

// freee取引先インポートCSV。認証は middleware（/api/freee-partner-csv）で実施済み。
//
// GET: freeeに未登録（freee_partner_registered=false）の取引先一覧・件数を返す。
// POST: 指定した取引先（省略時は未登録の全社）のCSVをダウンロード用に生成する。
//        ここでは freee_partner_registered を更新しない（DL＝インポート成功ではないため）。
// PATCH: 指定した取引先を freee_partner_registered=true に更新する（インポート成功後にUIから呼ぶ）。

export const dynamic = 'force-dynamic'

type CompanyNameRow = { id: string; company_name: string }

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('companies')
      .select('id, company_name')
      .eq('freee_partner_registered', false)
      .order('company_name', { ascending: true })

    if (error) throw error

    const companies = (data ?? []) as CompanyNameRow[]
    return NextResponse.json({ companies, count: companies.length })
  } catch (err) {
    console.error('freee取引先CSV 未登録件数取得エラー:', err)
    return NextResponse.json({ error: '未登録取引先の取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { companyIds } = (body ?? {}) as { companyIds?: unknown }

    if (companyIds !== undefined && (!Array.isArray(companyIds) || !companyIds.every((id) => typeof id === 'string'))) {
      return NextResponse.json({ error: 'companyIds は文字列配列で指定してください' }, { status: 400 })
    }

    const supabase = createServiceClient()

    let query = supabase.from('companies').select('id, company_name').eq('freee_partner_registered', false)
    if (companyIds && companyIds.length > 0) {
      query = query.in('id', companyIds as string[])
    }
    const { data, error } = await query.order('company_name', { ascending: true })

    if (error) throw error

    const companies = (data ?? []) as CompanyNameRow[]
    if (companies.length === 0) {
      return NextResponse.json({ error: '対象の取引先がありません' }, { status: 404 })
    }

    const csvString = generateFreeePartnerCSV(companies.map((c) => c.company_name))
    const csvBuffer = new TextEncoder().encode(csvString)

    // ファイル名の日付はJST基準
    const now = new Date()
    const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const dateStr = `${jstNow.getFullYear()}${String(jstNow.getMonth() + 1).padStart(2, '0')}${String(jstNow.getDate()).padStart(2, '0')}`
    const filename = `freee_partners_${dateStr}.csv`

    return new NextResponse(csvBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': csvBuffer.length.toString(),
      },
    })
  } catch (err) {
    console.error('freee取引先CSV生成エラー:', err)
    return NextResponse.json({ error: 'CSV生成に失敗しました' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { companyIds } = (body ?? {}) as { companyIds?: unknown }

    if (!Array.isArray(companyIds) || companyIds.length === 0 || !companyIds.every((id) => typeof id === 'string')) {
      return NextResponse.json({ error: 'companyIds は1件以上の文字列配列で指定してください' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // .update() は該当0件でもエラーを返さないため、.select() で更新件数を取得し
    // リクエスト件数と一致するか必ず検証する（不一致=一部が既に他状態で見つからなかった等）。
    const { data, error } = await supabase
      .from('companies')
      .update({ freee_partner_registered: true })
      .in('id', companyIds as string[])
      .select('id')

    if (error) throw error

    const updated = (data ?? []).length
    if (updated !== companyIds.length) {
      return NextResponse.json(
        { error: `更新件数が一致しません（指定${companyIds.length}件・更新${updated}件）` },
        { status: 409 }
      )
    }

    return NextResponse.json({ updated })
  } catch (err) {
    console.error('freee取引先CSV 登録済みマークエラー:', err)
    return NextResponse.json({ error: '登録済みへの更新に失敗しました' }, { status: 500 })
  }
}
