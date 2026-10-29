/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' is for Docker/Railway; Netlify plugin uses its own bundling
  ...(process.env.NETLIFY ? {} : { output: 'standalone' }),
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin', 'bullmq', 'ioredis'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
