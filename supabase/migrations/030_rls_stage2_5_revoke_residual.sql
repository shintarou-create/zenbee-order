-- 030（修正版）: RLS 段階2.5 — 公開キー（anon / authenticated）に残っている書き込み系の権限と、使われていない書き込みポリシーを取り除く
--
-- 初版からの修正点：
--   ・PostgreSQL 17 の新しい権限 MAINTAIN を取り消し忘れていた → 「ALL を取り消して SELECT だけ付け直す」方式に変更
--   ・実行の最後に自己チェックを追加（SELECT 以外の権限が1つでも残っていたら、全体を取り消して中止する）
--   ・初版で作ったバックアップ表（_backup_20261014_stage25_*）は、戻した後の状態と同じ内容なので、作り直す
--
-- やること：
--   0. 実行前の権限とポリシーをバックアップ表に保存
--   1. 使われていない書き込みポリシー6件を削除
--   2. anon・authenticated から全権限を取り消し、SELECT（読み取り）だけを付け直す（全テーブル）
--   3. バックアップ表（_backup_*）は、公開キーからの権限をすべて取り消す
--   4. 自己チェック（残っていれば中止）
--
-- やらないこと：読み取り（SELECT）の権限とポリシーは変えない（段階3・4で閉じる）。
-- service_role（サーバーAPI）は影響を受けない。
--
-- 実行方法：Supabase Studio の SQL Editor に全文を貼って1回だけ実行する。
--   途中で失敗すると BEGIN〜COMMIT 全体が取り消され、DBは実行前のまま。
-- 戻し方：030_rls_stage2_5_revoke_residual_rollback.sql

BEGIN;

-- ============================================================
-- 0. バックアップ（初版の表があれば作り直す。DBの状態は初版実行前と同じ）
-- ============================================================
DROP TABLE IF EXISTS public._backup_20261014_stage25_grants;
DROP TABLE IF EXISTS public._backup_20261014_stage25_policies;

-- 0-1. 実行前の権限（anon・authenticated のテーブル権限をすべて保存。MAINTAIN も含む）
CREATE TABLE public._backup_20261014_stage25_grants AS
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       r.rolname AS grantee,
       a.privilege_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND r.rolname IN ('anon', 'authenticated');

-- 0-2. 削除するポリシー6件の定義
CREATE TABLE public._backup_20261014_stage25_policies AS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (tablename, policyname) IN (
    ('companies',     'companies_insert'),
    ('companies',     'companies_update'),
    ('orders',        'orders_update'),
    ('invoices',      'stage1_invoices_insert'),
    ('invoices',      'stage1_invoices_update'),
    ('invoice_items', 'stage1_invoice_items_insert')
  );

-- 0-3. バックアップが想定どおりか確認（違えばここで全体を取り消す）
DO $$
BEGIN
  IF (SELECT count(*) FROM public._backup_20261014_stage25_policies) <> 6 THEN
    RAISE EXCEPTION 'ポリシーのバックアップが6件ではありません。実DBの状態が想定と違うため中止します';
  END IF;
  IF (SELECT count(*) FROM public._backup_20261014_stage25_grants) = 0 THEN
    RAISE EXCEPTION '権限のバックアップが0件です。中止します';
  END IF;
END $$;

-- 0-4. バックアップ表自体を公開キーから守る
ALTER TABLE public._backup_20261014_stage25_grants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_20261014_stage25_policies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 1. 使われていない書き込みポリシー6件を削除
-- ============================================================
DROP POLICY companies_insert             ON public.companies;
DROP POLICY companies_update             ON public.companies;
DROP POLICY orders_update                ON public.orders;
DROP POLICY stage1_invoices_insert       ON public.invoices;
DROP POLICY stage1_invoices_update       ON public.invoices;
DROP POLICY stage1_invoice_items_insert  ON public.invoice_items;

-- ============================================================
-- 2. 全テーブルで、anon・authenticated の権限を取り消し、SELECT だけ付け直す
--    （同じトランザクション内なので、読み取りが途切れることはない）
-- ============================================================
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname NOT LIKE '\_backup%'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.relname);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', t.relname);
  END LOOP;
END $$;

-- ============================================================
-- 3. バックアップ表は、公開キーから読み書きとも不可にする
-- ============================================================
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname LIKE '\_backup%'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.relname);
  END LOOP;
END $$;

-- ============================================================
-- 4. 自己チェック（1つでも想定と違えば、全体を取り消して中止する）
-- ============================================================
DO $$
DECLARE
  n_write   integer;
  n_nosel   integer;
  n_backup  integer;
  n_policy  integer;
BEGIN
  -- 4-1. バックアップ表以外：SELECT 以外の権限が残っていないこと
  SELECT count(*) INTO n_write
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
  JOIN pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND r.rolname IN ('anon', 'authenticated')
    AND c.relname NOT LIKE '\_backup%'
    AND a.privilege_type <> 'SELECT';
  IF n_write <> 0 THEN
    RAISE EXCEPTION 'SELECT 以外の権限が % 件残っています。中止します', n_write;
  END IF;

  -- 4-2. バックアップ表以外：anon の SELECT が残っていること（画面の読み取りが止まらない）
  SELECT count(*) INTO n_nosel
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND c.relname NOT LIKE '\_backup%'
    AND NOT has_table_privilege('anon', c.oid, 'SELECT');
  IF n_nosel <> 0 THEN
    RAISE EXCEPTION 'anon の SELECT が外れたテーブルが % 件あります。中止します', n_nosel;
  END IF;

  -- 4-3. バックアップ表：公開キーの権限が一切ないこと
  SELECT count(*) INTO n_backup
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
  JOIN pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND r.rolname IN ('anon', 'authenticated')
    AND c.relname LIKE '\_backup%';
  IF n_backup <> 0 THEN
    RAISE EXCEPTION 'バックアップ表に公開キーの権限が % 件残っています。中止します', n_backup;
  END IF;

  -- 4-4. 書き込みポリシーが残っていないこと（service_role 限定の ALL は対象外）
  SELECT count(*) INTO n_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  IF n_policy <> 0 THEN
    RAISE EXCEPTION '書き込みポリシーが % 件残っています。中止します', n_policy;
  END IF;
END $$;

COMMIT;
