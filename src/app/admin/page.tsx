'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Order, Product, Inventory } from '@/types'
import { formatDate, formatCurrency, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'
import PendingProductsSummary from '@/components/admin/PendingProductsSummary'

interface LowStockItem {
  product: Product
  inventory: Inventory
}

export default function AdminDashboard() {
  const [todayOrderCount, setTodayOrderCount] = useState(0)
  const [pendingOrderCount, setPendingOrderCount] = useState(0)
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([])
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>

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
