import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 認証: middleware が /api/admin/* を保護済み。DBアクセスは service_role。

const VALID_SCOPES = ['product', 'category'] as const
type ScopeType = (typeof VALID_SCOPES)[number]

function toIntOrNull(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (v === '' || v === null || v === undefined) return { ok: true, value: null }
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n)) return { ok: false }
  return { ok: true, value: n }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; overrideId: string } }
) {
  try {
    const body = await req.json()
    const {
      scope_type,
      product_id,
      category,
      pricing_tier_id,
      min_cases,
      unit_price,
      fixed_shipping_fee,
    } = body as Record<string, unknown>

    if (!scope_type || !VALID_SCOPES.includes(scope_type as ScopeType)) {
      return NextResponse.json(
        { error: 'scope_type は product / category のいずれかです' },
        { status: 400 }
      )
    }

    let resolvedProductId: string | null = null
    let resolvedCategory: string | null = null
    if (scope_type === 'product') {
      if (!product_id || typeof product_id !== 'string') {
        return NextResponse.json({ error: '商品を指定してください' }, { status: 400 })
      }
      resolvedProductId = product_id
      resolvedCategory = null
    } else {
      if (!category || typeof category !== 'string') {
        return NextResponse.json({ error: 'カテゴリを指定してください' }, { status: 400 })
      }
      resolvedCategory = category
      resolvedProductId = null
    }

    const minCasesRaw = min_cases === '' || min_cases === undefined || min_cases === null ? 1 : min_cases
    const minCasesParsed = toIntOrNull(minCasesRaw)
    if (!minCasesParsed.ok || minCasesParsed.value === null || minCasesParsed.value < 1) {
      return NextResponse.json({ error: '最小ケース数は1以上の整数です' }, { status: 400 })
    }

    const unitPriceParsed = toIntOrNull(unit_price)
    if (!unitPriceParsed.ok) {
      return NextResponse.json({ error: '個別単価は整数で指定してください' }, { status: 400 })
    }
    const fixedShippingParsed = toIntOrNull(fixed_shipping_fee)
    if (!fixedShippingParsed.ok) {
      return NextResponse.json({ error: '固定送料は整数で指定してください' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('company_overrides')
      .update({
        scope_type,
        product_id: resolvedProductId,
        category: resolvedCategory,
        pricing_tier_id: pricing_tier_id && typeof pricing_tier_id === 'string' ? pricing_tier_id : null,
        min_cases: minCasesParsed.value,
        unit_price: unitPriceParsed.value,
        fixed_shipping_fee: fixedShippingParsed.value,
      })
      .eq('id', params.overrideId)
      .eq('company_id', params.id)
      .select('*')
      .single()

    if (error) {
      console.error('company_overrides PATCH error:', error)
      return NextResponse.json({ error: '特例の更新に失敗しました' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: '特例が見つかりません' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('company_overrides PATCH error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; overrideId: string } }
) {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from('company_overrides')
      .delete()
      .eq('id', params.overrideId)
      .eq('company_id', params.id)

    if (error) {
      console.error('company_overrides DELETE error:', error)
      return NextResponse.json({ error: '特例の削除に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ data: { id: params.overrideId } })
  } catch (err) {
    console.error('company_overrides DELETE error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
