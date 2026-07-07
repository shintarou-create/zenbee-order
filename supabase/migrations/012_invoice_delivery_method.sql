-- 012_invoice_delivery_method.sql
-- 請求書の送付方法（取引先ごと）。
-- 既に Supabase Studio 上で適用済み。このファイルは記録用（アプリからは実行しない）。

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS invoice_delivery_method TEXT NOT NULL DEFAULT 'email'
    CHECK (invoice_delivery_method IN ('email', 'postal', 'other'));

-- 「その他」のときの内部メモ用（顧客管理の内部メモ。請求管理画面には表示しない）
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS invoice_delivery_note TEXT;
