-- 026_rls_phase2_stage1_check.sql
-- 026_rls_phase2_stage1.sql の実行後の確認用（読み取りのみ）。1本ずつ選択して実行する。

-- 確認1：公開キーで「条件 true」で許可されている操作の一覧（テーブル×操作）
-- 想定（段階1の後）:
--   companies      : SELECT, INSERT, UPDATE
--   orders         : SELECT, UPDATE
--   invoices       : SELECT, INSERT, UPDATE
--   invoice_items  : SELECT, INSERT
--   admin_users / line_users / order_items / order_shipping / inventory : SELECT のみ
--   products       : SELECT のみ（stage1_products_select_all を含む）
--   product_prices : SELECT のみ（023 実行済みなら行が出ない）
--   ALL・DELETE はどのテーブルにも出ない
SELECT tablename,
       string_agg(DISTINCT cmd, ', ' ORDER BY cmd) AS open_cmds
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('admin_users', 'line_users', 'companies', 'orders', 'order_items', 'order_shipping',
                    'invoices', 'invoice_items', 'products', 'product_prices', 'inventory')
  AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
GROUP BY tablename
ORDER BY tablename;

-- 確認2：対象テーブルの全ポリシー（詳細）
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('admin_users', 'line_users', 'companies', 'orders', 'order_items', 'order_shipping',
                    'invoices', 'invoice_items', 'products', 'product_prices', 'inventory')
ORDER BY tablename, cmd, policyname;

-- 確認3：段階1で消えた・増えたポリシー（バックアップとの差分）
SELECT 'removed' AS change, b.tablename, b.policyname, b.cmd, b.qual
FROM _backup_rls_stage1_policies b
WHERE NOT EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = 'public' AND p.tablename = b.tablename AND p.policyname = b.policyname)
UNION ALL
SELECT 'added', p.tablename, p.policyname, p.cmd, p.qual
FROM pg_policies p
WHERE p.schemaname = 'public' AND p.policyname LIKE 'stage1\_%'
ORDER BY 1, 2, 3;
