-- 031: RLS 段階3a — 請求書系4テーブルの「公開キー（anon / authenticated）での読み取り」を閉じる
--
-- 対象テーブル：invoices / invoice_items / invoice_adjustments / invoice_monthly_export_log
-- やること：上記4テーブルの「誰でも参照可能（SELECT・roles=public・qual=true）」ポリシーを削除する。
--           削除後は、公開キーでこれらを読むと0行になる（サーバーAPI＝service_role は従来どおり読める）。
--
-- 【前提】先にコード側の差し替え（請求管理の一覧・注文詳細の請求済み判定を管理API経由に）を
--         本番へデプロイし、本番で動作確認を済ませてから実行すること。
--         コードが公開キーで請求書系を読んだままこのSQLを実行すると、該当画面が0行表示になる。
--
-- service_role の ALL ポリシー（invoice_adjustments）は残す。SELECT 以外の権限・他テーブルには触れない。
--
-- 実行方法：Supabase Studio の SQL Editor に全文を貼って1回だけ実行する。
--   途中で失敗すると BEGIN〜COMMIT 全体が取り消され、DBは実行前のまま。
-- 戻し方：031_rls_stage3a_close_invoice_reads_rollback.sql

BEGIN;

-- ============================================================
-- 0. バックアップ（削除する4ポリシーの定義を保存）
-- ============================================================
DROP TABLE IF EXISTS public._backup_20261014_stage3a_invoice_read_policies;

CREATE TABLE public._backup_20261014_stage3a_invoice_read_policies AS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (tablename, policyname) IN (
    ('invoices',                   '請求書は誰でも参照可能'),
    ('invoice_items',              '請求明細は誰でも参照可能'),
    ('invoice_adjustments',        '請求書調整行は誰でも参照可能'),
    ('invoice_monthly_export_log', '月次PDFログは誰でも参照可能')
  );

-- 0-1. バックアップが4件かを確認（違えば中止）
DO $$
BEGIN
  IF (SELECT count(*) FROM public._backup_20261014_stage3a_invoice_read_policies) <> 4 THEN
    RAISE EXCEPTION 'ポリシーのバックアップが4件ではありません。実DBの状態が想定と違うため中止します';
  END IF;
END $$;

-- 0-2. バックアップ表自体を公開キーから守る
ALTER TABLE public._backup_20261014_stage3a_invoice_read_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_20261014_stage3a_invoice_read_policies FROM anon, authenticated;

-- ============================================================
-- 1. 公開キー向けの読み取りポリシー4件を削除
-- ============================================================
DROP POLICY "請求書は誰でも参照可能"       ON public.invoices;
DROP POLICY "請求明細は誰でも参照可能"      ON public.invoice_items;
DROP POLICY "請求書調整行は誰でも参照可能"    ON public.invoice_adjustments;
DROP POLICY "月次PDFログは誰でも参照可能"    ON public.invoice_monthly_export_log;

-- ============================================================
-- 2. 自己チェック（1つでも想定と違えば、全体を取り消して中止する）
-- ============================================================
DO $$
DECLARE
  n_public_select integer;
  n_service       integer;
BEGIN
  -- 2-1. 対象4テーブルに、公開（public / anon / authenticated）向けの SELECT ポリシーが残っていないこと
  SELECT count(*) INTO n_public_select
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('invoices','invoice_items','invoice_adjustments','invoice_monthly_export_log')
    AND cmd = 'SELECT';
  IF n_public_select <> 0 THEN
    RAISE EXCEPTION '請求書系に SELECT ポリシーが % 件残っています。中止します', n_public_select;
  END IF;

  -- 2-2. service_role の ALL ポリシー（invoice_adjustments）は残っていること（サーバーAPIが読み書きできる）
  SELECT count(*) INTO n_service
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'invoice_adjustments'
    AND cmd = 'ALL'
    AND qual = '(auth.role() = ''service_role''::text)';
  IF n_service <> 1 THEN
    RAISE EXCEPTION 'invoice_adjustments の service_role ポリシーが想定（1件）と違います（%件）。中止します', n_service;
  END IF;
END $$;

COMMIT;
