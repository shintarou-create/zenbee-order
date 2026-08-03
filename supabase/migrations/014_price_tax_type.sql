-- 014_price_tax_type.sql
-- 会社単位の「単価の税区分」フラグ。信太郎が手動でSupabase Studioに実行する
-- （このファイルはアプリからは実行しない・記録用）。
--
-- inclusive（デフォルト・従来通り）: order_items.unit_price は税込で登録される。
-- exclusive: 単価は税抜（本体価格）で登録されており、注文明細作成時に
--            toInclusiveUnitPrice()（src/lib/tax-conversion.ts）で税込金額へ
--            変換してから order_items.unit_price に保存する。

ALTER TABLE companies
  ADD COLUMN price_tax_type TEXT NOT NULL DEFAULT 'inclusive'
  CHECK (price_tax_type IN ('inclusive', 'exclusive'));

COMMENT ON COLUMN companies.price_tax_type IS
  'inclusive=単価は税込（従来通り、デフォルト）。exclusive=単価は税抜（本体価格）で登録されており、注文明細作成時に税込金額へ変換する。';
