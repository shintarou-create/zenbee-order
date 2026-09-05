// 代引き（ヤマトコレクト）関連の計算ロジック。ヤマトB2 CSV生成・管理画面の両方で共有する。

// 代引き手数料のサジェスト表（税込）。ヤマトとの契約内容によって変わる可能性があるため、
// 金額が変わった場合はこの定数だけを直せば suggestCodFee・isOverCodLimit 全体に反映される。
// 要確認: 2026-09時点の一般的な宅急便コレクト料金を仮設定。実際の契約料金と異なる場合は更新すること。
export const COD_FEE_TABLE: { maxAmount: number; fee: number }[] = [
  { maxAmount: 10_000, fee: 330 },
  { maxAmount: 30_000, fee: 440 },
  { maxAmount: 100_000, fee: 660 },
  { maxAmount: 300_000, fee: 1_100 },
]

// 宅急便コレクトの上限額（これを超える代引き総額は扱えない）
const COD_LIMIT = 300_000

/**
 * 代引き総額（商品代金＋送料＋手数料そのものを含まない「代引きされる金額」の目安）から
 * 手数料をサジェストする。COD_FEE_TABLE の該当帯が無い場合（30万円超）は最大値を返す
 * （呼び出し側は isOverCodLimit で別途警告を出すこと）。
 */
export function suggestCodFee(amount: number): number {
  const hit = COD_FEE_TABLE.find((row) => amount < row.maxAmount)
  return hit ? hit.fee : COD_FEE_TABLE[COD_FEE_TABLE.length - 1].fee
}

/** 宅急便コレクトの上限（30万円）を超えているかどうか */
export function isOverCodLimit(amount: number): boolean {
  return amount > COD_LIMIT
}

/**
 * 代引きの内消費税額を計算する。商品は8%（軽減税率）、送料と代引き手数料は10%（標準税率）
 * として計算し、それぞれの内税額の和を返す（freee-csv.ts と同じ税率の切り分け）。
 */
export function calcCodTax(itemsTotal: number, shippingTotal: number, codFee: number): number {
  const itemsTax = Math.floor(itemsTotal - itemsTotal / 1.08)
  const shippingAndFeeTax = Math.floor((shippingTotal + codFee) - (shippingTotal + codFee) / 1.1)
  return itemsTax + shippingAndFeeTax
}

/** 代引き請求額（注文合計 + 代引き手数料）を返す */
export function calcCodAmount(totalAmount: number, codFee: number): number {
  return totalAmount + codFee
}
