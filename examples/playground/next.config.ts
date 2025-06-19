import type { NextConfig } from 'next';
import { withPlausibleProxy } from 'next-plausible';

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ['@pgflow/client', '@pgflow/core', '@pgflow/dsl'],
};

export default withPlausibleProxy()(nextConfig);
