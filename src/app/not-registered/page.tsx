'use client'

// DEBUG TODO: 管理者登録完了後にuseState/useEffect/initLiff importごと削除すること
import { useState, useEffect } from 'react'
import { initLiff } from '@/lib/liff'

export default function NotRegisteredPage() {
  // DEBUG TODO: 削除対象
  const [lineUserId, setLineUserId] = useState<string | null>(null)
  useEffect(() => {
    initLiff().then((profile) => {
      if (profile?.userId) setLineUserId(profile.userId)
    }).catch(() => {})
  }, [])

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

        {/* DEBUG TODO: 管理者登録完了後に削除 */}
        {lineUserId && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-left">
            <p className="text-xs font-bold text-yellow-700 mb-2">あなたのLINE User ID:</p>
            <code className="block font-mono text-sm font-bold text-gray-900 break-all select-all">
              {lineUserId}
            </code>
            <p className="text-xs text-yellow-600 mt-2">
              このIDをSupabaseのline_usersテーブルに登録すると発注システムをご利用いただけます。
            </p>
          </div>
        )}

        {/* 注意書き */}
        <p className="text-xs text-gray-400 mt-6">
          ご不明な点がございましたら、善兵衛農園まで直接お問い合わせください。
        </p>
      </div>
    </div>
  )
}
