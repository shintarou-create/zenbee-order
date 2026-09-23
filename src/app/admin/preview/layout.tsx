// 発注画面プレビュー（/admin/preview, /admin/preview/cart）共通のスマホ枠レイアウト。
// 認証ガードは親の src/app/admin/layout.tsx が既に行っている（admin_users 照合）ため、
// ここでは見た目の枠だけを提供する。
//
// 枠の transform（translateZ(0)）は、子要素内の position:fixed（下部固定ボタン等）の
// containing block をこの枠自身に変える副作用を利用している。これにより
// ProductBrowser / CartScreen 側の "fixed bottom-4 left-0 right-0" 等のクラスを
// 一切変更せずに、枠の中に収まったスマホ風の固定フッターとして描画できる
// （本番の / と /cart では枠が無いため、従来通り画面全体に対する fixed になる）。
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center bg-gray-100 rounded-xl py-8 px-4 min-h-[75vh]">
      <div
        className="relative w-full max-w-[390px] bg-kinari rounded-[2rem] border-[6px] border-gray-900 shadow-2xl overflow-hidden"
        style={{ transform: 'translateZ(0)', height: '80vh', maxHeight: '820px' }}
      >
        <div className="h-full overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
