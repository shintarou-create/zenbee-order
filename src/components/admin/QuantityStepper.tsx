'use client'

import { useEffect, useState } from 'react'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
  className?: string
}

// 管理側の数量入力用ステッパー（[−][数値][＋]）。
// - 入力欄は type="text" inputMode="numeric"。編集中はローカル文字列で保持し空欄を許容。
// - 確定（onBlur / Enter）で min〜max にクランプして onChange 通知。空欄なら min に戻す。
// - onFocus で全選択（そのまま打てば上書き）。
export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  disabled = false,
  className = '',
}: QuantityStepperProps) {
  const [text, setText] = useState(String(value))

  // 親の value 変更（−＋ボタン経由・外部更新含む）をローカル文字列に同期
  useEffect(() => {
    setText(String(value))
  }, [value])

  function commit() {
    const n = parseInt(text, 10)
    const clamped = isNaN(n) ? min : Math.min(max, Math.max(min, n))
    setText(String(clamped))
    if (clamped !== value) onChange(clamped)
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    // 数字以外を除去し空欄を許容
    setText(e.target.value.replace(/[^0-9]/g, ''))
  }

  function decrement() {
    const next = Math.max(min, value - 1)
    if (next !== value) onChange(next)
  }

  function increment() {
    const next = Math.min(max, value + 1)
    if (next !== value) onChange(next)
  }

  const btnClass =
    'w-11 h-11 flex-shrink-0 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-700 transition-colors'

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button type="button" onClick={decrement} disabled={disabled || value <= min} className={btnClass} aria-label="減らす">
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={handleInput}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        disabled={disabled}
        className="w-14 h-11 text-center font-bold border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-50 disabled:text-gray-400"
      />
      <button type="button" onClick={increment} disabled={disabled || value >= max} className={btnClass} aria-label="増やす">
        ＋
      </button>
    </div>
  )
}
