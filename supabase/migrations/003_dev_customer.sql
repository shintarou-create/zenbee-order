-- 開発用テスト顧客（ローカル動作確認用）
-- line_user_id = 'dev_user_001' で自動ログイン状態になる

INSERT INTO customers (
  line_user_id,
  company_name,
  representative_name,
  postal_code,
  prefecture,
  city,
  address,
  phone,
  email,
  price_rank,
  is_active
) VALUES (
  'dev_user_001',
  'テスト食堂（開発用）',
  '開発 太郎',
  '543-0001',
  '大阪府',
  '大阪市天王寺区',
  '上本町1-1-1',
  '06-1234-5678',
  'dev@example.com',
  'standard',
  true
)
ON CONFLICT (line_user_id) DO NOTHING;
