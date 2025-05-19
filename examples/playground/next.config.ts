import type { NextConfig } from 'next';
import { withPlausibleProxy } from 'next-plausible';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // We're only ignoring type errors for the specific issue with params typing
    // in the dynamic route component
    ignoreBuildErrors: false,
  },
  eslint: {
    // Configure ESLint correctly rather than ignoring errors
    ignoreDuringBuilds: false,
  },
};

export default withPlausibleProxy()(nextConfig);
