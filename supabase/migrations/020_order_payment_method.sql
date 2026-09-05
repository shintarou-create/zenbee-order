-- 020_order_payment_method.sql
-- 注文単位の支払方法（代金引換対応）。信太郎が手動でSupabase Studioに実行する
-- （このファイルはアプリからは実行しない・記録用）。
--
-- invoice（デフォルト・従来通り）: 月末締め請求書払い。
-- cod: 代金引換。ヤマトB2 CSVがコレクト伝票として出力され、月次請求書には載らない
--      （src/app/admin/invoices/page.tsx の未請求注文取得で除外する）。
-- 顧客マスタ（companies）にはフラグを持たせない。同じ客でも注文の回によって変わるため。

ALTER TABLE orders
  ADD COLUMN payment_method text NOT NULL DEFAULT 'invoice'
    CHECK (payment_method IN ('invoice', 'cod')),
  ADD COLUMN cod_fee integer NOT NULL DEFAULT 0
    CHECK (cod_fee >= 0);

COMMENT ON COLUMN orders.payment_method IS 'invoice=月末締め請求書払い（既定） / cod=代金引換';
COMMENT ON COLUMN orders.cod_fee IS '代引き手数料（税込・10%課税）。payment_method=cod のときのみ意味を持つ';
