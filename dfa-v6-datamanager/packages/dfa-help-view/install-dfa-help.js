#!/usr/bin/env node

/**
 * Installation script for DFA Help Renderer
 * Run this in your hosting application directory to install the package correctly
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Installing DFA Help Renderer...\n');

try {
  // Step 1: Check if package is already installed
  console.log('1. Checking current installation...');
  const packagePath = path.join(process.cwd(), 'node_modules', '@dfa', 'dfa-help-renderer');
  
  if (fs.existsSync(packagePath)) {
    console.log('   📦 Package found, checking build files...');
    const distPath = path.join(packagePath, 'dist');
    
    if (fs.existsSync(distPath)) {
      console.log('   ✅ Build files exist');
      console.log('   🎉 Package is ready to use!');
      process.exit(0);
    } else {
      console.log('   ⚠️  Build files missing, will rebuild...');
    }
  } else {
    console.log('   📦 Package not found, will install...');
  }

  // Step 2: Uninstall if exists
  console.log('\n2. Cleaning up existing installation...');
  try {
    execSync('npm uninstall @dfa/dfa-help-renderer', { stdio: 'ignore' });
    console.log('   ✅ Existing package removed');
  } catch (error) {
    console.log('   ℹ️  No existing package to remove');
  }

  // Step 3: Install from git
  console.log('\n3. Installing from git repository...');
  execSync('npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force', { 
    stdio: 'inherit' 
  });
  console.log('   ✅ Package installed');

  // Step 4: Check if build files exist
  console.log('\n4. Checking build files...');
  if (fs.existsSync(path.join(packagePath, 'dist'))) {
    console.log('   ✅ Build files found');
    console.log('   🎉 Installation successful!');
  } else {
    console.log('   ⚠️  Build files missing, building manually...');
    
    // Step 5: Manual build
    console.log('\n5. Building package manually...');
    process.chdir(packagePath);
    execSync('npm install', { stdio: 'inherit' });
    execSync('npm run build', { stdio: 'inherit' });
    console.log('   ✅ Build completed');
  }

  // Step 6: Final verification
  console.log('\n6. Final verification...');
  const distPath = path.join(packagePath, 'dist', 'cjs', 'index.js');
  const typesPath = path.join(packagePath, 'dist', 'cjs', 'index.d.ts');
  
  if (fs.existsSync(distPath) && fs.existsSync(typesPath)) {
    console.log('   ✅ Main files verified');
    console.log('   ✅ TypeScript definitions verified');
    console.log('\n🎉 DFA Help Renderer is ready to use!');
    console.log('\n📖 Usage:');
    console.log('   import { initDFAHelp, DFAHelpRenderer } from "@dfa/dfa-help-renderer";');
  } else {
    throw new Error('Build files still missing after installation');
  }

} catch (error) {
  console.error('\n❌ Installation failed:', error.message);
  console.error('\n🔧 Manual installation steps:');
  console.error('   1. npm uninstall @dfa/dfa-help-renderer');
  console.error('   2. npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force');
  console.error('   3. cd node_modules/@dfa/dfa-help-renderer/');
  console.error('   4. npm install');
  console.error('   5. npm run build');
  process.exit(1);
}
