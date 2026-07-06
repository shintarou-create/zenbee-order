'use client'

import { useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import { adminFetch } from '@/lib/admin-fetch'
import { formatCurrency } from '@/lib/utils'
import type { AnalyticsResponse } from '@/app/api/admin/analytics/route'

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function formatYen(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.floor(value / 1_000)}K`
  return String(value)
}

function pctChange(current: number, prev: number | null | undefined): string | null {
  if (prev === null || prev === undefined || prev === 0) return null
  const diff = ((current - prev) / prev) * 100
  return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%'
}

function PctBadge({ label, pct }: { label: string; pct: string }) {
  const up = pct.startsWith('+')
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {label} {pct}
    </span>
  )
}

// ---- CSV helpers ----

function escapeCsv(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function buildMonthlyCsv(monthly: AnalyticsResponse['monthly']): string {
  const rows: string[][] = [['月', '今年の売上', '前年の売上', '昨年比']]
  for (const m of monthly) {
    const lastYearStr = m.lastYear === null ? '' : String(m.lastYear)
    let yoy = ''
    if (m.lastYear !== null && m.lastYear !== 0) {
      const pct = Math.round(((m.thisYear - m.lastYear) / m.lastYear) * 100)
      yoy = pct > 0 ? `+${pct}%` : pct < 0 ? `-${Math.abs(pct)}%` : '0%'
    }
    rows.push([`${m.month}月`, String(m.thisYear), lastYearStr, yoy])
  }
  return rows.map(r => r.map(escapeCsv).join(',')).join('\n')
}

function buildProductCsv(byProduct: AnalyticsResponse['byProduct']): string {
  const rows: string[][] = [['順位', '商品名', '数量', '売上金額']]
  byProduct.forEach((item, i) => {
    rows.push([String(i + 1), item.product_name, String(item.quantity), String(item.total)])
  })
  return rows.map(r => r.map(escapeCsv).join(',')).join('\n')
}

function buildCompanyCsv(byCompany: AnalyticsResponse['byCompany']): string {
  const rows: string[][] = [['順位', '取引先名', '注文件数', '売上金額']]
  byCompany.forEach((item, i) => {
    rows.push([String(i + 1), item.company_name, String(item.orderCount), String(item.total)])
  })
  return rows.map(r => r.map(escapeCsv).join(',')).join('\n')
}

function buildCategoryCsv(byCategory: AnalyticsResponse['byCategory']): string {
  const rows: string[][] = [['順位', 'カテゴリー名', '数量', '売上金額']]
  byCategory.forEach((item, i) => {
    rows.push([String(i + 1), item.category_name, String(item.quantity), String(item.total)])
  })
  return rows.map(r => r.map(escapeCsv).join(',')).join('\n')
}

function downloadCsv(csvString: string, filename: string): void {
  const withBom = '﻿' + csvString
  const blob = new Blob([withBom], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 月別推移グラフのカスタムツールチップ（今年・前年・前年比を統合表示）
type MonthlyRow = { 今年?: number; 前年?: number; pct?: string | null; hasLastYear?: boolean }
function MonthlyTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ payload: MonthlyRow }>
  label?: string | number
}) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="font-bold text-gray-900 mb-0.5">{label}</p>
      <p className="text-green-700">今年: {formatCurrency(d.今年 ?? 0)}</p>
      {d.hasLastYear && <p className="text-gray-500">前年: {formatCurrency(d.前年 ?? 0)}</p>}
      {d.pct && (
        <p className={d.pct.startsWith('+') ? 'text-green-600' : 'text-red-600'}>前年比: {d.pct}</p>
      )}
    </div>
  )
}

// ---- Page component ----

export default function AnalyticsPage() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState<number | null>(null) // null = 年間
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthlyView, setMonthlyView] = useState<'all' | 'category' | 'product'>('product')
  const [productExpanded, setProductExpanded] = useState(false)
  const [companyExpanded, setCompanyExpanded] = useState(false)

  const isCurrentYear = year === currentYear

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      setError(null)
      try {
        const url = month ? `/api/admin/analytics?year=${year}&month=${month}` : `/api/admin/analytics?year=${year}`
        const res = await adminFetch(url)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'エラー')
        setData(json.data as AnalyticsResponse)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'データの取得に失敗しました')
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [year, month])

  // 年切替時は未来月を選んでいたら年間へ戻す
  useEffect(() => {
    if (isCurrentYear && month && month > currentMonth) setMonth(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  const chartData = (data?.monthly ?? []).map((m) => ({
    name: MONTH_LABELS[m.month - 1],
    今年: m.thisYear,
    前年: m.lastYear ?? undefined,
    pct: pctChange(m.thisYear, m.lastYear),
    hasLastYear: m.lastYear !== null,
  }))

  const categoryChartData = (data?.byCategory ?? []).map((c) => ({
    name: c.category_name,
    売上: c.total,
  }))

  const productChartData = (data?.byProduct ?? []).slice(0, 10).map((p) => ({
    name: p.product_name,
    売上: p.total,
  }))

  const totalThisYear = (data?.monthly ?? []).reduce((s, m) => s + m.thisYear, 0)

  // 今月カード算出
  const thisMonthRow = (data?.monthly ?? []).find((m) => m.month === currentMonth)
  const thisMonthSales = thisMonthRow?.thisYear ?? 0
  const yoyPct = thisMonthRow ? pctChange(thisMonthSales, thisMonthRow.lastYear) : null
  const prevMonthRow = (data?.monthly ?? []).find((m) => m.month === currentMonth - 1)
  const momPct = prevMonthRow ? pctChange(thisMonthSales, prevMonthRow.thisYear) : null

  // 期間ラベル・ファイル名サフィックス
  const periodSuffix = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}`
  const periodLabel = month ? `${month}月` : '年間'

  const shownProducts = productExpanded ? (data?.byProduct ?? []) : (data?.byProduct ?? []).slice(0, 10)
  const shownCompanies = companyExpanded ? (data?.byCompany ?? []) : (data?.byCompany ?? []).slice(0, 10)

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">売上分析</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">対象年：</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {!isLoading && !error && data && (
        <>
          {/* 今月カード（当年のみ） / 過去年は年間累計カード */}
          {isCurrentYear ? (
            <div className="bg-white rounded-xl border-2 border-green-600 shadow-sm p-4">
              <p className="text-sm text-gray-500">{currentMonth}月の売上</p>
              <p className="text-3xl font-bold text-green-700 mt-1">{formatCurrency(thisMonthSales)}</p>
              {(yoyPct || momPct) && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {yoyPct && <PctBadge label="前年同月比" pct={yoyPct} />}
                  {momPct && <PctBadge label="前月比" pct={momPct} />}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">{year}年 累計 {formatCurrency(totalThisYear)}（キャンセル除く）</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-sm text-gray-500">{year}年 累計売上（キャンセル除く）</p>
              <p className="text-3xl font-bold text-green-700 mt-1">{formatCurrency(totalThisYear)}</p>
            </div>
          )}

          {/* 期間チップ（カテゴリー/商品グラフ・ランキングを絞り込む。月別推移は常に年間） */}
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            <button
              onClick={() => setMonth(null)}
              className={`flex items-center px-3 min-h-[44px] rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                month === null ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              年間
            </button>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const disabled = isCurrentYear && m > currentMonth
              if (disabled) return null // 当年の未来月は非表示
              return (
                <button
                  key={m}
                  onClick={() => setMonth(m)}
                  className={`flex items-center px-3 min-h-[44px] rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                    month === m ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {m}月
                </button>
              )
            })}
          </div>

          {/* (A) 月別売上グラフ */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            {/* セクションヘッダー */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-bold text-gray-900">
                  {monthlyView === 'all' ? '月別売上推移' : monthlyView === 'category' ? `カテゴリー別（${periodLabel}）` : `商品別（${periodLabel}）`}
                </h2>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                  <button
                    onClick={() => setMonthlyView('all')}
                    className={`px-3 py-1.5 min-h-[40px] font-medium transition-colors ${
                      monthlyView === 'all' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    全体
                  </button>
                  <button
                    onClick={() => setMonthlyView('category')}
                    className={`px-3 py-1.5 min-h-[40px] font-medium transition-colors border-l border-gray-200 ${
                      monthlyView === 'category' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    カテゴリー別
                  </button>
                  <button
                    onClick={() => setMonthlyView('product')}
                    className={`px-3 py-1.5 min-h-[40px] font-medium transition-colors border-l border-gray-200 ${
                      monthlyView === 'product' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    商品別
                  </button>
                </div>
              </div>
              {monthlyView === 'all' ? (
                <button
                  onClick={() => downloadCsv(buildMonthlyCsv(data.monthly), `売上_月別_${year}.csv`)}
                  disabled={data.monthly.length === 0}
                  className="text-sm text-green-600 hover:text-green-800 underline disabled:opacity-50"
                >
                  CSVダウンロード
                </button>
              ) : monthlyView === 'category' ? (
                <button
                  onClick={() => downloadCsv(buildCategoryCsv(data.byCategory), `売上_カテゴリー別_${periodSuffix}.csv`)}
                  disabled={data.byCategory.length === 0}
                  className="text-sm text-green-600 hover:text-green-800 underline disabled:opacity-50"
                >
                  CSVダウンロード
                </button>
              ) : (
                <button
                  onClick={() => downloadCsv(buildProductCsv(data.byProduct), `売上_商品別_${periodSuffix}.csv`)}
                  disabled={data.byProduct.length === 0}
                  className="text-sm text-green-600 hover:text-green-800 underline disabled:opacity-50"
                >
                  CSVダウンロード
                </button>
              )}
            </div>

            {/* 全体：月別グラフ（常に年間） */}
            {monthlyView === 'all' && (
              chartData.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">データがありません</p>
              ) : (
                <>
                  {month && <p className="text-xs text-gray-400 mb-2">月別推移は年間表示です（期間チップの影響を受けません）</p>}
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis tickFormatter={formatYen} tick={{ fontSize: 11 }} width={44} />
                      <Tooltip content={<MonthlyTooltip />} />
                      <Legend />
                      <Bar dataKey="今年" fill="#16a34a" radius={[3, 3, 0, 0]}>
                        <LabelList dataKey="今年" position="top" formatter={(v) => (v ? formatYen(Number(v)) : '')} style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }} />
                      </Bar>
                      {chartData.some((d) => d.hasLastYear) && (
                        <Bar dataKey="前年" fill="#86efac" radius={[3, 3, 0, 0]} />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )
            )}

            {/* カテゴリー別：売上比較グラフ */}
            {monthlyView === 'category' && (
              categoryChartData.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">データがありません</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={categoryChartData} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis tickFormatter={formatYen} tick={{ fontSize: 11 }} width={44} />
                    <Tooltip formatter={(value) => [formatCurrency(Number(value ?? 0)), '']} />
                    <Bar dataKey="売上" fill="#16a34a" radius={[3, 3, 0, 0]}>
                      <LabelList dataKey="売上" position="top" formatter={(v) => (v ? formatYen(Number(v)) : '')} style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            )}
            {/* 商品別：横棒グラフ */}
            {monthlyView === 'product' && (
              productChartData.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">データがありません</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(280, productChartData.length * 44)}>
                  <BarChart data={productChartData} layout="vertical" margin={{ top: 4, right: 64, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tickFormatter={formatYen} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} interval={0} />
                    <Tooltip formatter={(value) => [formatCurrency(Number(value ?? 0)), '']} />
                    <Bar dataKey="売上" fill="#16a34a" radius={[0, 3, 3, 0]}>
                      <LabelList dataKey="売上" position="right" formatter={(v) => (v ? formatYen(Number(v)) : '')} style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            )}
          </div>

          {/* (B) 商品別売上ランキング */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <h2 className="font-bold text-gray-900">商品別ランキング<span className="text-xs font-normal text-gray-400 ml-1">（{periodLabel}）</span></h2>
              <button
                onClick={() => downloadCsv(buildProductCsv(data.byProduct), `売上_商品別_${periodSuffix}.csv`)}
                disabled={data.byProduct.length === 0}
                className="text-sm text-green-600 hover:text-green-800 underline disabled:opacity-50 flex-shrink-0"
              >
                CSVダウンロード
              </button>
            </div>
            {data.byProduct.length === 0 ? (
              <p className="text-gray-400 text-sm px-4 py-6 text-center">データがありません</p>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {shownProducts.map((item, i) => (
                    <div key={item.product_name} className="px-4 py-3 flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-bold text-gray-400 flex-shrink-0">{i + 1}</span>
                      <span className="flex-1 text-sm text-gray-800 truncate">{item.product_name}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">{item.quantity.toLocaleString()}個/本</span>
                      <span className="font-bold text-green-700 text-sm flex-shrink-0">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
                {data.byProduct.length > 10 && (
                  <button
                    onClick={() => setProductExpanded((v) => !v)}
                    className="w-full px-4 py-3 min-h-[44px] text-sm font-medium text-green-600 hover:bg-gray-50 border-t border-gray-100"
                  >
                    {productExpanded ? '閉じる ▲' : `すべて表示 ▼（残り${data.byProduct.length - 10}件）`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* (C) 取引先別売上ランキング */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <h2 className="font-bold text-gray-900">取引先別ランキング<span className="text-xs font-normal text-gray-400 ml-1">（{periodLabel}）</span></h2>
              <button
                onClick={() => downloadCsv(buildCompanyCsv(data.byCompany), `売上_取引先別_${periodSuffix}.csv`)}
                disabled={data.byCompany.length === 0}
                className="text-sm text-green-600 hover:text-green-800 underline disabled:opacity-50 flex-shrink-0"
              >
                CSVダウンロード
              </button>
            </div>
            {data.byCompany.length === 0 ? (
              <p className="text-gray-400 text-sm px-4 py-6 text-center">データがありません</p>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {shownCompanies.map((item, i) => (
                    <div key={item.company_name} className="px-4 py-3 flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-bold text-gray-400 flex-shrink-0">{i + 1}</span>
                      <span className="flex-1 text-sm text-gray-800 truncate">{item.company_name}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">{item.orderCount}件</span>
                      <span className="font-bold text-green-700 text-sm flex-shrink-0">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
                {data.byCompany.length > 10 && (
                  <button
                    onClick={() => setCompanyExpanded((v) => !v)}
                    className="w-full px-4 py-3 min-h-[44px] text-sm font-medium text-green-600 hover:bg-gray-50 border-t border-gray-100"
                  >
                    {companyExpanded ? '閉じる ▲' : `すべて表示 ▼（残り${data.byCompany.length - 10}件）`}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
