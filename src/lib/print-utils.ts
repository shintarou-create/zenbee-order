// 印刷ユーティリティ
// window.print() を呼ぶ前に、ページ内の全 <img> のデコード/ロード完了を待つ。
// 固定タイマーだと大きなロゴ画像が間に合わず印刷プレビューが空枠になるため。

/**
 * root 配下の全 <img> のロード/デコード完了を待つ。
 * - 読み込み失敗(error)でも resolve する（画像が読めなくても印刷自体は止めない）。
 * - timeoutMs を超えたら待機を打ち切る（永久に待たない保険）。
 */
export async function waitForImages(
  root: ParentNode = document,
  timeoutMs = 3000,
): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))

  const waitOne = (img: HTMLImageElement): Promise<void> => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve()
    const onEvent = () =>
      new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })
    if (typeof img.decode === 'function') {
      return img.decode().then(
        () => undefined,
        () => onEvent(),
      )
    }
    return onEvent()
  }

  const allImages = Promise.all(imgs.map(waitOne)).then(() => undefined)
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  // 全画像完了 か タイムアウト の早い方で抜ける
  await Promise.race([allImages, timeout])
}

/**
 * 全画像のロード完了を待ってから window.print() を呼ぶ。
 */
export async function printAfterImagesLoaded(timeoutMs = 3000): Promise<void> {
  await waitForImages(document, timeoutMs)
  window.print()
}
