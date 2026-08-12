// 「発注シート（飲食店）」レガシー取込用の商品名寄せ表を product_mappings に登録する。
// フェーズB（人間によるレビュー済みの対応表）を反映したもの。冪等（UNIQUE(source_type, source_name)でUPSERT）。
// 対象外にした商品名（products未存在・部位違いで意図的にマージしないもの等）はここには含めない
// （product_mappings に無ければ import-legacy-wholesale.ts 側で product_id=null・variety_labelは原文のまま、という扱いになる）。

import { createClient } from '@supabase/supabase-js'

const SOURCE_TYPE = 'sheet_legacy'

// source_name はフェーズCの正規化ルール（最初の "(" "（" より前を商品名本体として抽出）後の値。
const MAPPINGS: { source_name: string; product_name: string }[] = [
  // products.name と完全一致する20件（フェーズA調査で確認済み）。
  // product_id は product_mappings 経由でしか解決しないため、完全一致であってもここに登録が必要。
  { source_name: 'レモン', product_name: 'レモン' },
  { source_name: '三宝柑', product_name: '三宝柑' },
  { source_name: '紅八朔', product_name: '紅八朔' },
  { source_name: '紅みかん', product_name: '紅みかん' },
  { source_name: '清見オレンジ', product_name: '清見オレンジ' },
  { source_name: '甘夏', product_name: '甘夏' },
  { source_name: 'ベルガモット', product_name: 'ベルガモット' },
  { source_name: '爽涼みかん', product_name: '爽涼みかん' },
  { source_name: 'ゆら早生', product_name: 'ゆら早生' },
  { source_name: 'みかんの葉', product_name: 'みかんの葉' },
  { source_name: '向山温州', product_name: '向山温州' },
  { source_name: 'あすみ', product_name: 'あすみ' },
  { source_name: '橙', product_name: '橙' },
  { source_name: '麗紅', product_name: '麗紅' },
  { source_name: '黄金柑', product_name: '黄金柑' },
  { source_name: '八朔ジュース180ml', product_name: '八朔ジュース180ml' },
  { source_name: '八朔ジュース720ml', product_name: '八朔ジュース720ml' },
  { source_name: '清見オレンジジュース180ml', product_name: '清見オレンジジュース180ml' },
  { source_name: '清見オレンジジュース720ml', product_name: '清見オレンジジュース720ml' },
  { source_name: 'バレンシアオレンジ', product_name: 'バレンシアオレンジ' },
  // 表記ゆれ19件（フェーズBで確認済み）
  { source_name: 'あすき', product_name: 'あすみ' },
  { source_name: 'みかんJ180ml', product_name: '温州みかんジュース180ml' },
  { source_name: 'みかんジュース180ml', product_name: '温州みかんジュース180ml' },
  { source_name: 'みかんJ720ml', product_name: '温州みかんジュース720ml' },
  { source_name: 'みかんジュース720ml', product_name: '温州みかんジュース720ml' },
  { source_name: 'みかんジュース20リットル', product_name: '冷凍20Lみかんジュース' },
  { source_name: 'バレンシア', product_name: 'バレンシアオレンジ' },
  { source_name: '三宝', product_name: '三宝柑' },
  { source_name: '八朔J180ml', product_name: '八朔ジュース180ml' },
  { source_name: '八朔J720ml', product_name: '八朔ジュース720ml' },
  { source_name: '涼風びわ6玉', product_name: '涼風びわ6玉パック' },
  { source_name: '涼風びわ6玉入', product_name: '涼風びわ6玉パック' },
  { source_name: '涼風びわ8玉入', product_name: '涼風びわ8玉パック' },
  { source_name: '清見', product_name: '清見オレンジ' },
  { source_name: '清見J180ml', product_name: '清見オレンジジュース180ml' },
  { source_name: '清見J720ml', product_name: '清見オレンジジュース720ml' },
  { source_name: '善兵衛ジュースお試しセット', product_name: '柑橘ジュースお試しセット' },
  { source_name: 'みかんの皮', product_name: 'みかんの皮（冷凍）' },
  { source_name: 'コブミカンの葉', product_name: 'コブミカンの葉（葉のみ無選別）' },
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

  console.log(`[seed-legacy-product-mappings] ${rows.length}件を登録しました`)
  for (const r of rows) {
    console.log(`  ${r.source_name} -> ${MAPPINGS.find((m) => m.source_name === r.source_name)!.product_name}`)
  }
}

main().catch((err) => {
  console.error('[seed-legacy-product-mappings] エラー:', err)
  process.exit(1)
})
