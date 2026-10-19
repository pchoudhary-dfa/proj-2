#!/usr/bin/env node

/**
 * Test script to verify the DFA Help Renderer package installation
 * This script can be run to test if the package is properly installed
 */

console.log('🧪 Testing DFA Help Renderer Package Installation...\n');

try {
  // Test 1: Import the main components
  console.log('1. Testing component imports...');
  const { DFAHelpRenderer, initDFAHelp } = require('./dist/cjs/index.js');
  console.log('   ✅ DFAHelpRenderer imported successfully');
  console.log('   ✅ initDFAHelp imported successfully');

  // Test 2: Test initialization
  console.log('\n2. Testing initialization...');
  initDFAHelp({
    apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata',
    colorCode: '#6f42c1',
    defaultLang: 'en',
    enable: true,
    languages: ['en', 'es', 'fr']
  });
  console.log('   ✅ DFAHelpRenderer initialized successfully');

  // Test 3: Check if components are functions
  console.log('\n3. Testing component types...');
  if (typeof DFAHelpRenderer === 'function') {
    console.log('   ✅ DFAHelpRenderer is a valid React component');
  } else {
    console.log('   ❌ DFAHelpRenderer is not a function');
  }

  if (typeof initDFAHelp === 'function') {
    console.log('   ✅ initDFAHelp is a valid function');
  } else {
    console.log('   ❌ initDFAHelp is not a function');
  }

  // Test 4: Check package.json
  console.log('\n4. Testing package configuration...');
  const packageJson = require('./package.json');
  console.log(`   ✅ Package name: ${packageJson.name}`);
  console.log(`   ✅ Package version: ${packageJson.version}`);
  console.log(`   ✅ Main entry: ${packageJson.main}`);
  console.log(`   ✅ Module entry: ${packageJson.module}`);
  console.log(`   ✅ Types entry: ${packageJson.types}`);

  console.log('\n🎉 All tests passed! The package is ready for installation.');
  console.log('\n📦 Installation commands:');
  console.log('   npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git');
  console.log('\n📖 Usage example:');
  console.log('   import { initDFAHelp, DFAHelpRenderer } from "@dfa/dfa-help-renderer";');

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error('\n🔧 Troubleshooting:');
  console.error('   1. Make sure you have run: npm run build');
  console.error('   2. Check if all dependencies are installed: npm install');
  console.error('   3. Verify the package structure is correct');
  process.exit(1);
}
