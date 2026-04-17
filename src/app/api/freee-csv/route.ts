import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateFreeeCSV, billingMonthToDate } from '@/lib/freee-csv'
import type { FreeeTransactionRow } from '@/lib/freee-csv'

export async function POST(req: NextRequest) {
  // 管理者認証チェック
  const adminToken = req.headers.get('x-admin-token')
  if (!adminToken && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as { billingMonth: string }
    const { billingMonth } = body

    if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
      return NextResponse.json({ error: '請求月の形式が正しくありません (YYYY-MM)' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select(`
        *,
        company:companies (company_name)
      `)
      .eq('billing_month', billingMonth)
      .order('invoice_number')

    if (error) throw error

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ error: '対象月の請求書がありません' }, { status: 404 })
    }

    // 発生日 = 請求月末日
    const date = billingMonthToDate(billingMonth)

    const rows: FreeeTransactionRow[] = invoices.map((invoice) => {
      const company = invoice.company as { company_name?: string } | undefined
      return {
        date,
        partner: company?.company_name || '',
        amount: invoice.total_amount,
        taxAmount: invoice.tax_amount,
        invoiceNumber: invoice.invoice_number,
        billingMonth,
      }
    })

    const csvBuffer = generateFreeeCSV(rows)
    const filename = `freee_${billingMonth.replace('-', '')}.csv`

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(csvBuffer)
        controller.close()
      },
    })

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': csvBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('freee CSV生成エラー:', error)
    return NextResponse.json({ error: 'CSV生成に失敗しました' }, { status: 500 })
  }
}
