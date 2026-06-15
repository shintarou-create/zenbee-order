export const BLOCKED_DELIVERY_WEEKDAYS = [1, 4] // 1=月, 4=木

export function isBlockedDeliveryDate(dateStr: string): boolean {
  if (!dateStr) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay() // ローカル時刻で曜日を取得（UTCズレ回避）
  return BLOCKED_DELIVERY_WEEKDAYS.includes(day)
}

export const MIN_DELIVERY_LEAD_DAYS = 2

export function hasMixedShipStart(items: { shipStartDate?: string | null }[]): boolean {
  const dates = new Set(items.map((i) => i.shipStartDate).filter((d): d is string => !!d))
  return dates.size >= 2
}

export function hasSeasonalAndYearRound(items: { shipStartDate?: string | null }[]): boolean {
  const hasSeasonal = items.some((i) => !!i.shipStartDate)
  const hasYearRound = items.some((i) => !i.shipStartDate)
  return hasSeasonal && hasYearRound
}

export function getLatestShipStartDate(items: { shipStartDate?: string | null }[]): string | null {
  const dates = items.map((i) => i.shipStartDate).filter((d): d is string => !!d)
  return dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null
}

export function getMinDeliveryDateStr(): string {
  const today = new Date()
  const min = new Date(today.getFullYear(), today.getMonth(), today.getDate() + MIN_DELIVERY_LEAD_DAYS)
  const y = min.getFullYear()
  const m = String(min.getMonth() + 1).padStart(2, '0')
  const d = String(min.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isTooSoonDeliveryDate(dateStr: string): boolean {
  if (!dateStr) return false
  return dateStr < getMinDeliveryDateStr()
}
