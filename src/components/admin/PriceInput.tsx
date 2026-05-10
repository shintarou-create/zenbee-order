'use client'

import { useState } from 'react'

interface PriceInputProps {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
}

function toHalfWidth(str: string): string {
  return str.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
}

export default function PriceInput({
  value,
  onChange,
  placeholder = '1,800',
  disabled,
  id,
  className = '',
}: PriceInputProps) {
  const [focused, setFocused] = useState(false)

  // フォーカス中は生数値、非フォーカス時はカンマ整形
  const displayValue = focused
    ? (value > 0 ? String(value) : '')
    : (value > 0 ? value.toLocaleString('ja-JP') : '')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = toHalfWidth(e.target.value)
    const digits = raw.replace(/[^0-9]/g, '')
    const num = digits === '' ? 0 : parseInt(digits, 10)
    onChange(num)
  }

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none select-none">
        ¥
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={displayValue}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50 disabled:bg-gray-50"
      />
    </div>
  )
}
