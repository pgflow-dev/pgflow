/// <reference types='vitest' />
const config = {
  root: __dirname,
  cacheDir: '../../node_modules/.vite/pkgs/client',
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
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      '__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/pkgs/client',
      provider: 'v8',
    },
  },
};

export default config;
