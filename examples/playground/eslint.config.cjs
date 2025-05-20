const baseConfig = require('../../eslint.config.cjs');

module.exports = [
  ...baseConfig,
  {
    ignores: ['.next/**', 'supabase/functions', 'supabase/functions/**/*'],
  },
];
