'use client'

import { useState } from 'react'
import type { Customer } from '@/types'
import { formatDate, getPriceRankLabel } from '@/lib/utils'

interface CustomerTableProps {
  customers: Customer[]
  onEdit: (customer: Customer) => void
}

export default function CustomerTable({ customers, onEdit }: CustomerTableProps) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<keyof Customer>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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
      const av = a[sortField]
      const bv = b[sortField]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const cmp = String(av).localeCompare(String(bv), 'ja')
      return sortDir === 'asc' ? cmp : -cmp
    })

  function handleSort(field: keyof Customer) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function SortIcon({ field }: { field: keyof Customer }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-green-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="space-y-3">
      {/* 検索 */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="会社名・担当者名・電話番号で検索"
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
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
                会社名 <SortIcon field="company_name" />
              </th>
              <th
                className="px-4 py-3 text-left text-gray-600 font-semibold cursor-pointer hover:bg-gray-100 hidden md:table-cell"
                onClick={() => handleSort('representative_name')}
              >
                担当者 <SortIcon field="representative_name" />
              </th>
              <th className="px-4 py-3 text-left text-gray-600 font-semibold hidden md:table-cell">電話番号</th>
              <th
                className="px-4 py-3 text-center text-gray-600 font-semibold cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('price_rank')}
              >
                ランク <SortIcon field="price_rank" />
              </th>
              <th
                className="px-4 py-3 text-center text-gray-600 font-semibold cursor-pointer hover:bg-gray-100 hidden lg:table-cell"
                onClick={() => handleSort('created_at')}
              >
                登録日 <SortIcon field="created_at" />
              </th>
              <th className="px-4 py-3 text-center text-gray-600 font-semibold">状態</th>
              <th className="px-4 py-3 text-center text-gray-600 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((customer) => (
              <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{customer.company_name}</p>
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  {customer.representative_name || '—'}
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  {customer.phone || '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    customer.price_rank === 'vip'
                      ? 'bg-purple-100 text-purple-700'
                      : customer.price_rank === 'premium'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {getPriceRankLabel(customer.price_rank)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-gray-500 text-xs hidden lg:table-cell">
                  {formatDate(customer.created_at)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    customer.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {customer.is_active ? '有効' : '無効'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onEdit(customer)}
                    className="text-green-600 hover:text-green-800 font-medium text-xs"
                  >
                    編集
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            顧客が見つかりません
          </div>
        )}
      </div>
    </div>
  )
}
