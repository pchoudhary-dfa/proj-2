#!/usr/bin/env node

/**
 * Verification script for DFA Help Renderer package installation
 * Run this in your hosting application to verify the package is properly installed
 */

console.log('🔍 Verifying DFA Help Renderer Installation...\n');

try {
  // Test 1: Check if package is installed
  console.log('1. Checking package installation...');
  const packagePath = require.resolve('@dfa/dfa-help-renderer');
  console.log(`   ✅ Package found at: ${packagePath}`);

  // Test 2: Check package.json
  console.log('\n2. Checking package metadata...');
  const packageJson = require('@dfa/dfa-help-renderer/package.json');
  console.log(`   ✅ Package name: ${packageJson.name}`);
  console.log(`   ✅ Package version: ${packageJson.version}`);

  // Test 3: Check if main files exist
  console.log('\n3. Checking main files...');
  const fs = require('fs');
  const path = require('path');
  
  const packageDir = path.dirname(packagePath);
  const mainFile = path.join(packageDir, 'dist', 'cjs', 'index.js');
  const typesFile = path.join(packageDir, 'dist', 'cjs', 'index.d.ts');
  
  if (fs.existsSync(mainFile)) {
    console.log('   ✅ Main file exists: dist/cjs/index.js');
  } else {
    console.log('   ❌ Main file missing: dist/cjs/index.js');
  }
  
  if (fs.existsSync(typesFile)) {
    console.log('   ✅ Types file exists: dist/cjs/index.d.ts');
  } else {
    console.log('   ❌ Types file missing: dist/cjs/index.d.ts');
  }

  // Test 4: Try to import the package
  console.log('\n4. Testing imports...');
  const { DFAHelpRenderer, initDFAHelp } = require('@dfa/dfa-help-renderer');
  
  if (typeof DFAHelpRenderer === 'function') {
    console.log('   ✅ DFAHelpRenderer imported successfully');
  } else {
    console.log('   ❌ DFAHelpRenderer import failed');
  }
  
  if (typeof initDFAHelp === 'function') {
    console.log('   ✅ initDFAHelp imported successfully');
  } else {
    console.log('   ❌ initDFAHelp import failed');
  }

  // Test 5: Test initialization
  console.log('\n5. Testing initialization...');
  initDFAHelp({
    apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata',
    colorCode: '#6f42c1',
    defaultLang: 'en',
    enable: true,
    languages: ['en', 'es', 'fr']
  });
  console.log('   ✅ Initialization successful');

  console.log('\n🎉 Package verification completed successfully!');
  console.log('\n📖 Usage in your application:');
  console.log('   import { initDFAHelp, DFAHelpRenderer } from "@dfa/dfa-help-renderer";');
  console.log('   initDFAHelp({ apiURL: "your-api-url" });');
  console.log('   <DFAHelpRenderer helpKey="your-key" />');

} catch (error) {
  console.error('\n❌ Verification failed:', error.message);
  console.error('\n🔧 Troubleshooting steps:');
  console.error('   1. Check if package is installed: npm list @dfa/dfa-help-renderer');
  console.error('   2. Reinstall the package: npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force');
  console.error('   3. Check if build files exist in node_modules/@dfa/dfa-help-renderer/dist/');
  console.error('   4. If build files are missing, manually build: cd node_modules/@dfa/dfa-help-renderer && npm run build');
  process.exit(1);
}
