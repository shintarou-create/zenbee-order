'use client'

// Singleton promise — ensures liff.init() runs exactly once per page session
// even if ensureLiffReady() is called concurrently from multiple components
let liffInitPromise: Promise<void> | null = null

export async function ensureLiffReady(): Promise<typeof import('@line/liff').default | null> {
  if (typeof window === 'undefined') return null

  const liffModule = await import('@line/liff')
  const liff = liffModule.default

  if (!liffInitPromise) {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID
    if (!liffId) return null
    liffInitPromise = liff.init({ liffId })
  }
  await liffInitPromise

  if (!liff.isLoggedIn()) {
    liff.login()
    return null
  }

  return liff
}
