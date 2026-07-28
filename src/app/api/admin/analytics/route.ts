import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchInChunksByIds } from '@/lib/supabase-batch'

// .in() のIDリスト分割サイズ（URL長対策）
const ID_CHUNK_SIZE = 200

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

    // thisYear と lastYear の範囲
    // 請求書は納品日（delivery_date）の月＝請求月で運用しているため、売上分析も
    // delivery_date を集計基準にする。delivery_date は時刻を持たない date 型なので、
    // 境界も時刻なしの 'YYYY-MM-DD' 文字列で比較する（ISO日時文字列だとタイムゾーン
    // ずれの原因になるため使わない）。
    const thisYearStart = `${year}-01-01`
    const thisYearEnd = `${year}-12-31`
    const lastYear = year - 1
    const lastYearStart = `${lastYear}-01-01`
    const lastYearEnd = `${lastYear}-12-31`

    type OrderRow = { id: string; delivery_date: string | null; company_id: string | null; total_amount: number | null }
    type LastYearRow = { delivery_date: string | null; total_amount: number | null }

    // 当年の注文を全件（1000行ずつバッチ）取得し、月別・商品別・取引先別すべてをここから導出する。
    // 月の判定は delivery_date（'YYYY-MM-DD'）の文字列slice方式で統一する。
    // new Date(delivery_date).getMonth() はタイムゾーンによって前日にずれる危険があるため使わない。
    const [thisYearRows, lastYearRows] = await Promise.all([
      fetchAllRows<OrderRow>((from, to) =>
        supabase
          .from('orders')
          .select('id, delivery_date, company_id, total_amount')
          .neq('status', 'cancelled')
          .gte('delivery_date', thisYearStart)
          .lte('delivery_date', thisYearEnd)
          .range(from, to),
      ),
      fetchAllRows<LastYearRow>((from, to) =>
        supabase
          .from('orders')
          .select('delivery_date, total_amount')
          .neq('status', 'cancelled')
          .gte('delivery_date', lastYearStart)
          .lte('delivery_date', lastYearEnd)
          .range(from, to),
      ),
    ])

    // 'YYYY-MM-DD' の delivery_date から月(1-12)を文字列sliceで取り出す。
    // new Date().getMonth() を使わないことでタイムゾーンずれを避ける。
    const monthOf = (deliveryDate: string): number => parseInt(deliveryDate.slice(5, 7), 10)

    // --- 月別集計（常に年間分） ---
    // 検証観点: 注文月≠納品月の21件（237,362円）は納品月に計上される。
    // 未来納品10件（88,000円）も除外せず、その delivery_date の月（maxMonth以内なら）に計上する。
    const thisYearByMonth: Record<number, number> = {}
    for (const o of thisYearRows) {
      if (!o.delivery_date) continue // 実データではNULL 0件だが念のためスキップ
      const m = monthOf(o.delivery_date)
      thisYearByMonth[m] = (thisYearByMonth[m] ?? 0) + (o.total_amount ?? 0)
    }
    const lastYearByMonth: Record<number, number> = {}
    for (const o of lastYearRows) {
      if (!o.delivery_date) continue
      const m = monthOf(o.delivery_date)
      lastYearByMonth[m] = (lastYearByMonth[m] ?? 0) + (o.total_amount ?? 0)
    }

    // 集計対象月数（monthly配列を何月まで作るか）。
    // 未来納品も計上する方針のため、単純な「今月まで」だと当年に存在する
    // 未来納品月（例: 8月納品予定）が monthly から欠落してしまう。
    // → 当年は「今月」と「当年データ上の最終納品月」の大きい方まで表示する
    //   （データが無い、今月より先の月は出さない）。過去年は従来どおり12月まで。
    // 検証観点:
    //   ・当年に8月納品予定があれば maxMonth>=8 になり monthly に8月分が含まれる。
    //   ・データも今月も届かない先の月（例: データ最終月・今月ともに8月なら9月以降）は含まれない。
    //   ・過去年を選んだ場合は従来どおり1〜12月すべて出る。
    const latestDataMonth = Math.max(0, ...Object.keys(thisYearByMonth).map((k) => parseInt(k, 10)))
    const maxMonth =
      year === currentYear ? Math.min(12, Math.max(now.getMonth() + 1, latestDataMonth)) : 12

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
      ? thisYearRows.filter((o) => o.delivery_date && monthOf(o.delivery_date) === month)
      : thisYearRows
    const aggOrderIds = aggOrders.map((o) => o.id)

    // --- 商品別・カテゴリー別集計 ---
    const byProduct: ProductData[] = []
    const byCategory: CategoryData[] = []
    if (aggOrderIds.length > 0) {
      type ItemRow = { product_name: string; subtotal: number | null; quantity: number | null; product_id: string | null }
      // aggOrderIds を 200件ずつに分割し、各チャンクを1000行ずつ全件取得して結合する。
      const items = await fetchInChunksByIds<ItemRow>(aggOrderIds, ID_CHUNK_SIZE, (chunkIds, from, to) =>
        supabase
          .from('order_items')
          .select('product_name, subtotal, quantity, product_id')
          .in('order_id', chunkIds)
          .range(from, to),
      )

      const productMap: Record<string, { total: number; quantity: number }> = {}
      for (const item of items) {
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
          items
            .map((i) => i.product_id)
            .filter((pid): pid is string => !!pid)
        )
      )

      const productIdToCategoryId = new Map<string, string | null>()
      if (productIds.length > 0) {
        type ProdRow = { id: string; category_id: string | null }
        const prods = await fetchInChunksByIds<ProdRow>(productIds, ID_CHUNK_SIZE, (chunkIds, from, to) =>
          supabase.from('products').select('id, category_id').in('id', chunkIds).range(from, to),
        )
        for (const prod of prods) {
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
      for (const it of items) {
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
      type CompanyRow = { id: string; company_name: string }
      const companies = await fetchInChunksByIds<CompanyRow>(companyIds, ID_CHUNK_SIZE, (chunkIds, from, to) =>
        supabase.from('companies').select('id, company_name').in('id', chunkIds).range(from, to),
      )

      const nameMap: Record<string, string> = {}
      for (const c of companies) nameMap[c.id] = c.company_name

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
