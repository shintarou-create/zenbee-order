-- 024_business_types.sql
-- 業態区分（飲食店／青果店・小売／直売所・道の駅など）のスキーマ追加。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
--
-- 【実行順序（重要）】
--   1. この 024 を実行
--   2. 続けて 025_migrate_existing_to_restaurant.sql を実行（既存の取引先・注文・商品を「飲食店」に設定）
--   3. アプリをデプロイ
--   025 を実行せずにデプロイすると、全取引先が業態未設定になり LIFF から発注できなくなる。
--
-- 既存の状態（approval_status: pending/approved/rejected、is_active=false で停止）はそのまま使う。
-- 新規テーブルは RLS を有効にしてポリシーを作らない（公開キーからは読めない。アプリは service role で読む）。

BEGIN;

-- ============================================================
-- business_types（業態マスタ。管理画面から追加・名称変更・並び替え・無効化する）
-- ============================================================
CREATE TABLE business_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_business_types_updated_at
  BEFORE UPDATE ON business_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO business_types (name, display_order) VALUES
  ('飲食店', 1),
  ('青果店・小売', 2),
  ('直売所・道の駅など', 3);

-- ============================================================
-- business_type_products（どの業態にどの商品を見せるか）
-- ============================================================
CREATE TABLE business_type_products (
  business_type_id UUID NOT NULL REFERENCES business_types(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_type_id, product_id)
);

CREATE INDEX idx_business_type_products_product_id ON business_type_products(product_id);

-- ============================================================
-- companies.business_type_id（NULL = 業態未設定。発注不可）
-- ============================================================
ALTER TABLE companies
  ADD COLUMN business_type_id UUID REFERENCES business_types(id) ON DELETE RESTRICT;

CREATE INDEX idx_companies_business_type_id ON companies(business_type_id);

COMMENT ON COLUMN companies.business_type_id IS
  '業態。NULL=未設定（承認待ち等）。LIFFの商品表示・注文受付は業態が設定済みの承認済み取引先のみ。';

-- ============================================================
-- orders.business_type_id（注文時点の業態スナップショット。売上分析の業態別集計に使う）
-- ============================================================
ALTER TABLE orders
  ADD COLUMN business_type_id UUID REFERENCES business_types(id) ON DELETE RESTRICT;

CREATE INDEX idx_orders_business_type_id ON orders(business_type_id);

COMMENT ON COLUMN orders.business_type_id IS
  '注文時点の取引先の業態。後から取引先の業態を変えても過去の注文の売上分類は動かない。';

-- ============================================================
-- company_business_type_logs（業態変更履歴）
-- ============================================================
CREATE TABLE company_business_type_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_business_type_id UUID REFERENCES business_types(id) ON DELETE SET NULL,
  to_business_type_id UUID REFERENCES business_types(id) ON DELETE SET NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_business_type_logs_company_id ON company_business_type_logs(company_id);

-- ============================================================
-- RLS（ポリシーなし = 公開キーからは読み書き不可）
-- ============================================================
ALTER TABLE business_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_type_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_business_type_logs ENABLE ROW LEVEL SECURITY;

COMMIT;
