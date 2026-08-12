-- 018_sales_facts.sql
-- 販路別収支管理システム フェーズ1：channels / sales_facts / product_mappings 新規作成。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
--
-- 既存テーブル（orders / order_items / products / companies / invoices 等）は一切変更しない。
-- 新規テーブル3つのみを追加する。

BEGIN;

-- ============================================================
-- channels（販路マスタ）
-- ============================================================

CREATE TABLE channels (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commission_rate NUMERIC DEFAULT 0,      -- 販売手数料率（市場歩合・産直手数料）。暫定値0、実数は後日設定
  payment_fee_rate NUMERIC DEFAULT 0,     -- 決済手数料率（カード手数料）。暫定値0、実数は後日設定
  has_variety_detail BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0
);

INSERT INTO channels (code, name, has_variety_detail, sort_order) VALUES
  ('d2c', 'D2C（ネット通販）', true, 1),
  ('wholesale', '卸', true, 2),
  ('farmstand', '産直市場', false, 3),
  ('market', '市場出荷', false, 4),
  ('event', 'イベント・直売', false, 5);

-- ============================================================
-- sales_facts（中核テーブル）
-- ============================================================

CREATE TABLE sales_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date DATE NOT NULL,                -- 納品日基準（orders.delivery_date）
  fiscal_year INTEGER NOT NULL,           -- 期（9月開始・8月決算）。src/lib/fiscal-year.ts で算出
  fiscal_month TEXT NOT NULL,             -- 暦月 'YYYY-MM'
  channel_code TEXT NOT NULL REFERENCES channels(code),
  product_id UUID REFERENCES products(id),
  variety_label TEXT,                     -- 品種名スナップショット。不明な場合は '不明'
  quantity_kg NUMERIC,                    -- products.weight_kg_per_unit が無い品目は NULL（推測換算しない）
  quantity_raw NUMERIC,
  unit TEXT,
  order_status TEXT,                      -- 取込元 orders.status のスナップショット（pending/shipped/done等）。status別内訳の集計用
  gross_sales_incl_tax INTEGER NOT NULL DEFAULT 0,  -- 税込。柑橘8%・送料10%混在のため一律の税抜換算はしない（会計突合フェーズで税率マスタと実装）
  shipping_revenue INTEGER NOT NULL DEFAULT 0,      -- 税込。order_shipping の注文合計額を gross_sales_incl_tax 比で品種行に按分
  shipping_cost INTEGER NOT NULL DEFAULT 0,         -- ヤマト等への支払実送料。DB内に実データが無いため当面 0（is_estimated=true）
  material_cost INTEGER NOT NULL DEFAULT 0,         -- 箱の資材原価。shipping_box_templates.cost は顧客請求送料であり資材原価ではないため当面 0（is_estimated=true）
  commission INTEGER NOT NULL DEFAULT 0,
  purchase_cost INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL,              -- order_system / colorme_csv / manual
  source_ref TEXT,
  is_estimated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN sales_facts.gross_sales_incl_tax IS
  '税込金額。柑橘8%・送料10%が混在するため一律の税抜換算はしない。税抜化は会計突合フェーズで税率マスタと共に実装する。';
COMMENT ON COLUMN sales_facts.shipping_cost IS
  'ヤマト等への支払実送料。現行DBに実費データが無いため0固定・is_estimated=trueで運用する。概算値は入れない。';
COMMENT ON COLUMN sales_facts.material_cost IS
  '箱の資材原価。shipping_box_templates.cost は顧客請求送料であり資材原価ではないため使用しない。0固定・is_estimated=trueで運用する。資材原価マスタは後日追加。';

CREATE UNIQUE INDEX sales_facts_source_uniq
  ON sales_facts (source_type, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX sales_facts_month_channel
  ON sales_facts (fiscal_month, channel_code);

CREATE INDEX sales_facts_status
  ON sales_facts (order_status);

CREATE TRIGGER update_sales_facts_updated_at
  BEFORE UPDATE ON sales_facts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- product_mappings（品種の名寄せ）
-- ============================================================

CREATE TABLE product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,              -- 'colorme_csv' など
  source_name TEXT NOT NULL,              -- 外部システム側の商品名
  product_id UUID REFERENCES products(id),
  kg_per_unit NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_type, source_name)
);

-- ============================================================
-- RLS：分析用の内部データのため、既存の「SELECT誰でも可」より厳格に
-- service_role のみ全操作可とする（他テーブルの慣例より制限を強めた変更点）
-- ============================================================

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "サービスロールは全操作可能 channels"
  ON channels FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE sales_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "サービスロールは全操作可能 sales_facts"
  ON sales_facts FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE product_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "サービスロールは全操作可能 product_mappings"
  ON product_mappings FOR ALL
  USING (auth.role() = 'service_role');

SELECT 'sales_facts / channels / product_mappings tables created' AS result;

COMMIT;
