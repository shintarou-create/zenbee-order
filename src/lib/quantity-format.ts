// 数量/ティア表記の共通フォーマッタ（唯一の表記ルール定義）。
// 判定は tier_quantity で行う:
//   - tier_quantity == null/undefined → ティアなし通常商品（現状維持: {quantity}{unit}）
//   - tier_quantity === 1（バラ）      → 「ケース」を使わず「本」
//   - tier_quantity >= 2（箱）          → 「ケース」＋総本数を併記
// 表記文字列の組み立てはこのファイル以外に書かないこと。

type TierQty = number | null | undefined

// 箱（ケース）ティアか？（tier_quantity >= 2）
export function isCaseTier(tq: TierQty): boolean {
  return tq != null && tq >= 2
}

// 品名バッジ(tier_label)を表示するか（箱のみ表示・バラは非表示）
export function shouldShowTierBadge(tq: TierQty): boolean {
  return isCaseTier(tq)
}

// 総本数（= tier_quantity × quantity。ティアなし/バラは quantity と一致）
export function totalBottles(quantity: number, tq: TierQty): number {
  return (tq ?? 1) * quantity
}

// 数量欄（納品書の数量欄・注文詳細の数量セル・顧客の注文サマリ等）
//   ティアなし: `${quantity}${unit}`
//   バラ:       `${quantity}本`
//   箱:         `${quantity}ケース（${総本数}本）`
export function formatQuantity(args: { quantity: number; tier_quantity?: TierQty; unit?: string | null }): string {
  const { quantity, tier_quantity, unit } = args
  if (tier_quantity == null) return `${quantity}${unit ?? ''}`
  if (tier_quantity >= 2) return `${quantity}ケース（${tier_quantity * quantity}本）`
  return `${quantity}本` // バラ
}

// 顧客発注画面の数量単位
//   ティアなし: unit / バラ: 本 / 箱: ケース
export function formatCartUnit(args: { tier_quantity?: TierQty; unit?: string | null }): string {
  const { tier_quantity, unit } = args
  if (tier_quantity == null) return unit ?? ''
  return tier_quantity >= 2 ? 'ケース' : '本'
}

// 数量入力欄の右に添える単位ラベル（箱は総本数も併記）
//   ティアなし: unit / バラ: 本 / 箱: `ケース（${総本数}本）`
export function formatUnitWithTotal(args: { quantity: number; tier_quantity?: TierQty; unit?: string | null }): string {
  const { quantity, tier_quantity, unit } = args
  if (tier_quantity == null) return unit ?? ''
  if (tier_quantity >= 2) return `ケース（${tier_quantity * quantity}本）`
  return '本' // バラ
}

// 顧客カート/選択中の表記
//   ティアなし: `${product_name} × ${quantity}${unit}`
//   バラ:       `${product_name} × ${quantity}本`
//   箱:         `${tier_label ?? product_name} × ${quantity}ケース（${総本数}本）`
export function formatCartLine(args: {
  product_name: string
  tier_label?: string | null
  quantity: number
  tier_quantity?: TierQty
  unit?: string | null
}): string {
  const { product_name, tier_label, quantity, tier_quantity, unit } = args
  if (isCaseTier(tier_quantity)) {
    return `${tier_label ?? product_name} × ${quantity}ケース（${(tier_quantity as number) * quantity}本）`
  }
  const u = tier_quantity != null ? '本' : (unit ?? '')
  return `${product_name} × ${quantity}${u}`
}

// 補助行「N本入 × Mケース = 総本数」。箱のみ。バラ/ティアなしは null（非表示）。
export function formatCaseBreakdown(args: { tier_quantity?: TierQty; quantity: number }): string | null {
  const { tier_quantity, quantity } = args
  if (!isCaseTier(tier_quantity)) return null
  const tq = tier_quantity as number
  return `${tq}本入 × ${quantity}ケース = ${tq * quantity}本`
}

// 管理の注文一覧の明細ラベル
//   ティアなし: `${product_name} ${quantity}${unit}`（unitなければ product_name のみ）
//   バラ:       `${product_name} ×${quantity}本`
//   箱:         `${product_name} ${tier_quantity}本入×${quantity}`
export function formatOrderItemLabel(args: {
  product_name: string
  quantity: number
  tier_quantity?: TierQty
  unit?: string | null
}): string {
  const { product_name, quantity, tier_quantity, unit } = args
  if (isCaseTier(tier_quantity)) return `${product_name} ${tier_quantity}本入×${quantity}`
  if (tier_quantity === 1) return `${product_name} ×${quantity}本`
  if (unit) return `${product_name} ${quantity}${unit}`
  return product_name
}

// ヤマト送り状の品名（ティア商品のみ想定。ティアなしは呼び出し側で name を使う）
//   バラ: `${name}×${quantity}`
//   箱:   `${name} ${tier_quantity}本入×${quantity}`
export function formatYamatoItemName(args: { name: string; quantity: number; tier_quantity?: TierQty }): string {
  const { name, quantity, tier_quantity } = args
  if (isCaseTier(tier_quantity)) return `${name} ${tier_quantity}本入×${quantity}`
  return `${name}×${quantity}`
}
