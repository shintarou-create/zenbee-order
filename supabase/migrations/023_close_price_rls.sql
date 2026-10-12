-- 023_close_price_rls.sql
-- 価格系テーブルを公開キー（anon）から読めないようにする。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
--
-- 対象: product_prices（ランク別価格）/ product_pricing_tiers（段階価格・取引先専用tier）/
--       company_overrides（取引先別の個別単価）
--
-- 【実行順序（重要）】
--   1. このファイルの変更を含むアプリを先にデプロイする
--      （LIFF発注画面・管理画面の商品取得がサーバーAPI経由に切り替わっていること）
--   2. デプロイ後にこのSQLを実行する
--   先に実行すると、旧コードのLIFF発注画面・管理画面で価格が0円／空になる。
--
-- サーバー側（API Route）は service role で接続しており RLS を経由しないため、
-- ポリシーをすべて削除しても注文API・管理APIの動作は変わらない。

BEGIN;

ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_overrides ENABLE ROW LEVEL SECURITY;

-- 既存ポリシー（「価格は誰でも参照可能」など）を名前に依存せず全削除する。
-- ポリシーが1つも無い＋RLS有効 = anon / authenticated からは一切読み書きできない。
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

-- 確認用（0行になればOK）:
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('product_prices', 'product_pricing_tiers', 'company_overrides');
--
-- 戻し方（緊急時のみ。読み取りだけ元に戻す）:
--   CREATE POLICY "price_select_rollback" ON product_prices FOR SELECT USING (true);
--   CREATE POLICY "tier_select_rollback" ON product_pricing_tiers FOR SELECT USING (true);
--   CREATE POLICY "override_select_rollback" ON company_overrides FOR SELECT USING (true);
