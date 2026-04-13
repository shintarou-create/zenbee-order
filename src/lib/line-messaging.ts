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
  const formattedAmount = new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(totalAmount)

  // お客様への通知
  const customerMessage = `【善兵衛農園】ご発注を受け付けました。

注文番号: ${orderNumber}
${productSummary}
合計金額: ${formattedAmount}

ご注文内容を確認次第、改めてご連絡いたします。
何かご不明な点がございましたら、お気軽にお申し付けください。`

  // 管理者への通知
  const adminMessage = `【新規注文通知】
お客様: ${customerName}
注文番号: ${orderNumber}
${productSummary}
合計金額: ${formattedAmount}

管理画面にてご確認ください。`

  await Promise.allSettled([
    sendPushMessage(customerLineId, customerMessage),
    sendPushMessage(adminLineId, adminMessage),
  ])
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
