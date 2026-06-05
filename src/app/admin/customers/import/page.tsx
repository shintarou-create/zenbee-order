'use client'

import { useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/admin-fetch'

const EXPECTED_COLUMNS = [
  'company_name',
  'representative_name',
  'postal_code',
  'prefecture',
  'city',
  'address',
  'building',
  'phone',
  'email',
  'price_rank',
] as const

interface CsvRow {
  company_name: string
  representative_name: string
  postal_code: string
  prefecture: string
  city: string
  address: string
  building: string
  phone: string
  email: string
  price_rank: string
}

interface ImportResult {
  row: number
  company_name: string
  action: 'insert' | 'update' | 'error'
  status: 'ok' | 'error'
  message?: string
}

interface ImportStats {
  new: number
  updated: number
  error: number
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseCsv(text: string): { rows: CsvRow[]; parseErrors: string[] } {
  const cleaned = text.startsWith('﻿') ? text.slice(1) : text
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim())
  const parseErrors: string[] = []

  if (lines.length < 2) {
    parseErrors.push('CSVにデータ行がありません（ヘッダー行のみ）')
    return { rows: [], parseErrors }
  }

  const header = splitCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''))
  const missing = EXPECTED_COLUMNS.filter((col) => !header.includes(col))
  if (missing.length > 0) {
    parseErrors.push(`ヘッダー列が不足しています: ${missing.join(', ')}`)
    return { rows: [], parseErrors }
  }

  const colIndex = Object.fromEntries(
    EXPECTED_COLUMNS.map((col) => [col, header.indexOf(col)])
  ) as Record<(typeof EXPECTED_COLUMNS)[number], number>

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    if (cells.length !== header.length) {
      parseErrors.push(
        `${i + 1}行目: 列数不一致（期待 ${header.length} 列、実際 ${cells.length} 列）`
      )
      continue
    }
    rows.push({
      company_name: cells[colIndex.company_name] || '',
      representative_name: cells[colIndex.representative_name] || '',
      postal_code: cells[colIndex.postal_code] || '',
      prefecture: cells[colIndex.prefecture] || '',
      city: cells[colIndex.city] || '',
      address: cells[colIndex.address] || '',
      building: cells[colIndex.building] || '',
      phone: cells[colIndex.phone] || '',
      email: cells[colIndex.email] || '',
      price_rank: cells[colIndex.price_rank] || '',
    })
  }

  return { rows, parseErrors }
}

export default function ImportPage() {
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [parsedRows, setParsedRows] = useState<CsvRow[] | null>(null)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResults(null)
    setStats(null)
    setIsDone(false)
    setMessage(null)
    setParsedRows(null)
    setParseErrors([])

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { rows, parseErrors: errs } = parseCsv(text)
      setParseErrors(errs)
      if (errs.length === 0) setParsedRows(rows)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function callImportApi(dryRun: boolean) {
    if (!parsedRows) return
    setIsLoading(true)
    setMessage(null)
    try {
      const res = await adminFetch('/api/admin/companies/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows, dryRun }),
      })
      const json = (await res.json()) as {
        results: ImportResult[]
        stats: ImportStats
        error?: string
      }
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || 'エラーが発生しました' })
        return
      }
      setResults(json.results)
      setStats(json.stats)
      if (!dryRun) {
        setIsDone(true)
        setMessage({
          type: 'success',
          text: `インポート完了: 新規 ${json.stats.new} 件、更新 ${json.stats.updated} 件${json.stats.error > 0 ? `、エラー ${json.stats.error} 件` : ''}`,
        })
      }
    } catch {
      setMessage({ type: 'error', text: '通信エラーが発生しました' })
    } finally {
      setIsLoading(false)
    }
  }

  const errorRows = results?.filter((r) => r.status === 'error') ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">取引先マスタ CSVインポート</h1>
        <Link
          href="/admin/customers"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          ← 顧客管理へ戻る
        </Link>
      </div>

      {/* ファイル選択 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <p className="text-sm text-gray-500">
          UTF-8 BOM付き CSV、10列固定:{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">
            company_name, representative_name, postal_code, prefecture, city, address, building,
            phone, email, price_rank
          </code>
        </p>
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
        />

        {parseErrors.length > 0 && (
          <div className="bg-red-50 rounded-lg p-3 space-y-1">
            {parseErrors.map((e, i) => (
              <p key={i} className="text-sm text-red-700">
                {e}
              </p>
            ))}
          </div>
        )}

        {parsedRows && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-600">{parsedRows.length} 行を読み込みました</p>
            <button
              onClick={() => callImportApi(true)}
              disabled={isLoading || isDone}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-1.5 rounded-lg text-sm disabled:opacity-50 transition-colors"
            >
              {isLoading && !stats ? '確認中...' : '内容を確認する'}
            </button>
          </div>
        )}
      </div>

      {/* dry-run プレビュー */}
      {stats && results && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
          {/* 集計 */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{stats.new}</p>
              <p className="text-xs text-gray-500">新規</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.updated}</p>
              <p className="text-xs text-gray-500">更新</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{stats.error}</p>
              <p className="text-xs text-gray-500">エラー</p>
            </div>
            {!isDone && stats.error === 0 && (
              <button
                onClick={() => callImportApi(false)}
                disabled={isLoading}
                className="ml-auto bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {isLoading ? '実行中...' : '確定してインポート'}
              </button>
            )}
            {!isDone && stats.error > 0 && (
              <p className="ml-auto text-sm text-red-600">
                エラー行を修正してから再試行してください
              </p>
            )}
            {isDone && (
              <Link
                href="/admin/customers"
                className="ml-auto bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2 rounded-lg text-sm transition-colors"
              >
                顧客管理へ
              </Link>
            )}
          </div>

          {/* エラー行 */}
          {errorRows.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">エラー行</p>
              {errorRows.map((r) => (
                <div key={r.row} className="bg-red-50 rounded-lg px-3 py-2 text-sm flex gap-2">
                  <span className="font-medium text-red-700 shrink-0">{r.row}行目</span>
                  {r.company_name && (
                    <span className="text-gray-700 truncate">{r.company_name}</span>
                  )}
                  <span className="text-red-600 shrink-0">— {r.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* 全行プレビュー（先頭30行） */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-700">
              プレビュー（先頭 30 行 / 全 {results.length} 行）
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-gray-500 font-medium">行</th>
                    <th className="px-2 py-1.5 text-left text-gray-500 font-medium">店名</th>
                    <th className="px-2 py-1.5 text-center text-gray-500 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 30).map((r) => (
                    <tr key={r.row} className="border-t border-gray-100">
                      <td className="px-2 py-1 text-gray-400">{r.row}</td>
                      <td className="px-2 py-1 text-gray-800">{r.company_name}</td>
                      <td className="px-2 py-1 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            r.status === 'error'
                              ? 'bg-red-100 text-red-700'
                              : r.action === 'insert'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {r.status === 'error' ? 'エラー' : r.action === 'insert' ? '新規' : '更新'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.length > 30 && (
                <p className="text-xs text-gray-400 mt-1 px-2">…他 {results.length - 30} 行</p>
              )}
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}
