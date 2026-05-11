-- Migration 010: freee エクスポート履歴テーブル作成
-- ダッシュボードの「先月分 freee CSV 未ダウンロード」リマインド機能で使用

BEGIN;

CREATE TABLE IF NOT EXISTS freee_export_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_year_month text NOT NULL,  -- 'YYYY-MM' or 'custom_YYYY-MM-DD_YYYY-MM-DD'
  exported_at timestamp with time zone NOT NULL DEFAULT now(),
  order_count integer NOT NULL DEFAULT 0,
  exported_by_line_user_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freee_export_log_target_ym
  ON freee_export_log(target_year_month);

SELECT 'freee_export_log table created' AS result;

COMMIT;
