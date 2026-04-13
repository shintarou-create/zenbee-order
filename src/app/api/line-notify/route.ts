import { NextRequest, NextResponse } from 'next/server'
import { sendPushMessage } from '@/lib/line-messaging'

export async function POST(req: NextRequest) {
  // 内部リクエストの検証
  const authHeader = req.headers.get('x-internal-secret')
  const internalSecret = process.env.INTERNAL_API_SECRET

  if (internalSecret && authHeader !== internalSecret) {
    return NextResponse.json({ error: '認証エラー' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { userId, message } = body

    if (!userId || !message) {
      return NextResponse.json(
        { error: 'userId と message が必要です' },
        { status: 400 }
      )
    }

    await sendPushMessage(userId, message)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('LINE通知エラー:', error)
    return NextResponse.json(
      { error: 'メッセージ送信に失敗しました' },
      { status: 500 }
    )
  }
}
