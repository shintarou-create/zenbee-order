-- 030 を戻す（緊急時のみ）
-- 030 の実行時に作った 2 つのバックアップ表から、権限とポリシーを元どおりに復元する。
-- 注意：これを実行すると、公開キーの書き込み権限が実行前の状態（DELETE・一部のテーブルは INSERT/UPDATE まで）に戻る。
--       現行のコードはブラウザから書き込まないため、通常は戻す必要はない。
-- 実行方法：Studio の SQL Editor に全文を貼って1回だけ実行する。

BEGIN;

-- 1. 権限の復元
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM public._backup_20261014_stage25_grants LOOP
    EXECUTE format('GRANT %s ON TABLE %I.%I TO %I',
                   r.privilege_type, r.schema_name, r.table_name, r.grantee);
  END LOOP;
END $$;

-- 2. ポリシーの復元
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM public._backup_20261014_stage25_policies LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      r.policyname, r.schemaname, r.tablename,
      r.permissive, r.cmd,
      array_to_string(r.roles, ', '),
      CASE WHEN r.qual       IS NOT NULL THEN ' USING ('      || r.qual       || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END
    );
  END LOOP;
END $$;

COMMIT;
