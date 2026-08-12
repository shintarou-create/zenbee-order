-- 019_sales_facts_source_uniq_fix.sql
-- 018で作成した sales_facts_source_uniq が部分ユニークインデックス（WHERE source_ref IS NOT NULL）
-- のため、バッチの upsert(... onConflict: 'source_type,source_ref') が発行する
-- ON CONFLICT (source_type, source_ref) にマッチせず失敗する（Postgresは部分インデックスに
-- ON CONFLICTでマッチさせるにはWHERE句も含めて指定する必要があるが、PostgREST/supabase-jsの
-- upsertはWHERE句を指定できない）。
--
-- UNIQUE制約はNULL同士を別値として扱うため、そもそも部分インデックスにする必要はなかった。
-- 通常のUNIQUE制約に置き換える（source_refがNULLの行は従来通り重複可能）。
-- 信太郎が手動でSupabase Studioに実行する（このファイルはアプリからは実行しない・記録用）。

BEGIN;

DROP INDEX IF EXISTS sales_facts_source_uniq;

ALTER TABLE sales_facts
  ADD CONSTRAINT sales_facts_source_uniq UNIQUE (source_type, source_ref);

COMMIT;
