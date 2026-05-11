'use client'

import { useState, useEffect, useCallback } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

interface ExportStatus {
  targetYearMonth: string
  targetYearMonthLabel: string
  orderCount: number
  lastExportedAt: string | null
  bannerType: 'remind' | 'done' | 'no_orders'
}

function getLastMonthDefaults(): { from: string; to: string } {
  const now = new Date()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const month = now.getMonth() === 0 ? 12 : now.getMonth()
  const lastDay = new Date(year, month, 0).getDate()
  const ym = String(month).padStart(2, '0')
  return {
    from: `${year}-${ym}-01`,
    to: `${year}-${ym}-${String(lastDay).padStart(2, '0')}`,
  }
}

function formatJST(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${min}`
}

export default function FreeeExportBanner() {
  const [status, setStatus] = useState<ExportStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const defaults = getLastMonthDefaults()
  const [customFrom, setCustomFrom] = useState(defaults.from)
  const [customTo, setCustomTo] = useState(defaults.to)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/freee-export-status')
      if (res.ok) {
        setStatus(await res.json())
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function handleDownload(from: string, to: string) {
    setDownloading(true)
    setDownloadError(null)
    try {
      const res = await adminFetch('/api/admin/freee-export-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setDownloadError(data.error || 'ダウンロードに失敗しました')
        return
      }

      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') || ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match?.[1] || 'freee.csv'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      await fetchStatus()
    } finally {
      setDownloading(false)
    }
  }

  function handleModalDownload() {
    if (!customFrom || !customTo) {
      setModalError('日付を選択してください')
      return
    }
    if (customFrom > customTo) {
      setModalError('開始日は終了日以前の日付を指定してください')
      return
    }
    const diffDays = (new Date(customTo).getTime() - new Date(customFrom).getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 180) {
      setModalError('期間は180日以内で指定してください')
      return
    }
    setModalError(null)
    setShowModal(false)
    handleDownload(customFrom, customTo)
  }

  if (loading || !status) return null

  const { targetYearMonthLabel, orderCount, lastExportedAt, bannerType } = status

  return (
    <>
      {bannerType === 'remind' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">未DL</span>
                <p className="font-bold text-red-700 text-sm">
                  ⚠️ {targetYearMonthLabel}分の freee CSV が未ダウンロード（{orderCount}件）
                </p>
              </div>
              {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => handleDownload(defaults.from, defaults.to)}
                disabled={downloading}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {downloading ? 'ダウンロード中...' : '先月分をダウンロード'}
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                任意期間でダウンロード
              </button>
            </div>
          </div>
        </div>
      )}

      {bannerType === 'no_orders' && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-gray-500">{targetYearMonthLabel}は取引がありませんでした</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            任意期間でダウンロード
          </button>
        </div>
      )}

      {bannerType === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="text-sm text-green-700">
              ✓ {targetYearMonthLabel}分のCSVは {lastExportedAt ? formatJST(lastExportedAt) : ''} にダウンロード済み
            </p>
            {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => handleDownload(defaults.from, defaults.to)}
              disabled={downloading}
              className="text-sm text-green-600 hover:text-green-800 underline disabled:opacity-50"
            >
              {downloading ? 'ダウンロード中...' : 'もう一度ダウンロード'}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              任意期間でダウンロード
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900">任意期間で freee CSV ダウンロード</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始日</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">終了日</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              {modalError && <p className="text-sm text-red-600">{modalError}</p>}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleModalDownload}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg text-sm transition-colors"
              >
                ダウンロード
              </button>
              <button
                onClick={() => { setShowModal(false); setModalError(null) }}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
