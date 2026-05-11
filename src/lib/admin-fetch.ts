async function getAccessToken(): Promise<string | null> {
  try {
    const liffModule = await import('@line/liff')
    return liffModule.default.getAccessToken()
  } catch {
    return null
  }
}

export async function adminFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(input, { ...init, headers })
}
