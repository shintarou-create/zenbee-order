'use client'

import { useState } from 'react'
import { useLiff } from '@/hooks/useLiff'

export default function NotRegisteredPage() {
  const { userId, isLoading } = useLiff()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!userId) return
    try {
      await navigator.clipboard.writeText(userId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('コピー失敗:', err)
    }
  }

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        {/* アイコン */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        {/* タイトル */}
        <h1 className="text-xl font-bold text-gray-900 mb-3">
          登録申請を受付中です
        </h1>

        {/* メッセージ */}
        <p className="text-gray-600 leading-relaxed mb-6">
          現在、発注システムへの登録申請を受付中です。
          <br />
          善兵衛農園から承認されるとご利用いただけます。
        </p>

        {/* 農園情報 */}
        <div className="bg-white rounded-xl border border-green-100 p-4 text-left">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">善</span>
            </div>
            <p className="font-bold text-gray-900">善兵衛農園</p>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            和歌山県有田郡湯浅町田 340-3
          </p>
          <p className="text-sm text-gray-600 mt-1">
            TEL: 0737-62-xxxx
          </p>
        </div>

        {/* LINE User ID */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
          <p className="text-sm font-medium text-gray-700 mb-2">
            あなたの LINE User ID
          </p>
          {isLoading ? (
            <p className="text-sm text-gray-500">ID を取得中…</p>
          ) : userId ? (
            <>
              <p className="font-mono text-xs text-gray-800 break-all select-all bg-white border border-gray-200 rounded p-2 mb-2">
                {userId}
              </p>
              <button
                type="button"
                onClick={handleCopy}
                className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition"
              >
                {copied ? 'コピーしました ✓' : 'コピーする'}
              </button>
              <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                このIDは、取引先登録時の本人確認に使います。<br />
                善兵衛農園からお問い合わせがあった際は、このIDをお伝えください。
              </p>
            </>
          ) : (
            <p className="text-sm text-red-500">
              IDが取得できませんでした。LINEアプリから再度アクセスしてください。
            </p>
          )}
        </div>

        {/* 注意書き */}
        <p className="text-xs text-gray-400 mt-6">
          ご不明な点がございましたら、善兵衛農園まで直接お問い合わせください。
        </p>
      </div>
    </div>
  )
}
