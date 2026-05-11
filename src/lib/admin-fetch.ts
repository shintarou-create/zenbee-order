async function getAccessToken(): Promise<string | null> {
  try {
    const liffModule = await import('@line/liff')
    return liffModule.default.getAccessToken()
  } catch {
    return null
  }
}

async function reinitAndGetToken(): Promise<string | null> {
  try {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID
    if (!liffId) return null
    const liffModule = await import('@line/liff')
    const liff = liffModule.default
    // Re-calling init refreshes the access token when the LINE session is still valid
    await liff.init({ liffId })
    if (!liff.isLoggedIn()) return null
    return liff.getAccessToken()
  } catch {
    return null
  }
}

export async function adminFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(input, { ...init, headers })

  // On 401, LIFF token may have expired — re-init to get fresh token and retry once
  if (res.status === 401) {
    const freshToken = await reinitAndGetToken()
    if (freshToken && freshToken !== token) {
      const retryHeaders = new Headers(init.headers)
      retryHeaders.set('Authorization', `Bearer ${freshToken}`)
      return fetch(input, { ...init, headers: retryHeaders })
    }
  }

  return res
}
