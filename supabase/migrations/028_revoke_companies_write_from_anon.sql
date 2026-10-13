-- 028_revoke_companies_write_from_anon.sql
-- RLS 第2段階：取引先（companies）の追加・更新を、公開キー（anon / authenticated）から外す。
-- 【実行済み（2026-10-14）】信太郎が Supabase Studio で手動実行済み。権限が外れたことも確認済み。
-- このファイルは記録用であり、アプリからは実行しない。
--
-- 【前提】コミット 30067f5（取引先の追加・更新を管理API経由に移行）が本番にデプロイ済みであること。
--   旧コードのまま実行すると、顧客管理の事前登録・編集・価格ランク変更、請求管理と注文詳細の
--   取引先情報の編集が「保存に失敗しました」になる。
--
-- 【影響】サーバーAPI（service role）からの書き込み（申込・承認・業態変更・取込み・管理画面の編集）は影響を受けない。
--   公開キーでの companies の読み取り（SELECT）は変更しない。
--   テーブル単位の REVOKE は、027 で付けた列単位の INSERT・UPDATE 権限もあわせて取り消す。

BEGIN;

REVOKE INSERT, UPDATE ON public.companies FROM anon, authenticated;

COMMIT;

-- ============================================================
-- 確認用（実行後。0行になればOK）
-- ============================================================
--   SELECT grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--   WHERE table_schema = 'public' AND table_name = 'companies'
--     AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE');
--
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'companies'
--     AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE');

-- ============================================================
-- 戻し方（緊急時のみ。027 実行後の状態＝列単位の INSERT・UPDATE 権限に戻す）
-- ============================================================
--   GRANT INSERT (company_name, representative_name, postal_code, prefecture, city, address, building, phone, email, price_rank, delivery_method, price_tax_type, notes, is_active, has_separate_billing, billing_name, billing_postal_code, billing_prefecture, billing_city, billing_address, billing_building, parent_company_id, invoice_delivery_method, invoice_delivery_note, internal_memo) ON public.companies TO anon, authenticated;
--   GRANT UPDATE (company_name, representative_name, postal_code, prefecture, city, address, building, phone, email, price_rank, delivery_method, price_tax_type, notes, is_active, has_separate_billing, billing_name, billing_postal_code, billing_prefecture, billing_city, billing_address, billing_building, parent_company_id, invoice_delivery_method, invoice_delivery_note, internal_memo) ON public.companies TO anon, authenticated;
