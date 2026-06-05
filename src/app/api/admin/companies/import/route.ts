import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const VALID_PRICE_RANKS = ['standard', 'premium', 'vip']

interface CsvRow {
  company_name: string
  representative_name: string
  postal_code: string
  prefecture: string
  city: string
  address: string
  building: string
  phone: string
  email: string
  price_rank: string
}

interface ImportResult {
  row: number
  company_name: string
  action: 'insert' | 'update' | 'error'
  status: 'ok' | 'error'
  message?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { rows: CsvRow[]; dryRun: boolean }
    const { rows, dryRun } = body

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '行データが空です' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: existing, error: fetchError } = await supabase
      .from('companies')
      .select('company_name')

    if (fetchError) throw fetchError

    const existingNames = new Set(
      (existing || []).map((c: { company_name: string }) => c.company_name)
    )

    const results: ImportResult[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2

      const companyName = row.company_name?.trim()
      if (!companyName) {
        results.push({
          row: rowNum,
          company_name: '',
          action: 'error',
          status: 'error',
          message: '店名が空です（company_name は必須）',
        })
        continue
      }

      const priceRank = row.price_rank?.trim() || 'standard'
      if (!VALID_PRICE_RANKS.includes(priceRank)) {
        results.push({
          row: rowNum,
          company_name: companyName,
          action: 'error',
          status: 'error',
          message: `price_rank が無効: "${priceRank}"（standard / premium / vip のみ）`,
        })
        continue
      }

      const action = existingNames.has(companyName) ? 'update' : 'insert'

      if (!dryRun) {
        const { error } = await supabase.from('companies').upsert(
          {
            company_name: companyName,
            representative_name: row.representative_name?.trim() || null,
            postal_code: row.postal_code?.trim() || null,
            prefecture: row.prefecture?.trim() || null,
            city: row.city?.trim() || null,
            address: row.address?.trim() || null,
            building: row.building?.trim() || null,
            phone: row.phone?.trim() || null,
            email: row.email?.trim() || null,
            price_rank: priceRank,
          },
          { onConflict: 'company_name' }
        )

        if (error) {
          results.push({
            row: rowNum,
            company_name: companyName,
            action: 'error',
            status: 'error',
            message: error.message,
          })
          continue
        }
      }

      results.push({ row: rowNum, company_name: companyName, action, status: 'ok' })
    }

    const stats = {
      new: results.filter((r) => r.action === 'insert' && r.status === 'ok').length,
      updated: results.filter((r) => r.action === 'update' && r.status === 'ok').length,
      error: results.filter((r) => r.status === 'error').length,
    }

    return NextResponse.json({ results, stats, dryRun })
  } catch (err) {
    console.error('companies import POST error:', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
