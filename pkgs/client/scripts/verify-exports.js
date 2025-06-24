#!/usr/bin/env node

/**
 * Verify that the client package exports are working correctly
 * This script tests both ESM and CJS imports
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

console.log('🔍 Verifying @pgflow/client exports...\n');

// Test ESM import
console.log('Testing ESM import...');
const esmTest = spawn('node', ['--input-type=module', '-e', `
  import { PgflowClient, FlowRun, FlowStep } from '@pgflow/client';
  
  if (typeof PgflowClient !== 'function') {
    throw new Error('PgflowClient is not a function/class');
  }
  
  if (typeof FlowRun !== 'function') {
    throw new Error('FlowRun is not a function/class');
  }
  
  if (typeof FlowStep !== 'function') {
    throw new Error('FlowStep is not a function/class');
  }
  
  console.log('✅ ESM import successful');
  console.log('  - PgflowClient:', typeof PgflowClient);
  console.log('  - FlowRun:', typeof FlowRun);
  console.log('  - FlowStep:', typeof FlowStep);
`], { cwd: packageRoot });

esmTest.stdout.on('data', (data) => {
  process.stdout.write(data);
});

esmTest.stderr.on('data', (data) => {
  process.stderr.write(data);
});

esmTest.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ ESM import test failed');
    process.exit(1);
  }
  
  // Test CJS require (expected to fail with nanoevents ESM dependency)
  console.log('\nTesting CJS require...');
  const cjsTest = spawn('node', ['-e', `
    try {
      const { PgflowClient, FlowRun, FlowStep } = require('@pgflow/client');
      console.log('✅ CJS require successful');
      console.log('  - PgflowClient:', typeof PgflowClient);
      console.log('  - FlowRun:', typeof FlowRun);
      console.log('  - FlowStep:', typeof FlowStep);
    } catch (err) {
      if (err.code === 'ERR_REQUIRE_ESM') {
        console.log('⚠️  CJS require failed with ERR_REQUIRE_ESM');
        console.log('   This is expected due to ESM-only dependencies (nanoevents)');
        console.log('   Next.js and other bundlers should handle this correctly');
      } else {
        throw err;
      }
    }
  `], { cwd: packageRoot });
  
  cjsTest.stdout.on('data', (data) => {
    process.stdout.write(data);
  });
  
  cjsTest.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
  
  cjsTest.on('close', (code) => {
    console.log('\n✅ Export verification complete');
    
    // Test browser bundle
    console.log('\nTesting browser bundle...');
    const browserTest = spawn('node', ['-e', `
      const fs = require('fs');
      const path = require('path');
      
      const browserBundlePath = path.join('${packageRoot}', 'dist', 'pgflow-client.browser.js');
      
      if (fs.existsSync(browserBundlePath)) {
        const stats = fs.statSync(browserBundlePath);
        console.log('✅ Browser bundle exists');
        console.log('  - Path:', browserBundlePath);
        console.log('  - Size:', (stats.size / 1024).toFixed(2), 'KB');
      } else {
        console.error('❌ Browser bundle not found at:', browserBundlePath);
        process.exit(1);
      }
    `], { cwd: packageRoot });
    
    browserTest.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    
    browserTest.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    browserTest.on('close', (code) => {
      if (code !== 0) {
        process.exit(1);
      }
      console.log('\n🎉 All export verifications passed!');
    });
  });
});