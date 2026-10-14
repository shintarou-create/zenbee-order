import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeRegistrationCode } from '@/lib/registration-code'

// 紛らわしい文字(0/o/1/l)を除いた安全な文字セット
const SAFE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'

function generateCode(length = 8): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  }
  return code
}

export async function POST(req: NextRequest) {
  // 認証: middleware が /api/admin/* を保護済み
  try {
    const body = await req.json()
    const { company_id } = body as { company_id?: string }
    if (!company_id) {
      return NextResponse.json({ error: 'company_id が必要です' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .single()

    if (!company) {
      return NextResponse.json({ error: '会社が見つかりません' }, { status: 404 })
    }

    // 衝突時は最大10回リトライ。照合は大文字小文字を区別しないため、衝突確認も ilike で行う
    // （DBに大文字で残っているコードと、大文字小文字違いで重複させない）
    let code = ''
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = normalizeRegistrationCode(generateCode())
      if (!candidate) continue
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .ilike('registration_code', candidate)
        .limit(1)
      if (!existing || existing.length === 0) {
        code = candidate
        break
      }
    }

    if (!code) {
      return NextResponse.json({ error: 'コード生成に失敗しました' }, { status: 500 })
    }

    const { error } = await supabase
      .from('companies')
      .update({ registration_code: code }) // 保存は常に小文字（normalizeRegistrationCode 済み）
      .eq('id', company_id)

    if (error) throw error

    return NextResponse.json({ code })
  } catch (err) {
    console.error('registration-code POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
