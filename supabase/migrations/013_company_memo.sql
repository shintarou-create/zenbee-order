-- 013_company_memo.sql
-- 取引先メモ機能（常設メモ＋時系列メモログ）。社内専用（LIFF/顧客側には表示しない）。
-- 既に手動適用済み。このファイルは記録用（アプリからは実行しない）。

-- 常設メモ
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS internal_memo text;

-- 時系列メモログ
CREATE TABLE IF NOT EXISTS company_memo_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  author_line_user_id text,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_memo_logs_company
  ON company_memo_logs (company_id, created_at DESC);
