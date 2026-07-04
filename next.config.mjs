/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // webpack バンドル外で読み込むサーバー専用パッケージ:
    // - iconv-lite: Shift_JIS エンコードテーブル
    // - @sparticuz/chromium-min / puppeteer-core: chromium をバンドルすると
    //   本番(Vercel)で ENOENT / libnss3.so 欠落になるため必ず external にする
    //   （chromium-min は実行時に pack.tar をリモート取得して /tmp に展開する）
    serverComponentsExternalPackages: ['iconv-lite', '@sparticuz/chromium-min', 'puppeteer-core'],
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
