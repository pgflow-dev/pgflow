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
  
  // No longer testing CJS as we've dropped support
  console.log('\n✅ CommonJS support has been dropped - package is now ESM-only');
  
  // Test that CJS file doesn't exist
  console.log('\nVerifying CJS file has been removed...');
  const cjsTest = spawn('node', ['-e', `
    const fs = require('fs');
    const path = require('path');
    
    const cjsPath = path.join('${packageRoot}', 'dist', 'index.cjs');
    
    if (fs.existsSync(cjsPath)) {
      console.error('❌ CommonJS file still exists at:', cjsPath);
      console.error('   Please remove this file as CommonJS is no longer supported');
      process.exit(1);
    } else {
      console.log('✅ CommonJS file correctly removed');
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