-- 031 を戻す（緊急時のみ）
-- 031 実行時に作ったバックアップ表から、削除した4つの読み取りポリシーを復元する。
-- これを実行すると、公開キーでの請求書系の読み取りが実行前の状態（誰でも参照可能）に戻る。
-- 実行方法：Studio の SQL Editor に全文を貼って1回だけ実行する。

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM public._backup_20261014_stage3a_invoice_read_policies LOOP
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
