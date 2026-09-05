// カラーミー（D2C）取込用の商品名寄せ表を product_mappings に登録する。
// フェーズA（人間によるレビュー済みの対応表 = colorme-product-mappings.ts）を反映したもの。
// 冪等（UNIQUE(source_type, source_name)でUPSERT）。

import { createClient } from '@supabase/supabase-js'
import { COLORME_MAPPINGS } from './colorme-product-mappings'

const SOURCE_TYPE = 'colorme_csv'

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

  const rows: { source_type: string; source_name: string; product_id: string | null; kg_per_unit: number | null }[] = []
  for (const m of COLORME_MAPPINGS) {
    let productId: string | null = null
    if (m.product_name) {
      const id = productIdByName.get(m.product_name)
      if (!id) throw new Error(`products.name='${m.product_name}' が見つかりません（source_name='${m.source_name}'）`)
      productId = id
    }
    rows.push({ source_type: SOURCE_TYPE, source_name: m.source_name, product_id: productId, kg_per_unit: m.kg_per_unit })
  }

  const { error } = await supabase.from('product_mappings').upsert(rows, { onConflict: 'source_type,source_name' })
  if (error) throw new Error(`upsert失敗: ${error.message}`)

  console.log(`[seed-colorme-product-mappings] ${rows.length}件を登録しました`)
  const mappedCount = rows.filter((r) => r.product_id !== null).length
  console.log(`  product_id あり: ${mappedCount}件 / product_id=null: ${rows.length - mappedCount}件`)
}

main().catch((err) => {
  console.error('[seed-colorme-product-mappings] エラー:', err)
  process.exit(1)
})
