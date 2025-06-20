import type { NextConfig } from 'next';
import { withPlausibleProxy } from 'next-plausible';

import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ['@pgflow/client', '@pgflow/core', '@pgflow/dsl'],
  webpack: (config, { isServer }) => {
    // Force @pgflow/client to use the ES module
    config.resolve.alias = {
      ...config.resolve.alias,
      '@pgflow/client$': path.resolve(
        __dirname,
        'node_modules/@pgflow/client/dist/index.js',
      ),
      '@pgflow/dsl$': path.resolve(
        __dirname,
        'node_modules/@pgflow/dsl/dist/index.js',
      ),
    };

    if (!isServer) {
      // Provide fallbacks for Node.js modules that ws tries to use
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        crypto: false,
      };
    }

    return config;
  },
};

export default withPlausibleProxy()(nextConfig);
