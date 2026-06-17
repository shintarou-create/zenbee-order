'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Order, Product, Inventory } from '@/types'
import { formatDate, formatDateWithDay, formatCurrency, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'
import PendingProductsSummary from '@/components/admin/PendingProductsSummary'
import FreeeExportBanner from '@/components/admin/FreeeExportBanner'

interface LowStockItem {
  product: Product
  inventory: Inventory
}

interface PendingCompany {
  id: string
  company_name: string
  representative_name: string | null
  created_at: string
  line_users?: Array<{ display_name: string | null }>
}

interface ActionOrder {
  id: string
  order_number: string
  delivery_date: string | null
  company: { company_name: string } | null
}

export default function AdminDashboard() {
  const [todayOrderCount, setTodayOrderCount] = useState(0)
  const [pendingOrderCount, setPendingOrderCount] = useState(0)
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([])
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [pendingCompanies, setPendingCompanies] = useState<PendingCompany[]>([])
  const [pendingCompaniesCount, setPendingCompaniesCount] = useState(0)
  const [unconfirmedOrders, setUnconfirmedOrders] = useState<ActionOrder[]>([])
  const [unconfirmedCount, setUnconfirmedCount] = useState(0)
  const [unshippedSoonOrders, setUnshippedSoonOrders] = useState<ActionOrder[]>([])
  const [unshippedSoonCount, setUnshippedSoonCount] = useState(0)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const supabase = createClient()

        // 今日の注文数
        const today = new Date()
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

        const { count: todayCount } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart.toISOString())
          .lt('created_at', todayEnd.toISOString())

        setTodayOrderCount(todayCount || 0)

        // 確認待ち注文数
        const { count: pendingCount } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')

        setPendingOrderCount(pendingCount || 0)

        // 在庫少ない商品（在庫-引当 < 10）
        const { data: inventories } = await supabase
          .from('inventory')
          .select(`
            *,
            product:products (*)
          `)
          .order('available_qty', { ascending: true })

        if (inventories) {
          const low = inventories
            .filter((inv) => {
              const net = (inv.available_qty || 0) - (inv.reserved_qty || 0)
              return net < 10 && inv.product?.is_active
            })
            .slice(0, 5)
            .map((inv) => ({
              product: inv.product as Product,
              inventory: {
                id: inv.id,
                product_id: inv.product_id,
                available_qty: inv.available_qty,
                reserved_qty: inv.reserved_qty,
                updated_at: inv.updated_at,
              } as Inventory,
            }))
          setLowStockItems(low)
        }

        // 最近の注文（10件）
        const { data: orders } = await supabase
          .from('orders')
          .select(`
            *,
            company:companies (company_name, representative_name)
          `)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(10)

        setRecentOrders((orders || []) as Order[])

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
          .select('id, order_number, delivery_date, company:companies(company_name)', { count: 'exact' })
          .eq('status', 'pending')
          .or('details_confirmed.is.null,details_confirmed.eq.false')
          .order('delivery_date', { ascending: true, nullsFirst: false })
          .limit(5)

        setUnconfirmedCount(unconfirmedCnt || 0)
        setUnconfirmedOrders((unconfirmed || []) as unknown as ActionOrder[])

        // 未出荷の注文（納品日が今日〜7日後）
        const todayJSTStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
        const [tyear, tmonth, tday] = todayJSTStr.split('-').map(Number)
        const plus7date = new Date(tyear, tmonth - 1, tday + 7)
        const plus7JSTStr = `${plus7date.getFullYear()}-${String(plus7date.getMonth() + 1).padStart(2, '0')}-${String(plus7date.getDate()).padStart(2, '0')}`

        const { data: unshippedSoon, count: unshippedSoonCnt } = await supabase
          .from('orders')
          .select('id, order_number, delivery_date, company:companies(company_name)', { count: 'exact' })
          .eq('status', 'pending')
          .gte('delivery_date', todayJSTStr)
          .lte('delivery_date', plus7JSTStr)
          .order('delivery_date', { ascending: true })
          .limit(5)

        setUnshippedSoonCount(unshippedSoonCnt || 0)
        setUnshippedSoonOrders((unshippedSoon || []) as unknown as ActionOrder[])
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

  const hasActionItems = pendingCompaniesCount > 0 || unconfirmedCount > 0 || unshippedSoonCount > 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>

      {/* freee CSV リマインドバナー */}
      <FreeeExportBanner />

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-sm text-gray-500">本日の受注</p>
          <p className="text-3xl font-bold text-green-700 mt-1">{todayOrderCount}</p>
          <p className="text-xs text-gray-400 mt-1">件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-sm text-gray-500">確認待ち</p>
          <p className={`text-3xl font-bold mt-1 ${pendingOrderCount > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
            {pendingOrderCount}
          </p>
          <p className="text-xs text-gray-400 mt-1">件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-sm text-gray-500">在庫注意</p>
          <p className={`text-3xl font-bold mt-1 ${lowStockItems.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {lowStockItems.length}
          </p>
          <p className="text-xs text-gray-400 mt-1">商品</p>
        </div>
        <Link href="/admin/orders" className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-4 hover:bg-green-100 transition-colors">
          <p className="text-sm text-green-700">受注一覧へ</p>
          <p className="text-2xl font-bold text-green-700 mt-1">→</p>
        </Link>
      </div>

      {/* 対応が必要なこと */}
      <div className="space-y-3">
        <h2 className="font-bold text-gray-900">対応が必要なこと</h2>

        {!hasActionItems ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-2 text-sm text-green-700 font-medium">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            対応が必要なことはありません
          </div>
        ) : (
          <div className="space-y-3">
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
                      className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{company.company_name}</p>
                        <p className="text-xs text-gray-500">
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
                      className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-gray-900 text-sm">
                          {order.company?.company_name ?? '—'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {order.order_number}
                          {order.delivery_date ? `　納品 ${formatDateWithDay(order.delivery_date)}` : ''}
                        </p>
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

            {/* 未出荷の注文（7日以内） */}
            {unshippedSoonCount > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">未出荷</span>
                    <span className="text-sm text-gray-500">納品日が近い未発送の注文</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{unshippedSoonCount}件</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {unshippedSoonOrders.map((order) => {
                    const isUrgent = !!order.delivery_date && order.delivery_date <= tomorrowJST
                    return (
                      <Link
                        key={order.id}
                        href={`/admin/orders/${order.id}`}
                        className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            {order.company?.company_name ?? '—'}
                          </p>
                          <p className={`text-xs ${isUrgent ? 'text-amber-700 font-bold' : 'text-gray-500'}`}>
                            納品 {formatDateWithDay(order.delivery_date)}
                          </p>
                        </div>
                        <span className="text-xs text-amber-700 font-medium whitespace-nowrap ml-2">出荷へ →</span>
                      </Link>
                    )
                  })}
                </div>
                {unshippedSoonCount > unshippedSoonOrders.length && (
                  <div className="px-4 py-2 border-t border-gray-100">
                    <Link href="/admin/orders" className="text-sm text-amber-700 font-medium hover:underline">
                      他 {unshippedSoonCount - unshippedSoonOrders.length}件（受注一覧へ）
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 未発送商品合計 */}
      <PendingProductsSummary />

      <div className="grid md:grid-cols-2 gap-6">
        {/* 在庫アラート */}
        {lowStockItems.length > 0 && (
          <div className="bg-white rounded-xl border border-red-100 shadow-sm">
            <div className="px-4 py-3 border-b border-red-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2 className="font-bold text-red-700">在庫注意商品</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {lowStockItems.map(({ product, inventory }) => {
                const net = inventory.available_qty - inventory.reserved_qty
                return (
                  <div key={product.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{product.name}</p>
                      <p className="text-xs text-gray-500">引当後: {net}{product.unit}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      net <= 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {net <= 0 ? '在庫切れ' : '残りわずか'}
                    </span>
                  </div>
                )
              })}
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
              <div className="px-4 py-6 text-center text-gray-400 text-sm">
                注文がありません
              </div>
            ) : (
              recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{order.order_number}</p>
                    <p className="text-xs text-gray-500">
                      {(order.company as { company_name: string } | undefined)?.company_name} ・ {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
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
