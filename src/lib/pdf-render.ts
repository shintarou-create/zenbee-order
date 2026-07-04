// HTML→PDF 変換。Vercel serverless では @sparticuz/chromium + puppeteer-core を使う。
// ローカル開発ではOS標準のChrome/Chromiumを実行パス指定で使う（CHROME_EXECUTABLE_PATH で上書き可）。

import puppeteer from 'puppeteer-core'

// ローカル開発時の既定 Chrome パス候補（macOS / Linux / Windows）
const LOCAL_CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

async function resolveLaunchOptions(): Promise<{
  args: string[]
  executablePath: string
  headless: boolean
}> {
  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) {
    // Vercel / 本番 serverless: @sparticuz/chromium の同梱バイナリを使う。
    const chromium = (await import('@sparticuz/chromium')).default
    return {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
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
  }
}

/**
 * 完成したHTML文字列をA4のPDF(Buffer)に変換する。
 * Webフォント（Google Fonts）の読み込み完了を待つため networkidle0 で待機する。
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
  })
  try {
    const page = await browser.newPage()
    // networkidle0 で待つことで Google Fonts（日本語）の読み込み完了後に描画される。
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 })
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
