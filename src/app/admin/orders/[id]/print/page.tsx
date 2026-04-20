'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Order } from '@/types'
import DeliveryNoteLayout from '@/components/admin/DeliveryNoteLayout'

export default function OrderPrintPage() {
  const params = useParams()
  const id = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('orders')
      .select('*, company:companies(*), order_items(*), order_shipping(*)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) setOrder(data as Order)
        setIsLoading(false)
      })
  }, [id])

  useEffect(() => {
    if (order) {
      const timer = setTimeout(() => window.print(), 500)
      return () => clearTimeout(timer)
    }
  }, [order])

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">注文が見つかりません</p>
        <Link href="/admin/orders" className="mt-4 inline-block text-green-600 font-bold text-sm">
          注文一覧に戻る
        </Link>
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
        }
      `}</style>

      {/* 操作エリア（印刷時非表示） */}
      <div className="no-print mb-6 px-6 pt-4 space-y-3">
        {/* 戻るリンク */}
        <Link
          href={`/admin/orders/${id}`}
          className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 w-fit"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          注文詳細に戻る
        </Link>

        {/* ボタンエリア */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-4 space-y-3">
          <p className="text-sm text-gray-600">納品書を印刷またはPDF保存できます</p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => window.print()}
              className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              印刷する
            </button>
            <button
              onClick={() => window.print()}
              className="border border-green-600 text-green-700 hover:bg-green-50 font-bold px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors bg-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDFで保存
            </button>
          </div>
          <p className="text-xs text-gray-400">
            ※「PDFで保存」を選んだ場合、印刷ダイアログの送信先を「PDFとして保存」に変更してください
          </p>
        </div>
      </div>

      <DeliveryNoteLayout order={order} />
    </>
  )
}
