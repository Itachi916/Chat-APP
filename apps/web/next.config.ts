import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SERVER_URL: 'http://localhost:4000',
  },
  // Optimize compilation speed
  experimental: {
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },
  // Enable SWC minification for faster builds
  swcMinify: true,
  // Optimize bundle splitting
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Split vendor chunks for better caching
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
          firebase: {
            test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/,
            name: 'firebase',
            chunks: 'all',
            priority: 20,
          },
          socket: {
            test: /[\\/]node_modules[\\/]socket\.io-client[\\/]/,
            name: 'socket',
            chunks: 'all',
            priority: 20,
          },
        },
      };
    }
    return config;
  },
  // Enable static optimization
  output: 'standalone',
};

export default nextConfig;
