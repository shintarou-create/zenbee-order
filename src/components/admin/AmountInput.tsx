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

  function commit() {
    const n = parseInt(text, 10)
    const clamped = isNaN(n) ? min : Math.min(max, Math.max(min, n))
    setText(String(clamped))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className={className}
    />
  )
}
