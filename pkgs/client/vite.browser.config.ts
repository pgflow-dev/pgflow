/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/pkgs/client',
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PgflowClient',  // Global variable: window.PgflowClient
      formats: ['iife'],
      fileName: () => 'pgflow-client.browser.js'
    },
    rollupOptions: {
      // Bundle ALL dependencies for standalone use
      external: [],
    },
    outDir: 'dist',
    minify: false,  // Default to no minification for development
    sourcemap: true,
    emptyOutDir: false,  // Don't empty the directory to preserve library build
  }
});