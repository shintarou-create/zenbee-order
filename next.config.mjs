/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // webpack バンドル外で読み込むサーバー専用パッケージ:
    // - iconv-lite: Shift_JIS エンコードテーブル
    // - @sparticuz/chromium / puppeteer-core: chromium バイナリをバンドルすると
    //   本番(Vercel)で ENOENT になるため必ず external にする
    serverComponentsExternalPackages: ['iconv-lite', '@sparticuz/chromium', 'puppeteer-core'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'profile.line-scdn.net',
      },
      {
        protocol: 'https',
        hostname: 'cczywqsmxnzziulanwqy.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // LIFF の外部スクリプト許可
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ]
  },
}

export default nextConfig
