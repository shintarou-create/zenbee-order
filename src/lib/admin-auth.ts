import { createServiceClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/types'

export async function verifyAdmin(req: Request): Promise<AdminRole | null> {
  if (process.env.NODE_ENV === 'development') return 'superadmin'

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null

  let lineUserId: string
  try {
    const res = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const profile = (await res.json()) as { userId: string }
    lineUserId = profile.userId
  } catch {
    return null
  }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('admin_users')
    .select('role')
    .eq('line_user_id', lineUserId)
    .single()

  return (data?.role as AdminRole) ?? null
}
