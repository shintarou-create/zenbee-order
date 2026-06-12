'use client'

import { useState } from 'react'

interface CustomItemCardProps {
  onAdd: (text: string) => void
  itemCount: number
  maxItems: number
  maxChars: number
}

export default function CustomItemCard({ onAdd, itemCount, maxItems, maxChars }: CustomItemCardProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const atLimit = itemCount >= maxItems

  function handleAdd() {
    const trimmed = text.trim()
    setError(null)
    if (!trimmed) {
      setError('内容を入力してください')
      return
    }
    if (trimmed.length > maxChars) {
      setError(`${maxChars}文字以内で入力してください`)
      return
    }
    if (itemCount >= maxItems) {
      setError(`自由記入は1注文${maxItems}件まです`)
      return
    }
    onAdd(trimmed)
    setText('')
    setOpen(false)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border-2 border-transparent">
      <div className="bg-kinari px-4 py-3">
        <h3 className="font-bold text-fukamidori text-base leading-tight font-serif">
          自由記入（その他のご注文）
        </h3>
      </div>

      <div className="p-4">
        <p className="text-xs text-gray-500 mb-1">
          一覧にない品物はこちらから文章でご注文ください（例：シークワーサー1kg）
        </p>
        <p className="text-sm font-medium text-amber-700 mb-3">金額は確定後にご連絡</p>

        {atLimit ? (
          <div className="w-full py-3 rounded-xl bg-gray-100 text-gray-400 text-sm font-bold text-center">
            自由記入は1注文{maxItems}件まです
          </div>
        ) : !open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full py-3 rounded-xl bg-amber-100 text-amber-800 text-sm font-bold text-center hover:bg-amber-200 transition-colors"
          >
            注文内容を入力する ›
          </button>
        ) : (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
              placeholder={`例：シークワーサー1kg（最大${maxChars}文字）`}
              maxLength={maxChars}
              rows={3}
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setOpen(false); setText(''); setError(null) }}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleAdd}
                className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors"
              >
                カートに追加
              </button>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
