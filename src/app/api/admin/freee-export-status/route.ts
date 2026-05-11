import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function getLastMonthInfo(): {
  yearMonth: string
  label: string
  startISO: string
  endISO: string
} {
  const now = new Date()
  const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const currentYear = jstNow.getFullYear()
  const currentMonth = jstNow.getMonth() + 1

  const year = currentMonth === 1 ? currentYear - 1 : currentYear
  const month = currentMonth === 1 ? 12 : currentMonth - 1
  const lastDay = new Date(year, month, 0).getDate()

  const ym = String(month).padStart(2, '0')
  const yearMonth = `${year}-${ym}`
  const label = `${year}年${month}月`

  // Convert JST range to UTC for reliable PostgREST comparison
  const startISO = new Date(`${year}-${ym}-01T00:00:00+09:00`).toISOString()
  const endISO = new Date(`${year}-${ym}-${String(lastDay).padStart(2, '0')}T23:59:59.999+09:00`).toISOString()

  return { yearMonth, label, startISO, endISO }
}

export async function GET() {
  try {
    const { yearMonth, label, startISO, endISO } = getLastMonthInfo()
    const supabase = createServiceClient()

    const { count: orderCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startISO)
      .lte('created_at', endISO)

    const { data: logEntry } = await supabase
      .from('freee_export_log')
      .select('exported_at')
      .eq('target_year_month', yearMonth)
      .order('exported_at', { ascending: false })
      .limit(1)
      .single()

    const count = orderCount ?? 0
    const lastExportedAt = logEntry?.exported_at ?? null

    let bannerType: 'remind' | 'done' | 'no_orders'
    if (count === 0) {
      bannerType = 'no_orders'
    } else if (lastExportedAt) {
      bannerType = 'done'
    } else {
      bannerType = 'remind'
    }

    return NextResponse.json({
      targetYearMonth: yearMonth,
      targetYearMonthLabel: label,
      orderCount: count,
      lastExportedAt,
      bannerType,
    })
  } catch (err) {
    console.error('freee-export-status error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
