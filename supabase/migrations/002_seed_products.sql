-- 善兵衛農園 実際の取引データに基づく商品マスタ
-- 公式ライン発注スプシ（2025年実績）から生成

-- ============================================================
-- 既存サンプルデータを削除
-- ============================================================
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM inventory;
DELETE FROM product_prices;
DELETE FROM products;

-- ============================================================
-- 商品マスタ INSERT
-- ============================================================
INSERT INTO products (name, category, unit, min_order_qty, max_order_qty, step_qty, cool_type, is_seasonal, season_start, season_end, sort_order, description) VALUES

-- みかん系
('ゆら早生',       'みかん', 'kg', 5, 200, 1, 0, true,  '10-01', '11-30', 10, '有田ゆら地区産の極早生みかん'),
('向山温州',       'みかん', 'kg', 5, 200, 1, 0, true,  '11-01', '01-31', 20, '向山地区産の有田みかん'),
('爽涼みかん',     'みかん', 'kg', 5, 200, 1, 0, true,  '11-01', '02-28', 30, '冷蔵熟成の濃厚な有田みかん'),
('紅みかん',       'みかん', 'kg', 5, 200, 1, 0, true,  '12-01', '02-28', 40, '甘みが凝縮した赤みの強いみかん'),
('あすみ',         'みかん', 'kg', 5, 200, 1, 0, true,  '01-01', '03-31', 50, '清見×興津の交配種、濃厚な甘さ'),
('せとか',         'みかん', 'kg', 5, 200, 1, 0, true,  '02-01', '03-31', 60, '柑橘の大トロと呼ばれる高糖度品種'),
('麗紅',           'みかん', 'kg', 5, 200, 1, 0, true,  '02-01', '03-31', 70, '果汁豊富で甘みと酸味のバランスが良い'),
('黄金柑',         'みかん', 'kg', 5, 200, 1, 0, true,  '03-01', '04-30', 80, '黄色い小粒みかん、香りが豊か'),

-- レモン系
('レモン',         'レモン', 'kg', 5, 200, 1, 0, true,  '09-01', '03-31', 110, '農薬不使用の国産レモン、皮まで使える'),
('ベルガモット',   'レモン', 'kg', 3, 100, 1, 0, true,  '01-01', '03-31', 120, '紅茶の香り付けで知られる希少柑橘'),

-- 柑橘その他
('清見',           '柑橘',   'kg', 5, 200, 1, 0, true,  '03-01', '05-31', 210, 'みかんとオレンジの交配、濃厚な甘さ'),
('三宝柑',         '柑橘',   'kg', 3, 100, 1, 0, true,  '03-01', '05-31', 220, '和歌山原産の希少な和柑橘'),
('八朔',           '柑橘',   'kg', 5, 200, 1, 0, true,  '02-01', '04-30', 230, '爽やかな苦みと甘みのバランスが特徴'),
('紅八朔',         '柑橘',   'kg', 5, 200, 1, 0, true,  '02-01', '04-30', 240, '八朔の高品質品種、糖度が高い'),
('甘夏',           '柑橘',   'kg', 5, 200, 1, 0, true,  '03-01', '06-30', 250, 'さっぱりした甘みと適度な酸味'),
('バレンシア',     '柑橘',   'kg', 5, 200, 1, 0, true,  '06-01', '08-31', 260, '夏のジュース向け柑橘、フレッシュな酸味'),

-- びわ（冷蔵）
('涼風びわ',       'びわ',   '個', 1,  50, 1, 2, true,  '05-01', '06-30', 310, '和歌山産の甘くとろけるびわ（1箱）'),
('加工用びわ',     'びわ',   'kg', 3,  50, 1, 2, true,  '05-01', '06-30', 320, '加工・料理用びわ、まとめ買いに最適'),

-- ジュース（通年）
('みかんJ180ml',   'ジュース', '個', 6, 500, 6, 0, false, NULL, NULL, 410, '有田みかん100%無添加ジュース（180ml）'),
('みかんJ720ml',   'ジュース', '個', 6, 300, 6, 0, false, NULL, NULL, 420, '有田みかん100%無添加ジュース（720ml）'),
('八朔J180ml',     'ジュース', '個', 6, 500, 6, 0, false, NULL, NULL, 430, '八朔100%無添加ジュース（180ml）'),
('八朔J720ml',     'ジュース', '個', 6, 300, 6, 0, false, NULL, NULL, 440, '八朔100%無添加ジュース（720ml）'),
('清見J180ml',     'ジュース', '個', 6, 500, 6, 0, false, NULL, NULL, 450, '清見100%無添加ジュース（180ml）'),
('清見J720ml',     'ジュース', '個', 6, 300, 6, 0, false, NULL, NULL, 460, '清見100%無添加ジュース（720ml）');

-- ============================================================
-- 価格 INSERT（standard / premium / vip）
-- ============================================================
-- ゆら早生
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 700 FROM products WHERE name = 'ゆら早生';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  650 FROM products WHERE name = 'ゆら早生';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      600 FROM products WHERE name = 'ゆら早生';

-- 向山温州
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 700 FROM products WHERE name = '向山温州';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  650 FROM products WHERE name = '向山温州';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      550 FROM products WHERE name = '向山温州';

-- 爽涼みかん
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 800 FROM products WHERE name = '爽涼みかん';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  750 FROM products WHERE name = '爽涼みかん';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      700 FROM products WHERE name = '爽涼みかん';

-- 紅みかん
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 800 FROM products WHERE name = '紅みかん';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  750 FROM products WHERE name = '紅みかん';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      700 FROM products WHERE name = '紅みかん';

-- あすみ
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 800 FROM products WHERE name = 'あすみ';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  750 FROM products WHERE name = 'あすみ';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      700 FROM products WHERE name = 'あすみ';

-- せとか
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 800 FROM products WHERE name = 'せとか';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  750 FROM products WHERE name = 'せとか';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      700 FROM products WHERE name = 'せとか';

-- 麗紅
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 700 FROM products WHERE name = '麗紅';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  650 FROM products WHERE name = '麗紅';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      600 FROM products WHERE name = '麗紅';

-- 黄金柑
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 800 FROM products WHERE name = '黄金柑';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  750 FROM products WHERE name = '黄金柑';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      700 FROM products WHERE name = '黄金柑';

-- レモン
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 600 FROM products WHERE name = 'レモン';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  550 FROM products WHERE name = 'レモン';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      500 FROM products WHERE name = 'レモン';

-- ベルガモット
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 1200 FROM products WHERE name = 'ベルガモット';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  1000 FROM products WHERE name = 'ベルガモット';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',       800 FROM products WHERE name = 'ベルガモット';

-- 清見
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 600 FROM products WHERE name = '清見';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  550 FROM products WHERE name = '清見';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      500 FROM products WHERE name = '清見';

-- 三宝柑
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 600 FROM products WHERE name = '三宝柑';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  550 FROM products WHERE name = '三宝柑';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      500 FROM products WHERE name = '三宝柑';

-- 八朔
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 600 FROM products WHERE name = '八朔';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  550 FROM products WHERE name = '八朔';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      500 FROM products WHERE name = '八朔';

-- 紅八朔
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 600 FROM products WHERE name = '紅八朔';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  550 FROM products WHERE name = '紅八朔';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      500 FROM products WHERE name = '紅八朔';

-- 甘夏
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 500 FROM products WHERE name = '甘夏';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  460 FROM products WHERE name = '甘夏';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      420 FROM products WHERE name = '甘夏';

-- バレンシア
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 650 FROM products WHERE name = 'バレンシア';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  600 FROM products WHERE name = 'バレンシア';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      550 FROM products WHERE name = 'バレンシア';

-- 涼風びわ
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 650 FROM products WHERE name = '涼風びわ';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  550 FROM products WHERE name = '涼風びわ';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      450 FROM products WHERE name = '涼風びわ';

-- 加工用びわ
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 1000 FROM products WHERE name = '加工用びわ';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',   800 FROM products WHERE name = '加工用びわ';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',       600 FROM products WHERE name = '加工用びわ';

-- みかんJ180ml
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 340 FROM products WHERE name = 'みかんJ180ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  310 FROM products WHERE name = 'みかんJ180ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      290 FROM products WHERE name = 'みかんJ180ml';

-- みかんJ720ml
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 1440 FROM products WHERE name = 'みかんJ720ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  1240 FROM products WHERE name = 'みかんJ720ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      1220 FROM products WHERE name = 'みかんJ720ml';

-- 八朔J180ml
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 372 FROM products WHERE name = '八朔J180ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  340 FROM products WHERE name = '八朔J180ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      310 FROM products WHERE name = '八朔J180ml';

-- 八朔J720ml
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 1440 FROM products WHERE name = '八朔J720ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  1240 FROM products WHERE name = '八朔J720ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      1220 FROM products WHERE name = '八朔J720ml';

-- 清見J180ml
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 310 FROM products WHERE name = '清見J180ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  290 FROM products WHERE name = '清見J180ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      270 FROM products WHERE name = '清見J180ml';

-- 清見J720ml
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'standard', 1440 FROM products WHERE name = '清見J720ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'premium',  1240 FROM products WHERE name = '清見J720ml';
INSERT INTO product_prices (product_id, price_rank, price_per_unit) SELECT id, 'vip',      1240 FROM products WHERE name = '清見J720ml';

-- ============================================================
-- 在庫 INSERT（初期値0、管理画面から手動入力）
-- ============================================================
INSERT INTO inventory (product_id, available_qty, reserved_qty)
SELECT id, 0, 0 FROM products;
