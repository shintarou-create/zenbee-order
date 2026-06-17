import type { Product } from '@/types'

export function generateOrderNumber(date: Date, sequence: number): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const seq = String(sequence).padStart(3, '0')
  return `ZB-${year}${month}${day}-${seq}`
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(amount)
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function formatDateWithDay(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(d)
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  return `${month}/${day}（${weekday}）`
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

// 日本時間で今日の日付を YYYY-MM-DD 形式で返す
function getTodayJST(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

// 表示判定：order_start_date〜order_end_date の範囲内か（NULL は制約なし）
export function isProductVisible(product: Product): boolean {
  const today = getTodayJST()
  if (product.order_start_date && today < product.order_start_date) return false
  if (product.order_end_date && today > product.order_end_date) return false
  return true
}

// 予約判定：ship_start_date が設定されていて今日がその日より前
export function isProductPreorder(product: Product): boolean {
  if (!product.ship_start_date) return false
  return getTodayJST() < product.ship_start_date
}

// "YYYY-MM-DD" → "M月D日" 形式に変換
export function formatShipStartDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number)
  return `${month}月${day}日`
}

export function getNextBusinessDay(date: Date): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)

  // 土曜日(6)の場合は月曜日に、日曜日(0)の場合は月曜日に
  const dayOfWeek = next.getDay()
  if (dayOfWeek === 6) {
    next.setDate(next.getDate() + 2)
  } else if (dayOfWeek === 0) {
    next.setDate(next.getDate() + 1)
  }

  return next
}

export function formatDateForInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCustomerOrderStatusLabel(status: string, detailsConfirmed?: boolean): string {
  if (status === 'pending') {
    return detailsConfirmed ? 'ご注文受付' : '確認中'
  }
  return getOrderStatusLabel(status)
}

export function getCustomerOrderStatusColor(status: string, detailsConfirmed?: boolean): string {
  if (status === 'pending') {
    return detailsConfirmed
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-gray-100 text-gray-700'
  }
  return getOrderStatusColor(status)
}

export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '未対応',
    shipped: '出荷済',
    done: '完了',
    cancelled: 'キャンセル',
  }
  return labels[status] || status
}

export function getOrderStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    shipped: 'bg-blue-100 text-blue-800',
    done: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

export function getPriceRankLabel(rank: string): string {
  const labels: Record<string, string> = {
    standard: 'スタンダード',
    premium: 'プレミアム',
    vip: 'VIP',
  }
  return labels[rank] || rank
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    みかん: 'みかん',
    びわ: 'びわ',
    レモン: 'レモン',
    ジュース: 'ジュース',
    その他: 'その他',
  }
  return labels[category] || category
}
