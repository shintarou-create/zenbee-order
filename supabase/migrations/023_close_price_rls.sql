-- 023_close_price_rls.sql
-- 価格系テーブルを公開キー（anon）から読めないようにする。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
--
-- 対象: product_prices（ランク別価格）/ product_pricing_tiers（段階価格・取引先専用tier）/
--       company_overrides（取引先別の個別単価）
--
-- 【実行順序（重要）】
--   024 → 025 → アプリのデプロイ（商品取得がサーバーAPI経由の新コード）→ この 023
--   新コードのデプロイ前に実行すると、旧コードのLIFF発注画面・管理画面で価格が0円／空になる。
--
-- サーバー側（API Route）は service role で接続しており RLS を経由しないため、
-- ポリシーをすべて削除しても注文API・管理APIの動作は変わらない。
--
-- 元に戻す場合は 023_close_price_rls_rollback.sql を実行する（下の手順0で保存した
-- 実行前のポリシー定義・RLS有効/無効の状態をそのまま復元する）。

-- ============================================================
-- 0. 実行前の状態を保存（ロールバック用。BEGIN の外で作り、失敗しても残るようにする）
-- ============================================================
CREATE TABLE _backup_20261013_price_policies AS
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('product_prices', 'product_pricing_tiers', 'company_overrides');

CREATE TABLE _backup_20261013_price_rls AS
SELECT c.relname AS tablename, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('product_prices', 'product_pricing_tiers', 'company_overrides');

-- バックアップ表自体も公開キーから読めないようにする
ALTER TABLE _backup_20261013_price_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE _backup_20261013_price_rls ENABLE ROW LEVEL SECURITY;

-- 保存内容の確認（ポリシー数とRLS状態。ここで表示された内容がロールバック時に復元される）
SELECT * FROM _backup_20261013_price_policies ORDER BY tablename, policyname;
SELECT * FROM _backup_20261013_price_rls ORDER BY tablename;

-- ============================================================
-- 1. RLSを有効にし、既存ポリシーを名前に依存せず全削除する
--    ポリシーが1つも無い＋RLS有効 = anon / authenticated からは一切読み書きできない
-- ============================================================
BEGIN;

ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_overrides ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('product_prices', 'product_pricing_tiers', 'company_overrides')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

COMMIT;

-- ============================================================
-- 確認用
-- ============================================================
-- ポリシーが0行、RLSがすべて true になっていればOK
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('product_prices', 'product_pricing_tiers', 'company_overrides');
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('product_prices', 'product_pricing_tiers', 'company_overrides');
