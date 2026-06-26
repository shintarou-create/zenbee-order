import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 認証: middleware が /api/admin/* を保護済み（LINEトークン→admin_users照合）。
// DBアクセスは service_role（createServiceClient）で行う。

const VALID_SCOPES = ['product', 'category'] as const
type ScopeType = (typeof VALID_SCOPES)[number]

/** 空文字・undefined・null を null に、それ以外は整数として検証して返す */
function toIntOrNull(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (v === '' || v === null || v === undefined) return { ok: true, value: null }
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n)) return { ok: false }
  return { ok: true, value: n }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('company_overrides')
      .select('*')
      .eq('company_id', params.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('company_overrides GET error:', error)
      return NextResponse.json({ error: '特例の取得に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('company_overrides GET error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

    // スコープ別の必須・排他チェック
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

    // min_cases（デフォルト1、1以上の整数）
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
      .insert({
        company_id: params.id,
        scope_type,
        product_id: resolvedProductId,
        category: resolvedCategory,
        pricing_tier_id: pricing_tier_id && typeof pricing_tier_id === 'string' ? pricing_tier_id : null,
        min_cases: minCasesParsed.value,
        unit_price: unitPriceParsed.value,
        fixed_shipping_fee: fixedShippingParsed.value,
      })
      .select('*')
      .single()

    if (error) {
      console.error('company_overrides POST error:', error)
      return NextResponse.json({ error: '特例の作成に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ data })
  } catch (err) {
    console.error('company_overrides POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
