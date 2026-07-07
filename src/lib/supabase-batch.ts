// Supabase(PostgREST) の暗黙1000行上限対策のバッチ取得ヘルパー。
// .limit() を書かなくても1クエリ最大1000行しか返らないため、range で1000件ずつ取得して結合する。

// Supabase のクエリ結果（error は PostgrestError 互換で message を持つ）
type BatchResult<T> = { data: T[] | null; error: { message: string } | null }

const PAGE_SIZE = 1000
const MAX_LOOPS = 100 // 無限ループ保険（最大 100 * 1000 = 10万行）

/**
 * range(from, to) で1000行ずつ全件取得する。
 * makeQuery は毎回「新しいクエリ」を構築して .range(from, to) を適用したものを返すこと
 * （Supabase のクエリビルダは単回使用のため使い回せない）。
 * 各バッチで error を確認し、エラー時は throw する（沈黙失敗を握りつぶさない）。
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<BatchResult<T>>,
): Promise<T[]> {
  const all: T[] = []
  for (let i = 0; i < MAX_LOOPS; i++) {
    const from = i * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await makeQuery(from, to)
    if (error) throw new Error(`fetchAllRows: ${error.message}`)
    const rows = data ?? []
    all.push(...rows)
    // 1000行未満なら最後のページ
    if (rows.length < PAGE_SIZE) return all
  }
  throw new Error(`fetchAllRows: 最大ループ回数(${MAX_LOOPS})を超過しました`)
}

/**
 * ID配列を chunkSize 件ずつに分割し、各チャンクを .in(...) で取得して結合する。
 * .in() のIDリストが巨大になるとURL長制限で壊れるため分割する。
 * 各チャンクのクエリも1000行を超えうるので fetchAllRows と併用する。
 * makeChunkQuery は (chunkIds, from, to) から .in(col, chunkIds).range(from, to) を適用した新規クエリを返すこと。
 */
export async function fetchInChunksByIds<T>(
  ids: string[],
  chunkSize: number,
  makeChunkQuery: (chunkIds: string[], from: number, to: number) => PromiseLike<BatchResult<T>>,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const rows = await fetchAllRows<T>((from, to) => makeChunkQuery(chunk, from, to))
    out.push(...rows)
  }
  return out
}
