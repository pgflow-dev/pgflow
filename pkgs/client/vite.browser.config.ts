/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/pkgs/client',
  build: {
    lib: {
      entry: resolve(__dirname, 'src/browser.ts'),
      name: 'pgflow',  // Global variable: window.pgflow
      formats: ['iife'],
      fileName: () => 'pgflow-client.browser.js'
    },
    rollupOptions: {
      // Bundle ALL dependencies for standalone use
      external: [],
    },
    outDir: 'dist',
    minify: 'terser',  // Always minify browser bundle
    sourcemap: true,
    emptyOutDir: false,  // Don't empty the directory to preserve library build
  }
});