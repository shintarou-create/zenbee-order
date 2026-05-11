-- Migration 009: cool_type 制約に 1（冷蔵）を追加し、びわを正しい値に修正
-- 001_initial_schema.sql では CHECK (cool_type IN (0, 2)) と定義されており
-- cool_type = 1（冷蔵）が保存できなかったため、びわが誤って 2（冷凍）で登録されていた

-- 旧制約を削除
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_cool_type_check;

-- 1（冷蔵）を含む新制約を追加
ALTER TABLE products ADD CONSTRAINT products_cool_type_check CHECK (cool_type IN (0, 1, 2));

-- びわ商品（unit=パック）を正しい冷蔵（1）に更新
UPDATE products SET cool_type = 1 WHERE unit = 'パック';
