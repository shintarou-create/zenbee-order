/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // iconv-lite の Shift_JIS エンコードテーブルを webpack バンドル外で読み込む
    serverComponentsExternalPackages: ['iconv-lite'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'profile.line-scdn.net',
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
