-- ============================================================
-- 005_restructure_v2.sql
-- DB構造 v2: companies + line_users 分離、請求先、送料明細
-- ============================================================
-- 本番データなし前提のマイグレーション
-- 変更点:
--   1. customers → companies にリネーム + 請求先カラム追加
--   2. line_users テーブル新設
--   3. orders: customer_id → company_id、ステータス整理、請求先オーバーライド
--   4. order_shipping テーブル新設（送料明細）
-- ============================================================

-- ============================================================
-- 0. 依存データを全削除（本番データなし前提）
-- ============================================================
DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM order_items;
DELETE FROM orders;

-- ============================================================
-- 1. customers → companies リネーム + カラム変更
-- ============================================================

-- テーブル名変更
ALTER TABLE customers RENAME TO companies;

-- line_user_id を削除（line_users テーブルに移行）
-- まず依存するインデックスを削除
DROP INDEX IF EXISTS idx_customers_line_user_id;
DROP INDEX IF EXISTS idx_customers_is_active;

-- line_user_id カラムを削除
ALTER TABLE companies DROP COLUMN line_user_id;

-- delivery_time_slot を削除（使わない）
ALTER TABLE companies DROP COLUMN delivery_time_slot;

-- 請求先カラムを追加
ALTER TABLE companies ADD COLUMN has_separate_billing BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN billing_name TEXT;
ALTER TABLE companies ADD COLUMN billing_postal_code TEXT;
ALTER TABLE companies ADD COLUMN billing_prefecture TEXT;
ALTER TABLE companies ADD COLUMN billing_city TEXT;
ALTER TABLE companies ADD COLUMN billing_address TEXT;
ALTER TABLE companies ADD COLUMN billing_building TEXT;

-- インデックス再作成
CREATE INDEX idx_companies_is_active ON companies(is_active);

-- ============================================================
-- 2. line_users テーブル新設
-- ============================================================
CREATE TABLE line_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_user_id TEXT UNIQUE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  display_name TEXT,
  picture_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_line_users_line_user_id ON line_users(line_user_id);
CREATE INDEX idx_line_users_company_id ON line_users(company_id);

-- updated_at トリガー
CREATE TRIGGER update_line_users_updated_at
  BEFORE UPDATE ON line_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. orders テーブル変更
-- ============================================================

-- customer_id → company_id にリネーム
ALTER TABLE orders RENAME COLUMN customer_id TO company_id;

-- FK制約を再作成（名前を更新）
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

-- インデックス更新
DROP INDEX IF EXISTS idx_orders_customer_id;
CREATE INDEX idx_orders_company_id ON orders(company_id);

-- ステータスを4段階に整理: pending / shipped / done / cancelled
-- まず既存のCHECK制約を削除して再作成
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'shipped', 'done', 'cancelled'));

-- delivery_time_slot を削除（使わない）
ALTER TABLE orders DROP COLUMN IF EXISTS delivery_time_slot;

-- cool_type を削除（送料計算は order_shipping で管理）
ALTER TABLE orders DROP COLUMN IF EXISTS cool_type;

-- 請求先オーバーライド用カラム追加
ALTER TABLE orders ADD COLUMN billing_name TEXT;
ALTER TABLE orders ADD COLUMN billing_postal_code TEXT;
ALTER TABLE orders ADD COLUMN billing_prefecture TEXT;
ALTER TABLE orders ADD COLUMN billing_city TEXT;
ALTER TABLE orders ADD COLUMN billing_address TEXT;
ALTER TABLE orders ADD COLUMN billing_building TEXT;

-- 納品日にインデックス追加（グループ表示で使用）
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);

-- ============================================================
-- 4. order_shipping テーブル新設（送料明細）
-- ============================================================
CREATE TABLE order_shipping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost DECIMAL NOT NULL DEFAULT 0,
  cost DECIMAL NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX idx_order_shipping_order_id ON order_shipping(order_id);

-- ============================================================
-- 5. invoices の customer_id → company_id（テーブルは残す）
-- ============================================================
ALTER TABLE invoices RENAME COLUMN customer_id TO company_id;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_customer_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
DROP INDEX IF EXISTS idx_invoices_customer_id;
CREATE INDEX idx_invoices_company_id ON invoices(company_id);

-- ============================================================
-- 6. RLS ポリシー再作成
-- ============================================================

-- companies（旧 customers）のポリシー再作成
DROP POLICY IF EXISTS "顧客は自分のデータのみ参照可能" ON companies;
DROP POLICY IF EXISTS "サービスロールは全操作可能 customers" ON companies;
DROP POLICY IF EXISTS "anon_select_customers" ON companies;
DROP POLICY IF EXISTS "anon_insert_customers" ON companies;
DROP POLICY IF EXISTS "anon_update_customers" ON companies;
DROP POLICY IF EXISTS "anon_delete_customers" ON companies;

CREATE POLICY "companies_select" ON companies FOR SELECT USING (true);
CREATE POLICY "companies_insert" ON companies FOR INSERT WITH CHECK (true);
CREATE POLICY "companies_update" ON companies FOR UPDATE USING (true);
CREATE POLICY "companies_delete" ON companies FOR DELETE USING (true);

-- line_users RLS
ALTER TABLE line_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_users_select" ON line_users FOR SELECT USING (true);
CREATE POLICY "line_users_insert" ON line_users FOR INSERT WITH CHECK (true);
CREATE POLICY "line_users_update" ON line_users FOR UPDATE USING (true);
CREATE POLICY "line_users_delete" ON line_users FOR DELETE USING (true);

-- orders のポリシー再作成（名前統一）
DROP POLICY IF EXISTS "顧客は自分の注文のみ参照可能" ON orders;
DROP POLICY IF EXISTS "サービスロールは全操作可能 orders" ON orders;
DROP POLICY IF EXISTS "anon_select_orders" ON orders;
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
DROP POLICY IF EXISTS "anon_delete_orders" ON orders;

CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true);
CREATE POLICY "orders_delete" ON orders FOR DELETE USING (true);

-- order_items のポリシー再作成
DROP POLICY IF EXISTS "注文明細は誰でも参照可能" ON order_items;
DROP POLICY IF EXISTS "サービスロールは全操作可能 order_items" ON order_items;
DROP POLICY IF EXISTS "anon_select_order_items" ON order_items;
DROP POLICY IF EXISTS "anon_insert_order_items" ON order_items;
DROP POLICY IF EXISTS "anon_update_order_items" ON order_items;
DROP POLICY IF EXISTS "anon_delete_order_items" ON order_items;

CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (true);
CREATE POLICY "order_items_insert" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "order_items_update" ON order_items FOR UPDATE USING (true);
CREATE POLICY "order_items_delete" ON order_items FOR DELETE USING (true);

-- order_shipping RLS
ALTER TABLE order_shipping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_shipping_select" ON order_shipping FOR SELECT USING (true);
CREATE POLICY "order_shipping_insert" ON order_shipping FOR INSERT WITH CHECK (true);
CREATE POLICY "order_shipping_update" ON order_shipping FOR UPDATE USING (true);
CREATE POLICY "order_shipping_delete" ON order_shipping FOR DELETE USING (true);

-- ============================================================
-- 7. 開発用テストデータを再作成
-- ============================================================

-- 既存の開発用顧客を削除
DELETE FROM companies WHERE company_name = 'テスト食堂（開発用）';

-- テスト用会社を挿入
INSERT INTO companies (
  company_name, representative_name, postal_code, prefecture, city, address, building,
  phone, email, price_rank, is_active, has_separate_billing
) VALUES (
  'テスト食堂（開発用）', '開発 太郎', '150-0001', '東京都', '渋谷区', '神宮前1-1-1', 'テストビル3F',
  '03-1234-5678', 'dev@test.com', 'standard', true, false
);

-- テスト用LINE担当者を挿入
INSERT INTO line_users (line_user_id, company_id, display_name, is_active)
SELECT 'dev_user_001', id, '開発 太郎', true
FROM companies WHERE company_name = 'テスト食堂（開発用）';

-- ============================================================
-- 完了
-- ============================================================
-- 実行後の確認:
--   SELECT * FROM companies;
--   SELECT * FROM line_users;
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' ORDER BY ordinal_position;
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'order_shipping' ORDER BY ordinal_position;
