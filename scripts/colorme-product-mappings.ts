// カラーミー「売上詳細データ」商品名 → products/variety_label/unit の対応表。
// 2026-08-12 フェーズA合意（第5期・第6期に登場する57商品名を全件洗い出し済み）。
//
// 合意事項:
//   - 紅みかん・温州みかんのグレード表記（「善」「恵」「雫」「潤」）は variety_label に残す
//     （指示書A-1の例は品種名のみだが、フェーズC-3のグレード別集計に必須のため）
//   - 涼風びわ・バレンシアオレンジ・紅八朔のサイズ表記（2L/3L/Lサイズ）も同様に variety_label に残す
//   - 温州みかんは products.name に完全一致する商品が無いため product_id は常に null
//   - 玉数・個数もの（A-2）は kg_per_unit=null 固定（サイズで重量が変わるため推測しない）

export type ColormeUnit = '箱' | '個' | '件' | '本'

export type ColormeMapping = {
  source_name: string
  product_name: string | null // products.name。一致する商品が無ければ null（新規追加しない）
  kg_per_unit: number | null
  variety_label: string
  unit: ColormeUnit
}

export const COLORME_MAPPINGS: ColormeMapping[] = [
  // ① kg換算できる規格品（unit='箱'）
  { source_name: '紅みかん「善」2.8kg', product_name: '紅みかん', kg_per_unit: 2.8, variety_label: '紅みかん「善」', unit: '箱' },
  { source_name: '紅みかん「善」５kg', product_name: '紅みかん', kg_per_unit: 5.0, variety_label: '紅みかん「善」', unit: '箱' },
  { source_name: '【年越し用】紅みかん「善」５kg', product_name: '紅みかん', kg_per_unit: 5.0, variety_label: '紅みかん「善」', unit: '箱' },
  { source_name: '紅みかん「恵」５kg', product_name: '紅みかん', kg_per_unit: 5.0, variety_label: '紅みかん「恵」', unit: '箱' },
  { source_name: '紅みかん「恵」2.8kg', product_name: '紅みかん', kg_per_unit: 2.8, variety_label: '紅みかん「恵」', unit: '箱' },
  { source_name: '紅みかん「雫」2.8kg', product_name: '紅みかん', kg_per_unit: 2.8, variety_label: '紅みかん「雫」', unit: '箱' },
  { source_name: '紅みかん「潤」５kg', product_name: '紅みかん', kg_per_unit: 5.0, variety_label: '紅みかん「潤」', unit: '箱' },
  { source_name: '温州みかん「善」５kg', product_name: null, kg_per_unit: 5.0, variety_label: '温州みかん「善」', unit: '箱' },
  { source_name: '温州みかん「善」2.8kg', product_name: null, kg_per_unit: 2.8, variety_label: '温州みかん「善」', unit: '箱' },
  { source_name: '【年越し用】温州みかん「善」5kg', product_name: null, kg_per_unit: 5.0, variety_label: '温州みかん「善」', unit: '箱' },
  { source_name: '【年越し用】温州みかん「善」５kg', product_name: null, kg_per_unit: 5.0, variety_label: '温州みかん「善」', unit: '箱' },
  { source_name: '温州みかん「恵」5kg', product_name: null, kg_per_unit: 5.0, variety_label: '温州みかん「恵」', unit: '箱' },
  { source_name: '温州みかん「恵」2.8kg', product_name: null, kg_per_unit: 2.8, variety_label: '温州みかん「恵」', unit: '箱' },
  { source_name: '【年越し用】温州みかん「恵」5kg', product_name: null, kg_per_unit: 5.0, variety_label: '温州みかん「恵」', unit: '箱' },
  { source_name: '温州みかん「雫」2.8kg', product_name: null, kg_per_unit: 2.8, variety_label: '温州みかん「雫」', unit: '箱' },
  { source_name: 'ゆら早生みかん「善」2.8kg', product_name: 'ゆら早生', kg_per_unit: 2.8, variety_label: 'ゆら早生「善」', unit: '箱' },
  { source_name: 'ゆら早生みかん「善」５kg', product_name: 'ゆら早生', kg_per_unit: 5.0, variety_label: 'ゆら早生「善」', unit: '箱' },
  { source_name: 'ゆら早生みかん「恵」５kg', product_name: 'ゆら早生', kg_per_unit: 5.0, variety_label: 'ゆら早生「恵」', unit: '箱' },
  { source_name: 'ゆら早生みかん「恵」2.8kg', product_name: 'ゆら早生', kg_per_unit: 2.8, variety_label: 'ゆら早生「恵」', unit: '箱' },
  { source_name: 'ゆら早生みかん「雫」2.8kg', product_name: 'ゆら早生', kg_per_unit: 2.8, variety_label: 'ゆら早生「雫」', unit: '箱' },
  { source_name: '清見オレンジ 5kg', product_name: '清見オレンジ', kg_per_unit: 5.0, variety_label: '清見オレンジ', unit: '箱' },
  { source_name: '清見オレンジ 2.8kg', product_name: '清見オレンジ', kg_per_unit: 2.8, variety_label: '清見オレンジ', unit: '箱' },
  { source_name: 'バレンシアオレンジ（約2.5kg）', product_name: 'バレンシアオレンジ', kg_per_unit: 2.5, variety_label: 'バレンシアオレンジ', unit: '箱' },
  { source_name: 'バレンシアオレンジ  ５kg（L・２L混合サイズ）', product_name: 'バレンシアオレンジ', kg_per_unit: 5.0, variety_label: 'バレンシアオレンジ', unit: '箱' },
  { source_name: '【ギフト向け】バレンシアオレンジ（約2kg）', product_name: 'バレンシアオレンジ', kg_per_unit: 2.0, variety_label: 'バレンシアオレンジ', unit: '箱' },
  { source_name: '【ギフト】バレンシアオレンジ（約2kg）', product_name: 'バレンシアオレンジ', kg_per_unit: 2.0, variety_label: 'バレンシアオレンジ', unit: '箱' },
  { source_name: 'バレンシアオレンジ【Lサイズ】15玉入り（約2.4kg）', product_name: 'バレンシアオレンジ', kg_per_unit: 2.4, variety_label: 'バレンシアオレンジ（Lサイズ）', unit: '箱' },

  // ② 玉数・個数もの（unit='個'、kg_per_unit=null固定）
  { source_name: '越冬紅 （８玉入り）', product_name: null, kg_per_unit: null, variety_label: '越冬紅', unit: '個' },
  { source_name: '涼風びわ　１５個入り', product_name: null, kg_per_unit: null, variety_label: '涼風びわ', unit: '個' },
  { source_name: '涼風びわ（３L ）１２個入り', product_name: null, kg_per_unit: null, variety_label: '涼風びわ（3L）', unit: '個' },
  { source_name: '涼風びわ（２L ）１２個入り', product_name: null, kg_per_unit: null, variety_label: '涼風びわ（2L）', unit: '個' },
  { source_name: '紅八朔　18玉入り', product_name: '紅八朔', kg_per_unit: null, variety_label: '紅八朔', unit: '個' },
  { source_name: '紅八朔　8玉入り', product_name: '紅八朔', kg_per_unit: null, variety_label: '紅八朔', unit: '個' },
  { source_name: '紅八朔【Lサイズ】18玉入り', product_name: '紅八朔', kg_per_unit: null, variety_label: '紅八朔（Lサイズ）', unit: '個' },
  { source_name: '紅八朔【Lサイズ】8玉入り', product_name: '紅八朔', kg_per_unit: null, variety_label: '紅八朔（Lサイズ）', unit: '個' },

  // ③ kg換算しないもの（product_id=null固定、variety_label固定値）
  { source_name: '善兵衛農園 定期便', product_name: null, kg_per_unit: null, variety_label: '定期便', unit: '件' },
  { source_name: 'SPECIAL年間セット', product_name: null, kg_per_unit: null, variety_label: 'SPECIALセット', unit: '件' },
  { source_name: '春の柑橘食べ比べセット', product_name: null, kg_per_unit: null, variety_label: '詰め合わせ', unit: '件' },
  { source_name: '八朔＆紅八朔　食べ比べ１８玉入り', product_name: null, kg_per_unit: null, variety_label: '詰め合わせ', unit: '件' },
  { source_name: '八朔＆紅八朔　食べ比べ８玉入り', product_name: null, kg_per_unit: null, variety_label: '詰め合わせ', unit: '件' },
  { source_name: '八朔＆紅八朔【Lサイズ】食べ比べ１８玉入り', product_name: null, kg_per_unit: null, variety_label: '詰め合わせ', unit: '件' },
  { source_name: '八朔＆紅八朔【Lサイズ】食べ比べ８玉入り', product_name: null, kg_per_unit: null, variety_label: '詰め合わせ', unit: '件' },
  { source_name: '八朔皮むき機「ムッキーちゃん」', product_name: null, kg_per_unit: null, variety_label: '雑貨', unit: '個' },
  { source_name: '善兵衛ジュースミニギフト (温州みかん&清見オレンジ&八朔ジュース)', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '柑橘ジュースミニギフト (３種×２本入り)', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '柑橘ジュースミニギフト〈父の日ギフトカード付き〉', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '善兵衛ジュースセット（温州みかん＆清見オレンジ）（お届けの箱：簡易包装）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '八朔ジュース（720ml 2本入り）（お届けの箱：簡易包装）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '木成り八朔ジュース（720ml 2本入り）（お届けの箱：簡易包装）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '温州みかんジュース（720ml 2本入り）（お届けの箱：簡易包装）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '【御中元】柑橘ジュースギフト（熨斗付き）（組み合わせ：各種１本）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '夏のジュースギフトセット（温州みかん＆清見オレンジ＆八朔ジュース）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '善兵衛ジュースセット（温州みかん＆八朔）（お届けの箱：簡易包装）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '柑橘ジュースギフト（3本入り）（組み合わせ：各種１本、熨斗：なし）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: 'えらべる柑橘ジュースセット（２本入り）（１本目：八朔、２本目：八朔）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: 'えらべる柑橘ジュースセット（２本入り）（１本目：清見オレンジ、２本目：温州みかん）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
  { source_name: '清見オレンジジュース（720ml 2本入り）（お届けの箱：簡易包装）', product_name: null, kg_per_unit: null, variety_label: 'ジュース', unit: '本' },
]
