'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLiff } from '@/hooks/useLiff'
import { createClient } from '@/lib/supabase/client'
import type { AdminUser } from '@/types'

const NAV_ITEMS = [
  { href: '/admin', label: 'ダッシュボード', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/admin/orders', label: '注文管理', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { href: '/admin/products', label: '商品管理', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: '/admin/customers', label: '顧客管理', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { href: '/admin/shipping', label: '出荷管理', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
  { href: '/admin/invoices', label: '請求管理', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
]

const DEV_BYPASS = process.env.NODE_ENV === 'development'
const DEV_ADMIN: AdminUser = { id: 'dev', line_user_id: 'dev', name: '開発者（DEV）', role: 'superadmin' }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { userId, isLoading: liffLoading } = useLiff()
  const [adminUser, setAdminUser] = useState<AdminUser | null>(DEV_BYPASS ? DEV_ADMIN : null)
  const [checking, setChecking] = useState(!DEV_BYPASS)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (DEV_BYPASS) return

    if (!userId) {
      if (!liffLoading) setChecking(false)
      return
    }

    async function checkAdmin() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('admin_users')
          .select('*')
          .eq('line_user_id', userId)
          .single()

        setAdminUser(data as AdminUser | null)
      } catch {
        setAdminUser(null)
      } finally {
        setChecking(false)
      }
    }

    checkAdmin()
  }, [userId, liffLoading])

  if (liffLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!adminUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">アクセス拒否</h1>
          <p className="text-gray-600">管理者権限がありません</p>
          <Link href="/" className="mt-4 inline-block text-green-600 font-bold text-sm">
            ホームに戻る
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* サイドバー（デスクトップ） */}
      <aside className="hidden md:flex md:flex-col w-56 bg-green-800 text-white">
        <div className="p-4 border-b border-green-700">
          <p className="font-bold text-white">善兵衛農園</p>
          <p className="text-green-300 text-xs mt-0.5">管理システム</p>
        </div>
        <nav className="flex-1 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-green-700 text-white font-bold'
                    : 'text-green-200 hover:bg-green-700 hover:text-white'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-green-700">
          <p className="text-green-300 text-xs">{adminUser.name}</p>
        </div>
      </aside>

      {/* モバイルサイドバーオーバーレイ */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-green-800 text-white flex flex-col">
            <div className="p-4 border-b border-green-700 flex items-center justify-between">
              <div>
                <p className="font-bold text-white">善兵衛農園</p>
                <p className="text-green-300 text-xs">管理システム</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-green-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 py-4">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-green-700 text-white font-bold'
                        : 'text-green-200 hover:bg-green-700 hover:text-white'
                    }`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* トップバー（モバイル） */}
        <header className="md:hidden bg-green-800 text-white px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <p className="font-bold">
            {NAV_ITEMS.find((item) =>
              pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
            )?.label || '管理システム'}
          </p>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
