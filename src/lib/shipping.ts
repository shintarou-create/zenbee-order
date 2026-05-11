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

export function calculateShipping(items: CartItem[]): ShippingBreakdown {
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
    .filter((i) => i.unit === 'パック')
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

  // ジュース720ml: 12本=1箱¥1,500（1〜12本→¥1,500 / 13〜24本→¥3,000 / 25〜36本→¥4,500）
  const total720ml = items
    .filter((i) => i.unit === '本' && i.productName.includes('720ml'))
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
    .filter((i) => i.unit === '本' && i.productName.includes('180ml'))
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
  const totalFrozen = items
    .filter((i) => i.coolType === 2)
    .reduce((sum, i) => sum + i.quantity, 0)

  if (totalFrozen > 0) {
    if (totalFrozen >= 4) {
      throw new Error('冷凍20Lジュースは3箱までしか同時注文できません')
    }
    const FROZEN_COSTS: Record<number, number> = { 1: 3000, 2: 4000, 3: 5000 }
    const frozenCost = FROZEN_COSTS[totalFrozen]
    lines.push({
      label: '冷凍20Lジュース（冷凍便）',
      quantity: totalFrozen,
      unitCost: frozenCost,
      cost: frozenCost,
    })
  }

  const total = lines.reduce((sum, l) => sum + l.cost, 0)
  return { lines, total }
}
