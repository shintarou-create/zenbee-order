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

export function isInSeason(product: Product): boolean {
  // 季節商品でない場合は常にtrue
  if (!product.is_seasonal) return true

  // season_start/season_endが未設定の場合はtrue
  if (!product.season_start || !product.season_end) return true

  const now = new Date()
  const currentMonth = now.getMonth() + 1 // 1-12
  const currentDay = now.getDate()

  const [startMonth, startDay] = product.season_start.split('-').map(Number)
  const [endMonth, endDay] = product.season_end.split('-').map(Number)

  // 現在の日付をMM-DD形式の数値として比較
  const current = currentMonth * 100 + currentDay
  const start = startMonth * 100 + startDay
  const end = endMonth * 100 + endDay

  if (start <= end) {
    // 通常の範囲（例: 11-01 〜 01-31 はまたがないケースは少ないが）
    return current >= start && current <= end
  } else {
    // 年をまたぐ場合（例: 11-01 〜 01-31）
    return current >= start || current <= end
  }
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
