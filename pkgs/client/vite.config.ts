/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/pkgs/client',
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      outDir: 'dist',
      rollupTypes: false,  // Don't bundle for now
      insertTypesEntry: true,
      // Don't specify tsConfigFilePath - let the plugin find tsconfig.json naturally
      // This avoids the rootDir issue by not forcing it to use tsconfig.lib.json
      skipDiagnostics: true,  // Skip diagnostics since Nx runs tsc separately
      compilerOptions: {
        // Override composite to false just for declaration generation
        // This allows dts plugin to traverse into dependency packages
        composite: false
      }
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PgflowClient',
      fileName: 'index',
      // Only generate ES module
      formats: ['es']
    },
    rollupOptions: {
      // External dependencies that shouldn't be bundled
      external: [
        '@pgflow/core',
        '@pgflow/dsl',
        '@supabase/supabase-js',
        'nanoevents',
        'uuid'
      ],
      output: {
        // Preserve the existing export structure
        exports: 'named'
      }
    },
    sourcemap: true,
    emptyOutDir: false,  // Don't empty the directory to preserve browser build
  },
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: [
      '__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    setupFiles: ['__tests__/setup.ts'],
    globalSetup: './vitest.global-setup.ts',
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/pkgs/client',
      provider: 'v8',
    },
  },
});
