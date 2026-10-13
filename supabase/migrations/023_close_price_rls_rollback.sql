-- 023_close_price_rls_rollback.sql
-- 023_close_price_rls.sql を元に戻す（緊急時のみ）。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
--
-- 023 の手順0で保存したバックアップ（_backup_20261013_price_policies / _backup_20261013_price_rls）
-- から、実行前のポリシー定義とRLSの有効/無効をそのまま復元する。
-- 新コード（サーバーAPI経由）はRLSの状態に関係なく動くため、戻してもアプリ側の変更は不要。
-- ※ 戻すと価格・個別単価が再び公開キーで読める状態になる。

BEGIN;

-- 1. 現在のポリシーを全削除（023実行後に手で足したものも含め、バックアップの状態に揃える）
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

-- 2. 実行前のポリシーを復元
DO $$
DECLARE
  r record;
  role_list text;
BEGIN
  FOR r IN SELECT * FROM _backup_20261013_price_policies LOOP
    SELECT string_agg(CASE WHEN x = 'public' THEN 'public' ELSE quote_ident(x) END, ', ')
      INTO role_list
      FROM unnest(r.roles) AS x;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname,
      r.tablename,
      r.permissive,
      r.cmd,
      role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END
    );
  END LOOP;
END $$;

-- 3. RLSの有効/無効を実行前の状態に戻す
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM _backup_20261013_price_rls LOOP
    IF r.rls_enabled THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    ELSE
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- 確認用（023 の手順0で表示された内容と一致すればOK）
--   SELECT tablename, policyname, cmd, roles, qual FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('product_prices', 'product_pricing_tiers', 'company_overrides')
--   ORDER BY tablename, policyname;
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('product_prices', 'product_pricing_tiers', 'company_overrides');
--
-- 戻した後、バックアップ表が不要なら:
--   DROP TABLE _backup_20261013_price_policies;
--   DROP TABLE _backup_20261013_price_rls;
