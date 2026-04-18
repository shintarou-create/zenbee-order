'use client'

import liff from '@line/liff'
import type { LiffProfile } from '@/types'

let initialized = false

export async function initLiff(): Promise<LiffProfile | null> {
  if (!process.env.NEXT_PUBLIC_LIFF_ID) {
    console.warn('LIFF ID が設定されていません')
    return null
  }

  try {
    if (!initialized) {
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID })
      initialized = true
    }

    if (!liff.isLoggedIn()) {
      liff.login()
      return null
    }

    const profile = await liff.getProfile()
    console.log('[LIFF Profile] userId:', profile.userId, 'displayName:', profile.displayName)
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage,
    }
  } catch (error) {
    console.error('LIFF 初期化エラー:', error)
    throw error
  }
}

export function isLiffInitialized(): boolean {
  return initialized
}

export async function getLiffProfile(): Promise<LiffProfile | null> {
  try {
    if (!initialized || !liff.isLoggedIn()) {
      return null
    }
    const profile = await liff.getProfile()
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage,
    }
  } catch (error) {
    console.error('LIFF プロフィール取得エラー:', error)
    return null
  }
}

export function getLiffAccessToken(): string | null {
  try {
    if (!initialized || !liff.isLoggedIn()) return null
    return liff.getAccessToken()
  } catch {
    return null
  }
}

export function isLiffBrowser(): boolean {
  try {
    return liff.isInClient()
  } catch {
    return false
  }
}

export default liff
