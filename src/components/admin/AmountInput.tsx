'use client'

import { useEffect, useState } from 'react'

interface AmountInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  placeholder?: string
  className?: string
}

// 管理側の金額入力（ステッパーなし）。
// - type="text" inputMode="numeric"。編集中はローカル文字列で保持し空欄を許容。
// - onFocus で全選択。確定（onBlur / Enter）で min〜max にクランプして onChange 通知。空欄なら min。
export default function AmountInput({
  value,
  onChange,
  min = 0,
  max = 1_000_000,
  placeholder,
  className = '',
}: AmountInputProps) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  // min が負の場合のみマイナス記号の入力を許容する。min>=0 の既存呼び出し（送料・数量等）は
  // 従来通り数字のみで、挙動は一切変わらない。
  const allowNegative = min < 0

  function commit() {
    const n = parseInt(text, 10)
    const clamped = isNaN(n) ? min : Math.min(max, Math.max(min, n))
    setText(String(clamped))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <input
      type="text"
      inputMode={allowNegative ? 'text' : 'numeric'}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value
        const filtered = allowNegative
          // 先頭のマイナス記号1つ＋数字のみを許容する（2つ目以降のマイナスは除去）。
          ? (raw.startsWith('-') ? '-' : '') + raw.replace(/[^0-9]/g, '')
          : raw.replace(/[^0-9]/g, '')
        setText(filtered)
      }}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className={className}
    />
  )
}
