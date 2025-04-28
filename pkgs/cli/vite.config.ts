/// <reference types='vitest' />
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/pkgs/cli',
  plugins: [],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: [
      '__tests__/**/*.{test,spec,test-d,spec-d}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
    },
    setupFiles: ['vitest.setup.ts'],
  },
});
