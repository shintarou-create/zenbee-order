// 商品セレクトを「よく使う商品」順に並び替える共通ユーティリティ。
// 2層構造:
//   1) 実績のある商品（登場注文件数 > 0）を件数降順で上に（同数は display_order 昇順）
//   2) 実績のない商品（0件）を従来どおり display_order 昇順で下に
// display_order が null/undefined の場合は末尾扱い。元配列は破壊しない。

export function sortProductsByUsage<T extends { id: string; display_order?: number | null }>(
  products: T[],
  usageStats: Record<string, number>
): T[] {
  const orderOf = (p: T) => (p.display_order == null ? Number.POSITIVE_INFINITY : p.display_order)

  return [...products].sort((a, b) => {
    const ca = usageStats[a.id] ?? 0
    const cb = usageStats[b.id] ?? 0
    // グループ: 0 = 実績あり（上）, 1 = 実績なし（下）
    const ga = ca > 0 ? 0 : 1
    const gb = cb > 0 ? 0 : 1
    if (ga !== gb) return ga - gb

    // 実績ありグループ内は件数降順を優先
    if (ga === 0 && ca !== cb) return cb - ca

    // 同数（または実績なしグループ）は display_order 昇順（null 末尾）
    const da = orderOf(a)
    const db = orderOf(b)
    if (da === db) return 0
    return da - db
  })
}
