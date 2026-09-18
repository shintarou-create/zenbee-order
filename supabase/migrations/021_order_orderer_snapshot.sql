-- 021_order_orderer_snapshot.sql
-- 発注担当者のスナップショット保存。line_users.display_name は後から変わりうるため、
-- 注文時点の名前を確定情報として orders に保存する（自由入力欄は設けない。
-- LINEログイン中のユーザーの display_name をそのまま使う）。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
--
-- ordered_by_line_user_id: 発注した line_users.id への参照。line_users が削除されても
--   過去注文自体は残したいため ON DELETE SET NULL（会社削除等の連鎖は発生しない設計）。
-- ordered_by_display_name: 発注時点の line_users.display_name のスナップショット。
--   後から display_name が変わっても過去注文の表示は変わらない。
-- 管理画面からの手動注文（api/admin/orders）や既存の過去注文は両方NULLのまま
-- （担当者不明としてアプリ側でフォールバック表示する）。

ALTER TABLE orders
  ADD COLUMN ordered_by_line_user_id uuid REFERENCES line_users(id) ON DELETE SET NULL,
  ADD COLUMN ordered_by_display_name text;

COMMENT ON COLUMN orders.ordered_by_line_user_id IS
  '発注した line_users.id（LINEログイン中のユーザー）。管理画面からの手動注文・既存の過去注文はNULL。';
COMMENT ON COLUMN orders.ordered_by_display_name IS
  '発注時点の line_users.display_name のスナップショット。後から名前が変わっても過去注文の表示は変わらない。';
