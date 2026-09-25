-- 022_order_notes_replied_at.sql
-- 注文の備考（orders.notes）への「要返信／返信済み」管理。
-- notes_replied_at が NULL かつ notes あり = 要返信、NOT NULL = 返信済み扱い。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。
--
-- 初期値backfill方針：
--   備考(notes)があり、かつステータスが「発送済み以降」（shipped または done）の注文は、
--   既に対応済みとみなして notes_replied_at = COALESCE(updated_at, created_at) で返信済み扱いにする。
--   未発送（pending）・キャンセル済み（cancelled）や、備考が無い注文は NULL のまま（対象外）。

BEGIN;

ALTER TABLE orders
  ADD COLUMN notes_replied_at timestamptz NULL;

COMMENT ON COLUMN orders.notes_replied_at IS
  '備考(notes)への返信対応が完了した日時。NULL=未対応（備考ありなら「要返信」）。';

UPDATE orders
SET notes_replied_at = COALESCE(updated_at, created_at)
WHERE notes IS NOT NULL
  AND btrim(notes) <> ''
  AND status IN ('shipped', 'done');

COMMIT;
