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

function pctChange(current: number, prev: number | null): string | null {
  if (prev === null || prev === 0) return null
  const diff = ((current - prev) / prev) * 100
  return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%'
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

// ---- Page component ----

export default function AnalyticsPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthlyView, setMonthlyView] = useState<'all' | 'category' | 'product'>('category')

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      setError(null)
      try {
        const res = await adminFetch(`/api/admin/analytics?year=${year}`)
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

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">売上分析</h1>
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
          {/* サマリー */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">{year}年 累計売上（キャンセル除く）</p>
            <p className="text-3xl font-bold text-green-700 mt-1">{formatCurrency(totalThisYear)}</p>
          </div>

          {/* (A) 月別売上グラフ */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            {/* セクションヘッダー */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-gray-900">月別売上推移</h2>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                  <button
                    onClick={() => setMonthlyView('all')}
                    className={`px-3 py-1 font-medium transition-colors ${
                      monthlyView === 'all'
                        ? 'bg-green-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    全体
                  </button>
                  <button
                    onClick={() => setMonthlyView('category')}
                    className={`px-3 py-1 font-medium transition-colors border-l border-gray-200 ${
                      monthlyView === 'category'
                        ? 'bg-green-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    カテゴリー別
                  </button>
                  <button
                    onClick={() => setMonthlyView('product')}
                    className={`px-3 py-1 font-medium transition-colors border-l border-gray-200 ${
                      monthlyView === 'product'
                        ? 'bg-green-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
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
                  onClick={() => downloadCsv(buildCategoryCsv(data.byCategory), `売上_カテゴリー別_${year}.csv`)}
                  disabled={data.byCategory.length === 0}
                  className="text-sm text-green-600 hover:text-green-800 underline disabled:opacity-50"
                >
                  CSVダウンロード
                </button>
              ) : (
                <button
                  onClick={() => downloadCsv(buildProductCsv(data.byProduct), `売上_商品別_${year}.csv`)}
                  disabled={data.byProduct.length === 0}
                  className="text-sm text-green-600 hover:text-green-800 underline disabled:opacity-50"
                >
                  CSVダウンロード
                </button>
              )}
            </div>

            {/* 全体：月別グラフ */}
            {monthlyView === 'all' && (
              chartData.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">データがありません</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={formatYen} tick={{ fontSize: 11 }} width={52} />
                      <Tooltip
                        formatter={(value) => [formatCurrency(Number(value ?? 0)), '']}
                      />
                      <Legend />
                      <Bar dataKey="今年" fill="#16a34a" radius={[3, 3, 0, 0]}>
                        <LabelList dataKey="今年" position="top" formatter={(v) => (v ? formatCurrency(Number(v)) : '')} style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} />
                      </Bar>
                      {chartData.some((d) => d.hasLastYear) && (
                        <Bar dataKey="前年" fill="#86efac" radius={[3, 3, 0, 0]} />
                      )}
                    </BarChart>
                  </ResponsiveContainer>

                  {/* 前年比ラベル（前年データのある月のみ） */}
                  {chartData.some((d) => d.pct !== null) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {chartData.map((d) =>
                        d.pct ? (
                          <span
                            key={d.name}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              d.pct.startsWith('+')
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {d.name} {d.pct}
                          </span>
                        ) : null
                      )}
                    </div>
                  )}
                </>
              )
            )}

            {/* カテゴリー別：売上比較グラフ */}
            {monthlyView === 'category' && (
              categoryChartData.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">データがありません</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={categoryChartData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={formatYen} tick={{ fontSize: 11 }} width={52} />
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value ?? 0)), '']}
                    />
                    <Bar dataKey="売上" fill="#16a34a" radius={[3, 3, 0, 0]}>
                      <LabelList dataKey="売上" position="top" formatter={(v) => (v ? formatCurrency(Number(v)) : '')} style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} />
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
                  <BarChart data={productChartData} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tickFormatter={formatYen} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} interval={0} />
                    <Tooltip formatter={(value) => [formatCurrency(Number(value ?? 0)), '']} />
                    <Bar dataKey="売上" fill="#16a34a" radius={[0, 3, 3, 0]}>
                      <LabelList dataKey="売上" position="right" formatter={(v) => (v ? formatCurrency(Number(v)) : '')} style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            )}
          </div>

          {/* (B) 商品別売上ランキング */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">商品別売上ランキング</h2>
              <button
                onClick={() => downloadCsv(buildProductCsv(data.byProduct), `売上_商品別_${year}.csv`)}
                disabled={data.byProduct.length === 0}
                className="text-sm text-green-600 hover:text-green-800 underline disabled:opacity-50"
              >
                CSVダウンロード
              </button>
            </div>
            {data.byProduct.length === 0 ? (
              <p className="text-gray-400 text-sm px-4 py-6 text-center">データがありません</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.byProduct.map((item, i) => (
                  <div key={item.product_name} className="px-4 py-3 flex items-center gap-3">
                    <span className="w-6 text-center text-xs font-bold text-gray-400 flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-gray-800 truncate">{item.product_name}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">{item.quantity.toLocaleString()}個/本</span>
                    <span className="font-bold text-green-700 text-sm flex-shrink-0">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* (C) 取引先別売上ランキング */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">取引先別売上ランキング</h2>
              <button
                onClick={() => downloadCsv(buildCompanyCsv(data.byCompany), `売上_取引先別_${year}.csv`)}
                disabled={data.byCompany.length === 0}
                className="text-sm text-green-600 hover:text-green-800 underline disabled:opacity-50"
              >
                CSVダウンロード
              </button>
            </div>
            {data.byCompany.length === 0 ? (
              <p className="text-gray-400 text-sm px-4 py-6 text-center">データがありません</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.byCompany.map((item, i) => (
                  <div key={item.company_name} className="px-4 py-3 flex items-center gap-3">
                    <span className="w-6 text-center text-xs font-bold text-gray-400 flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-gray-800 truncate">{item.company_name}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">{item.orderCount}件</span>
                    <span className="font-bold text-green-700 text-sm flex-shrink-0">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
