'use client'

import { useState, useEffect } from 'react'
import CustomerHeader from './CustomerHeader'

type View = 'select' | 'code' | 'register'

interface OnboardingScreenProps {
  accessToken: string | null
  onSuccess: () => void
}

interface RegisterForm {
  company_name: string
  postal_code: string
  prefecture: string
  city: string
  address: string
  building: string
  phone: string
  email: string
  representative_name: string
  notes: string
}

const initialRegisterForm: RegisterForm = {
  company_name: '',
  postal_code: '',
  prefecture: '',
  city: '',
  address: '',
  building: '',
  phone: '',
  email: '',
  representative_name: '',
  notes: '',
}

export default function OnboardingScreen({ accessToken, onSuccess }: OnboardingScreenProps) {
  const [view, setView] = useState<View>('select')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('view') === 'register') {
      setView('register')
    }
  }, [])

  // コード入力
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)

  // 新規登録フォーム
  const [form, setForm] = useState<RegisterForm>(initialRegisterForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handlePostalLookup(rawZip: string) {
    const digits = rawZip
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[^0-9]/g, '')
    if (digits.length !== 7) return
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`)
      const json = (await res.json()) as {
        status: number
        results: { address1: string; address2: string; address3: string }[] | null
      }
      if (json.status !== 200 || !json.results) return
      const { address1, address2, address3 } = json.results[0]
      setForm((p) => ({ ...p, prefecture: address1, city: address2, address: address3 }))
    } catch {
      // 検索エラーは無視（手動入力で対応）
    }
  }

  async function handleCodeSubmit() {
    const trimmed = code.trim().toUpperCase()
    setCodeError(null)
    if (!trimmed) { setCodeError('登録コードを入力してください'); return }
    if (trimmed.length !== 8) { setCodeError('登録コードは8文字です'); return }

    setCodeLoading(true)
    try {
      const res = await fetch('/api/onboarding/link-by-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liff_access_token: accessToken,
          registration_code: trimmed,
        }),
      })
      const json = (await res.json()) as { error?: string; approval_status?: string }
      if (!res.ok) {
        setCodeError(json.error ?? 'エラーが発生しました')
        return
      }
      // 紐付け成功 → 親に通知して状態を更新
      onSuccess()
    } catch {
      setCodeError('通信エラーが発生しました。再度お試しください。')
    } finally {
      setCodeLoading(false)
    }
  }

  async function handleRegisterSubmit() {
    setFormError(null)

    // フロントバリデーション
    if (!form.company_name.trim()) { setFormError('店舗名を入力してください'); return }
    const digits = form.postal_code.replace(/[^0-9]/g, '')
    if (digits.length !== 7) { setFormError('郵便番号を7桁で入力してください'); return }
    if (!form.prefecture.trim()) { setFormError('都道府県を入力してください'); return }
    if (!form.city.trim()) { setFormError('市区町村を入力してください'); return }
    if (!form.address.trim()) { setFormError('住所を入力してください'); return }
    const phoneDigits = form.phone.replace(/[^0-9]/g, '')
    if (phoneDigits.length < 10 || phoneDigits.length > 11) { setFormError('電話番号を10〜11桁で入力してください'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setFormError('メールアドレスの形式が正しくありません'); return }

    setFormLoading(true)
    try {
      const res = await fetch('/api/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liff_access_token: accessToken,
          company_name: form.company_name.trim(),
          postal_code: digits,
          prefecture: form.prefecture.trim(),
          city: form.city.trim(),
          address: form.address.trim(),
          building: form.building.trim() || undefined,
          phone: phoneDigits,
          email: form.email.trim(),
          representative_name: form.representative_name.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setFormError(json.error ?? 'エラーが発生しました')
        return
      }
      setSubmitted(true)
      // 登録申請完了 → 親で状態を再取得（pending 画面へ）
      setTimeout(onSuccess, 1500)
    } catch {
      setFormError('通信エラーが発生しました。再度お試しください。')
    } finally {
      setFormLoading(false)
    }
  }

  const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fukamidori bg-white'

  return (
    <div className="min-h-screen bg-kinari">
      <CustomerHeader />

      <main className="max-w-md mx-auto px-4 py-6">
        {/* 選択画面 */}
        {view === 'select' && (
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900 mb-2">善兵衛農園 発注システム</h1>
            <p className="text-sm text-gray-500 mb-8">ご利用を開始するには以下をお選びください</p>

            <div className="space-y-3">
              <button
                onClick={() => setView('code')}
                className="w-full bg-fukamidori hover:bg-fukamidori-dark text-white font-bold py-4 px-6 rounded-xl text-left flex items-center gap-4 transition-colors shadow-sm"
              >
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold">登録コードをお持ちの方</p>
                  <p className="text-xs font-normal opacity-80 mt-0.5">農園からお知らせした8桁のコードで登録</p>
                </div>
              </button>

              <button
                onClick={() => setView('register')}
                className="w-full bg-white hover:bg-gray-50 text-gray-800 font-bold py-4 px-6 rounded-xl text-left flex items-center gap-4 transition-colors shadow-sm border border-gray-200"
              >
                <div className="w-10 h-10 bg-kinari rounded-full flex items-center justify-center flex-shrink-0 border border-kincha">
                  <svg className="w-5 h-5 text-fukamidori" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold">新規のお取引をご希望の方</p>
                  <p className="text-xs font-normal text-gray-500 mt-0.5">お取引情報を登録して申請（承認後に利用可）</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* コード入力画面 */}
        {view === 'code' && (
          <div>
            <button onClick={() => setView('select')} className="text-sm text-fukamidori mb-4 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              戻る
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-1">登録コードで紐付け</h2>
            <p className="text-sm text-gray-500 mb-6">善兵衛農園からお知らせした8桁のコードを入力してください</p>

            <div className="space-y-4">
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCodeSubmit() } }}
                placeholder="例: abcd2345"
                maxLength={8}
                className="w-full border border-gray-300 rounded-xl px-4 py-4 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-fukamidori bg-white"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              {codeError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{codeError}</p>
              )}
              <button
                onClick={handleCodeSubmit}
                disabled={codeLoading}
                className="w-full bg-fukamidori hover:bg-fukamidori-dark disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors"
              >
                {codeLoading ? '確認中...' : '登録する'}
              </button>
            </div>
          </div>
        )}

        {/* 新規登録フォーム */}
        {view === 'register' && !submitted && (
          <div>
            <button onClick={() => setView('select')} className="text-sm text-fukamidori mb-4 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              戻る
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-1">新規お取引申請</h2>
            <p className="text-sm text-gray-500 mb-6">必要事項をご記入ください。担当者が確認後に承認いたします。</p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">店舗名・会社名 <span className="text-red-500">*</span></label>
                <input type="text" value={form.company_name}
                  onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))}
                  placeholder="例：〇〇食堂" className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">担当者名</label>
                <input type="text" value={form.representative_name}
                  onChange={(e) => setForm((p) => ({ ...p, representative_name: e.target.value }))}
                  placeholder="例：山田 太郎" className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号 <span className="text-red-500">*</span></label>
                  <input type="text" value={form.postal_code}
                    onChange={(e) => {
                      const v = e.target.value
                      setForm((p) => ({ ...p, postal_code: v }))
                      handlePostalLookup(v)
                    }}
                    placeholder="0000000" inputMode="numeric" maxLength={8} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">都道府県 <span className="text-red-500">*</span></label>
                  <input type="text" value={form.prefecture}
                    onChange={(e) => setForm((p) => ({ ...p, prefecture: e.target.value }))}
                    placeholder="和歌山県" className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">市区町村 <span className="text-red-500">*</span></label>
                <input type="text" value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  placeholder="有田市" className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">住所 <span className="text-red-500">*</span></label>
                <input type="text" value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="宮崎町123" className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">建物名・部屋番号</label>
                <input type="text" value={form.building}
                  onChange={(e) => setForm((p) => ({ ...p, building: e.target.value }))}
                  placeholder="〇〇ビル2F（任意）" className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話番号 <span className="text-red-500">*</span></label>
                <input type="tel" value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="0737620000" inputMode="tel" className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス <span className="text-red-500">*</span></label>
                <input type="email" value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="info@example.com" className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考・ご要望</label>
                <textarea value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder="ご希望・質問など（任意）"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fukamidori bg-white resize-none" />
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
              )}

              <button
                onClick={handleRegisterSubmit}
                disabled={formLoading}
                className="w-full bg-fukamidori hover:bg-fukamidori-dark disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors mt-2"
              >
                {formLoading ? '送信中...' : '申請する'}
              </button>
            </div>
          </div>
        )}

        {/* 送信完了 */}
        {view === 'register' && submitted && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">申請を受け付けました</h2>
            <p className="text-sm text-gray-500">担当者が確認後にご連絡いたします。しばらくお待ちください。</p>
          </div>
        )}
      </main>
    </div>
  )
}
