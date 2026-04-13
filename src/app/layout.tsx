'use client'

import './globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <title>善兵衛農園 発注システム</title>
        <meta name="description" content="善兵衛農園 BtoB発注システム" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <div className="min-h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}
