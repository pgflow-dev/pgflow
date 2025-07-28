import type { NextConfig } from 'next';
import { composePlugins, withNx } from '@nx/next';
import { withPlausibleProxy } from 'next-plausible';

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ['@pgflow/client', '@pgflow/dsl'],
  nx: {
    svgr: false, // Disable deprecated SVGR support
  },
  webpack: (config, { isServer }) => {
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

// Compose plugins properly - withNx handles workspace library resolution
export default composePlugins(
  withNx,
  withPlausibleProxy()
)(nextConfig);