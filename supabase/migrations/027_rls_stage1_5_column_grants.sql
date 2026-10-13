-- 027_rls_stage1_5_column_grants.sql
-- RLS 第2段階・段階1.5：公開キー（anon / authenticated）が書き込める「列」を、管理画面のブラウザが
-- 実際に書き込んでいる列だけに絞る（列単位の権限）。
--
-- 【実行済み】信太郎が Supabase Studio で手動実行済み。このファイルは記録用であり、アプリからは実行しない。
-- 計画・注意事項: docs/rls-phase2.md（「段階1.5：列単位の権限」）
--
-- 【目的】段階1の後も公開キーで更新できる companies / orders / invoices について、
--   承認状態（approval_status）・業態（business_type_id）・freee登録フラグ・注文金額（total_amount）・
--   請求金額など、ブラウザが書き込まない列を公開キーで書き換えられないようにする。
--   サーバーAPI（service role）はこの権限の影響を受けない。
--
-- 【重要】今後、管理画面のブラウザから companies・orders・invoices に新しい列を書き込む変更をするときは、
--   その列の GRANT を追加しないと保存が失敗する（permission denied for table ...）。

BEGIN;

REVOKE INSERT, UPDATE, TRUNCATE ON public.companies FROM anon, authenticated;
GRANT INSERT (company_name, representative_name, postal_code, prefecture, city, address, building, phone, email, price_rank, delivery_method, price_tax_type, notes, is_active, has_separate_billing, billing_name, billing_postal_code, billing_prefecture, billing_city, billing_address, billing_building, parent_company_id, invoice_delivery_method, invoice_delivery_note, internal_memo) ON public.companies TO anon, authenticated;
GRANT UPDATE (company_name, representative_name, postal_code, prefecture, city, address, building, phone, email, price_rank, delivery_method, price_tax_type, notes, is_active, has_separate_billing, billing_name, billing_postal_code, billing_prefecture, billing_city, billing_address, billing_building, parent_company_id, invoice_delivery_method, invoice_delivery_note, internal_memo) ON public.companies TO anon, authenticated;

REVOKE UPDATE, TRUNCATE ON public.orders FROM anon, authenticated;
GRANT UPDATE (status, delivery_note_printed, shipping_label_printed, details_confirmed, notes, notes_replied_at, admin_notes, delivery_date, delivery_time_slot) ON public.orders TO anon, authenticated;

REVOKE UPDATE, TRUNCATE ON public.invoices FROM anon, authenticated;
GRANT UPDATE (status, paid_at, due_date) ON public.invoices TO anon, authenticated;

COMMIT;

-- ============================================================
-- 戻し方（緊急時のみ。テーブル単位の権限に戻す）
-- ============================================================
--   GRANT INSERT, UPDATE, TRUNCATE ON public.companies TO anon, authenticated;
--   GRANT UPDATE, TRUNCATE ON public.orders, public.invoices TO anon, authenticated;
