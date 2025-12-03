/// <reference types='vitest' />
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vite.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      globalSetup: './vitest.e2e.global-setup.ts',
    },
  })
);
