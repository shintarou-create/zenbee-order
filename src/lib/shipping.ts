import type { CartItem } from '@/types'

export interface ShippingLine {
  label: string
  quantity: number
  unitCost: number
  cost: number
}

export interface ShippingBreakdown {
  lines: ShippingLine[]
  total: number
}

export interface ShippingOptions {
  // 'direct_delivery' / 'pickup' は送料一律¥0
  deliveryMethod?: 'yamato' | 'direct_delivery' | 'pickup'
  // yamato かつ非null の場合、自動計算せず固定送料1行のみ
  fixedShippingFee?: number | null
}

// 商品名の全角英数字（U+FF01〜U+FF5E）を半角（U+0021〜U+007E）に正規化する。
// 例: 「温州みかんジュース２L」→「温州みかんジュース2L」。
// 送料判定（2L / 720ml / 180ml）はこの正規化後の文字列に対して半角リテラルで行う。
function normalizeProductName(name: string): string {
  return (name ?? '').replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  )
}

export function calculateShipping(
  items: CartItem[],
  options?: ShippingOptions
): ShippingBreakdown {
  const deliveryMethod = options?.deliveryMethod ?? 'yamato'
  const fixedShippingFee = options?.fixedShippingFee ?? null

  // 直接配達・来店引取りは送料一律¥0（自動計算・冷凍箱数チェックともスキップ）
  if (deliveryMethod === 'direct_delivery' || deliveryMethod === 'pickup') {
    return { lines: [], total: 0 }
  }

  // ヤマト発送 かつ 固定送料特例あり: 既存の自動計算を行わず固定送料1行のみ
  if (fixedShippingFee != null) {
    return {
      lines: [
        { label: '送料（特例固定）', quantity: 1, unitCost: fixedShippingFee, cost: fixedShippingFee },
      ],
      total: fixedShippingFee,
    }
  }

  const lines: ShippingLine[] = []

  // 青果（kg単位）: 10kg箱¥1,300優先、端数5kg以下なら5kg箱¥1,000
  const totalKg = items
    .filter((i) => i.unit === 'kg')
    .reduce((sum, i) => sum + i.quantity, 0)

  if (totalKg > 0) {
    let boxes10 = Math.floor(totalKg / 10)
    const remainder = totalKg % 10
    let boxes5 = 0
    if (remainder > 0) {
      if (remainder <= 5) {
        boxes5 = 1
      } else {
        boxes10 += 1
      }
    }
    if (boxes10 > 0) {
      lines.push({
        label: '青果 10kg箱',
        quantity: boxes10,
        unitCost: 1300,
        cost: boxes10 * 1300,
      })
    }
    if (boxes5 > 0) {
      lines.push({
        label: '青果 5kg箱',
        quantity: boxes5,
        unitCost: 1000,
        cost: 1000,
      })
    }
  }

  // びわ（パック単位、冷蔵）: 12パックまで¥1,550
  const totalPacks = items
    .filter((i) => i.unit === 'パック' && !normalizeProductName(i.productName).includes('2L'))
    .reduce((sum, i) => sum + i.quantity, 0)

  if (totalPacks > 0) {
    const boxes = Math.ceil(totalPacks / 12)
    lines.push({
      label: 'びわ 冷蔵箱（12パックまで）',
      quantity: boxes,
      unitCost: 1550,
      cost: boxes * 1550,
    })
  }

  // 2Lジュース（パック単位）: 4パックまで¥1,300 / 5パック以上は送料無料
  const total2L = items
    .filter((i) => i.unit === 'パック' && normalizeProductName(i.productName).includes('2L'))
    .reduce((sum, i) => sum + i.quantity, 0)

  if (total2L > 0 && total2L <= 4) {
    lines.push({
      label: 'ジュース2L（4パックまで）',
      quantity: 1,
      unitCost: 1300,
      cost: 1300,
    })
  }

  // ジュース720ml: 12本=1箱¥1,500（1〜12本→¥1,500 / 13〜24本→¥3,000 / 25〜36本→¥4,500）
  const total720ml = items
    .filter((i) => i.unit === '本' && normalizeProductName(i.productName).includes('720ml'))
    .reduce((sum, i) => sum + i.quantity * (i.tierQuantity ?? 1), 0)

  if (total720ml > 0) {
    const boxes = Math.ceil(total720ml / 12)
    lines.push({
      label: 'ジュース720ml（12本/箱）',
      quantity: boxes,
      unitCost: 1500,
      cost: boxes * 1500,
    })
  }

  // ジュース180ml: 30本ケース×N(¥1,300each) + 端数10本以内なら小口便(¥1,000) / 11〜29本なら追加ケース(¥1,300)
  const total180ml = items
    .filter((i) => i.unit === '本' && normalizeProductName(i.productName).includes('180ml'))
    .reduce((sum, i) => sum + i.quantity * (i.tierQuantity ?? 1), 0)

  if (total180ml > 0) {
    const caseCount = Math.floor(total180ml / 30)
    const remainder = total180ml % 30

    if (caseCount > 0) {
      lines.push({
        label: 'ジュース180ml（30本/ケース）',
        quantity: caseCount,
        unitCost: 1300,
        cost: caseCount * 1300,
      })
    }
    if (remainder > 0) {
      if (remainder <= 10) {
        lines.push({
          label: 'ジュース180ml（小口便）',
          quantity: 1,
          unitCost: 1000,
          cost: 1000,
        })
      } else {
        lines.push({
          label: 'ジュース180ml（30本/ケース）',
          quantity: 1,
          unitCost: 1300,
          cost: 1300,
        })
      }
    }
  }

  // 冷凍20Lジュース: 1箱¥3,000 / 2箱¥4,000 / 3箱¥5,000 / 4箱以上エラー
  // unit==='個' で冷凍20Lジュースのみを識別（びわ等の冷蔵商品を誤カウントしない）
  const totalFrozen = items
    .filter((i) => i.coolType === 2 && i.unit === '個')
    .reduce((sum, i) => sum + i.quantity, 0)

  if (totalFrozen > 0) {
    if (totalFrozen >= 4) {
      throw new Error('冷凍20Lジュースは3箱までしか同時注文できません')
    }
    const FROZEN_COSTS: Record<number, number> = { 1: 3000, 2: 4000, 3: 5000 }
    const frozenCost = FROZEN_COSTS[totalFrozen]
    lines.push({
      label: `冷凍20Lジュース ${totalFrozen}箱（冷凍便）`,
      quantity: 1,
      unitCost: frozenCost,
      cost: frozenCost,
    })
  }

  const total = lines.reduce((sum, l) => sum + l.cost, 0)
  return { lines, total }
}
