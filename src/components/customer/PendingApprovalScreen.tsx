'use client'

import CustomerHeader from './CustomerHeader'

interface PendingApprovalScreenProps {
  companyName?: string | null
}

export default function PendingApprovalScreen({ companyName }: PendingApprovalScreenProps) {
  return (
    <div className="min-h-screen bg-kinari">
      <CustomerHeader />
      <div className="flex items-center justify-center p-4 py-8">
        <div className="max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-200">
            <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-3">承認をお待ちください</h1>
          {companyName && (
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-medium">{companyName}</span> 様のご登録申請を受付中です。
            </p>
          )}
          <p className="text-gray-600 leading-relaxed mb-6 text-sm">
            善兵衛農園の担当者が内容を確認後、LINEにてご連絡いたします。
            しばらくお待ちください。
          </p>

          <div className="bg-white rounded-xl border border-kincha p-4 text-left">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-fukamidori rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">善</span>
              </div>
              <p className="font-bold text-gray-900">善兵衛農園</p>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              和歌山県有田郡湯浅町田 340-3
            </p>
          </div>

          <p className="text-xs text-gray-400 mt-6">
            ご不明な点がございましたら、善兵衛農園まで直接お問い合わせください。
          </p>
        </div>
      </div>
    </div>
  )
}
