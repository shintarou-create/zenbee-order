export const BLOCKED_DELIVERY_WEEKDAYS = [1, 4] // 1=月, 4=木

export function isBlockedDeliveryDate(dateStr: string): boolean {
  if (!dateStr) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay() // ローカル時刻で曜日を取得（UTCズレ回避）
  return BLOCKED_DELIVERY_WEEKDAYS.includes(day)
}
