// 送料自動計算（箱詰め）ロジック — 純粋関数・DBアクセスなし。
// 常温(ambient)品のみを換算重量で合計し、shipping_box_templates で箱詰めする。
// 冷蔵(chilled)・冷凍(frozen)・自由記入(isCustom)・重量未設定(weightKgPerUnit=null)は
// 自動計算に含めず warnings に積む（手入力に回す運用）。

export type PackingItem = {
  weightKgPerUnit: number | null // 1数量単位あたりの梱包換算kg
  temperatureZone: string // 'ambient' / 'chilled' / 'frozen'
  realQuantity: number // 実数量（tier商品は総本数に展開済み）
  productName: string
  isCustom: boolean
}

export type PackingBox = {
  label: string
  cost: number
  maxWeightKg: number
}

export type PackingLine = {
  label: string
  cost: number
}

export type PackingResult = {
  lines: PackingLine[]
  totalKg: number
  warnings: string[]
}

/**
 * 常温品の換算重量合計を箱詰めして送料行を返す。
 *
 * ルール:
 *  1) ambient 以外・isCustom・weightKgPerUnit=null は除外し warnings に積む。
 *  2) 換算重量 = weightKgPerUnit × realQuantity を合計 → totalKg。
 *  3) boxes（max_weight_kg 昇順）でファーストフィット・大箱優先の箱詰め:
 *     - 最大箱の maxWeightKg を Bmax とする。
 *     - remaining > Bmax の間、最大箱を1つ確定（remaining -= Bmax）。
 *     - 最後に remaining(>0) を「remaining <= maxWeightKg を満たす最小の箱」1つで収める。
 *  4) 同一の箱が複数出たら「label ×N」1行にまとめ、cost = 単価 × N。
 */
export function calcShipping(items: PackingItem[], boxes: PackingBox[]): PackingResult {
  const warnings: string[] = []

  // (1) 常温品のみ抽出。除外分は warnings。
  let totalKg = 0
  for (const item of items) {
    if (item.isCustom) {
      // 自由記入行は重量不明。自動計算対象外（黙って除外＝手入力に回す）。
      continue
    }
    if (item.temperatureZone !== 'ambient') {
      warnings.push(`${item.productName}（${item.temperatureZone === 'chilled' ? '冷蔵' : item.temperatureZone === 'frozen' ? '冷凍' : item.temperatureZone}）`)
      continue
    }
    if (item.weightKgPerUnit == null) {
      warnings.push(`${item.productName}（重量未設定）`)
      continue
    }
    totalKg += item.weightKgPerUnit * item.realQuantity
  }

  // 常温品が無ければ送料行なし。
  if (totalKg <= 0) {
    return { lines: [], totalKg, warnings }
  }

  // (3) 箱詰め。boxes は max_weight_kg 昇順の想定だが、防御的にソートする。
  const sorted = [...boxes].sort((a, b) => a.maxWeightKg - b.maxWeightKg)
  if (sorted.length === 0) {
    warnings.push('送料テンプレートが設定されていないため送料を自動計算できません')
    return { lines: [], totalKg, warnings }
  }

  const maxBox = sorted[sorted.length - 1]
  const bMax = maxBox.maxWeightKg
  const chosen: PackingBox[] = []
  let remaining = totalKg

  // 最大箱で埋められる分を確定。
  while (remaining > bMax) {
    chosen.push(maxBox)
    remaining -= bMax
  }

  // 端数（remaining > 0）を収める最小の箱を選ぶ。
  if (remaining > 0) {
    const fit = sorted.find((b) => remaining <= b.maxWeightKg)
    if (fit) {
      chosen.push(fit)
    } else {
      // 通常発生しない（remaining <= bMax のはず）。テンプレ異常時の保険。
      warnings.push('送料テンプレートに収まらない重量があるため一部の送料を自動計算できません')
    }
  }

  // (4) 同一ラベルの箱をまとめて「label ×N」1行に。出現順を維持する。
  const grouped: { label: string; cost: number; count: number }[] = []
  for (const box of chosen) {
    const existing = grouped.find((g) => g.label === box.label && g.cost === box.cost)
    if (existing) {
      existing.count++
    } else {
      grouped.push({ label: box.label, cost: box.cost, count: 1 })
    }
  }

  const lines: PackingLine[] = grouped.map((g) => ({
    label: g.count > 1 ? `${g.label} ×${g.count}` : g.label,
    cost: g.cost * g.count,
  }))

  return { lines, totalKg, warnings }
}
