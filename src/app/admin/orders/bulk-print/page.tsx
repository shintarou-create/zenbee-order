'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Order } from '@/types'
import DeliveryNoteLayout from '@/components/admin/DeliveryNoteLayout'

export default function BulkPrintPage() {
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printed, setPrinted] = useState(false)

  useEffect(() => {
    const idsParam = searchParams.get('ids')
    if (!idsParam) {
      setError('印刷対象の注文IDが指定されていません')
      setIsLoading(false)
      return
    }

    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) {
      setError('有効な注文IDがありません')
      setIsLoading(false)
      return
    }

    const supabase = createClient()
    supabase
      .from('orders')
      .select('*, company:companies(*), order_items(*), order_shipping(*)')
      .in('id', ids)
      .order('delivery_date', { ascending: true, nullsFirst: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError('注文データの取得に失敗しました')
        } else {
          setOrders((data ?? []) as Order[])
        }
        setIsLoading(false)
      })
  }, [searchParams])

  async function markDeliveryNotePrinted(targetOrders: Order[]) {
    if (targetOrders.length === 0) return
    try {
      const supabase = createClient()
      await supabase
        .from('orders')
        .update({ delivery_note_printed: true })
        .in('id', targetOrders.map((o) => o.id))
    } catch (err) {
      console.error('delivery_note_printed 更新エラー:', err)
    }
  }

  useEffect(() => {
    if (!isLoading && orders.length > 0) {
      const timer = setTimeout(async () => {
        await markDeliveryNotePrinted(orders)
        window.print()
        setPrinted(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isLoading, orders.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">納品書を準備しています…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => window.close()}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          このタブを閉じる
        </button>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">該当する注文が見つかりませんでした</p>
        <button
          onClick={() => window.close()}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          このタブを閉じる
        </button>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @media print {
          @page {
            margin: 0;
            size: A4;
          }
          body {
            margin: 1.5cm;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-after: always;
          }
        }
      `}</style>

      {/* 操作バー（印刷時非表示） */}
      <div className="no-print mb-6 flex items-center gap-3 px-6 pt-4">
        <span className="text-sm text-gray-600">{orders.length}件の納品書</span>
        <button
          onClick={async () => { await markDeliveryNotePrinted(orders); window.print(); setPrinted(true) }}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          印刷する
        </button>
        {printed && (
          <button
            onClick={() => window.close()}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            タブを閉じる
          </button>
        )}
      </div>

      {/* 納品書一覧（各注文の間で改ページ） */}
      {orders.map((order, index) => (
        <div
          key={order.id}
          className={index < orders.length - 1 ? 'page-break' : undefined}
        >
          <DeliveryNoteLayout order={order} />
        </div>
      ))}
    </>
  )
}
