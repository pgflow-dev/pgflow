import type { NextConfig } from 'next';
import { withPlausibleProxy } from 'next-plausible';

const nextConfig: NextConfig = {};

export default withPlausibleProxy()(nextConfig);
