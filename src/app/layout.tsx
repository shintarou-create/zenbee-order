import './globals.css'
import { Noto_Sans_JP, Noto_Serif_JP } from 'next/font/google'

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-noto-jp',
})

const notoSerifJP = Noto_Serif_JP({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-noto-serif-jp',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} ${notoSerifJP.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <title>善兵衛農園 発注システム</title>
        <meta name="description" content="善兵衛農園 BtoB発注システム" />
      </head>
      <body className="bg-kinari text-gray-900 antialiased">
        <div className="min-h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}
