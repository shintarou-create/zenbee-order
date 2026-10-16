-- 030 の確認SQL（4本）
-- 注意：Studio は複数のSELECTをまとめて実行すると最後の結果しか表示しない。
--       1本ずつ選択して実行すること。

-- ① 書き込み系の権限が残っていないか　→ 期待：0行
SELECT c.relname AS table_name, r.rolname AS grantee,
       string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type) AS privs
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND r.rolname IN ('anon', 'authenticated')
  AND c.relname NOT LIKE '\_backup%'
  AND a.privilege_type <> 'SELECT'
GROUP BY c.relname, r.rolname
ORDER BY 1, 2;

-- ② 書き込み系のポリシーが残っていないか　→ 期待：cmd が ALL の4行のみ
--    （channels / invoice_adjustments / product_mappings / sales_facts。条件は service_role 限定なので公開キーでは使えない）
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND cmd <> 'SELECT'
ORDER BY tablename, policyname;

-- ③ 読み取りは変わっていないか　→ 期待：0行（バックアップ表以外のすべてのテーブルで anon の SELECT が残っている）
SELECT c.relname AS table_without_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname NOT LIKE '\_backup%'
  AND NOT has_table_privilege('anon', c.oid, 'SELECT');

-- ④ バックアップ表が公開キーから守られているか　→ 期待：0行
SELECT c.relname AS exposed_backup_table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname LIKE '\_backup%'
  AND (has_table_privilege('anon', c.oid, 'SELECT')
    OR has_table_privilege('authenticated', c.oid, 'SELECT'));
