import { NextRequest, NextResponse } from 'next/server'

// In-memory rate limiting store (resets on cold start — sufficient for 83 customers)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs })
    return false
  }
  if (entry.count >= limit) return true
  entry.count++
  return false
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  // Rate limit: admin routes — 60 req/min/IP
  if (pathname.startsWith('/api/admin') || pathname.startsWith('/api/shipping-csv') || pathname.startsWith('/api/freee-csv')) {
    if (isRateLimited(ip, 60, 60_000)) {
      return NextResponse.json({ error: 'リクエストが多すぎます。しばらくお待ちください。' }, { status: 429 })
    }

    // Skip auth in dev
    if (process.env.NODE_ENV === 'development') return NextResponse.next()

    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 })
    }

    // Verify token against LINE profile endpoint
    const token = authHeader.slice(7)
    let lineUserId: string
    try {
      const res = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 })
      }
      const profile = (await res.json()) as { userId: string }
      lineUserId = profile.userId
    } catch {
      return NextResponse.json({ error: '認証サーバーへの接続に失敗しました' }, { status: 503 })
    }

    // Check admin_users via service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const dbRes = await fetch(
      `${supabaseUrl}/rest/v1/admin_users?select=role&line_user_id=eq.${encodeURIComponent(lineUserId)}&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    )
    const rows = (await dbRes.json()) as Array<{ role: string }>
    if (!rows?.[0]?.role) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
    }

    // Forward lineUserId to route handlers so they can log it without re-calling LINE API
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-line-user-id', lineUserId)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Rate limit: customer orders — 10 req/min/IP
  if (pathname === '/api/orders' && req.method === 'POST') {
    if (isRateLimited(ip, 10, 60_000)) {
      return NextResponse.json({ error: 'リクエストが多すぎます。しばらくお待ちください。' }, { status: 429 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/admin/:path*', '/api/shipping-csv', '/api/freee-csv', '/api/orders'],
}
