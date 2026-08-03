-- 015_tier_visible_company.sql
-- pricing_tier（セット区切り）を特定の取引先だけに見せる機能。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。

ALTER TABLE product_pricing_tiers
  ADD COLUMN visible_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

COMMENT ON COLUMN product_pricing_tiers.visible_company_id IS
  'NULL=全取引先に表示（デフォルト）。特定companies.idが入っている場合、その会社のLIFF発注画面にのみ表示する専用tier。';
