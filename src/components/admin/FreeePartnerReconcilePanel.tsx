'use client'

import { useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'
import {
  decodeFreeeCsvFile,
  parseFreeeExportCsv,
  reconcileFreeePartners,
  type FreeeReconcileResult,
} from '@/lib/freee-partner-match'

interface FreeePartnerReconcilePanelProps {
  billingMonth: string
  // その月の請求対象社（invoices.company_id を持つ会社。company_name は生の companies.company_name。
  // freeeの請求書CSVも同じ値を使う＝billing_name等には絶対に差し替えないこと）。
  billingCompanies: { id: string; company_name: string }[]
}

export default function FreeePartnerReconcilePanel({ billingMonth, billingCompanies }: FreeePartnerReconcilePanelProps) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FreeeReconcileResult | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function handleFileChange(file: File) {
    setFileName(file.name)
    setError(null)
    setResult(null)
    setParsing(true)
    try {
      const buffer = await file.arrayBuffer()
      const text = decodeFreeeCsvFile(buffer)
      const partners = parseFreeeExportCsv(text)
      const reconciled = reconcileFreeePartners(billingCompanies, partners)
      setResult(reconciled)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSVの読み取りに失敗しました')
    } finally {
      setParsing(false)
    }
  }

  // 既存の取引先インポートCSV生成（/api/freee-partner-csv）をそのまま流用する。
  // freee_partner_registered の値に関わらず、ここで明示的に選んだ企業をそのままCSVに含める
  // （このフラグは手動更新のため実態とズレることがあり、この機能が検出する「未登録」企業は
  // フラグがtrueのまま残っているケースがほとんどのため）。
  async function handleDownloadMissingCsv() {
    if (!result || result.missing.length === 0) return
    setDownloading(true)
    setDownloadError(null)
    try {
      const res = await adminFetch('/api/freee-partner-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: result.missing.map((m) => m.id) }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setDownloadError(json.error || 'CSV生成に失敗しました')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const dateStr = new Date().toLocaleDateString('sv-SE').replace(/-/g, '')
      const a = document.createElement('a')
      a.href = url
      a.download = `freee_partners_${dateStr}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('CSV生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const problemCount = result ? result.missing.length + result.fuzzyMatches.length + result.needsManualCheck.length : 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        freeeの「取引先」画面から取引先一覧CSVをエクスポートしてアップロードすると、
        {billingMonth}分の請求対象社（{billingCompanies.length}社）と突き合わせ、
        請求書CSVインポートで弾かれそうな取引先を検出します。
      </p>

      <div>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileChange(file)
          }}
          className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:text-xs file:font-medium file:text-gray-600 file:bg-white hover:file:bg-gray-50"
        />
        {fileName && <p className="text-xs text-gray-400 mt-1">{fileName}</p>}
      </div>

      {parsing && <p className="text-sm text-gray-500">照合中...</p>}
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {result && (
        <div className="space-y-4">
          <div
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              problemCount === 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {problemCount === 0
              ? `${result.totalCompanies}社すべてfreeeと一致しました。このままインポートして問題ありません。`
              : `${result.totalCompanies}社中 ${problemCount}社に対応が必要です（問題なし: ${result.okCount}社）`}
          </div>

          {/* 1. freee未登録 */}
          {result.missing.length > 0 && (
            <section className="border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-50 px-3 py-2">
                <h3 className="text-sm font-bold text-red-800">freee未登録（{result.missing.length}社）</h3>
                <p className="text-xs text-red-700 mt-0.5">
                  新規登録が必要です。「使用停止」はfreee側で使用停止/使用再開になっているため、名前は合っていてもインポートが弾かれる可能性があります。
                </p>
              </div>
              <ul className="divide-y divide-red-100">
                {result.missing.map((m) => (
                  <li key={m.id} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <span className="text-gray-900">{m.company_name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      m.reason === 'suspended' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {m.reason === 'suspended' ? 'freee側で使用停止' : 'freeeに見つかりません'}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="px-3 py-2 border-t border-red-100">
                <button
                  type="button"
                  onClick={handleDownloadMissingCsv}
                  disabled={downloading}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {downloading ? '生成中...' : `この${result.missing.length}社の取引先インポートCSVを作成`}
                </button>
                {downloadError && <p className="text-xs text-red-600 mt-1">{downloadError}</p>}
              </div>
            </section>
          )}

          {/* 2. 表記ゆれの疑い */}
          {result.fuzzyMatches.length > 0 && (
            <section className="border border-amber-200 rounded-lg overflow-hidden">
              <div className="bg-amber-50 px-3 py-2">
                <h3 className="text-sm font-bold text-amber-800">表記ゆれの疑い（{result.fuzzyMatches.length}社）</h3>
                <p className="text-xs text-amber-700 mt-0.5">
                  完全一致ではありませんが、空白の有無・全角半角・大文字小文字を無視すると一致する候補があります。自動では変更しません。どちらの表記に合わせるか判断してください。
                </p>
              </div>
              <ul className="divide-y divide-amber-100">
                {result.fuzzyMatches.map((f) => (
                  <li key={f.id} className="px-3 py-2 text-sm">
                    <p className="text-gray-900">
                      <span className="text-gray-500">発注システム: </span>
                      {f.company_name}
                    </p>
                    <p className="text-gray-900 mt-0.5">
                      <span className="text-gray-500">freee側: </span>
                      {f.freeeSuggestions.join(' / ')}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 3. 要目視確認 */}
          {result.needsManualCheck.length > 0 && (
            <section className="border border-blue-200 rounded-lg overflow-hidden">
              <div className="bg-blue-50 px-3 py-2">
                <h3 className="text-sm font-bold text-blue-800">要目視確認（{result.needsManualCheck.length}社）</h3>
                <p className="text-xs text-blue-700 mt-0.5">
                  アクセント記号付きの文字（â・è等）を含むため、freeeのCP932エクスポートで文字が
                  無言で削除されている可能性があります。本当は登録済みでも「未登録」に見えることがあるため、自動判定していません。freee側で目視確認してください。
                </p>
              </div>
              <ul className="divide-y divide-blue-100">
                {result.needsManualCheck.map((m) => (
                  <li key={m.id} className="px-3 py-2 text-sm text-gray-900">
                    {m.company_name}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
