/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

// Separate config for type tests - NO global setup needed
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/pkgs/client',
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: [
      '__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    // NO setupFiles or globalSetup - type tests don't need runtime setup
    typecheck: {
      enabled: true,
    },
    reporters: ['default'],
  },
});
