-- 025_migrate_existing_to_restaurant.sql
-- 既存の取引先・注文・商品を業態「飲食店」に一括設定する移行SQL。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
-- 024_business_types.sql の実行後、アプリのデプロイ前に実行すること。
--
-- 2026-10-13 時点の想定件数（実行前の読み取りで確認済み）:
--   companies 211社（すべて approval_status='approved'。うち1社は is_active=false）
--   products  34品（有効16品・無効18品）
--   orders    全件（キャンセル含む。過去の売上はすべて飲食店として集計される）

-- ============================================================
-- 0. バックアップ（移行前の状態を保存。不要になったら DROP TABLE で削除）
-- ============================================================
CREATE TABLE _backup_20261013_companies AS SELECT * FROM companies;
CREATE TABLE _backup_20261013_orders AS SELECT id, company_id, status, total_amount, delivery_date FROM orders;
ALTER TABLE _backup_20261013_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE _backup_20261013_orders ENABLE ROW LEVEL SECURITY;

BEGIN;

-- ============================================================
-- 1. 取引先: 業態未設定の承認済み取引先を「飲食店」にする
--    （申込中 pending・却下 rejected は対象外。承認時に業態を選ぶ）
--    状態（approval_status / is_active）は変更しない。
-- ============================================================
UPDATE companies
SET business_type_id = (SELECT id FROM business_types WHERE name = '飲食店')
WHERE business_type_id IS NULL
  AND approval_status = 'approved';

-- ============================================================
-- 2. 注文: 既存の注文すべてを「飲食店」にする（売上分析の業態別集計用）
-- ============================================================
UPDATE orders
SET business_type_id = (SELECT id FROM business_types WHERE name = '飲食店')
WHERE business_type_id IS NULL;

-- ============================================================
-- 3. 商品: 既存の商品すべてを「飲食店」に紐づける（無効な商品も含む。
--    再び有効にしたときに飲食店に表示されるようにするため）
-- ============================================================
INSERT INTO business_type_products (business_type_id, product_id)
SELECT bt.id, p.id
FROM products p
CROSS JOIN (SELECT id FROM business_types WHERE name = '飲食店') bt
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- 確認用
-- ============================================================
-- 業態別の取引先数（飲食店 211 / 未設定 0 になる想定）
--   SELECT COALESCE(bt.name, '未設定') AS 業態, COUNT(*)
--   FROM companies c LEFT JOIN business_types bt ON bt.id = c.business_type_id
--   GROUP BY 1 ORDER BY 1;
--
-- 業態未設定の注文（0件になる想定）
--   SELECT COUNT(*) FROM orders WHERE business_type_id IS NULL;
--
-- 飲食店に紐づく商品数（34 になる想定）
--   SELECT COUNT(*) FROM business_type_products btp
--   JOIN business_types bt ON bt.id = btp.business_type_id WHERE bt.name = '飲食店';
--
-- 代表的な取引先の確認（例: 丸田屋）
--   SELECT c.company_name, c.approval_status, c.is_active, bt.name
--   FROM companies c LEFT JOIN business_types bt ON bt.id = c.business_type_id
--   WHERE c.company_name = '丸田屋';
--
-- 戻し方（問題があった場合）:
--   UPDATE companies SET business_type_id = NULL;
--   UPDATE orders SET business_type_id = NULL;
--   DELETE FROM business_type_products;
