import type { NextConfig } from 'next';
import { withPlausibleProxy } from 'next-plausible';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ['@pgflow/client', '@pgflow/core', '@pgflow/dsl'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@pgflow/client': path.resolve(__dirname, '../../pkgs/client/dist'),
      '@pgflow/core': path.resolve(__dirname, '../../pkgs/core/dist'),
      '@pgflow/dsl': path.resolve(__dirname, '../../pkgs/dsl/dist'),
    };
    return config;
  },
};

export default withPlausibleProxy()(nextConfig);
