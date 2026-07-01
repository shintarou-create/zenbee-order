import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { calcShipping, type PackingItem, type PackingBox } from '@/lib/packing'

// 注文の常温品から送料行を自動計算して返す（GET）。
// 認証は middleware（/api/admin/*）で実施済み。集計は純粋関数 calcShipping に委譲する。
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const orderId = params.id
    if (!orderId) {
      return NextResponse.json({ error: '注文IDが指定されていません' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 注文明細 ＋ 商品の重量/温度帯を取得
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        product_name,
        quantity,
        tier_quantity,
        is_custom,
        product:products (name, weight_kg_per_unit, temperature_zone)
      `)
      .eq('order_id', orderId)

    if (itemsError) throw itemsError

    type ItemRow = {
      product_name: string
      quantity: number
      tier_quantity: number | null
      is_custom: boolean | null
      product?: { name: string; weight_kg_per_unit: number | null; temperature_zone: string | null } | null
    }

    const items: PackingItem[] = ((orderItems || []) as unknown as ItemRow[]).map((oi) => {
      // 実数量: tier_quantity 非null（ケース商品）は総本数、null は quantity。
      const realQuantity = oi.tier_quantity != null ? oi.tier_quantity * oi.quantity : oi.quantity
      return {
        weightKgPerUnit: oi.product?.weight_kg_per_unit ?? null,
        temperatureZone: oi.product?.temperature_zone ?? 'ambient',
        realQuantity,
        productName: oi.product?.name ?? oi.product_name ?? '',
        isCustom: oi.is_custom === true,
      }
    })

    // 送料テンプレート（有効・max_weight_kg 昇順）
    const { data: templates, error: tplError } = await supabase
      .from('shipping_box_templates')
      .select('label, cost, max_weight_kg')
      .eq('is_active', true)
      .order('max_weight_kg', { ascending: true })

    if (tplError) throw tplError

    const boxes: PackingBox[] = ((templates || []) as Array<{ label: string; cost: number; max_weight_kg: number }>).map((t) => ({
      label: t.label,
      cost: t.cost,
      maxWeightKg: t.max_weight_kg,
    }))

    const result = calcShipping(items, boxes)

    return NextResponse.json(result)
  } catch (err) {
    console.error('送料自動計算エラー:', err)
    return NextResponse.json({ error: '送料の自動計算に失敗しました' }, { status: 500 })
  }
}
