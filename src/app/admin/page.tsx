'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Order } from '@/types'
import { formatDate, formatDateWithDay, formatCurrency, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'
import FreeeExportBanner from '@/components/admin/FreeeExportBanner'

interface PendingCompany {
  id: string
  company_name: string
  representative_name: string | null
  created_at: string
  line_users?: Array<{ display_name: string | null }>
}

interface ActionOrderItem {
  product_name: string
  quantity: number
  unit: string
}

interface ActionOrder {
  id: string
  order_number: string
  delivery_date: string | null
  company: { company_name: string } | null
  order_items: ActionOrderItem[]
}

// 「次の納品」集計用（PendingProductsSummary と同じ集計ロジック: product_id 単位・tier実本数）
interface UpcomingItem {
  product_id: string
  quantity: number
  tier_quantity: number | null
}
interface UpcomingOrder {
  id: string
  delivery_date: string | null
  order_items: UpcomingItem[]
}
interface ProductMaster {
  id: string
  name: string
  unit: string
}
interface CrossStockProduct {
  id: string
  name: string
}

function formatItemSummary(items: ActionOrderItem[], maxItems = 3): string {
  if (!items || items.length === 0) return ''
  const visible = items.slice(0, maxItems)
  const rest = items.length - maxItems
  const parts = visible.map((item) =>
    item.unit ? `${item.product_name} ${item.quantity}${item.unit}` : item.product_name
  )
  if (rest > 0) parts.push(`ほか${rest}点`)
  return parts.join('、')
}

const HUB_ITEMS = [
  { href: '/admin/orders', label: '注文管理', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { href: '/admin/products', label: '商品管理', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: '/admin/customers', label: '顧客管理', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { href: '/admin/invoices', label: '請求管理', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { href: '/admin/analytics', label: '売上分析', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
]

export default function AdminDashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // 次の納品
  const [upcomingOrders, setUpcomingOrders] = useState<UpcomingOrder[]>([])
  const [products, setProducts] = useState<ProductMaster[]>([])
  const [nullDateCount, setNullDateCount] = useState(0)

  // 対応が必要なこと
  const [overdueOrders, setOverdueOrders] = useState<ActionOrder[]>([])
  const [overdueCount, setOverdueCount] = useState(0)
  const [pendingCompanies, setPendingCompanies] = useState<PendingCompany[]>([])
  const [pendingCompaniesCount, setPendingCompaniesCount] = useState(0)
  const [unconfirmedOrders, setUnconfirmedOrders] = useState<ActionOrder[]>([])
  const [unconfirmedCount, setUnconfirmedCount] = useState(0)

  // 詳細データ
  const [crossStock, setCrossStock] = useState<CrossStockProduct[]>([])
  const [recentOrders, setRecentOrders] = useState<Order[]>([])

  const [bannerType, setBannerType] = useState<'remind' | 'done' | 'no_orders' | null>(null)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const supabase = createClient()
        const todayJSTStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })

        // 次の納品: 今日以降の pending 注文（アイテム込み・納品日昇順）
        const { data: upcoming } = await supabase
          .from('orders')
          .select('id, delivery_date, order_items(product_id, quantity, tier_quantity)')
          .eq('status', 'pending')
          .gte('delivery_date', todayJSTStr)
          .order('delivery_date', { ascending: true })
        setUpcomingOrders((upcoming || []) as unknown as UpcomingOrder[])

        // 商品マスタ（名前・単位）
        const { data: prods } = await supabase.from('products').select('id, name, unit')
        setProducts((prods || []) as ProductMaster[])

        // 納品日未設定の pending 件数
        const { count: nullCnt } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .is('delivery_date', null)
        setNullDateCount(nullCnt || 0)

        // 納品日超過: 今日より前の pending 注文（5件＋件数）
        const { data: overdue, count: overdueCnt } = await supabase
          .from('orders')
          .select('id, order_number, delivery_date, company:companies(company_name), order_items(product_name, quantity, unit)', { count: 'exact' })
          .eq('status', 'pending')
          .lt('delivery_date', todayJSTStr)
          .order('delivery_date', { ascending: true })
          .limit(5)
        setOverdueCount(overdueCnt || 0)
        setOverdueOrders((overdue || []) as unknown as ActionOrder[])

        // 承認待ちの取引先
        const { data: pendingComps, count: pendingCompsCount } = await supabase
          .from('companies')
          .select('id, company_name, representative_name, created_at, line_users(display_name)', { count: 'exact' })
          .eq('approval_status', 'pending')
          .order('created_at', { ascending: true })
          .limit(5)
        setPendingCompaniesCount(pendingCompsCount || 0)
        setPendingCompanies((pendingComps || []) as PendingCompany[])

        // 未確認の注文（status=pending かつ details_confirmed が true でない）
        const { data: unconfirmed, count: unconfirmedCnt } = await supabase
          .from('orders')
          .select('id, order_number, delivery_date, company:companies(company_name), order_items(product_name, quantity, unit)', { count: 'exact' })
          .eq('status', 'pending')
          .or('details_confirmed.is.null,details_confirmed.eq.false')
          .order('delivery_date', { ascending: true, nullsFirst: false })
          .limit(5)
        setUnconfirmedCount(unconfirmedCnt || 0)
        setUnconfirmedOrders((unconfirmed || []) as unknown as ActionOrder[])

        // 在庫×の商品（is_active=true かつ stock_status='cross'）
        const { data: crossProducts } = await supabase
          .from('products')
          .select('id, name')
          .eq('is_active', true)
          .eq('stock_status', 'cross')
          .order('name', { ascending: true })
        setCrossStock((crossProducts || []) as CrossStockProduct[])

        // 最近の注文（10件）
        const { data: orders } = await supabase
          .from('orders')
          .select(`*, company:companies (company_name, representative_name)`)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(10)
        setRecentOrders((orders || []) as Order[])
      } catch (err) {
        console.error('ダッシュボード取得エラー:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboard()
  }, [])

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const todayJST = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  const [ryear, rmonth, rday] = todayJST.split('-').map(Number)
  const tomorrowDate = new Date(ryear, rmonth - 1, rday + 1)
  const tomorrowJST = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`

  // 次の納品: 納品日でグループ化
  const groupsMap = new Map<string, UpcomingOrder[]>()
  for (const o of upcomingOrders) {
    if (!o.delivery_date) continue
    const arr = groupsMap.get(o.delivery_date) ?? []
    arr.push(o)
    groupsMap.set(o.delivery_date, arr)
  }
  const groupKeys = Array.from(groupsMap.keys()).sort()
  const nearestKey = groupKeys[0] ?? null
  const nearestOrders = nearestKey ? groupsMap.get(nearestKey)! : []
  const nextGroups = groupKeys.slice(1, 4).map((k) => ({ date: k, count: groupsMap.get(k)!.length }))
  const isNearestSoon = nearestKey === todayJST || nearestKey === tomorrowJST

  // 次の納品グループの商品合計（product_id 単位・tier は実本数・単位は本、数量降順）
  const productById = new Map(products.map((p) => [p.id, p]))
  const aggMap = new Map<string, { name: string; unit: string; qty: number }>()
  for (const o of nearestOrders) {
    for (const it of o.order_items ?? []) {
      const p = productById.get(it.product_id)
      if (!p) continue
      const realQty = it.tier_quantity ? it.quantity * it.tier_quantity : it.quantity
      const existing = aggMap.get(it.product_id)
      if (existing) existing.qty += realQty
      else aggMap.set(it.product_id, { name: p.name, unit: it.tier_quantity ? '本' : p.unit, qty: realQty })
    }
  }
  const aggList = Array.from(aggMap.values())
    .filter((a) => a.qty > 0)
    .sort((a, b) => b.qty - a.qty)
  const shownItems = aggList.length > 6 ? aggList.slice(0, 5) : aggList
  const moreItemCount = aggList.length > 6 ? aggList.length - 5 : 0

  const hasActionItems = overdueCount > 0 || pendingCompaniesCount > 0 || unconfirmedCount > 0
  const nothingToDo = !hasActionItems && bannerType !== 'remind'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="order-0 text-2xl font-bold text-gray-900">ホーム</h1>

      {/* スマホ用 機能ハブ（PCはサイドバーがあるので非表示） */}
      <div className="order-1 md:hidden grid grid-cols-3 gap-3">
        {HUB_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex flex-col items-center justify-center gap-2 active:bg-gray-50 transition-colors min-h-[88px]"
          >
            <svg className="w-7 h-7 text-fukamidori" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            <span className="text-xs font-bold text-gray-700">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* 次の納品（最重要ブロック） */}
      <div className="order-2 bg-white rounded-xl border-2 border-fukamidori shadow-sm overflow-hidden">
        {!nearestKey ? (
          <div className="px-4 py-4">
            <p className="text-sm text-gray-500">直近の納品予定はありません</p>
            {nullDateCount > 0 && (
              <Link href="/admin/orders?status=pending" className="mt-2 inline-block text-xs text-amber-700 font-medium hover:underline">
                納品日未設定 {nullDateCount}件 →
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* ヘッダー */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
              <h2 className={`text-base font-bold ${isNearestSoon ? 'text-amber-700' : 'text-gray-900'}`}>
                次の納品 {formatDateWithDay(nearestKey)}
              </h2>
              <span className="text-sm font-medium text-gray-500 whitespace-nowrap">{nearestOrders.length}件の注文</span>
            </div>

            {/* 商品合計 */}
            {shownItems.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {shownItems.map((item) => (
                  <div key={item.name} className="px-4 py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-800 truncate min-w-0">{item.name}</span>
                    <span className="flex items-baseline gap-0.5 flex-shrink-0">
                      <span className="text-lg font-bold text-gray-900 tabular-nums">{item.qty}</span>
                      <span className="text-xs text-gray-500">{item.unit}</span>
                    </span>
                  </div>
                ))}
                {moreItemCount > 0 && (
                  <div className="px-4 py-2 text-xs text-gray-400">ほか{moreItemCount}品</div>
                )}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-gray-400">商品明細がありません</div>
            )}

            {/* 注文管理で開く */}
            <div className="px-4 py-3 border-t border-gray-100">
              <Link
                href={`/admin/orders?status=pending&from=${nearestKey}&to=${nearestKey}`}
                className="flex items-center justify-center w-full md:w-auto md:inline-flex min-h-[44px] px-4 rounded-lg bg-fukamidori text-white text-sm font-bold active:opacity-90 transition-opacity"
              >
                この{nearestOrders.length}件を注文管理で開く
              </Link>
            </div>

            {/* その先の納品 */}
            {nextGroups.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">その先の納品</p>
                <div className="flex flex-wrap gap-2">
                  {nextGroups.map((g) => (
                    <Link
                      key={g.date}
                      href={`/admin/orders?status=pending&from=${g.date}&to=${g.date}`}
                      className="flex items-center min-h-[44px] px-3 rounded-lg border border-gray-200 text-sm text-gray-700 active:bg-gray-50 transition-colors whitespace-nowrap"
                    >
                      {formatDateWithDay(g.date)} {g.count}件
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 納品日未設定 */}
            {nullDateCount > 0 && (
              <div className="px-4 py-2 border-t border-gray-100">
                <Link href="/admin/orders?status=pending" className="text-xs text-amber-700 font-medium hover:underline">
                  納品日未設定 {nullDateCount}件 →
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* 対応が必要なこと */}
      <div className="order-3 space-y-3">
        <h2 className="font-bold text-gray-900">対応が必要なこと</h2>

        {nothingToDo ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-2 text-sm text-green-700 font-medium">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            対応が必要なことはありません
          </div>
        ) : (
          <div className="space-y-3">
            {/* 納品日超過（最優先） */}
            {overdueCount > 0 && (
              <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-red-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">納品日超過</span>
                    <span className="text-sm text-gray-500">納品日を過ぎた未発送</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{overdueCount}件</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {overdueOrders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/admin/orders/${order.id}`}
                      className="px-4 py-3 min-h-[44px] flex items-center justify-between hover:bg-gray-50 active:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 text-sm truncate">{order.company?.company_name ?? '—'}</p>
                        <p className="text-xs text-red-600 font-bold">納品 {formatDateWithDay(order.delivery_date)}</p>
                        {order.order_items && order.order_items.length > 0 && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{formatItemSummary(order.order_items)}</p>
                        )}
                      </div>
                      <span className="text-xs text-red-600 font-medium whitespace-nowrap ml-2">出荷へ →</span>
                    </Link>
                  ))}
                </div>
                {overdueCount > overdueOrders.length && (
                  <div className="px-4 py-2 border-t border-gray-100">
                    <Link href="/admin/orders?status=pending" className="text-sm text-red-600 font-medium hover:underline">
                      他 {overdueCount - overdueOrders.length}件（注文管理へ）
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* 承認待ちの取引先 */}
            {pendingCompaniesCount > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">承認待ち</span>
                    <span className="text-sm text-gray-500">新規取引先の登録申請</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{pendingCompaniesCount}件</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {pendingCompanies.map((company) => (
                    <Link
                      key={company.id}
                      href="/admin/customers"
                      className="px-4 py-3 min-h-[44px] flex items-center justify-between hover:bg-gray-50 active:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 text-sm truncate">{company.company_name}</p>
                        <p className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">
                          {company.line_users?.[0]?.display_name ?? company.representative_name ?? ''}
                          {company.created_at ? `　申請 ${formatDateWithDay(company.created_at)}` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-purple-600 font-medium whitespace-nowrap ml-2">承認へ →</span>
                    </Link>
                  ))}
                </div>
                {pendingCompaniesCount > pendingCompanies.length && (
                  <div className="px-4 py-2 border-t border-gray-100">
                    <Link href="/admin/customers" className="text-sm text-purple-600 font-medium hover:underline">
                      他 {pendingCompaniesCount - pendingCompanies.length}件（顧客管理へ）
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* 未確認の注文 */}
            {unconfirmedCount > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">未確認</span>
                    <span className="text-sm text-gray-500">まだ確認していない注文</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{unconfirmedCount}件</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {unconfirmedOrders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/admin/orders/${order.id}`}
                      className="px-4 py-3 min-h-[44px] flex items-center justify-between hover:bg-gray-50 active:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 text-sm truncate">{order.company?.company_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">
                          {order.order_number}
                          {order.delivery_date ? `　納品 ${formatDateWithDay(order.delivery_date)}` : ''}
                        </p>
                        {order.order_items && order.order_items.length > 0 && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{formatItemSummary(order.order_items)}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-600 font-medium whitespace-nowrap ml-2">確認する →</span>
                    </Link>
                  ))}
                </div>
                {unconfirmedCount > unconfirmedOrders.length && (
                  <div className="px-4 py-2 border-t border-gray-100">
                    <Link href="/admin/orders" className="text-sm text-gray-600 font-medium hover:underline">
                      他 {unconfirmedCount - unconfirmedOrders.length}件（受注一覧へ）
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* freee CSV バナー（remind時は order-4 で対応セクション直下、それ以外は order-20 で最下部） */}
      <div className={bannerType === 'remind' ? 'order-4' : 'order-20'}>
        <FreeeExportBanner onBannerTypeChange={setBannerType} />
      </div>

      {/* 詳細データ開閉ボタン（全サイズ・デフォルト閉） */}
      <button
        className="order-5 w-full bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 min-h-[44px] flex items-center justify-between text-sm font-medium text-gray-700"
        onClick={() => setDetailsOpen((v) => !v)}
      >
        <span>詳細データ（在庫・最近の注文）</span>
        <svg
          className={`w-5 h-5 flex-shrink-0 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 詳細データ本体 */}
      <div className={`order-6 ${detailsOpen ? 'md:grid md:grid-cols-2 gap-6 space-y-6 md:space-y-0' : 'hidden'}`}>
        {/* 在庫×の商品 */}
        {crossStock.length > 0 && (
          <div className="bg-white rounded-xl border border-red-100 shadow-sm">
            <div className="px-4 py-3 border-b border-red-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2 className="font-bold text-red-700">在庫×の商品</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {crossStock.map((product) => (
                <div key={product.id} className="px-4 py-3 flex items-center justify-between">
                  <p className="font-medium text-gray-900 text-sm truncate min-w-0">{product.name}</p>
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-700 flex-shrink-0 ml-2">×</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-gray-100">
              <Link href="/admin/products" className="text-sm text-green-600 font-medium hover:underline">
                商品管理で更新 →
              </Link>
            </div>
          </div>
        )}

        {/* 最近の注文 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">最近の注文</h2>
            <Link href="/admin/orders" className="text-sm text-green-600 hover:underline">
              すべて表示
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentOrders.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">注文がありません</div>
            ) : (
              recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="px-4 py-3 min-h-[44px] flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {(order.company as { company_name?: string } | undefined)?.company_name ?? '—'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {order.order_number} ・ {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-green-700 text-sm">{formatCurrency(order.total_amount)}</p>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${getOrderStatusColor(order.status)}`}>
                      {getOrderStatusLabel(order.status)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
