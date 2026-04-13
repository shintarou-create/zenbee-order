'use client'

import { useState, useEffect } from 'react'
import type { LiffProfile } from '@/types'

interface UseLiffReturn {
  userId: string | null
  displayName: string | null
  pictureUrl: string | null
  isLoading: boolean
  error: string | null
  isLoggedIn: boolean
}

export function useLiff(): UseLiffReturn {
  const [userId, setUserId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [pictureUrl, setPictureUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function initializeLiff() {
      try {
        // 開発環境はLIFF認証をスキップし、仮ユーザーでログイン済みにする
        if (process.env.NODE_ENV === 'development') {
          if (mounted) {
            setUserId('dev_user_001')
            setDisplayName('開発テスト顧客')
            setIsLoading(false)
          }
          return
        }

        if (!process.env.NEXT_PUBLIC_LIFF_ID) {
          throw new Error('LIFF ID が設定されていません')
        }

        const liffModule = await import('@line/liff')
        const liff = liffModule.default

        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID })

        if (!liff.isLoggedIn()) {
          // LINEログインにリダイレクト
          liff.login()
          return
        }

        const profile: LiffProfile = await liff.getProfile()

        if (mounted) {
          setUserId(profile.userId)
          setDisplayName(profile.displayName)
          setPictureUrl(profile.pictureUrl || null)
          setIsLoading(false)
        }
      } catch (err) {
        console.error('LIFF 初期化エラー:', err)
        if (mounted) {
          setError(err instanceof Error ? err.message : 'LIFF の初期化に失敗しました')
          setIsLoading(false)
        }
      }
    }

    initializeLiff()

    return () => {
      mounted = false
    }
  }, [])

  return {
    userId,
    displayName,
    pictureUrl,
    isLoading,
    error,
    isLoggedIn: !!userId,
  }
}
