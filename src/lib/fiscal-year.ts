// 9月始まり・8月決算の会計年度ヘルパー。
// 法人化2021年5月・第1期は2020-09〜2021-08。2019を起点にすると
// 第1期(2020-09〜2021-08)がfiscal_year=1になる。
const FISCAL_YEAR_BASE = 2019

// dateStr は 'YYYY-MM-DD'（または先頭が 'YYYY-MM'）形式。タイムゾーンずれを避けるため Date は使わず文字列から直接算出する。
export function getFiscalYear(dateStr: string): number {
  const year = Number(dateStr.slice(0, 4))
  const month = Number(dateStr.slice(5, 7))
  const fiscalYearStartYear = month >= 9 ? year : year - 1
  return fiscalYearStartYear - FISCAL_YEAR_BASE
}

export function getFiscalMonth(dateStr: string): string {
  return dateStr.slice(0, 7)
}

// 期(fiscal_year)の開始日・終了日を 'YYYY-MM-DD' で返す。
export function getFiscalYearRange(fiscalYear: number): { start: string; end: string } {
  const startYear = FISCAL_YEAR_BASE + fiscalYear
  return { start: `${startYear}-09-01`, end: `${startYear + 1}-08-31` }
}

// 期(fiscal_year)を構成する12個の暦月('YYYY-MM')を9月始まりの順で返す。
export function getFiscalMonths(fiscalYear: number): string[] {
  const startYear = FISCAL_YEAR_BASE + fiscalYear
  const months: string[] = []
  for (let m = 9; m <= 12; m++) months.push(`${startYear}-${String(m).padStart(2, '0')}`)
  for (let m = 1; m <= 8; m++) months.push(`${startYear + 1}-${String(m).padStart(2, '0')}`)
  return months
}
