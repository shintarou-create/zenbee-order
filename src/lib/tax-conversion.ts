// 会社単位の「単価の税区分」（companies.price_tax_type）に関する変換ユーティリティ。
// exclusive（税抜/本体価格）の会社に対してのみ、注文明細作成時に単価を税込へ変換する。

// 税抜単価から税込単価に変換（8%軽減税率）。
// 明細行ごとに丸める（「行の単価」を四捨五入してから quantity 倍する。
// 全行合計してからの丸めは行わない）。
export function toInclusiveUnitPrice(exclusiveUnitPrice: number, taxRate = 0.08): number {
  return Math.round(exclusiveUnitPrice * (1 + taxRate))
}
