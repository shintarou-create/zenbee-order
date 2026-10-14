import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// サーバー側の Supabase 問い合わせは、Next.js の fetch キャッシュ（Data Cache）を使わない。
// Next.js 14 は Route Handler 内の GET の fetch をキャッシュすることがあり、実際に商品カタログの
// 問い合わせ結果が revalidate=1年 で保存され、商品の変更がプレビュー等に反映されなかった
// （route の `export const dynamic = 'force-dynamic'` だけでは防げていなかった）。
// DBの最新値を常に読むため、Supabase クライアントの fetch に cache: 'no-store' を必ず付ける。
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' })

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: noStoreFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component からの呼び出しでは cookie の設定を無視
          }
        },
      },
    }
  )
}

export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: { fetch: noStoreFetch },
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}
