'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ProductSummary {
  productId: string
  name: string
  unit: string
  category: string
  totalQty: number
}

interface PendingProductsSummaryProps {
  dateFrom?: string
  dateTo?: string
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; order: number }> = {
  citrus: { label: '柑橘',     icon: '🍊', order: 0 },
  biwa:   { label: 'びわ',     icon: '🫒', order: 1 },
  juice:  { label: 'ジュース', icon: '🧃', order: 2 },
  other:  { label: 'その他',   icon: '📦', order: 3 },
}

export default function PendingProductsSummary({ dateFrom, dateTo }: PendingProductsSummaryProps) {
  const [summaries, setSummaries] = useState<ProductSummary[]>([])
  const [orderCount, setOrderCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchSummary() {
      setIsLoading(true)
      try {
        const supabase = createClient()

        // Step1: pending注文IDを取得（納品日フィルター付き）
        let ordersQuery = supabase
          .from('orders')
          .select('id')
          .eq('status', 'pending')
        if (dateFrom) ordersQuery = ordersQuery.gte('delivery_date', dateFrom)
        if (dateTo)   ordersQuery = ordersQuery.lte('delivery_date', dateTo)

        const { data: orderRows, error: ordersError } = await ordersQuery
        if (ordersError) throw ordersError

        if (!orderRows || orderRows.length === 0) {
          setSummaries([])
          setOrderCount(0)
          return
        }

        setOrderCount(orderRows.length)
        const orderIds = orderRows.map((o) => o.id)

        // Step2: order_items を取得（product_id, quantity のみ）
        const { data: items, error: itemsError } = await supabase
          .from('order_items')
          .select('product_id, quantity')
          .in('order_id', orderIds)
        if (itemsError) throw itemsError

        if (!items || items.length === 0) {
          setSummaries([])
          return
        }

        // Step3: 全商品マスタを取得（24件程度なので全件OK）
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('id, name, unit, category')
        if (productsError) throw productsError

        const productMap = new Map((products ?? []).map((p) => [p.id, p]))

        // Step4: JS側で product_id ごとに数量を集計
        const summaryMap = new Map<string, ProductSummary>()
        for (const item of items) {
          const product = productMap.get(item.product_id)
          if (!product) continue
          const existing = summaryMap.get(item.product_id)
          if (existing) {
            existing.totalQty += item.quantity
          } else {
            summaryMap.set(item.product_id, {
              productId: item.product_id,
              name: product.name,
              unit: product.unit,
              category: product.category || 'other',
              totalQty: item.quantity,
            })
          }
        }

        setSummaries(Array.from(summaryMap.values()))
      } catch (err) {
        console.error('未発送商品集計エラー:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSummary()
  }, [dateFrom, dateTo])

  // カテゴリでグループ化、各グループ内は合計数量の多い順
  const grouped = Object.entries(CATEGORY_CONFIG)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([cat, config]) => ({
      cat,
      config,
      items: summaries
        .filter((s) => s.category === cat && s.totalQty > 0)
        .sort((a, b) => b.totalQty - a.totalQty),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-bold text-gray-900">📦 未発送の商品合計</h2>
        {!isLoading && (
          <span className="text-sm text-gray-500">{orderCount}件の注文</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : summaries.length === 0 ? (
        <div className="px-4 py-8 text-center text-gray-400 text-sm">
          未発送の注文はありません
        </div>
      ) : (
        <div>
          {grouped.map(({ cat, config, items }) => (
            <div key={cat}>
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 first:border-t-0">
                <span className="text-sm font-semibold text-gray-600">
                  {config.icon} {config.label}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {items.map((item) => (
                    <tr key={item.productId}>
                      <td className="px-4 py-2.5 text-gray-800">{item.name}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">
                        {item.totalQty}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 w-12">{item.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
