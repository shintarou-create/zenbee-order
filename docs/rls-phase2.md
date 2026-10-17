# RLS 第2段階：取引先・注文・請求書を公開キーから閉じる計画

調査日：2026-10-13（コミット `0b4d23c` 時点）／調査のみ（コード・DBは未変更）

> **⚠ 開発時のルール（2026-10-14・段階2完了時点）**
> - **ブラウザ（公開キー）からテーブルへは書き込めない。** companies は 028、orders・invoices・invoice_items は 029 で
>   公開キーの書き込み権限を外した（読み取りのみ）。`createClient()`（`src/lib/supabase/client`）で `.insert()` / `.update()` /
>   `.upsert()` / `.delete()` を書くと `permission denied`（42501）で失敗する。
> - **管理画面からの保存は、必ず各管理API（`/api/admin/*`・service role・`verifyAdmin`）を通す。**
> - **新しい列を保存したいときは、GRANT を足すのではなく、各管理APIの「受け付ける列」の一覧に追加する**
>   （一覧は下の「段階2：完了」の表を参照）。一覧にない列は、APIが 400 で断る。
> - 以前の「orders・invoices に新しい列を書き込むときは GRANT を追加する」というルール（段階1.5）は、029 で不要になった。
> - **段階2.5（030・2026-10-14 実行済み）以降、public の全テーブルで anon・authenticated に残っている権限は SELECT だけ。**
>   新しいテーブルを作ると、Supabase の既定で anon・authenticated にすべての権限が付くので、作ったら必ず
>   `REVOKE ALL ... FROM anon, authenticated` →（公開キーで読む必要がある場合のみ）`GRANT SELECT` をする（下の「教訓」②）。
> - **請求書系（invoices・invoice_items・invoice_adjustments・invoice_monthly_export_log）は、ブラウザから読まない**（段階3a）。
>   画面からは `src/lib/invoice-api.ts` の管理API経由で取得する。031 実行済みのため、公開キーで読むと0行になる。
> - **admin_users は、ブラウザから読まない**（段階3b）。管理者かどうか・自分の名前は `GET /api/admin/me` で取得する
>   （LIFFアクセストークンをサーバーでLINEに照会して本人を特定し、本人の name・role だけを返す）。

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

### 段階1.5：列単位の権限（`027_rls_stage1_5_column_grants.sql`・実行済み → 028・029 で役目を終えた）

> **現在は使っていない（記録として残す）。** 027 で絞った列単位の書き込み権限は、028（companies）と 029（orders・invoices・invoice_items）で
> テーブルの書き込み権限ごと取り消した。下の表とルールは、027〜029 の間の暫定的な状態の記録。

段階1の後も公開キーで追加・更新できる companies / orders / invoices について、**書き込める列を、管理画面のブラウザが実際に書き込んでいる列だけに絞った**（PostgreSQL の列単位の GRANT）。RLSのポリシーは変えていない。

| テーブル | 公開キーで書き込める列 | 書き込めなくなった主な列 |
|---|---|---|
| ~~companies（追加・更新）~~ **028 で廃止** | （027 時点：company_name ほか25列。028 で列単位の権限ごと取り消し、現在は公開キーで書き込み不可） | すべての列（承認状態・業態・freee登録・登録コードを含む） |
| ~~orders（更新）~~ **029 で廃止** | （027 時点：status, delivery_note_printed, shipping_label_printed, details_confirmed, notes, notes_replied_at, admin_notes, delivery_date, delivery_time_slot。029 で取り消し、現在は公開キーで書き込み不可） | すべての列 |
| ~~invoices（更新）~~ **029 で廃止** | （027 時点：status, paid_at, due_date。029 で取り消し、追加も不可） | すべての列 |

あわせて3テーブルの TRUNCATE も公開キーから外した。invoices の追加（請求書作成）は段階1で許可した INSERT のまま（列は絞っていない）。

**2026-10-14 追記（028・実行済み）**：取引先の追加・更新4か所（顧客管理の事前登録・編集・価格ランク、請求管理の顧客情報、注文詳細の取引先情報）を管理API経由に移した（コミット `30067f5`）うえで、`028_revoke_companies_write_from_anon.sql` で companies の INSERT・UPDATE を anon・authenticated から取り消した。companies については列単位の GRANT のルールは不要になり、管理APIの許可リスト（`src/lib/company-profile.ts`）が保存できる列の唯一の定義になった。

#### 027〜029 の間だけ有効だったルール（現在は不要）

- 027 実行後〜029 実行前は、「管理画面のブラウザから orders・invoices に新しい列を書き込む変更をするときは、その列の GRANT を追加しないと保存が失敗する」というルールがあった。
- 029 でブラウザ（公開キー）からの書き込み権限そのものを外したため、**このルールは不要になった。GRANT は追加しない。** 新しい列を保存したいときは、「段階2：完了」の表にある各管理APIの「受け付ける列」の一覧に追加する。

### 段階2：ブラウザからの書き込み19か所をAPIへ移し、残りの書き込み権限を外す（**完了：2026-10-14**）

> **完了（2026-10-14）**：ブラウザからの書き込み19か所をすべて管理API経由に移し、公開キーの書き込み権限を外した。
> コード上のブラウザ（公開キー）からの書き込みは **0件**。
>
> | 対象 | API化のコミット | 権限を外したSQL |
> |---|---|---|
> | companies の追加1・更新4 | `30067f5` | `028_revoke_companies_write_from_anon.sql`（実行済み） |
> | orders の更新9（請求書作成以外） | `2ea6d11` | `029_revoke_orders_invoices_write_from_anon.sql`（実行済み） |
> | 請求書作成（invoices 追加・invoice_items 追加・orders 完了）、invoices の更新2 | `5c5727b` | 同上 |

#### 管理APIと「受け付ける列」の一覧（新しい列を保存したいときはここに追加する）

| テーブル | 管理API | 受け付ける列の定義（追加する場所） | 画面側の呼び出し |
|---|---|---|---|
| companies | `POST /api/admin/companies`（事前登録）、`PATCH /api/admin/companies/[id]` の `{ profile }`（編集） | `src/lib/company-profile.ts` の `COMPANY_PROFILE_FIELDS` と `validateCompanyProfile` | `src/lib/company-api.ts` |
| companies（承認・業態） | `PATCH /api/admin/companies/[id]` の `approval_status`・`business_type_id`（業態変更は履歴を記録） | 同ファイルの専用処理（`profile` とは同時に受け付けない） | 顧客管理の承認・編集画面 |
| orders | `PATCH /api/admin/orders/[id]`（1件）、`PATCH /api/admin/orders/bulk-update`（複数件） | `src/lib/order-update.ts` の `ORDER_UPDATE_FIELDS` と `validateOrderUpdate` | `src/lib/order-api.ts` |
| invoices（更新） | `PATCH /api/admin/invoices/[id]` の `{ fields }` | `src/app/api/admin/invoices/[id]/route.ts` の `INVOICE_UPDATE_FIELDS` と検証 | `src/lib/invoice-api.ts` の `updateInvoice` |
| invoices・invoice_items（作成） | `POST /api/admin/invoices`（1社分の請求書・明細・注文の完了をまとめて作成し、失敗時は取り消す） | `src/app/api/admin/invoices/route.ts`（金額・採番・支払期限はサーバーで計算） | `src/lib/invoice-api.ts` の `createInvoice` |

- 列を追加するときは、「受け付ける列」の一覧に加えて、値の検証（型・選択肢・文字数）も同じファイルに足す。
- 承認状態・業態・金額・請求先のような重要な列は、汎用の更新APIに入れず、専用の処理で扱う（今の設計を崩さない）。
- 明細・送料・支払方法の変更は、従来どおり専用のAPI（`/api/admin/orders/[id]/items`・`/shipping`・`/payment`）。
- 戻し方（緊急時のみ）：`028_*.sql`・`029_*.sql` の末尾にある戻すSQLで、027 の列単位の権限に戻せる。ただし現行コードはブラウザから書き込まないため、通常は不要。

**以下は計画時（2026-10-13）の記載（記録として残す）**

| 閉じるもの | 書き換えが必要な画面 |
|---|---|
| orders の更新、companies の追加・更新、invoices の追加・更新、invoice_items の追加 | 受注一覧（6）、注文詳細（3）、一括印刷（1）、顧客管理（3）、請求管理（6） |

- 最も重いのは請求管理の**請求書作成**（`createInvoiceForCompany`：連番の採番→請求書追加→明細追加→注文を完了へ）。今はブラウザで順番に実行しており途中で失敗すると中途半端な状態が残るため、サーバーAPIに移して1か所で処理する（1.5日程度）。
- 受注一覧・注文詳細の注文更新は、既存の `/api/admin/orders/[id]` 系に操作を追加する形で寄せられる。
- 戻し方：SQLのみ（書き込みポリシーを復元）。APIへの置き換えはそのままでよい。

### 段階2.5：残っていた書き込み系の権限・ポリシーを取り除く（**完了：2026-10-14・本番実行済み**）

`030_rls_stage2_5_revoke_residual.sql`（確認：`_check.sql`、戻し：`_rollback.sql`）

- 段階2で書き込みをすべて管理APIに移した後も、公開キー（anon・authenticated）には DELETE などのテーブル権限と、使われていない書き込みポリシーが残っていた。
- やったこと：
  1. 実行前の権限とポリシーをバックアップ表（`_backup_20261014_stage25_grants`・`_backup_20261014_stage25_policies`）に保存
  2. 使われていない書き込みポリシー6件を削除（companies_insert・companies_update・orders_update・stage1_invoices_insert・stage1_invoices_update・stage1_invoice_items_insert）
  3. public の全テーブル（バックアップ表を除く）で、anon・authenticated の権限を **ALL 取消 → SELECT だけ付け直し**
  4. バックアップ表は公開キーから読み書きとも不可
  5. 自己チェック（SELECT 以外の権限・書き込みポリシーが1つでも残れば全体を取り消して中止）
- 読み取り（SELECT）の権限とポリシーは変えていない（段階3・4で閉じる）。service_role は影響なし。
- 実行後の状態：public の全テーブルで、公開キーに残る権限は SELECT のみ。書き込み系ポリシーは service_role 限定の ALL 4件（channels・invoice_adjustments・product_mappings・sales_facts）だけ。

#### 教訓（段階2.5 で分かったこと）

1. **PostgreSQL 17 の `MAINTAIN` 権限も、公開キーから取り消す対象になる。** 初版は INSERT・UPDATE・DELETE などを個別に取り消したため、PG17 で追加された `MAINTAIN`（VACUUM・ANALYZE・REINDEX などを実行できる権限）が残った。そこで「ALL を取り消してから SELECT だけ付け直す」方式に改めた。今後も権限を絞るときは、個別に列挙せず ALL 取消 → 必要な権限だけ付与、にする。
2. **新しく作った public のテーブルには、既定で anon・authenticated にすべての権限（ALL）が付く**（Supabase の既定の権限設定）。RLS を有効にしてポリシーを作らなければ行は読み書きできないが、テーブル権限としては全部付いている。新しいテーブルを作ったら、同じマイグレーションの中で `REVOKE ALL ON TABLE ... FROM anon, authenticated;` を必ず入れる（公開キーで読ませる必要があるときだけ `GRANT SELECT`）。

### 段階3a：請求書系の読み取りを管理APIへ（**完了：コード `f93d749`・031 本番実行済み**）

| 対象 | 変更 |
|---|---|
| 請求管理の一覧（`src/app/admin/invoices/page.tsx` の `fetchInvoices`） | `GET /api/admin/invoices?billingMonth=YYYY-MM`（`src/lib/invoice-api.ts` の `fetchInvoicesByMonth`）に変更。返す形は従来と同じ |
| 注文詳細の請求済み判定（`src/app/admin/orders/[id]/page.tsx` の `fetchLinkedInvoice`） | `GET /api/admin/invoices/by-order/[orderId]` に変更 |

- これで、ブラウザ（公開キー）から invoices・invoice_items・invoice_adjustments・invoice_monthly_export_log を読む箇所は **0件**。印刷ページ・PDF・調整行・月次PDFは以前から管理API経由。
- 本番での確認（031 の実行前に行う）：
  - 請求管理：一覧・月の切り替え・送付方法のグループ・調整行の件数バッジ・未請求の警告が従来どおり
  - 注文詳細：請求書に載っている注文では「代金引換」が選べず注意文が出る／載っていない注文では選べる
- 本番確認（2026-10-17）：上の項目はすべて ○（調整行バッジのみ、調整行のある請求書が0件のため表示機会なし）。コンソール・ネットワークに 401/403/500 なし。
- **031 は本番実行済み**：`031_rls_stage3a_close_invoice_reads.sql`（確認：`_check.sql`、戻し：`_rollback.sql`）。
  - 削除する読み取りポリシー4件：invoices「請求書は誰でも参照可能」、invoice_items「請求明細は誰でも参照可能」、invoice_adjustments「請求書調整行は誰でも参照可能」、invoice_monthly_export_log「月次PDFログは誰でも参照可能」
  - invoice_adjustments の service_role ALL ポリシーは残す（自己チェックで確認）
  - 実行後、公開キーでこの4テーブルを読むと0行になる（`/rest/v1/invoices?select=id&limit=1` が `[]`）

### 段階3b：admin_users の読み取りを /api/admin/me へ（**コード：実装・デプロイ済み `3844a16`／SQL：033 未作成・未実行**）

| 対象 | 変更 |
|---|---|
| 管理画面の入場判定（`src/app/admin/layout.tsx` の `checkAdmin`） | 公開キーで `admin_users` を `select('*')` していたのを `GET /api/admin/me`（`adminFetch`）に変更。レイアウトは管理画面内の移動では作り直されないため、呼び出しは画面を開いたとき1回 |
| LIFFトップの「管理者なら /admin へ」（`src/app/page.tsx` の `fetchCustomer`） | LIFFアクセストークンを付けて `GET /api/admin/me` を呼び、200 なら /admin へ。**管理者でない取引先では 403 が返るのが正常**（ネットワーク欄に出る）。開発環境では管理APIが常に管理者扱いになるため判定しない |

- `GET /api/admin/me`（`src/app/api/admin/me/route.ts`）：middleware（トークン→LINE `/v2/profile`→service role で admin_users 照合）を通ったうえで、`getAdminIdentity` が同じトークンから本人を特定し直す。クライアントが送る line_user_id は使わない。返すのは `{ name, role }` のみ。管理者でなければ 401（トークンなし・無効）／403（管理者でない）。
- 管理画面の入場判定は、401/403 なら従来どおり「アクセス拒否」。429・5xx・通信失敗は「確認できませんでした（再読み込みしてください）」と出し分ける（管理者が一時的な失敗で締め出されたと誤解しないため）。
- これで、ブラウザ（公開キー）から admin_users を読む箇所は **0件**。残る読み取りは middleware（service role の REST）と `src/lib/admin-auth.ts`（service role）だけで、どちらも読取ポリシーに依存しない。
- あわせて middleware の `DEBUG: remove after diagnosis` ログ2行を削除。
- 本番での確認（033 の実行前に行う）：
  - 管理画面にログインでき、ダッシュボードが開く。サイドバー下に自分の名前が出る
  - 管理者でないアカウント（またはトークンなし）で `/api/admin/me` が 401/403
  - LIFFトップ：管理者は /admin へ移動、取引先は従来どおり商品画面
- **033（admin_users の読取ポリシー「管理者情報は誰でも参照可能」の削除）は未作成・未実行**。上の確認が済んだら実行する。

### 段階3：管理画面の読み取りをAPIへ移し、請求書・管理者まわりの読み取りを閉じる（4〜5日）

> 進捗（2026-10-17）：**段階3a（請求書系）完了（031 実行済み）。段階3b（admin_users）のコードは完了・033 未実行**。残りは company_memo_logs と、管理画面の companies・orders 等の読み取り。

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

| 段階 | 日数 | コード変更 | 状況 |
|---|---|---|---|
| 0 実DBポリシーの確認 | 15分 | なし | 完了 |
| 1 未使用の書き込み権限を外す | 0.5日 | なし | 完了（026） |
| 1.5 列単位の権限（暫定） | ― | なし | 完了（027）→ 028・029 で役目を終えた |
| 2 書き込みをAPIへ | 3〜4日 | 5画面 | **完了（028・029、2026-10-14）** |
| 2.5 残っていた書き込み権限・ポリシーを除去 | ― | なし | **完了（030、2026-10-14）** |
| 3 管理画面の読み取りをAPIへ | 4〜5日 | 10画面＋LIFFトップの管理者判定 | **3a（請求書系）完了**／**3b（admin_users）コード完了・033 未実行**／残りは未着手 |
| 4 LIFFの読み取りをAPIへ | 2〜3日 | 3画面 | 未着手 |
| 5 商品系（任意） | 1日 | なし〜少量 | 未着手 |

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
