# RLS 第2段階：取引先・注文・請求書を公開キーから閉じる計画

調査日：2026-10-13（コミット `0b4d23c` 時点）／調査のみ（コード・DBは未変更）

## 0. 前提と、最初に確認すべきこと

### 公開キーで実際に読めるか（2026-10-13 実測・件数のみ）

公開キー（`NEXT_PUBLIC_SUPABASE_ANON_KEY`。ブラウザに配布されている）で各テーブルを1行だけ読んだ結果。

| テーブル | 公開キーで読めるか | 備考 |
|---|---|---|
| companies / line_users / orders / order_items / order_shipping | 読める | 取引先の住所・電話・メール、全注文 |
| invoices / invoice_items | 読める | 全請求書 |
| admin_users | 読める | 管理者のLINEユーザーIDが見える |
| categories / inventory / products | 読める | |
| product_prices / product_pricing_tiers / company_overrides | 読める | **023 は未実行**（実行後は読めなくなる予定） |
| invoice_adjustments / company_memo_logs | 0行（判定不能） | 実データが0件のため、閉じているか不明 |
| freee_export_log / shipping_box_templates | **読めない** | 実データはあるのに0行 → 公開キーの読み取りポリシーなし |
| business_types / sales_facts | 読めない | 想定どおり |

### リポジトリのSQLと実DBが一致していない

- `001_initial_schema.sql` では invoices / invoice_items は「公開キーは読み取りのみ」だが、請求管理画面はブラウザから請求書の**追加・更新**ができている。実DBには、リポジトリにないポリシー（Studio で手で追加したもの等）があるか、RLS自体が無効になっている可能性が高い。
- そのため、**段階1の前に、実DBのポリシーを次のSQLで書き出して確認する**（読み取りのみ・変更なし）。

```sql
-- 全テーブルのRLS有効/無効
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1;

-- 全ポリシー（公開キー＝anon / public ロールに効くもの）
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;
```

この結果で、下の表の「実DBで許可されている操作」を確定させてから段階1に進む。

### 副次的に見つかった不具合（参考）

- 注文詳細（`src/app/admin/orders/[id]/page.tsx:184`）が公開キーで `shipping_box_templates` を読んでいるが、公開キーでは0行しか返らない。送料テンプレートの選択肢が空になっている可能性がある（要確認）。

---

## 1. 公開キー（ブラウザ）から直接読み書きしている箇所の一覧

### 1-1. テーブル別

操作：読＝読み取り / 追＝追加 / 更＝更新 / 削＝削除。「埋め込み」は他テーブルを select で結合して読んでいるもの（結合先のRLSも効くため、閉じると結果が欠ける）。

| テーブル | 操作 | ファイル:行 | 画面 |
|---|---|---|---|
| **orders** | 更 | `src/app/admin/orders/page.tsx:253,260,268,283,302,355` | 受注一覧（印刷済み解除・ステータス戻し・送り状解除・詳細確認済み・完了・出荷済み） |
| | 更 | `src/app/admin/orders/[id]/page.tsx:390,547` | 注文詳細（詳細確認済み・ステータス/備考/社内メモ等の更新） |
| | 更 | `src/app/admin/orders/bulk-print/page.tsx:53` | 一括印刷（納品書印刷済み） |
| | 更 | `src/app/admin/invoices/page.tsx:267` | 請求管理（請求書作成時に注文を完了へ） |
| | 読 | `src/app/admin/page.tsx:105,118,126,147,158,179` | ダッシュボード |
| | 読 | `src/app/admin/orders/page.tsx:187,224` | 受注一覧 |
| | 読 | `src/app/admin/orders/[id]/page.tsx:104,522` | 注文詳細 |
| | 読 | `src/app/admin/orders/[id]/print/page.tsx:21` | 納品書印刷 |
| | 読 | `src/app/admin/orders/bulk-print/page.tsx:34` | 一括印刷 |
| | 読 | `src/app/admin/customers/page.tsx:288` | 顧客管理（注文の有無でステージ判定） |
| | 読 | `src/app/admin/invoices/page.tsx:77` | 請求管理（対象月の注文） |
| | 読 | `src/components/admin/PendingProductsSummary.tsx:48` | 受注一覧（未出荷商品の集計） |
| | 読 | `src/app/orders/page.tsx:47`、`src/app/orders/[id]/page.tsx:40` | **LIFF** 注文履歴・注文詳細 |
| **companies** | 追 | `src/app/admin/customers/page.tsx:530` | 顧客管理（事前登録） |
| | 更 | `src/app/admin/customers/page.tsx:515,610` | 顧客管理（編集・価格ランク変更） |
| | 更 | `src/app/admin/invoices/page.tsx:701` | 請求管理（顧客情報の編集） |
| | 更 | `src/app/admin/orders/[id]/page.tsx:515` | 注文詳細（取引先情報の編集） |
| | 読 | `src/app/admin/page.tsx:137` | ダッシュボード（承認待ち件数） |
| | 読 | `src/app/admin/customers/page.tsx:285` | 顧客管理 |
| | 読 | `src/app/admin/invoices/page.tsx:628` | 請求管理（顧客情報の編集） |
| | 読 | `src/app/admin/orders/new/page.tsx:126` | 注文作成（取引先の選択肢） |
| | 読 | `src/components/admin/PricingTiersModal.tsx:243` | 商品管理（価格段階の専用取引先の選択肢） |
| | 埋め込み | orders から `company:companies`（ダッシュボード・注文詳細・印刷・一括印刷・請求管理・**LIFF注文詳細**）、`src/app/page.tsx:50`（**LIFFトップ**） | |
| **invoices** | 追 | `src/app/admin/invoices/page.tsx:222` | 請求管理（請求書の一括作成・1社だけ作成） |
| | 更 | `src/app/admin/invoices/page.tsx:584,604` | 請求管理（送信ステータス・支払期限） |
| | 読 | `src/app/admin/invoices/page.tsx:187,407,470,538` | 請求管理 |
| | 埋め込み | `src/app/admin/orders/[id]/page.tsx:169`（invoice_items 経由） | 注文詳細（請求済みかの判定） |
| **invoice_items** | 追 | `src/app/admin/invoices/page.tsx:242` | 請求管理（請求書作成） |
| | 読 | `src/app/admin/orders/[id]/page.tsx:169`、invoices 埋め込み | 注文詳細・請求管理 |
| **invoice_adjustments** | 埋め込み読 | `src/app/admin/invoices/page.tsx:407` | 請求管理（調整行の件数） |
| **line_users** | 読 | `src/app/page.tsx:50`、`src/app/orders/page.tsx:33`、`src/app/orders/[id]/page.tsx:29` | **LIFF** トップ・注文履歴・注文詳細 |
| | 埋め込み読 | `src/app/admin/customers/page.tsx:285`、`src/app/admin/page.tsx:137` | 顧客管理・ダッシュボード |
| **order_items** | 読 | `src/components/admin/PendingProductsSummary.tsx:68`、orders 埋め込み多数 | 受注一覧・ダッシュボード・注文詳細・印刷・**LIFF** |
| **order_shipping** | 埋め込み読 | orders 埋め込み（受注一覧・注文詳細・印刷・**LIFF注文詳細**） | |
| **admin_users** | 読 | `src/app/admin/layout.tsx:40` | 管理画面すべて（表示前の管理者チェック） |
| | 読 | `src/app/page.tsx:38` | **LIFF** トップ（管理者なら /admin へ移動） |
| **products** | 読・埋め込み | `src/app/admin/page.tsx:113,170`、`PendingProductsSummary.tsx:80`、orders 埋め込み（印刷・LIFF） | 価格は含まない |
| **categories** | 読 | `PendingProductsSummary.tsx:37` | |
| **shipping_box_templates** | 読 | `src/app/admin/orders/[id]/page.tsx:184` | 公開キーでは0行（上記の副次不具合） |

**削除（delete）をブラウザから行っている箇所は0件**。請求書の削除は既にAPI経由（`/api/admin/invoices/[id]`）。

### 1-2. 画面別の件数

| 画面 | ファイル | 読み取り | 書き込み |
|---|---|---|---|
| 管理画面の管理者チェック | `src/app/admin/layout.tsx` | 1 | 0 |
| ダッシュボード | `src/app/admin/page.tsx` | 9 | 0 |
| 受注一覧 | `src/app/admin/orders/page.tsx`＋`PendingProductsSummary.tsx` | 6 | 6 |
| 注文詳細 | `src/app/admin/orders/[id]/page.tsx` | 4 | 3 |
| 納品書印刷 | `src/app/admin/orders/[id]/print/page.tsx` | 1 | 0 |
| 一括印刷 | `src/app/admin/orders/bulk-print/page.tsx` | 1 | 1 |
| 注文作成 | `src/app/admin/orders/new/page.tsx` | 1 | 0 |
| 顧客管理 | `src/app/admin/customers/page.tsx` | 2 | 3 |
| 請求管理 | `src/app/admin/invoices/page.tsx` | 6 | 6 |
| 商品管理（価格段階モーダル） | `src/components/admin/PricingTiersModal.tsx` | 1 | 0 |
| LIFF トップ | `src/app/page.tsx` | 2 | 0 |
| LIFF 注文履歴 | `src/app/orders/page.tsx` | 2 | 0 |
| LIFF 注文詳細 | `src/app/orders/[id]/page.tsx` | 2 | 0 |
| **合計** | 14ファイル | **38** | **19** |

---

## 2. 優先順位

リポジトリのSQL（`005_restructure_v2.sql`）上、公開キーで**追加・更新・削除まで誰でもできる**のは companies / line_users / orders / order_items / order_shipping の5テーブル。invoices / invoice_items も、実際にブラウザから書けているので同様に扱う。

| 順位 | テーブル・操作 | 起こりうる被害 | 閉じるのに必要なコード変更 |
|---|---|---|---|
| 1 | **line_users の追加・更新・削除** | 自分のLINEを任意の取引先に紐づけ → その取引先として発注・価格閲覧（なりすまし） | **なし**（ブラウザから書いていない） |
| 2 | **全テーブルの削除** | 注文・取引先・請求書の消去 | **なし**（ブラウザから削除していない） |
| 3 | **order_items / order_shipping の追加・更新** | 注文明細・送料の改ざん → 請求額の改ざん | **なし** |
| 4 | **orders・companies・invoices の追加**（ブラウザ不使用分） | 架空の注文・取引先 | orders の追加はなし。companies・invoices の追加は段階2 |
| 5 | **admin_users の書き込み**（実DBで許可されていれば） | 自分を管理者に追加 → 管理APIを全部使える | なし（ブラウザから書いていない）。**段階0の確認で許可があれば最優先** |
| 6 | orders / companies / invoices / invoice_items の更新 | ステータス・請求先・メール・請求額の改ざん | 段階2（19か所をAPIへ） |
| 7 | invoices / invoice_items / invoice_adjustments / admin_users / company_memo_logs の読み取り | 請求額・管理者IDの漏えい | 段階3（管理画面の読み取りをAPIへ） |
| 8 | companies / orders / order_items / order_shipping / line_users の読み取り | 取引先の住所・電話・注文履歴の漏えい | 段階3＋段階4（管理画面とLIFFの両方） |
| 9 | products / categories / inventory の読み取り | 商品名・在庫数（機微度は低い） | 印刷・LIFF等の埋め込みをすべて置き換えた後（任意） |

---

## 3. 段階案

各段階のSQLは 023 と同じ作りにする：
1. 実行前のポリシー定義とRLSの状態をバックアップ表に保存する
2. 対象のポリシーだけを削除する
3. 戻すSQLで、バックアップ表から元どおりに復元する

コード側の変更（APIへの置き換え）はRLSの状態に関係なく動くので、**戻すときはSQLだけでよい**。

### 段階1：ブラウザが使っていない書き込み権限を外す（SQLのみ・0.5日）

| 閉じるもの | 残すもの |
|---|---|
| line_users・order_items・order_shipping の追加・更新・削除 | 読み取りはすべて残す |
| orders の追加・削除 | orders の更新 |
| companies の削除 | companies の追加・更新 |
| invoices・invoice_items・invoice_adjustments の削除（実DBにあれば） | invoices の追加・更新、invoice_items の追加 |
| admin_users・categories・inventory・products への書き込み（実DBにあれば） | |

- 書き換えが必要な画面：**なし**（サーバーAPIは service role で接続しておりRLSの影響を受けない）
- 戻し方：`026_rls_phase2_stage1_rollback.sql`（仮）でバックアップ表から復元

### 段階2：ブラウザからの書き込み19か所をAPIへ移し、残りの書き込み権限を外す（3〜4日）

| 閉じるもの | 書き換えが必要な画面 |
|---|---|
| orders の更新、companies の追加・更新、invoices の追加・更新、invoice_items の追加 | 受注一覧（6）、注文詳細（3）、一括印刷（1）、顧客管理（3）、請求管理（6） |

- 最も重いのは請求管理の**請求書作成**（`createInvoiceForCompany`：連番の採番→請求書追加→明細追加→注文を完了へ）。今はブラウザで順番に実行しており途中で失敗すると中途半端な状態が残るため、サーバーAPIに移して1か所で処理する（1.5日程度）。
- 受注一覧・注文詳細の注文更新は、既存の `/api/admin/orders/[id]` 系に操作を追加する形で寄せられる。
- 戻し方：SQLのみ（書き込みポリシーを復元）。APIへの置き換えはそのままでよい。

### 段階3：管理画面の読み取りをAPIへ移し、請求書・管理者まわりの読み取りを閉じる（4〜5日）

| 閉じるもの | 書き換えが必要な画面 |
|---|---|
| invoices / invoice_items / invoice_adjustments / company_memo_logs / admin_users の読み取り | 管理者チェック（layout）、ダッシュボード、受注一覧、注文詳細、納品書印刷、一括印刷、注文作成、顧客管理、請求管理、商品管理（価格段階モーダル）、**LIFFトップの管理者判定** |

- companies / orders などはLIFFでも読んでいるため、**この段階ではまだ閉じない**（段階4で閉じる）。ただし管理画面側の読み取りはこの段階ですべてAPIに移しておく。
- ダッシュボードは9本の読み取りを1本のAPIにまとめる（後述のレート制限対策）。
- 戻し方：SQLのみ。

### 段階4：LIFF画面の読み取りをAPIへ移し、取引先・注文の読み取りを閉じる（2〜3日）

| 閉じるもの | 書き換えが必要な画面 |
|---|---|
| companies / line_users / orders / order_items / order_shipping の読み取り | LIFFトップ（取引先状態の判定）、LIFF注文履歴、LIFF注文詳細 |

- LIFF用に `/api/me`（自分の取引先・承認状態・業態）、`/api/my-orders`、`/api/my-orders/[id]` を作る。LINEアクセストークンで本人を特定し、**自社の注文だけ**を返す（`/api/products` と同じ方式）。
- 既存の `/api/onboarding/status` を `/api/me` に拡張して使い回せる。
- 戻し方：SQLのみ。

### 段階5（任意）：products / categories / inventory の読み取りを閉じる（1日）

- 印刷・LIFF・ダッシュボードの products 埋め込みが段階3・4でAPI経由になっていれば、SQLのみで閉じられる。
- 優先度は低い（価格は既に別テーブルで閉じている）。

### 合計の目安

| 段階 | 日数 | コード変更 |
|---|---|---|
| 0 実DBポリシーの確認 | 15分 | なし |
| 1 未使用の書き込み権限を外す | 0.5日 | なし |
| 2 書き込みをAPIへ | 3〜4日 | 5画面 |
| 3 管理画面の読み取りをAPIへ | 4〜5日 | 10画面＋LIFFトップの管理者判定 |
| 4 LIFFの読み取りをAPIへ | 2〜3日 | 3画面 |
| 5 商品系（任意） | 1日 | なし〜少量 |

---

## 4. 各段階を閉じたあとの実機確認手順

共通：本番の管理画面（LINEから開く）と、テスト用取引先のLINEで確認する。あわせて、公開キーでの直接アクセスが拒否されることを、確認用スクリプト（curl で公開キーを使い、更新は存在しないIDに対して行う）で確かめる。

### 段階1のあと
| 画面 | 確認すること |
|---|---|
| LIFF | 発注できる・注文履歴と注文詳細が見える・新規申込ができる |
| 受注一覧 | 一覧表示、ステータス変更（出荷済み・完了）、詳細確認済み |
| 注文詳細 | 表示、ステータス・備考の更新、明細の編集（API経由） |
| 顧客管理 | 一覧、編集、事前登録、承認 |
| 請求管理 | 請求書の一括作成、1社だけ作成、送信ステータス変更、削除 |
| 公開キー | line_users・order_items・order_shipping への追加・更新、全テーブルの削除が拒否される |

### 段階2のあと
| 画面 | 確認すること |
|---|---|
| 受注一覧 | 6種類の一括操作（印刷済み解除・ステータス戻し・送り状解除・詳細確認済み・完了・出荷済み） |
| 注文詳細 | 詳細確認済みの切り替え、ステータス・備考・社内メモの保存、取引先情報の編集 |
| 一括印刷 | 印刷後に「納品書印刷済み」が付く |
| 顧客管理 | 編集・事前登録（業態の設定と履歴も）・価格ランク変更 |
| 請求管理 | 請求書作成（連番が飛ばない・明細と注文の完了が揃う）、送信ステータス、支払期限、顧客情報の編集 |
| 公開キー | orders・companies・invoices・invoice_items への追加・更新が拒否される |

### 段階3のあと
| 画面 | 確認すること |
|---|---|
| 全管理画面 | 管理者は開ける・管理者でないLINEでは「権限がない」表示になる |
| ダッシュボード | 件数・承認待ち・直近の注文・freeeバナー |
| 受注一覧・未出荷集計 | 一覧・検索・ページ送り・集計 |
| 注文詳細・印刷・一括印刷 | 表示・印刷レイアウト（新しいタブで開いても表示される） |
| 注文作成 | 取引先の選択肢・取引メモ |
| 顧客管理 | 一覧・LINE連携状況・ステージ表示 |
| 請求管理 | 一覧・グループ表示・調整行の件数・未請求の警告 |
| 商品管理 | 価格段階モーダルの専用取引先の選択肢 |
| LIFFトップ | 管理者のLINEで開くと管理画面へ移動する |
| 公開キー | invoices・invoice_items・admin_users が0行になる |

### 段階4のあと
| 画面 | 確認すること |
|---|---|
| LIFFトップ | 申込前・承認待ち・利用中・却下・停止の各状態で正しい画面になる |
| LIFF注文履歴 | 自社の注文だけが出る |
| LIFF注文詳細 | 自社の注文は見える／他社の注文IDを直接開くと見えない |
| 管理画面全体 | 段階3の確認を再度（埋め込みの取引先名・明細が欠けていないか） |
| 公開キー | companies・orders・order_items・order_shipping・line_users が0行になる |

---

## 5. 管理画面の認証は、サーバーAPI経由に切り替えたあとも効くか

**効く。むしろ切り替えて初めて実効性が出る。**

- `src/middleware.ts` は `/api/admin/*`（と `/api/shipping-csv` 等）に対し、LINEアクセストークンをLINEのプロフィールAPIで検証し、`admin_users` を service role で照合している。新しく作る `/api/admin/*` は自動でこの保護を受ける。
- 現状の管理画面の管理者チェック（`src/app/admin/layout.tsx`）は**画面表示を止めているだけ**で、データは公開キーで誰でも直接読めるため、実質的な保護になっていない。

### 注意点と対策

| 注意点 | 対策 |
|---|---|
| `admin_users` を管理画面（layout）とLIFFトップが公開キーで読んでいる | 段階3で `/api/admin/me`（middleware 保護下で role を返す）に置き換えてから閉じる。LIFFトップの管理者判定は `/api/me` の結果に含める |
| middleware のレート制限が **IPあたり1分60回**（メモリ上・インスタンスごと） | ダッシュボード（9本）・請求管理（6本）などを個別APIに分けると上限に近づく。画面ごとに1〜2本のAPIにまとめる。事務所の同一IPから複数人が使う場合は上限の見直しも検討 |
| APIを呼ぶたびにLINEのプロフィールAPIへの問い合わせが発生（100〜300ms程度） | 上と同じく、画面あたりのAPI本数を減らす。必要なら検証結果を短時間キャッシュする |
| 新しいタブで開く印刷画面（納品書印刷・一括印刷） | `adminFetch` は各ページでLIFFを初期化してトークンを取る。請求書印刷（`/admin/invoices/print`）は既にこの方式で動いているので同じ形にする。LINEアプリ外のブラウザで開くとLINEログインに飛ぶ点は現状と同じ |
| 開発環境（`NODE_ENV=development`）では middleware と `verifyAdmin` が認証を省略 | 本番・プレビューは production なので影響なし。ローカル確認時は認証なしで動く点に注意 |
| middleware に `DEBUG: remove after diagnosis` のログが残っている | 段階3のついでに削除してよい |
| `/api/admin/*` の各ルートは middleware 任せで、ルート内で再検証していないものが多い | matcher から外れない限り問題ない。matcher を変更するときは要注意 |

---

## 6. LINE（LIFF）側の画面への影響

| LIFF画面 | 現在の読み取り | 影響を受ける段階 | 対応 |
|---|---|---|---|
| トップ（`src/app/page.tsx`） | admin_users、line_users＋companies | 段階3（admin_users）、段階4（line_users・companies） | `/api/me` に置き換え |
| 発注（商品一覧） | `/api/products`（サーバーAPI） | 影響なし | 対応済み |
| カート・注文送信 | `/api/orders`（サーバーAPI） | 影響なし | ― |
| 注文履歴（`src/app/orders/page.tsx`） | line_users、orders＋order_items＋products | 段階4 | `/api/my-orders` |
| 注文詳細（`src/app/orders/[id]/page.tsx`） | line_users、orders＋companies＋order_items＋products＋order_shipping | 段階4 | `/api/my-orders/[id]` |
| 申込・登録コード | `/api/onboarding/*`（サーバーAPI） | 影響なし | ― |

- 段階1・2では LIFF は影響を受けない（LIFFはブラウザから書き込んでいない）。
- 現状、LIFFの注文履歴は「自分のLINEユーザーID」で絞って読んでいるだけなので、公開キーを使えば**他社の注文履歴も読める**。段階4でサーバー側が本人確認をして自社分だけを返すようになる。

---

## 最初の段階の提案：段階1（コード変更なし・SQLのみ）

**内容**：段階0のSQLで実DBのポリシーを確認したうえで、ブラウザが一度も使っていない書き込み権限だけを外す。

- line_users・order_items・order_shipping の追加・更新・削除
- orders の追加・削除
- companies・invoices・invoice_items・invoice_adjustments の削除
- admin_users・categories・inventory・products への書き込み（実DBにあれば）

**この段階を最初にする理由**
- アプリのコードを1行も変えずに、優先順位の1〜3位（LINEの紐づけ乗っ取り・データ削除・明細の改ざん）を塞げる。
- ブラウザがこれらの操作を使っていないことはコード上で確認済み。画面が壊れる心配が小さく、壊れてもSQLで即座に戻せる。
- 段階0の結果に admin_users への書き込み許可があれば、それも同時に塞げる。

**手順の案**
1. 段階0のSQLを実行し、結果を共有してもらう
2. その結果に合わせて、段階1のSQLと戻すSQLを作る（023と同じバックアップ方式）
3. 実行 → 上の「段階1のあと」の確認
