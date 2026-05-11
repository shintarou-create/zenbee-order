import { ensureLiffReady } from './liff-client'

export async function adminFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const liff = await ensureLiffReady()
  const token = liff?.getAccessToken() ?? null

  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  return fetch(input, { ...init, headers })
}
