import Link from 'next/link'

// 管理画面「発注画面プレビュー」専用ヘッダー。本番の CustomerHeader と見た目を揃えつつ、
// 上部にプレビュー注意バナーを重ね、リンク先も管理画面内で完結させる
// （本番の CustomerHeader は "/" "/orders" を指すため、プレビューではそのまま使わない）。
export default function PreviewHeader() {
  return (
    <div className="sticky top-0 z-30">
      <div className="bg-amber-500 text-white text-center text-[11px] sm:text-xs font-bold py-1.5 px-3 leading-tight">
        プレビュー表示中：注文は送信されません／単価は標準ランク
      </div>
      <header className="bg-fukamidori shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center">
          <div className="flex-1">
            <Link href="/admin/products" className="text-kinari text-xs hover:text-white transition-colors">
              ← 管理画面
            </Link>
          </div>
          <Link href="/admin/preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="善兵衛農園"
              className="h-11 w-auto object-contain"
            />
          </Link>
          <div className="flex-1" />
        </div>
      </header>
    </div>
  )
}
