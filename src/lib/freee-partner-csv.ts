// freee 取引先インポート CSV 生成（57列）
// freeeの照合キーは「名前（通称）」。請求書CSV（src/lib/freee-csv.ts / src/app/api/freee-csv/route.ts）が
// 取引先名称に company.company_name を使っているため、こちらも必ず同じ値を使うこと
// （billing_name・has_separate_billing は使わない）。

// このヘッダー文字列はfreee公式フォーマットそのまま。カッコの全角/半角混在も含め一字一句変更しないこと。
const CSV_HEADERS = [
  '名前（通称）', '取引先コード', 'ショートカット1', 'ショートカット2', '正式名称（帳票出力時に使用される名称）',
  'カナ名称', '敬称', '事業所種別', '地域', '郵便番号', '都道府県', '市区町村・番地', '建物名・部屋番号など',
  '電話番号', '営業担当者名', '営業担当者メールアドレス', '請求書送付方法', '入力候補',
  '銀行名', '銀行名（カナ）', '銀行番号', '支店名', '支店名（カナ）', '支店番号', '口座種別', '口座番号',
  '受取人名', '受取人名（カナ）',
  '締め日(支払期日設定)', '支払月(支払期日設定)', '支払日(支払期日設定)',
  '締め日(入金期日設定)', '入金月(入金期日設定)', '入金日(入金期日設定)',
  '手数料負担', '振込元口座',
  '適格請求書発行事業者（該当する/該当しない）', '適格請求書発行事業者の登録番号',
  '取引先担当者敬称', '取引先担当者部署',
  '顧客として利用する', '見込顧客として利用する', '請求先として利用する', '入金元として利用する',
  '仕入先として利用する', '支払先として利用する',
  '外税/内税',
  '締め日(請求期日設定)', '請求予定月(請求期日設定)', '請求予定日(請求期日設定)',
  '入金方法', '振込手数料負担区分(請求)', '支払方法',
  '帳票共有ポータル', '従業員として利用する', '販売設定の送付先として利用する', '調達設定の送付先として利用する',
]

const COLUMN_COUNT = 57

// 事業所種別「法人」判定。会社名にこれらの語を含む場合のみ法人、含まない場合は空欄
// （個人事業主とは書かない。freee側の運用に合わせて未確定の分類を断定しない）。
const CORPORATE_KEYWORDS = ['株式会社', '合同会社', '有限会社', '専門学校']

function isCorporate(companyName: string): boolean {
  return CORPORATE_KEYWORDS.some((kw) => companyName.includes(kw))
}

// RFC4180準拠のクォート処理。カンマ・ダブルクォート・改行を含む値のみクォートする。
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function makeRow(companyName: string): string[] {
  const row = new Array(COLUMN_COUNT).fill('')
  row[0] = companyName                              // 名前（通称）
  row[4] = companyName                               // 正式名称（帳票出力時に使用される名称）
  row[6] = '様'                                       // 敬称
  row[7] = isCorporate(companyName) ? '法人' : ''     // 事業所種別
  row[8] = '国内'                                     // 地域
  row[17] = '使用する'                                // 入力候補
  row[40] = '利用する'                                // 顧客として利用する
  row[41] = '利用しない'                              // 見込顧客として利用する
  row[42] = '利用する'                                // 請求先として利用する
  row[43] = '利用する'                                // 入金元として利用する（通帳消し込みに必要）
  row[44] = '利用しない'                              // 仕入先として利用する
  row[45] = '利用しない'                              // 支払先として利用する
  row[46] = '内税'                                    // 外税/内税
  row[53] = '利用しない'                              // 帳票共有ポータル
  row[54] = '利用しない'                              // 従業員として利用する
  row[55] = '利用しない'                              // 販売設定の送付先として利用する
  row[56] = '利用しない'                              // 調達設定の送付先として利用する
  return row
}

export function generateFreeePartnerCSV(companyNames: string[]): string {
  const lines: string[] = []
  lines.push(CSV_HEADERS.map(escapeCSV).join(','))
  for (const name of companyNames) {
    lines.push(makeRow(name).map(escapeCSV).join(','))
  }
  return lines.join('\r\n')
}
