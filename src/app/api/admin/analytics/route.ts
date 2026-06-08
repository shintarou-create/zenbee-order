import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export interface MonthlyData {
  month: number
  thisYear: number
  lastYear: number | null
}

export interface ProductData {
  product_name: string
  total: number
  quantity: number
}

export interface CompanyData {
  company_name: string
  total: number
  orderCount: number
}

export interface AnalyticsResponse {
  monthly: MonthlyData[]
  byProduct: ProductData[]
  byCompany: CompanyData[]
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const now = new Date()
    const currentYear = now.getFullYear()
    const yearParam = searchParams.get('year')
    const year = yearParam ? parseInt(yearParam, 10) : currentYear

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: '年の指定が不正です' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 集計対象月数（当年なら今月まで、過去年なら12月まで）
    const maxMonth = year === currentYear ? now.getMonth() + 1 : 12

    // thisYear と lastYear の範囲
    const thisYearStart = `${year}-01-01T00:00:00.000Z`
    const thisYearEnd = `${year}-12-31T23:59:59.999Z`
    const lastYear = year - 1
    const lastYearStart = `${lastYear}-01-01T00:00:00.000Z`
    const lastYearEnd = `${lastYear}-12-31T23:59:59.999Z`

    // --- 月別集計 ---
    const [thisYearOrders, lastYearOrders] = await Promise.all([
      supabase
        .from('orders')
        .select('created_at, total_amount')
        .neq('status', 'cancelled')
        .gte('created_at', thisYearStart)
        .lte('created_at', thisYearEnd),
      supabase
        .from('orders')
        .select('created_at, total_amount')
        .neq('status', 'cancelled')
        .gte('created_at', lastYearStart)
        .lte('created_at', lastYearEnd),
    ])

    const thisYearByMonth: Record<number, number> = {}
    for (const o of thisYearOrders.data ?? []) {
      const m = new Date(o.created_at).getMonth() + 1
      thisYearByMonth[m] = (thisYearByMonth[m] ?? 0) + (o.total_amount ?? 0)
    }

    const lastYearByMonth: Record<number, number> = {}
    for (const o of lastYearOrders.data ?? []) {
      const m = new Date(o.created_at).getMonth() + 1
      lastYearByMonth[m] = (lastYearByMonth[m] ?? 0) + (o.total_amount ?? 0)
    }

    const monthly: MonthlyData[] = []
    for (let m = 1; m <= maxMonth; m++) {
      const ly = lastYearByMonth[m]
      monthly.push({
        month: m,
        thisYear: thisYearByMonth[m] ?? 0,
        lastYear: ly != null ? ly : null,
      })
    }

    // --- 商品別集計 ---
    // thisYear の orders ID を取得してから order_items を引く
    const thisYearOrderIds = (thisYearOrders.data ?? []).map((o) => o as unknown as { id?: string })
    // order_items を year 範囲の orders に絞る（orders の id が必要）
    const { data: ordersFull } = await supabase
      .from('orders')
      .select('id')
      .neq('status', 'cancelled')
      .gte('created_at', thisYearStart)
      .lte('created_at', thisYearEnd)

    const orderIdsFull = (ordersFull ?? []).map((o) => o.id)

    const byProduct: ProductData[] = []
    if (orderIdsFull.length > 0) {
      const { data: items } = await supabase
        .from('order_items')
        .select('product_name, subtotal, quantity')
        .in('order_id', orderIdsFull)

      const productMap: Record<string, { total: number; quantity: number }> = {}
      for (const item of items ?? []) {
        const key = item.product_name
        if (!productMap[key]) productMap[key] = { total: 0, quantity: 0 }
        productMap[key].total += item.subtotal ?? 0
        productMap[key].quantity += item.quantity ?? 0
      }
      const sorted = Object.entries(productMap)
        .map(([product_name, v]) => ({ product_name, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20)
      byProduct.push(...sorted)
    }

    // --- 取引先別集計 ---
    const { data: ordersFull2 } = await supabase
      .from('orders')
      .select('company_id, total_amount')
      .neq('status', 'cancelled')
      .gte('created_at', thisYearStart)
      .lte('created_at', thisYearEnd)

    const companyMap: Record<string, { total: number; orderCount: number }> = {}
    for (const o of ordersFull2 ?? []) {
      const cid = o.company_id
      if (!cid) continue
      if (!companyMap[cid]) companyMap[cid] = { total: 0, orderCount: 0 }
      companyMap[cid].total += o.total_amount ?? 0
      companyMap[cid].orderCount += 1
    }

    const companyIds = Object.keys(companyMap)
    const byCompany: CompanyData[] = []
    if (companyIds.length > 0) {
      const { data: companies } = await supabase
        .from('companies')
        .select('id, company_name')
        .in('id', companyIds)

      const nameMap: Record<string, string> = {}
      for (const c of companies ?? []) nameMap[c.id] = c.company_name

      const sorted = companyIds
        .map((cid) => ({
          company_name: nameMap[cid] ?? cid,
          total: companyMap[cid].total,
          orderCount: companyMap[cid].orderCount,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20)
      byCompany.push(...sorted)
    }

    // ordersFull2 は別途取得しているので thisYearOrderIds は未使用変数になるため lint を回避
    void thisYearOrderIds

    const response: AnalyticsResponse = { monthly, byProduct, byCompany }
    return NextResponse.json({ data: response })
  } catch (err) {
    console.error('analytics GET error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
