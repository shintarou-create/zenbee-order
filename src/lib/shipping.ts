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

  // ジュース720ml: 24本=1ケース¥3,700
  const total720ml = items
    .filter((i) => i.unit === '本' && i.productName.includes('720ml'))
    .reduce((sum, i) => sum + i.quantity, 0)

  if (total720ml > 0) {
    const cases = Math.ceil(total720ml / 24)
    lines.push({
      label: 'ジュース720ml（24本/ケース）',
      quantity: cases,
      unitCost: 3700,
      cost: cases * 3700,
    })
  }

  // ジュース180ml: 30本=1ケース¥1,300
  const total180ml = items
    .filter((i) => i.unit === '本' && i.productName.includes('180ml'))
    .reduce((sum, i) => sum + i.quantity, 0)

  if (total180ml > 0) {
    const cases = Math.ceil(total180ml / 30)
    lines.push({
      label: 'ジュース180ml（30本/ケース）',
      quantity: cases,
      unitCost: 1300,
      cost: cases * 1300,
    })
  }

  const total = lines.reduce((sum, l) => sum + l.cost, 0)
  return { lines, total }
}
