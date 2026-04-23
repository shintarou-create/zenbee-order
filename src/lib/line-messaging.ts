const LINE_API_BASE = 'https://api.line.me/v2/bot'

async function sendPushMessage(userId: string, message: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) {
    console.warn('LINE_CHANNEL_ACCESS_TOKEN が設定されていません')
    return
  }

  const response = await fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [
        {
          type: 'text',
          text: message,
        },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`LINE メッセージ送信エラー: ${response.status}`, body)
    throw new Error(`LINE API エラー: ${response.status}`)
  }
}

export { sendPushMessage }

export async function notifyOrderCreated(
  customerLineId: string,
  orderNumber: string,
  totalAmount: number,
  customerName: string,
  productSummary: string,
  adminLineId: string
): Promise<void> {
  // 仕様書 v2 準拠: 顧客へのPushは通数消費を避けるため送信しない（注文確認は LIFF 画面完結）
  // 引数 customerLineId は将来の応答メッセージ連携のため残存
  const formattedAmount = new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(totalAmount)

  const adminMessage = `【新規注文通知】
お客様: ${customerName}
注文番号: ${orderNumber}
${productSummary}
合計金額: ${formattedAmount}

管理画面にてご確認ください。`

  await sendPushMessage(adminLineId, adminMessage)
}

export async function notifyOrderShipped(
  customerLineId: string,
  orderNumber: string,
  deliveryDate: string
): Promise<void> {
  const message = `【善兵衛農園】ご注文品を発送いたしました。

注文番号: ${orderNumber}
お届け予定日: ${deliveryDate}

お届けまでしばらくお待ちください。
ご不明な点はお気軽にご連絡ください。`

  await sendPushMessage(customerLineId, message)
}

export async function notifyOrderConfirmed(
  customerLineId: string,
  orderNumber: string
): Promise<void> {
  const message = `【善兵衛農園】ご注文内容を確認いたしました。

注文番号: ${orderNumber}

商品の準備が整い次第、発送いたします。
引き続きよろしくお願いいたします。`

  await sendPushMessage(customerLineId, message)
}
