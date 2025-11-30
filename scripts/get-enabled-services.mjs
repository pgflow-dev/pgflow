#!/usr/bin/env node
// Usage: node scripts/get-enabled-services.mjs <path-to-config.toml>
// Outputs container service names for enabled services (one per line)
// Example output: db, rest, realtime, edge_runtime
// Use these to construct container names: supabase_${service}_${project_id}

import { readFileSync } from 'fs';
import { parse } from '@decimalturn/toml-patch';

// Mapping: config.toml section -> container service name
// Note: config section names don't always match container names
const SERVICE_MAP = {
  'db': 'db',                      // Database
  'api': 'rest',                   // PostgREST (config calls it 'api')
  'realtime': 'realtime',          // Realtime subscriptions
  'edge_runtime': 'edge_runtime',  // Edge Functions runtime
  'studio': 'studio',              // Supabase Studio dashboard
  'inbucket': 'inbucket',          // Email testing
  'storage': 'storage',            // File storage
  'analytics': 'analytics',        // Analytics backend
};

const configPath = process.argv[2];
if (!configPath) {
  console.error('Usage: get-enabled-services.mjs <config.toml>');
  process.exit(1);
}

const toml = readFileSync(configPath, 'utf-8');
const config = parse(toml);

const enabledServices = [];

// Check each service
for (const [configSection, containerName] of Object.entries(SERVICE_MAP)) {
  const serviceConfig = config[configSection];
  // Service is enabled if: section exists AND enabled is not explicitly false
  if (serviceConfig && serviceConfig.enabled !== false) {
    enabledServices.push(containerName);
  }
}

// Check nested db.pooler
if (config.db?.pooler?.enabled === true) {
  enabledServices.push('pooler');
}

// Kong (API gateway) runs if any HTTP service is enabled
const httpServices = ['api', 'studio', 'storage'];
const hasHttpService = httpServices.some(s => config[s]?.enabled !== false && config[s]);
if (hasHttpService) {
  enabledServices.push('kong');
}

// Output one service name per line
enabledServices.forEach(s => console.log(s));
