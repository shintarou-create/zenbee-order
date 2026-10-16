-- 031 の確認SQL（3本）
-- 注意：Studio は複数のSELECTをまとめて実行すると最後の結果しか表示しない。1本ずつ選択して実行すること。

-- ① 請求書系4テーブルに、公開向けの SELECT ポリシーが残っていないか　→ 期待：0行
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('invoices','invoice_items','invoice_adjustments','invoice_monthly_export_log')
  AND cmd = 'SELECT'
ORDER BY tablename;

-- ② 残っているポリシー（期待：invoice_adjustments の service_role ALL 1行のみ）
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('invoices','invoice_items','invoice_adjustments','invoice_monthly_export_log')
ORDER BY tablename, policyname;

-- ③ 公開キーで実際に読めなくなったかの最終確認（Studioではなく、公開キーでのHTTP確認で行う）
--    下記はポリシーの状態確認のみ。実アクセス確認は curl で anon キーを使って /rest/v1/invoices?select=id&limit=1 が
--    空配列 [] を返すことを確かめる（別途）。
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('invoices','invoice_items','invoice_adjustments','invoice_monthly_export_log')
ORDER BY 1;
