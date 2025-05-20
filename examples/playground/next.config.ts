import type { NextConfig } from 'next';
import { withPlausibleProxy } from 'next-plausible';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    tsconfigPath: 'tsconfig.build.json'
  }
};

export default withPlausibleProxy()(nextConfig);
