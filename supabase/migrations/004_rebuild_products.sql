-- 善兵衛農園 商品マスタ全削除＆24品目で再構築
-- 柑橘15品目 / びわ2品目 / ジュース6品目 / その他1品目

-- ============================================================
-- 依存関係順に全削除（外部キー制約考慮）
-- ============================================================
DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM inventory;
DELETE FROM product_prices;
DELETE FROM products;

-- ============================================================
-- 商品マスタ INSERT（24品目）
-- ============================================================
INSERT INTO products (name, category, unit, min_order_qty, max_order_qty, step_qty, cool_type, is_seasonal, season_start, season_end, sort_order, description) VALUES

-- 柑橘15品目（kg単価）
('レモン',               '柑橘', 'kg',   5,    200, 1,  0, true,  '09-01', '03-31',  10, '農薬不使用の国産レモン、皮まで使える'),
('三宝柑',               '柑橘', 'kg',   3,    100, 1,  0, true,  '03-01', '05-31',  20, '和歌山原産の希少な和柑橘'),
('清見',                 '柑橘', 'kg',   5,    200, 1,  0, true,  '03-01', '05-31',  30, 'みかんとオレンジの交配、濃厚な甘さ'),
('甘夏',                 '柑橘', 'kg',   5,    200, 1,  0, true,  '03-01', '06-30',  40, 'さっぱりした甘みと適度な酸味'),
('バレンシア',           '柑橘', 'kg',   5,    200, 1,  0, true,  '06-01', '08-31',  50, '夏のジュース向け柑橘、フレッシュな酸味'),
('向山温州',             '柑橘', 'kg',   5,    200, 1,  0, true,  '11-01', '01-31',  60, '向山地区産の有田みかん'),
('爽涼みかん',           '柑橘', 'kg',   5,    200, 1,  0, true,  '11-01', '02-28',  70, '冷蔵熟成の濃厚な有田みかん'),
('ゆら早生',             '柑橘', 'kg',   5,    200, 1,  0, true,  '10-01', '11-30',  80, '有田ゆら地区産の極早生みかん'),
('あすみ',               '柑橘', 'kg',   5,    200, 1,  0, true,  '01-01', '03-31',  90, '清見×興津の交配種、濃厚な甘さ'),
('黄金柑',               '柑橘', 'kg',   5,    200, 1,  0, true,  '03-01', '04-30', 100, '黄色い小粒みかん、香りが豊か'),
('麗紅',                 '柑橘', 'kg',   5,    200, 1,  0, true,  '02-01', '03-31', 110, '果汁豊富で甘みと酸味のバランスが良い'),
('紅みかん',             '柑橘', 'kg',   5,    200, 1,  0, true,  '12-01', '02-28', 120, '甘みが凝縮した赤みの強いみかん'),
('紅八朔',               '柑橘', 'kg',   5,    200, 1,  0, true,  '02-01', '04-30', 130, '八朔の高品質品種、糖度が高い'),
('橙',                   '柑橘', 'kg',   5,    200, 1,  0, true,  '12-01', '02-28', 140, '柚子代わりに使える和柑橘、香り豊か'),
('ベルガモット',         '柑橘', 'kg',   3,    100, 1,  0, true,  '01-01', '03-31', 150, '紅茶の香り付けで知られる希少柑橘'),

-- びわ2品目（パック単価・冷蔵）
('涼風びわ6玉パック',   'びわ', 'パック', 1,   50, 1,  2, true,  '05-01', '06-30', 210, '和歌山産びわ6玉入りパック（冷蔵）'),
('涼風びわ8玉パック',   'びわ', 'パック', 1,   50, 1,  2, true,  '05-01', '06-30', 220, '和歌山産びわ8玉入りパック（冷蔵）'),

-- ジュース6品目（本単価）
('温州みかんジュース720ml', 'ジュース', '本', 24, 300, 1, 0, false, NULL, NULL, 310, '有田みかん100%無添加ジュース（720ml）'),
('温州みかんジュース180ml', 'ジュース', '本', 30, 500, 1, 0, false, NULL, NULL, 320, '有田みかん100%無添加ジュース（180ml）'),
('八朔ジュース720ml',       'ジュース', '本', 24, 300, 1, 0, false, NULL, NULL, 330, '八朔100%無添加ジュース（720ml）'),
('八朔ジュース180ml',       'ジュース', '本', 30, 500, 1, 0, false, NULL, NULL, 340, '八朔100%無添加ジュース（180ml）'),
('清見オレンジジュース720ml', 'ジュース', '本', 24, 300, 1, 0, false, NULL, NULL, 350, '清見100%無添加ジュース（720ml）'),
('清見オレンジジュース180ml', 'ジュース', '本', 30, 500, 1, 0, false, NULL, NULL, 360, '清見100%無添加ジュース（180ml）'),

-- その他1品目
('みかんの葉', 'その他', '枚', 10, 1000, 10, 0, false, NULL, NULL, 410, '飾り・料理用みかんの葉（10枚単位）');

-- ============================================================
-- 価格 INSERT（standardのみ）
-- ============================================================
-- 柑橘15品目
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  800 FROM products WHERE name = 'レモン';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  800 FROM products WHERE name = '三宝柑';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  800 FROM products WHERE name = '清見';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  700 FROM products WHERE name = '甘夏';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  800 FROM products WHERE name = 'バレンシア';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  800 FROM products WHERE name = '向山温州';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  900 FROM products WHERE name = '爽涼みかん';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  800 FROM products WHERE name = 'ゆら早生';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  900 FROM products WHERE name = 'あすみ';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  900 FROM products WHERE name = '黄金柑';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  900 FROM products WHERE name = '麗紅';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  900 FROM products WHERE name = '紅みかん';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  700 FROM products WHERE name = '紅八朔';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  600 FROM products WHERE name = '橙';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 1300 FROM products WHERE name = 'ベルガモット';

-- びわ2品目
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 650 FROM products WHERE name = '涼風びわ6玉パック';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 550 FROM products WHERE name = '涼風びわ8玉パック';

-- ジュース6品目
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 1240 FROM products WHERE name = '温州みかんジュース720ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  372 FROM products WHERE name = '温州みかんジュース180ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 1240 FROM products WHERE name = '八朔ジュース720ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  372 FROM products WHERE name = '八朔ジュース180ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 1240 FROM products WHERE name = '清見オレンジジュース720ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard',  372 FROM products WHERE name = '清見オレンジジュース180ml';

-- その他
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 18 FROM products WHERE name = 'みかんの葉';

-- ============================================================
-- 在庫 INSERT（全品目 available_qty=100 で初期設定）
-- ============================================================
INSERT INTO inventory (product_id, available_qty, reserved_qty)
SELECT id, 100, 0 FROM products;
