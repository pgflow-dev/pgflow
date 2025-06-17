/// <reference types='vitest' />
import { defineConfig } from 'vite';
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
      compilerOptions: {
        declaration: true,
        emitDeclarationOnly: true,
        skipLibCheck: true
      }
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PgflowClient',
      fileName: (format) => format === 'cjs' ? 'index.cjs' : 'index.js',
      // Generate both .js (ES) and .cjs (CommonJS) files
      formats: ['es', 'cjs']
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
