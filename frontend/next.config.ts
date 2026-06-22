import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    // Required for Next.js 15 server actions
  },
};

export default nextConfig;
