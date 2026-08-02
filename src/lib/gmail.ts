// Gmail 下書き作成（direct REST）。googleapis の重い依存を避け fetch のみで実装する。
// 必要な環境変数（値はコード/リポジトリに置かない・参照名のみ）:
//   GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN
// scope: https://www.googleapis.com/auth/gmail.compose（drafts.create に必要）

export function hasGmailConfig(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN,
  )
}

// refresh_token から access_token を取得
export async function getGmailAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID!,
    client_secret: process.env.GMAIL_CLIENT_SECRET!,
    refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gmail アクセストークンの取得に失敗しました: ${res.status} ${text}`)
  }
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('Gmail アクセストークンが空です')
  return json.access_token
}

// RFC 2047: 日本語の件名を =?UTF-8?B?...?= でエンコード
function encodeHeaderWord(s: string): string {
  return `=?UTF-8?B?${Buffer.from(s, 'utf-8').toString('base64')}?=`
}

// 標準base64 → base64url（Gmail の raw は base64url）
function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// 添付ファイル名（日本語可）: RFC 5987 の filename*=UTF-8'' でエンコード
function encodeFilenameStar(name: string): string {
  return `UTF-8''${encodeURIComponent(name)}`
}

// filename*= のみだと一部クライアント（Mail.app等）が添付名を扱えず空プレースホルダを
// 出すことがあるため、素の filename= 用にASCII安全なフォールバック名を作る。
// 日本語部分は取り除き、残ったASCII部分（日付など）を "invoice_" で補う。
function asciiFallbackFilename(name: string): string {
  const ext = name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ''
  const stemRaw = name.slice(0, name.length - ext.length)
  const asciiOnly = stemRaw.replace(/[^\x20-\x7e]/g, '')
  const stem = asciiOnly.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  return `invoice_${stem || 'attachment'}${ext}`
}

export type GmailDraftInput = {
  to: string
  subject: string
  bodyText: string
  attachment: { filename: string; content: Buffer; mimeType: string }
}

/**
 * PDF添付付きのGmail下書きを作成する。成功時は draftId を返す。
 * accessToken は呼び出し側で getGmailAccessToken() から取得して渡す
 * （トークン更新失敗と下書きAPI失敗を呼び出し側で切り分けられるようにするため）。
 */
export async function createGmailDraft(
  input: GmailDraftInput,
  accessToken: string,
): Promise<{ draftId: string }> {
  const boundary = 'zenbee_boundary_' + Buffer.from(input.subject).toString('hex').slice(0, 16)

  // RFC 2045: base64本文は76文字ごとにCRLF改行する必要がある。1行のままだと
  // 添付が壊れて「ファイルが開けない」原因になる。
  // 事前に base64 アルファベット（A-Za-z0-9+/=）以外の文字を除去してからラップする。
  // Buffer#toString('base64') 自体は不正な文字を出力しないはずだが、万一どこかの
  // 段階で余計な文字が混入しても本文base64の末尾にゴミバイトとして残らないよう防御する。
  const wrapBase64 = (b64: string): string => {
    const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '')
    return clean.match(/.{1,76}/g)?.join('\r\n') ?? clean
  }
  const attachmentBase64 = wrapBase64(input.attachment.content.toString('base64'))
  const bodyBase64 = wrapBase64(Buffer.from(input.bodyText, 'utf-8').toString('base64'))

  // MIME multipart/mixed（本文 + PDF添付）を組み立てる
  const mime = [
    `To: ${input.to}`,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    bodyBase64,
    '',
    `--${boundary}`,
    // ファイル名は filename*=（RFC 5987・日本語フルネーム）に加え、素の filename=
    // にもASCII安全なフォールバック名を併記する（Mail.app等、filename*= のみだと
    // 添付名を扱えないクライアント向け）。name= に encoded-word を入れるのは
    // パラメータ値として不正なので使わない。
    `Content-Type: ${input.attachment.mimeType}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${asciiFallbackFilename(input.attachment.filename)}"; filename*=${encodeFilenameStar(input.attachment.filename)}`,
    '',
    attachmentBase64,
    '',
    `--${boundary}--`,
  ].join('\r\n')

  // 閉じ境界の後ろは CRLF を1つだけ残す（末尾に空要素を足して join すると
  // 余分な空行ができ、一部クライアント（Mail.app）が中身のない添付パートとして
  // 描画してしまう＝署名下に「?」四角が出る原因だった）。
  const raw = toBase64Url(Buffer.from(mime + '\r\n', 'utf-8'))

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { raw } }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gmail 下書きの作成に失敗しました: ${res.status} ${text}`)
  }
  const json = (await res.json()) as { id?: string }
  return { draftId: json.id ?? '' }
}
