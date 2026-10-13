-- 026_rls_phase2_stage1.sql
-- RLS 第2段階・段階1：ブラウザ（公開キー）が使っていない書き込み権限を塞ぐ。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
-- 計画: docs/rls-phase2.md ／ 戻し: 026_rls_phase2_stage1_rollback.sql ／ 確認: 026_rls_phase2_stage1_check.sql
--
-- 【方針】
--   - 公開キーに効く（roles に public / anon / authenticated を含み、条件が true の）
--     ALL・INSERT・UPDATE・DELETE ポリシーのうち、ブラウザが使っていない操作のものを削除する。
--   - DELETE はすべて塞ぐ（ブラウザからの削除はコード上0件）。
--   - ALL を外すテーブルで、ブラウザが INSERT・UPDATE を使っている場合は、その操作だけの
--     個別ポリシー（名前は stage1_<テーブル>_<操作>）を作る。既に同等の個別ポリシーがあれば作らない。
--   - SELECT ポリシーは変更しない。サービスロール限定のポリシー（条件が auth.role() = 'service_role'）も変更しない。
--   - 例外：ALL を外すと公開キーの読み取り範囲が狭まるテーブル（products）は、今と同じ読み取り
--     （条件 true）を stage1_products_select_all として残す（判断点1。下記参照）。
--
-- 【ブラウザの書き込み（2026-10-13 コード確認・19か所・削除0件）】
--   companies   : INSERT 1（顧客管理の事前登録）／UPDATE 4（顧客管理の編集・価格ランク、請求管理の顧客情報、注文詳細の取引先情報）
--   orders      : UPDATE 10（受注一覧6、注文詳細2、一括印刷1、請求管理1）
--   invoices    : INSERT 1（請求書作成）／UPDATE 2（送信ステータス・支払期限）
--   invoice_items: INSERT 1（請求書作成）
--   admin_users / line_users / order_items / order_shipping / products / product_prices / inventory : 書き込みなし
--
-- 【実行方法】
--   1. ブロック0（バックアップ）を最初に1回だけ実行する。2回目はエラーになる（上書き防止のため）。
--   2. ブロック1〜11を、1ブロックずつ選択して実行する。各ブロックは BEGIN〜COMMIT で独立しており、
--      途中でエラー（RAISE EXCEPTION）になったブロックは何も変更されない。
--   3. 各ブロックの実行後、Studio の「Messages」に削除・作成したポリシー名が NOTICE で出る。
--   4. 全ブロック実行後、026_rls_phase2_stage1_check.sql で確認する。
--
-- 【各ブロックの安全装置】
--   - 対象テーブルの RLS が無効なら中止（ポリシーを変えても効果がないため）
--   - ブロック0のバックアップに対象テーブルが無ければ中止
--   - 実行前に公開キーで読めていたのに、実行後に読めるポリシーが無くなる場合は中止

-- ============================================================
-- ブロック0：実行前のポリシーとRLS状態をバックアップ（最初に1回だけ）
-- ============================================================
CREATE TABLE _backup_rls_stage1_policies AS
SELECT now() AS backed_up_at, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'admin_users', 'line_users', 'companies', 'orders', 'order_items', 'order_shipping',
    'invoices', 'invoice_items', 'products', 'product_prices', 'inventory'
  );

CREATE TABLE _backup_rls_stage1_rls AS
SELECT now() AS backed_up_at, c.relname AS tablename, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'admin_users', 'line_users', 'companies', 'orders', 'order_items', 'order_shipping',
    'invoices', 'invoice_items', 'products', 'product_prices', 'inventory'
  );

-- バックアップ表自体も公開キーから読めないようにする（ポリシーなし＋RLS有効）
ALTER TABLE _backup_rls_stage1_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE _backup_rls_stage1_rls ENABLE ROW LEVEL SECURITY;

-- 保存内容の確認（この内容が戻すSQLで復元される）
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM _backup_rls_stage1_policies ORDER BY tablename, cmd, policyname;


-- ============================================================
-- ブロック1：admin_users（ブラウザの書き込みなし → 書き込みをすべて塞ぐ）
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'admin_users';
  need_insert boolean := false;
  need_update boolean := false;
  keep_open_select boolean := false;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF need_insert AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'INSERT' AND roles && open_roles AND COALESCE(with_check, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (true)', 'stage1_' || tbl || '_insert', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_insert (INSERT)', tbl, tbl;
  END IF;
  IF need_update AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'UPDATE' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (true) WITH CHECK (true)', 'stage1_' || tbl || '_update', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_update (UPDATE)', tbl, tbl;
  END IF;
  IF keep_open_select AND had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'SELECT' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)', 'stage1_' || tbl || '_select_all', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_select_all (SELECT・従来と同じ読み取りを維持)', tbl, tbl;
  END IF;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;


-- ============================================================
-- ブロック2：line_users（ブラウザの書き込みなし → 書き込みをすべて塞ぐ）
--   LINEの紐づけ乗っ取り（他社の取引先に自分のLINEを紐づける）を防ぐ。
--   申込・登録コードでの紐づけはサーバーAPI（service role）なので影響なし。
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'line_users';
  need_insert boolean := false;
  need_update boolean := false;
  keep_open_select boolean := false;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF need_insert AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'INSERT' AND roles && open_roles AND COALESCE(with_check, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (true)', 'stage1_' || tbl || '_insert', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_insert (INSERT)', tbl, tbl;
  END IF;
  IF need_update AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'UPDATE' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (true) WITH CHECK (true)', 'stage1_' || tbl || '_update', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_update (UPDATE)', tbl, tbl;
  END IF;
  IF keep_open_select AND had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'SELECT' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)', 'stage1_' || tbl || '_select_all', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_select_all (SELECT・従来と同じ読み取りを維持)', tbl, tbl;
  END IF;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;


-- ============================================================
-- ブロック3：order_items（ブラウザの書き込みなし → 書き込みをすべて塞ぐ）
--   注文明細の追加・変更は注文API・管理API（service role）なので影響なし。
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'order_items';
  need_insert boolean := false;
  need_update boolean := false;
  keep_open_select boolean := false;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF need_insert AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'INSERT' AND roles && open_roles AND COALESCE(with_check, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (true)', 'stage1_' || tbl || '_insert', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_insert (INSERT)', tbl, tbl;
  END IF;
  IF need_update AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'UPDATE' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (true) WITH CHECK (true)', 'stage1_' || tbl || '_update', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_update (UPDATE)', tbl, tbl;
  END IF;
  IF keep_open_select AND had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'SELECT' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)', 'stage1_' || tbl || '_select_all', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_select_all (SELECT・従来と同じ読み取りを維持)', tbl, tbl;
  END IF;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;


-- ============================================================
-- ブロック4：order_shipping（ブラウザの書き込みなし → 書き込みをすべて塞ぐ）
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'order_shipping';
  need_insert boolean := false;
  need_update boolean := false;
  keep_open_select boolean := false;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF need_insert AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'INSERT' AND roles && open_roles AND COALESCE(with_check, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (true)', 'stage1_' || tbl || '_insert', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_insert (INSERT)', tbl, tbl;
  END IF;
  IF need_update AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'UPDATE' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (true) WITH CHECK (true)', 'stage1_' || tbl || '_update', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_update (UPDATE)', tbl, tbl;
  END IF;
  IF keep_open_select AND had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'SELECT' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)', 'stage1_' || tbl || '_select_all', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_select_all (SELECT・従来と同じ読み取りを維持)', tbl, tbl;
  END IF;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;


-- ============================================================
-- ブロック5：orders（ブラウザは UPDATE のみ使用 → INSERT・DELETE・ALL を塞ぎ、UPDATE を残す）
--   既存の個別 UPDATE ポリシー（orders_update）があればそれを残し、新たには作らない。
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'orders';
  need_insert boolean := false;
  need_update boolean := true;
  keep_open_select boolean := false;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF need_insert AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'INSERT' AND roles && open_roles AND COALESCE(with_check, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (true)', 'stage1_' || tbl || '_insert', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_insert (INSERT)', tbl, tbl;
  END IF;
  IF need_update AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'UPDATE' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (true) WITH CHECK (true)', 'stage1_' || tbl || '_update', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_update (UPDATE)', tbl, tbl;
  END IF;
  IF keep_open_select AND had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'SELECT' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)', 'stage1_' || tbl || '_select_all', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_select_all (SELECT・従来と同じ読み取りを維持)', tbl, tbl;
  END IF;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;


-- ============================================================
-- ブロック6：companies（ブラウザは INSERT・UPDATE を使用 → DELETE・ALL を塞ぎ、INSERT・UPDATE を残す）
--   既存の個別 INSERT・UPDATE ポリシー（companies_insert / companies_update）があればそれを残す。
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'companies';
  need_insert boolean := true;
  need_update boolean := true;
  keep_open_select boolean := false;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF need_insert AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'INSERT' AND roles && open_roles AND COALESCE(with_check, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (true)', 'stage1_' || tbl || '_insert', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_insert (INSERT)', tbl, tbl;
  END IF;
  IF need_update AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'UPDATE' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (true) WITH CHECK (true)', 'stage1_' || tbl || '_update', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_update (UPDATE)', tbl, tbl;
  END IF;
  IF keep_open_select AND had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'SELECT' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)', 'stage1_' || tbl || '_select_all', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_select_all (SELECT・従来と同じ読み取りを維持)', tbl, tbl;
  END IF;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;


-- ============================================================
-- ブロック7：invoices（ブラウザは INSERT・UPDATE を使用 → ALL を外し、INSERT・UPDATE の個別ポリシーに置き換える）
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'invoices';
  need_insert boolean := true;
  need_update boolean := true;
  keep_open_select boolean := false;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF need_insert AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'INSERT' AND roles && open_roles AND COALESCE(with_check, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (true)', 'stage1_' || tbl || '_insert', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_insert (INSERT)', tbl, tbl;
  END IF;
  IF need_update AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'UPDATE' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (true) WITH CHECK (true)', 'stage1_' || tbl || '_update', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_update (UPDATE)', tbl, tbl;
  END IF;
  IF keep_open_select AND had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'SELECT' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)', 'stage1_' || tbl || '_select_all', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_select_all (SELECT・従来と同じ読み取りを維持)', tbl, tbl;
  END IF;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;


-- ============================================================
-- ブロック8：invoice_items（ブラウザは INSERT のみ使用 → ALL を外し、INSERT の個別ポリシーに置き換える）
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'invoice_items';
  need_insert boolean := true;
  need_update boolean := false;
  keep_open_select boolean := false;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF need_insert AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'INSERT' AND roles && open_roles AND COALESCE(with_check, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (true)', 'stage1_' || tbl || '_insert', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_insert (INSERT)', tbl, tbl;
  END IF;
  IF need_update AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'UPDATE' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (true) WITH CHECK (true)', 'stage1_' || tbl || '_update', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_update (UPDATE)', tbl, tbl;
  END IF;
  IF keep_open_select AND had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'SELECT' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)', 'stage1_' || tbl || '_select_all', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_select_all (SELECT・従来と同じ読み取りを維持)', tbl, tbl;
  END IF;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;


-- ============================================================
-- ブロック9：products（ブラウザの書き込みなし → 書き込みをすべて塞ぐ）
--   【判断点1】既存の SELECT ポリシーは「有効な商品のみ」（is_active = true）。ALL（条件 true）を外すと、
--   公開キーで無効な商品が読めなくなり、過去の注文に含まれる無効商品の情報（カテゴリ）が
--   受注一覧・注文詳細・印刷・LIFF注文履歴で欠ける。今と同じ読み取りを保つため
--   stage1_products_select_all（SELECT・条件 true）を作る（keep_open_select = true）。
--   作りたくない場合は keep_open_select を false にして実行する。
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'products';
  need_insert boolean := false;
  need_update boolean := false;
  keep_open_select boolean := true;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF need_insert AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'INSERT' AND roles && open_roles AND COALESCE(with_check, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (true)', 'stage1_' || tbl || '_insert', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_insert (INSERT)', tbl, tbl;
  END IF;
  IF need_update AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'UPDATE' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (true) WITH CHECK (true)', 'stage1_' || tbl || '_update', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_update (UPDATE)', tbl, tbl;
  END IF;
  IF keep_open_select AND had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd = 'SELECT' AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)', 'stage1_' || tbl || '_select_all', tbl);
    RAISE NOTICE '[%] 作成: stage1_%_select_all (SELECT・従来と同じ読み取りを維持)', tbl, tbl;
  END IF;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;


-- ============================================================
-- ブロック10：product_prices（ブラウザの書き込みなし → 書き込みをすべて塞ぐ）
--   SELECT は残す（読み取りは 023 で閉じる）。023 を先に実行済みならポリシーが無いため何もしない。
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'product_prices';
  need_insert boolean := false;
  need_update boolean := false;
  keep_open_select boolean := false;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl)
     AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;


-- ============================================================
-- ブロック11：inventory（ブラウザの書き込みなし → 書き込みをすべて塞ぐ）
--   在庫の更新は商品管理API（service role）なので影響なし。
-- ============================================================
BEGIN;
DO $$
DECLARE
  tbl text := 'inventory';
  need_insert boolean := false;
  need_update boolean := false;
  keep_open_select boolean := false;
  open_roles name[] := ARRAY['public', 'anon', 'authenticated']::name[];
  p record;
  had_select boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', tbl)::regclass) THEN
    RAISE EXCEPTION '% は RLS が無効です。ポリシーを変えても効果がないため中止します', tbl;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _backup_rls_stage1_policies WHERE tablename = tbl) THEN
    RAISE EXCEPTION '% のバックアップがありません。ブロック0を先に実行してください', tbl;
  END IF;

  had_select := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles AND COALESCE(qual, 'true') = 'true'
  );

  FOR p IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && open_roles
      AND COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true'
      AND NOT ((cmd = 'INSERT' AND need_insert) OR (cmd = 'UPDATE' AND need_update))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, tbl);
    RAISE NOTICE '[%] 削除: % (%)', tbl, p.policyname, p.cmd;
  END LOOP;

  IF had_select AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL') AND roles && open_roles
  ) THEN
    RAISE EXCEPTION '[%] 公開キーで読めるポリシーが無くなるため中止します（個別の SELECT ポリシーが無い）', tbl;
  END IF;
END $$;
COMMIT;
