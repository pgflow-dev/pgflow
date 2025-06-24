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
      tsConfigFilePath: resolve(__dirname, 'tsconfig.lib.json'),
      skipDiagnostics: true  // Skip TypeScript diagnostics to avoid vite-plugin-dts errors with monorepo project references. 
                             // The plugin tries to compile all imported files (including from other packages) 
                             // which breaks rootDir boundaries. Nx runs proper type checking separately.
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
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/pkgs/client',
      provider: 'v8',
    },
  },
});
