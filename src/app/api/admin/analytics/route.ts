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

export interface CategoryData {
  category_name: string
  total: number
  quantity: number
}

export interface AnalyticsResponse {
  monthly: MonthlyData[]
  byProduct: ProductData[]
  byCompany: CompanyData[]
  byCategory: CategoryData[]
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

    // 任意パラメータ month（1〜12）。指定時は byProduct/byCompany/byCategory を
    // その月の注文に限定する（monthly は常に年間分を返す）。
    const monthParam = searchParams.get('month')
    const month = monthParam ? parseInt(monthParam, 10) : null
    if (month !== null && (isNaN(month) || month < 1 || month > 12)) {
      return NextResponse.json({ error: '月の指定が不正です' }, { status: 400 })
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

    // 当年の注文を1回だけ取得し、月別・商品別・取引先別すべてをここから導出する。
    // 月の判定は new Date(created_at).getMonth() で統一（今月カードの算出と一致させる）。
    const [thisYearOrders, lastYearOrders] = await Promise.all([
      supabase
        .from('orders')
        .select('id, created_at, company_id, total_amount')
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

    type OrderRow = { id: string; created_at: string; company_id: string | null; total_amount: number | null }
    const thisYearRows = (thisYearOrders.data ?? []) as OrderRow[]

    // --- 月別集計（常に年間分） ---
    const thisYearByMonth: Record<number, number> = {}
    for (const o of thisYearRows) {
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

    // --- 集計対象の注文（month 指定時はその月に限定） ---
    const aggOrders = month
      ? thisYearRows.filter((o) => new Date(o.created_at).getMonth() + 1 === month)
      : thisYearRows
    const aggOrderIds = aggOrders.map((o) => o.id)

    // --- 商品別・カテゴリー別集計 ---
    const byProduct: ProductData[] = []
    const byCategory: CategoryData[] = []
    if (aggOrderIds.length > 0) {
      const { data: items } = await supabase
        .from('order_items')
        .select('product_name, subtotal, quantity, product_id')
        .in('order_id', aggOrderIds)

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

      // カテゴリー別集計
      const productIds = Array.from(
        new Set(
          (items ?? [])
            .map((i) => (i as unknown as { product_id?: string | null }).product_id)
            .filter((pid): pid is string => !!pid)
        )
      )

      const productIdToCategoryId = new Map<string, string | null>()
      if (productIds.length > 0) {
        const { data: prods } = await supabase
          .from('products')
          .select('id, category_id')
          .in('id', productIds)
        for (const p of prods ?? []) {
          const prod = p as unknown as { id: string; category_id?: string | null }
          productIdToCategoryId.set(prod.id, prod.category_id ?? null)
        }
      }

      const { data: cats } = await supabase.from('categories').select('id, name')
      const categoryIdToName = new Map<string, string>()
      for (const c of cats ?? []) {
        const cat = c as unknown as { id: string; name: string }
        categoryIdToName.set(cat.id, cat.name)
      }

      const catMap: Record<string, { total: number; quantity: number }> = {}
      for (const item of items ?? []) {
        const it = item as unknown as { product_id?: string | null; subtotal?: number | null; quantity?: number | null }
        const catId = it.product_id ? (productIdToCategoryId.get(it.product_id) ?? null) : null
        const catName = catId ? (categoryIdToName.get(catId) ?? 'その他') : 'その他'
        if (!catMap[catName]) catMap[catName] = { total: 0, quantity: 0 }
        catMap[catName].total += it.subtotal ?? 0
        catMap[catName].quantity += it.quantity ?? 0
      }

      const sortedByCategory = Object.entries(catMap)
        .map(([category_name, v]) => ({ category_name, ...v }))
        .sort((a, b) => b.total - a.total)
      byCategory.push(...sortedByCategory)
    }

    // --- 取引先別集計（aggOrders から直接） ---
    const companyMap: Record<string, { total: number; orderCount: number }> = {}
    for (const o of aggOrders) {
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

    const response: AnalyticsResponse = { monthly, byProduct, byCompany, byCategory }
    return NextResponse.json({ data: response })
  } catch (err) {
    console.error('analytics GET error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
