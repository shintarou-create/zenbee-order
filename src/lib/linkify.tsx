import React from 'react'

const URL_REGEX = /(https?:\/\/[^\s。、,)）」\]]+)/g

export function linkifyText(text: string): React.ReactNode[] {
  return text.split(URL_REGEX).map((el, i) =>
    el.startsWith('http') ? (
      <a
        key={i}
        href={el}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline break-all"
      >
        {el}
      </a>
    ) : (
      el
    )
  )
}
