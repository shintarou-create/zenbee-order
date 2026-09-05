// 手入力販路（manual_csv）取込用の品種名寄せ表を product_mappings に登録する。
// data/manual-sales.csv に出てくる品種は3つのみ（紅みかん・向山温州・ゆら早生）。
// いずれも products.name と完全一致するため、products への新規追加は行わない。
// 冪等（UNIQUE(source_type, source_name)でUPSERT）。

import { createClient } from '@supabase/supabase-js'

const SOURCE_TYPE = 'manual'

const MAPPINGS: { source_name: string; product_name: string }[] = [
  { source_name: '紅みかん', product_name: '紅みかん' },
  { source_name: '向山温州', product_name: '向山温州' },
  { source_name: 'ゆら早生', product_name: 'ゆら早生' },
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.local を確認してください）')
  }
  const supabase = createClient(url, key)

  const { data: products, error: productsError } = await supabase.from('products').select('id, name')
  if (productsError) throw new Error(`products取得失敗: ${productsError.message}`)
  const productIdByName = new Map((products ?? []).map((p) => [p.name, p.id]))

  const rows: { source_type: string; source_name: string; product_id: string; kg_per_unit: null }[] = []
  for (const m of MAPPINGS) {
    const productId = productIdByName.get(m.product_name)
    if (!productId) {
      throw new Error(`products.name='${m.product_name}' が見つかりません（source_name='${m.source_name}'）`)
    }
    rows.push({ source_type: SOURCE_TYPE, source_name: m.source_name, product_id: productId, kg_per_unit: null })
  }

  const { error } = await supabase.from('product_mappings').upsert(rows, { onConflict: 'source_type,source_name' })
  if (error) throw new Error(`upsert失敗: ${error.message}`)

  console.log(`[seed-manual-product-mappings] ${rows.length}件を登録しました`)
  for (const r of rows) console.log(`  ${r.source_name} -> ${MAPPINGS.find((m) => m.source_name === r.source_name)!.product_name}`)
}

main().catch((err) => {
  console.error('[seed-manual-product-mappings] エラー:', err)
  process.exit(1)
})
