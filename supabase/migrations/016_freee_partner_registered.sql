-- 016_freee_partner_registered.sql
-- 取引先がfreee側に「取引先」として登録済みかどうかのフラグ。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
--
-- false（未登録）: 請求管理画面の「取引先CSV」で freee公式フォーマットの
--   取引先インポートCSVをダウンロードできる対象になる。
-- true（登録済み）: 対象から外れる。CSVインポート等で新規作成される取引先は
--   デフォルトで false になるため、以後は都度この画面で拾える。
--
-- 既存の全社は移行時点でfreeeに登録済みという前提で true に更新する。

ALTER TABLE companies
  ADD COLUMN freee_partner_registered BOOLEAN NOT NULL DEFAULT false;

UPDATE companies SET freee_partner_registered = true;

COMMENT ON COLUMN companies.freee_partner_registered IS
  'true=freeeに取引先として登録済み。false=未登録（取引先インポートCSVのダウンロード対象）。新規作成時はデフォルトfalse。';
