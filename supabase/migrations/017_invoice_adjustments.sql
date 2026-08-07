-- 017_invoice_adjustments.sql
-- 請求書の調整行（後から追加する任意の項目・金額）。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
--
-- 用途例：前回請求の振込差額を今回の請求書に合算する等。注文由来の明細（invoice_items /
-- order_items）は一切変更しない。amount は税込・マイナス可（値引き・過払い返金に対応）。

CREATE TABLE invoice_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  tax_rate TEXT NOT NULL DEFAULT '8' CHECK (tax_rate IN ('8', '10', '0')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoice_adjustments_invoice_id ON invoice_adjustments(invoice_id);

-- invoice_adjustments RLS
ALTER TABLE invoice_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "請求書調整行は誰でも参照可能"
  ON invoice_adjustments FOR SELECT
  USING (true);

CREATE POLICY "サービスロールは全操作可能 invoice_adjustments"
  ON invoice_adjustments FOR ALL
  USING (auth.role() = 'service_role');
