// 数量/ティア表記の共通フォーマッタ（唯一の表記ルール定義）。
// 判定は tier_quantity と category で行う:
//   - tier_quantity == null/undefined → ティアなし通常商品（現状維持: {quantity}{unit}）
//   - category が 'ジュース*'         → 従来どおり「本」「ケース」表記
//       - tier_quantity === 1（バラ）      → 「ケース」を使わず「本」
//       - tier_quantity >= 2（箱）          → 「ケース」＋総本数を併記
//   - category が '柑橘'/'その他'（Nkgセット等）→ 「セット」表記。tier_quantityの値に
//     関わらず（1でも）常にセット扱い・tier_labelを表示する（バラ/箱の区別はない）。
//   - category 省略/上記以外 → 従来どおり（ジュースと同じ扱い）にフォールバックする
//     （既存の呼び出し元を壊さないための後方互換デフォルト）。
// 表記文字列の組み立てはこのファイル以外に書かないこと。

type TierQty = number | null | undefined

// category が「セット」表記対象か（柑橘/その他のkg品をtierで売る場合）
export function isSetCategory(category?: string | null): boolean {
  return category === '柑橘' || category === 'その他'
}

// 箱（ケース）ティアか？（tier_quantity >= 2）。セットカテゴリは常にfalse
// （箱/バラの区別を持たないため。tier_label表示可否は shouldShowTierBadge を使うこと）。
export function isCaseTier(tq: TierQty, category?: string | null): boolean {
  if (isSetCategory(category)) return false
  return tq != null && tq >= 2
}

// 品名バッジ(tier_label)を表示するか
//   ジュース（既定含む）: 箱のみ表示・バラは非表示（tier_quantity>=2）
//   セット（柑橘/その他）: tierがあれば常に表示（サイズ違いを区別するため）
export function shouldShowTierBadge(tq: TierQty, category?: string | null): boolean {
  if (tq == null) return false
  if (isSetCategory(category)) return true
  return tq >= 2
}

// 総本数（= tier_quantity × quantity。ティアなし/バラは quantity と一致）
// セットカテゴリでは「本」の概念がないため呼び出し側では使わないこと。
export function totalBottles(quantity: number, tq: TierQty): number {
  return (tq ?? 1) * quantity
}

// 数量欄（納品書の数量欄・注文詳細の数量セル・顧客の注文サマリ等）
//   ティアなし: `${quantity}${unit}`
//   セット:     `${quantity}セット`
//   バラ:       `${quantity}本`
//   箱:         `${quantity}ケース（${総本数}本）`
export function formatQuantity(args: {
  quantity: number
  tier_quantity?: TierQty
  unit?: string | null
  category?: string | null
}): string {
  const { quantity, tier_quantity, unit, category } = args
  if (tier_quantity == null) return `${quantity}${unit ?? ''}`
  if (isSetCategory(category)) return `${quantity}セット`
  if (tier_quantity >= 2) return `${quantity}ケース（${tier_quantity * quantity}本）`
  return `${quantity}本` // バラ
}

// 顧客発注画面の数量単位
//   ティアなし: unit / セット: セット / バラ: 本 / 箱: ケース
export function formatCartUnit(args: { tier_quantity?: TierQty; unit?: string | null; category?: string | null }): string {
  const { tier_quantity, unit, category } = args
  if (tier_quantity == null) return unit ?? ''
  if (isSetCategory(category)) return 'セット'
  return tier_quantity >= 2 ? 'ケース' : '本'
}

// 数量入力欄の右に添える単位ラベル（箱は総本数も併記）
//   ティアなし: unit / セット: セット / バラ: 本 / 箱: `ケース（${総本数}本）`
export function formatUnitWithTotal(args: {
  quantity: number
  tier_quantity?: TierQty
  unit?: string | null
  category?: string | null
}): string {
  const { quantity, tier_quantity, unit, category } = args
  if (tier_quantity == null) return unit ?? ''
  if (isSetCategory(category)) return 'セット'
  if (tier_quantity >= 2) return `ケース（${tier_quantity * quantity}本）`
  return '本' // バラ
}

// 顧客カート/選択中の表記
//   ティアなし: `${product_name} × ${quantity}${unit}`
//   セット:     `${tier_label ?? product_name} × ${quantity}セット`
//   バラ:       `${product_name} × ${quantity}本`
//   箱:         `${tier_label ?? product_name} × ${quantity}ケース（${総本数}本）`
export function formatCartLine(args: {
  product_name: string
  tier_label?: string | null
  quantity: number
  tier_quantity?: TierQty
  unit?: string | null
  category?: string | null
}): string {
  const { product_name, tier_label, quantity, tier_quantity, unit, category } = args
  if (isSetCategory(category) && tier_quantity != null) {
    return `${tier_label ?? product_name} × ${quantity}セット`
  }
  if (isCaseTier(tier_quantity)) {
    return `${tier_label ?? product_name} × ${quantity}ケース（${(tier_quantity as number) * quantity}本）`
  }
  const u = tier_quantity != null ? '本' : (unit ?? '')
  return `${product_name} × ${quantity}${u}`
}

// 補助行「N本入 × Mケース = 総本数」。ジュースの箱のみ表示。
// セットカテゴリ・バラ/ティアなしは null（非表示。セットは1セット=1単位で自明なため）。
export function formatCaseBreakdown(args: { tier_quantity?: TierQty; quantity: number; category?: string | null }): string | null {
  const { tier_quantity, quantity, category } = args
  if (isSetCategory(category)) return null
  if (!isCaseTier(tier_quantity)) return null
  const tq = tier_quantity as number
  return `${tq}本入 × ${quantity}ケース = ${tq * quantity}本`
}

// 管理の注文一覧の明細ラベル
//   ティアなし: `${product_name} ${quantity}${unit}`（unitなければ product_name のみ）
//   セット:     `${product_name} ×${quantity}セット`
//   バラ:       `${product_name} ×${quantity}本`
//   箱:         `${product_name} ${tier_quantity}本入×${quantity}`
export function formatOrderItemLabel(args: {
  product_name: string
  quantity: number
  tier_quantity?: TierQty
  unit?: string | null
  category?: string | null
}): string {
  const { product_name, quantity, tier_quantity, unit, category } = args
  if (isSetCategory(category) && tier_quantity != null) {
    return `${product_name} ×${quantity}セット`
  }
  if (isCaseTier(tier_quantity)) return `${product_name} ${tier_quantity}本入×${quantity}`
  if (tier_quantity === 1) return `${product_name} ×${quantity}本`
  if (unit) return `${product_name} ${quantity}${unit}`
  return product_name
}

// ヤマト送り状の品名（ティア商品のみ想定。ティアなしは呼び出し側で name を使う）
//   セット: `${name} ×${quantity}セット`
//   バラ:   `${name}×${quantity}`
//   箱:     `${name} ${tier_quantity}本入×${quantity}`
export function formatYamatoItemName(args: {
  name: string
  quantity: number
  tier_quantity?: TierQty
  category?: string | null
}): string {
  const { name, quantity, tier_quantity, category } = args
  if (isSetCategory(category) && tier_quantity != null) {
    return `${name} ×${quantity}セット`
  }
  if (isCaseTier(tier_quantity)) return `${name} ${tier_quantity}本入×${quantity}`
  return `${name}×${quantity}`
}
