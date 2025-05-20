// Load the parent configuration
const baseConfig = require('../../eslint.config.cjs');

// Export our configuration
module.exports = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'supabase/functions/**/*.ts',
    ],
  },
  ...baseConfig,
];