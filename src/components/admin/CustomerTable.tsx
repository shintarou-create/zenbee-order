'use client'

import { useState } from 'react'
import type { Company } from '@/types'
import { getPriceRankLabel } from '@/lib/utils'

interface CustomerTableProps {
  customers: Company[]
  onEdit: (customer: Company) => void
  onLinkLine: (customer: Company) => void
  onApprove?: (customer: Company) => void
  onGenerateCode?: (customer: Company) => void
  generatingCodeId?: string | null
  approvingId?: string | null
}

export default function CustomerTable({
  customers,
  onEdit,
  onLinkLine,
  onApprove,
  onGenerateCode,
  generatingCodeId,
  approvingId,
}: CustomerTableProps) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<keyof Company>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [unlinkedFirst, setUnlinkedFirst] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filtered = customers
    .filter((c) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        c.company_name.toLowerCase().includes(q) ||
        (c.representative_name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (unlinkedFirst) {
        const aLinked = (a.line_users?.length ?? 0) > 0
        const bLinked = (b.line_users?.length ?? 0) > 0
        if (aLinked !== bLinked) return aLinked ? 1 : -1
      }
      const av = a[sortField]
      const bv = b[sortField]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const cmp = String(av).localeCompare(String(bv), 'ja')
      return sortDir === 'asc' ? cmp : -cmp
    })

  function handleSort(field: keyof Company) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  async function handleCopyCode(company: Company) {
    if (!company.registration_code) return
    try {
      await navigator.clipboard.writeText(company.registration_code)
      setCopiedId(company.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // コピー失敗は無視
    }
  }

  function SortIcon({ field }: { field: keyof Company }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-green-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="space-y-3">
      {/* 検索 + ソートオプション */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="店名・担当者名・電話番号で検索"
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unlinkedFirst}
            onChange={(e) => setUnlinkedFirst(e.target.checked)}
            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          未紐づけを上に
        </label>
      </div>

      <div className="text-sm text-gray-500">{filtered.length}件</div>

      {/* テーブル */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th
                className="px-4 py-3 text-left text-gray-600 font-semibold cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('company_name')}
              >
                店名 <SortIcon field="company_name" />
              </th>
              <th
                className="px-4 py-3 text-left text-gray-600 font-semibold cursor-pointer hover:bg-gray-100 hidden md:table-cell"
                onClick={() => handleSort('representative_name')}
              >
                担当者 <SortIcon field="representative_name" />
              </th>
              <th className="px-4 py-3 text-left text-gray-600 font-semibold hidden md:table-cell">
                電話番号
              </th>
              <th className="px-4 py-3 text-center text-gray-600 font-semibold">LINE</th>
              <th
                className="px-4 py-3 text-center text-gray-600 font-semibold cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('price_rank')}
              >
                価格帯 <SortIcon field="price_rank" />
              </th>
              <th className="px-4 py-3 text-center text-gray-600 font-semibold">状態</th>
              <th className="px-4 py-3 text-center text-gray-600 font-semibold">登録コード</th>
              <th className="px-4 py-3 text-center text-gray-600 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((company) => {
              const hasLine = (company.line_users?.length ?? 0) > 0
              const missingAddress = !company.postal_code && !company.address
              const isPending = company.approval_status === 'pending'
              const isRejected = company.approval_status === 'rejected'
              return (
                <tr key={company.id} className={`hover:bg-gray-50 transition-colors ${isPending ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{company.company_name}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {company.has_separate_billing && (
                        <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                          請求先別
                        </span>
                      )}
                      {missingAddress && (
                        <span className="text-xs text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded">
                          住所未取得
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                    {company.representative_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                    {company.phone || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full ${
                        hasLine ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {hasLine ? '連携済' : '未紐づけ'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full ${
                        company.price_rank === 'vip'
                          ? 'bg-purple-100 text-purple-700'
                          : company.price_rank === 'premium'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {getPriceRankLabel(company.price_rank)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-full ${
                          company.is_active && !isPending && !isRejected
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {company.is_active ? '有効' : '無効'}
                      </span>
                      {isPending && (
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                          承認待ち
                        </span>
                      )}
                      {isRejected && (
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">
                          却下
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {company.registration_code ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded tracking-wider">
                          {company.registration_code}
                        </span>
                        <button
                          onClick={() => handleCopyCode(company)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {copiedId === company.id ? 'コピー済 ✓' : 'コピー'}
                        </button>
                      </div>
                    ) : onGenerateCode ? (
                      <button
                        onClick={() => onGenerateCode(company)}
                        disabled={generatingCodeId === company.id}
                        className="text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50"
                      >
                        {generatingCodeId === company.id ? '生成中...' : 'コード生成'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onEdit(company)}
                          className="text-green-600 hover:text-green-800 font-medium text-xs"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => onLinkLine(company)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                        >
                          LINE紐づけ
                        </button>
                      </div>
                      {isPending && onApprove && (
                        <button
                          onClick={() => onApprove(company)}
                          disabled={approvingId === company.id}
                          className="text-xs font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-1 rounded-full transition-colors"
                        >
                          {approvingId === company.id ? '承認中...' : '承認する'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">顧客が見つかりません</div>
        )}
      </div>
    </div>
  )
}
