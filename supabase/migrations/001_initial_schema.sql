-- 善兵衛農園 BtoB発注システム 初期スキーマ

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- customers テーブル
-- ============================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_user_id TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  representative_name TEXT,
  postal_code TEXT,
  prefecture TEXT,
  city TEXT,
  address TEXT,
  building TEXT,
  phone TEXT,
  email TEXT,
  price_rank TEXT DEFAULT 'standard' CHECK (price_rank IN ('standard', 'premium', 'vip')),
  delivery_time_slot TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- products テーブル
-- ============================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'その他',
  unit TEXT DEFAULT 'kg',
  min_order_qty DECIMAL DEFAULT 0.1,
  max_order_qty DECIMAL DEFAULT 200,
  step_qty DECIMAL DEFAULT 0.1,
  cool_type INTEGER DEFAULT 0 CHECK (cool_type IN (0, 2)),
  is_seasonal BOOLEAN DEFAULT false,
  season_start TEXT,
  season_end TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- product_prices テーブル
-- ============================================================
CREATE TABLE product_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  price_rank TEXT DEFAULT 'standard' CHECK (price_rank IN ('standard', 'premium', 'vip')),
  price_per_unit DECIMAL NOT NULL,
  UNIQUE(product_id, price_rank)
);

-- ============================================================
-- inventory テーブル
-- ============================================================
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE UNIQUE,
  available_qty DECIMAL DEFAULT 0,
  reserved_qty DECIMAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- orders テーブル
-- ============================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  total_amount DECIMAL NOT NULL DEFAULT 0,
  shipping_date DATE,
  delivery_date DATE,
  delivery_time_slot TEXT,
  cool_type INTEGER DEFAULT 0,
  notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- order_items テーブル
-- ============================================================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity DECIMAL NOT NULL,
  unit TEXT NOT NULL,
  unit_price DECIMAL NOT NULL,
  subtotal DECIMAL NOT NULL
);

-- ============================================================
-- invoices テーブル
-- ============================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  billing_month TEXT NOT NULL,
  total_amount DECIMAL NOT NULL DEFAULT 0,
  tax_amount DECIMAL NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- invoice_items テーブル
-- ============================================================
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  amount DECIMAL NOT NULL
);

-- ============================================================
-- admin_users テーブル
-- ============================================================
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_user_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin'))
);

-- ============================================================
-- インデックス
-- ============================================================
CREATE INDEX idx_customers_line_user_id ON customers(line_user_id);
CREATE INDEX idx_customers_is_active ON customers(is_active);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_sort_order ON products(sort_order);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_billing_month ON invoices(billing_month);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_admin_users_line_user_id ON admin_users(line_user_id);

-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security (RLS) ポリシー
-- ============================================================

-- customers RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "顧客は自分のデータのみ参照可能"
  ON customers FOR SELECT
  USING (true);

CREATE POLICY "サービスロールは全操作可能 customers"
  ON customers FOR ALL
  USING (auth.role() = 'service_role');

-- products RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "アクティブ商品は誰でも参照可能"
  ON products FOR SELECT
  USING (is_active = true);

CREATE POLICY "サービスロールは全操作可能 products"
  ON products FOR ALL
  USING (auth.role() = 'service_role');

-- product_prices RLS
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "価格は誰でも参照可能"
  ON product_prices FOR SELECT
  USING (true);

CREATE POLICY "サービスロールは全操作可能 product_prices"
  ON product_prices FOR ALL
  USING (auth.role() = 'service_role');

-- inventory RLS
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "在庫は誰でも参照可能"
  ON inventory FOR SELECT
  USING (true);

CREATE POLICY "サービスロールは全操作可能 inventory"
  ON inventory FOR ALL
  USING (auth.role() = 'service_role');

-- orders RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "顧客は自分の注文のみ参照可能"
  ON orders FOR SELECT
  USING (true);

CREATE POLICY "サービスロールは全操作可能 orders"
  ON orders FOR ALL
  USING (auth.role() = 'service_role');

-- order_items RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "注文明細は誰でも参照可能"
  ON order_items FOR SELECT
  USING (true);

CREATE POLICY "サービスロールは全操作可能 order_items"
  ON order_items FOR ALL
  USING (auth.role() = 'service_role');

-- invoices RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "請求書は誰でも参照可能"
  ON invoices FOR SELECT
  USING (true);

CREATE POLICY "サービスロールは全操作可能 invoices"
  ON invoices FOR ALL
  USING (auth.role() = 'service_role');

-- invoice_items RLS
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "請求明細は誰でも参照可能"
  ON invoice_items FOR SELECT
  USING (true);

CREATE POLICY "サービスロールは全操作可能 invoice_items"
  ON invoice_items FOR ALL
  USING (auth.role() = 'service_role');

-- admin_users RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "管理者情報は誰でも参照可能"
  ON admin_users FOR SELECT
  USING (true);

CREATE POLICY "サービスロールは全操作可能 admin_users"
  ON admin_users FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- サンプルデータ（開発用）
-- ============================================================

-- サンプル商品
INSERT INTO products (name, category, unit, min_order_qty, max_order_qty, step_qty, cool_type, is_seasonal, season_start, season_end, sort_order, description) VALUES
  ('有田みかん（S）', 'みかん', 'kg', 5, 200, 1, 0, true, '11-01', '01-31', 1, '有田産の新鮮なみかん（Sサイズ）'),
  ('有田みかん（M）', 'みかん', 'kg', 5, 200, 1, 0, true, '11-01', '01-31', 2, '有田産の新鮮なみかん（Mサイズ）'),
  ('有田みかん（L）', 'みかん', 'kg', 5, 200, 1, 0, true, '11-01', '01-31', 3, '有田産の新鮮なみかん（Lサイズ）'),
  ('びわ（L）', 'びわ', 'kg', 1, 50, 0.5, 2, true, '05-01', '06-30', 10, '和歌山産の甘いびわ（Lサイズ）'),
  ('びわ（M）', 'びわ', 'kg', 1, 50, 0.5, 2, true, '05-01', '06-30', 11, '和歌山産の甘いびわ（Mサイズ）'),
  ('有田レモン', 'レモン', 'kg', 2, 100, 1, 0, true, '09-01', '03-31', 20, '農薬不使用の国産レモン'),
  ('みかんジュース（500ml）', 'ジュース', '個', 6, 500, 6, 0, false, NULL, NULL, 30, '有田みかん100%の無添加ジュース'),
  ('みかんジュース（1L）', 'ジュース', '個', 6, 300, 6, 0, false, NULL, NULL, 31, '有田みかん100%の無添加ジュース（大容量）');

-- サンプル価格（standard）
INSERT INTO product_prices (product_id, price_rank, price_per_unit)
SELECT id, 'standard',
  CASE name
    WHEN '有田みかん（S）' THEN 280
    WHEN '有田みかん（M）' THEN 300
    WHEN '有田みかん（L）' THEN 320
    WHEN 'びわ（L）' THEN 1200
    WHEN 'びわ（M）' THEN 1000
    WHEN '有田レモン' THEN 450
    WHEN 'みかんジュース（500ml）' THEN 250
    WHEN 'みかんジュース（1L）' THEN 450
  END
FROM products;

-- サンプル価格（premium）
INSERT INTO product_prices (product_id, price_rank, price_per_unit)
SELECT id, 'premium',
  CASE name
    WHEN '有田みかん（S）' THEN 260
    WHEN '有田みかん（M）' THEN 280
    WHEN '有田みかん（L）' THEN 300
    WHEN 'びわ（L）' THEN 1100
    WHEN 'びわ（M）' THEN 900
    WHEN '有田レモン' THEN 420
    WHEN 'みかんジュース（500ml）' THEN 230
    WHEN 'みかんジュース（1L）' THEN 420
  END
FROM products;

-- サンプル価格（vip）
INSERT INTO product_prices (product_id, price_rank, price_per_unit)
SELECT id, 'vip',
  CASE name
    WHEN '有田みかん（S）' THEN 240
    WHEN '有田みかん（M）' THEN 260
    WHEN '有田みかん（L）' THEN 280
    WHEN 'びわ（L）' THEN 1000
    WHEN 'びわ（M）' THEN 850
    WHEN '有田レモン' THEN 400
    WHEN 'みかんジュース（500ml）' THEN 210
    WHEN 'みかんジュース（1L）' THEN 400
  END
FROM products;

-- サンプル在庫
INSERT INTO inventory (product_id, available_qty, reserved_qty)
SELECT id,
  CASE name
    WHEN '有田みかん（S）' THEN 500
    WHEN '有田みかん（M）' THEN 800
    WHEN '有田みかん（L）' THEN 300
    WHEN 'びわ（L）' THEN 50
    WHEN 'びわ（M）' THEN 80
    WHEN '有田レモン' THEN 200
    WHEN 'みかんジュース（500ml）' THEN 300
    WHEN 'みかんジュース（1L）' THEN 150
  END,
  0
FROM products;
