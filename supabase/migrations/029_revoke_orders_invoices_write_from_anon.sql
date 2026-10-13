-- 029_revoke_orders_invoices_write_from_anon.sql
-- RLS 第2段階の仕上げ：注文（orders）の更新、請求書（invoices）の追加・更新、請求明細（invoice_items）の追加を、
-- 公開キー（anon / authenticated）から外す。
--
-- 【実行済み（2026-10-14）】
--   信太郎が Supabase Studio で手動実行済み。確認SQL2本とも0行で、権限が外れたことを確認済み。
--   このファイルは記録用であり、アプリからは実行しない。
--   実行の前に、次の2つを必ず確認すること。
--     1. コミット 5c5727b（請求書まわりを管理API経由に移行）が本番にデプロイ済み（Ready）であること
--        （注文の更新は 2ea6d11、取引先は 30067f5 で移行済み）
--     2. 本番の画面で、次の保存ができること
--        - 請求管理：請求書の一括作成・1社だけ作成（明細が付き、対象注文が完了になる）、送信ステータスの変更、支払期限の変更
--        - 受注一覧：印刷済み解除・未出荷に戻す・送り状解除・確認済み・完了・出荷済み
--        - 注文詳細：確認済みの切り替え・保存、一括印刷：印刷済みが付く
--   旧コードのまま実行すると、上の操作が「保存に失敗しました」等になる。
--
-- 【影響】サーバーAPI（service role）からの書き込みは影響を受けない。公開キーでの読み取り（SELECT）は変更しない。
--   テーブル単位の REVOKE は、027 で付けた列単位の UPDATE 権限（orders の9列・invoices の3列）もあわせて取り消す。
--   これで、ブラウザ（公開キー）から書き込めるテーブルは無くなる（コード上のブラウザ書き込みは 5c5727b で0件）。

BEGIN;

REVOKE UPDATE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.invoices FROM anon, authenticated;
REVOKE INSERT ON public.invoice_items FROM anon, authenticated;

COMMIT;

-- ============================================================
-- 確認用（実行後。どちらも0行になればOK）
-- ============================================================
--   SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
--     AND ((table_name = 'orders' AND privilege_type = 'UPDATE')
--       OR (table_name = 'invoices' AND privilege_type IN ('INSERT', 'UPDATE'))
--       OR (table_name = 'invoice_items' AND privilege_type = 'INSERT'));
--
--   SELECT table_name, grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
--     AND ((table_name = 'orders' AND privilege_type = 'UPDATE')
--       OR (table_name = 'invoices' AND privilege_type IN ('INSERT', 'UPDATE'))
--       OR (table_name = 'invoice_items' AND privilege_type = 'INSERT'));

-- ============================================================
-- 戻し方（緊急時のみ。029 実行前＝027 実行後の状態に戻す）
--   orders   : 列単位の UPDATE（027 の9列）
--   invoices : INSERT（テーブル単位）＋ 列単位の UPDATE（027 の3列）
--   invoice_items : INSERT（テーブル単位）
-- ============================================================
--   GRANT UPDATE (status, delivery_note_printed, shipping_label_printed, details_confirmed, notes, notes_replied_at, admin_notes, delivery_date, delivery_time_slot) ON public.orders TO anon, authenticated;
--   GRANT INSERT ON public.invoices TO anon, authenticated;
--   GRANT UPDATE (status, paid_at, due_date) ON public.invoices TO anon, authenticated;
--   GRANT INSERT ON public.invoice_items TO anon, authenticated;
