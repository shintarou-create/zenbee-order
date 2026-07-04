// HTML→PDF 変換。Vercel serverless では @sparticuz/chromium + puppeteer-core を使う。
// ローカル開発ではOS標準のChrome/Chromiumを実行パス指定で使う（CHROME_EXECUTABLE_PATH で上書き可）。

import puppeteer, { type Viewport } from 'puppeteer-core'

// ローカル開発時の既定 Chrome パス候補（macOS / Linux / Windows）
const LOCAL_CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

// A4 相当のビューポート（96dpi）。大解像度を避けメモリ/起動負荷を抑える。
const A4_VIEWPORT: Viewport = { width: 794, height: 1123, deviceScaleFactor: 1 }

type LaunchOptions = {
  args: string[]
  executablePath: string
  headless: boolean | 'shell'
  defaultViewport: Viewport
}

async function resolveLaunchOptions(): Promise<LaunchOptions> {
  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) {
    // Vercel / 本番 serverless: @sparticuz/chromium の同梱バイナリを使う。
    const chromium = (await import('@sparticuz/chromium')).default
    return {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless, // 'shell'（新しい chromium ヘッドレス）
      defaultViewport: chromium.defaultViewport ?? A4_VIEWPORT,
    }
  }

  // ローカル開発: 明示パス優先、無ければ既定候補から存在するものを使う。
  const fs = await import('fs')
  const explicit = process.env.CHROME_EXECUTABLE_PATH
  const executablePath =
    explicit || LOCAL_CHROME_CANDIDATES.find((p) => fs.existsSync(p)) || ''

  return {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath,
    headless: true,
    defaultViewport: A4_VIEWPORT,
  }
}

/**
 * 完成したHTML文字列をA4のPDF(Buffer)に変換する。
 * Google Fonts（日本語）の読み込みを待つが、フォント読込が遅くても全体が落ちない構造にする:
 *   まず domcontentloaded で確実に描画 → その後ネットワークidleを最大10秒だけ待機（失敗は無視）。
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const opts = await resolveLaunchOptions()
  if (!opts.executablePath) {
    throw new Error('Chrome/Chromium の実行パスが見つかりません（CHROME_EXECUTABLE_PATH を設定してください）')
  }

  const browser = await puppeteer.launch({
    args: opts.args,
    executablePath: opts.executablePath,
    headless: opts.headless,
    defaultViewport: opts.defaultViewport,
  })
  try {
    const page = await browser.newPage()
    // domcontentloaded で確実に描画確定（外部フォント待ちで setContent 自体を落とさない）。
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    // フォント等の外部リソースを最大10秒だけ待つ。idle にならなくても続行する。
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 10_000 }).catch(() => {})
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
