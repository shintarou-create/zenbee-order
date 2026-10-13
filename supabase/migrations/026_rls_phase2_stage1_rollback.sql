-- 026_rls_phase2_stage1_rollback.sql
-- 026_rls_phase2_stage1.sql を元に戻す（緊急時のみ）。テーブルごとに1ブロックずつ戻せる。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
--
-- 【戻し方】
--   各ブロックは次の2つを行う：
--     1. 段階1で作ったポリシー（名前が stage1_<テーブル>_ で始まるもの）を削除する
--     2. バックアップ表（_backup_rls_stage1_policies）にあって、今は無い書き込み系ポリシー
--        （ALL・INSERT・UPDATE・DELETE）を、元の名前・条件・ロールのまま作り直す
--   SELECT ポリシーは段階1で変更していないため触らない。
--   戻すと、そのテーブルは再び公開キーで書き込み（・削除）できる状態になる。
--
-- 【注意】product_prices（ブロック10）は、023 を実行済みの場合、戻すと ALL ポリシー（読み取りを含む）が
--   復活し、023 で閉じた価格の読み取りまで再び開いてしまう。023 実行済みならブロック10は中止する。

-- ============================================================
-- ブロック1：admin_users を戻す
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'admin_users';
  r record;
  role_list text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;


-- ============================================================
-- ブロック2：line_users を戻す
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'line_users';
  r record;
  role_list text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;


-- ============================================================
-- ブロック3：order_items を戻す
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'order_items';
  r record;
  role_list text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;


-- ============================================================
-- ブロック4：order_shipping を戻す
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'order_shipping';
  r record;
  role_list text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;


-- ============================================================
-- ブロック5：orders を戻す
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'orders';
  r record;
  role_list text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;


-- ============================================================
-- ブロック6：companies を戻す
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'companies';
  r record;
  role_list text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;


-- ============================================================
-- ブロック7：invoices を戻す
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'invoices';
  r record;
  role_list text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;


-- ============================================================
-- ブロック8：invoice_items を戻す
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'invoice_items';
  r record;
  role_list text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;


-- ============================================================
-- ブロック9：products を戻す（stage1_products_select_all も削除される）
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'products';
  r record;
  role_list text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;


-- ============================================================
-- ブロック10：product_prices を戻す（023 実行済みなら中止）
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'product_prices';
  r record;
  role_list text;
BEGIN
  IF to_regclass('public._backup_20261013_price_policies') IS NOT NULL THEN
    RAISE EXCEPTION '023 実行済みのため中止します。戻すと 023 で閉じた価格の読み取りが再び開きます。必要なら先に 023_close_price_rls_rollback.sql を検討してください';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;


-- ============================================================
-- ブロック11：inventory を戻す
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'inventory';
  r record;
  role_list text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません', tbl;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl AND policyname LIKE 'stage1\_' || tbl || '\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, tbl);
    RAISE NOTICE '[%] 削除: %', tbl, r.policyname;
  END LOOP;
  FOR r IN SELECT b.* FROM _backup_rls_stage1_policies b
           WHERE b.tablename = tbl AND b.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = b.policyname)
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO role_list FROM unnest(r.roles) AS x;
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, tbl, r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
    RAISE NOTICE '[%] 復元: % (%)', tbl, r.policyname, r.cmd;
  END LOOP;
END $$;
COMMIT;

-- すべて戻した後、バックアップ表が不要なら:
--   DROP TABLE _backup_rls_stage1_policies;
--   DROP TABLE _backup_rls_stage1_rls;
