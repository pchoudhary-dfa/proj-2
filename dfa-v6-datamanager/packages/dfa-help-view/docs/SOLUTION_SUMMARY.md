# DFA Help Renderer - Installation Issues & Solutions

## 🚨 **Issues Identified:**

1. **TypeScript Error**: `Cannot find module '@dfa/dfa-help-renderer'`
2. **TypeScript Warning**: `'initDFAHelp' is declared but its value is never read`
3. **Missing Build Files**: Only metadata files (package.json, README.md) in node_modules

## ✅ **Root Cause:**
When installing from git, npm doesn't automatically run the build process, so only the source files and metadata are installed, not the compiled JavaScript and TypeScript definition files.

## 🔧 **Solutions:**

### **Solution 1: Reinstall with Force (Recommended)**
```bash
# Uninstall current package
npm uninstall @dfa/dfa-help-renderer

# Reinstall with force to trigger build
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force
```

### **Solution 2: Manual Build After Installation**
```bash
# Navigate to the installed package
cd node_modules/@dfa/dfa-help-renderer/

# Install dependencies and build
npm install
npm run build
```

### **Solution 3: Local Installation (Most Reliable)**
```bash
# Clone repository locally
git clone https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git
cd dfa-help-view

# Install dependencies and build
npm install
npm run build

# Install from local directory in your hosting app
npm install /path/to/dfa-help-view
```

### **Solution 4: Verify Installation**
```bash
# Run verification script
node verify-installation.js
```

## 📋 **What Should Be in node_modules/@dfa/dfa-help-renderer/:**

After successful installation, you should see:
```
node_modules/@dfa/dfa-help-renderer/
├── dist/
│   ├── cjs/
│   │   ├── index.js          ← Main JavaScript file
│   │   ├── index.d.ts        ← TypeScript definitions
│   │   └── index.css         ← Styles
│   └── esm/
│       ├── index.js          ← ES Module version
│       └── index.d.ts        ← TypeScript definitions
├── lib/                      ← TypeScript compiled files
├── src/                      ← Source files
├── package.json              ← Package metadata
├── README.md                 ← Documentation
└── CHANGELOG.md              ← Version history
```

## 🎯 **Quick Fix for Hosting Applications:**

1. **Uninstall current package:**
   ```bash
   npm uninstall @dfa/dfa-help-renderer
   ```

2. **Reinstall with force:**
   ```bash
   npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force
   ```

3. **Verify installation:**
   ```bash
   ls node_modules/@dfa/dfa-help-renderer/dist/
   # Should show: cjs/, esm/ directories with index.js and index.d.ts files
   ```

4. **Test in your application:**
   ```javascript
   import { initDFAHelp, DFAHelpRenderer } from '@dfa/dfa-help-renderer';
   
   // This should work without TypeScript errors
   initDFAHelp({
     apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata',
     colorCode: '#6f42c1',
     defaultLang: 'en',
     enable: true,
     languages: ['en', 'es', 'fr']
   });
   ```

## 📝 **Notes:**

- The `'initDFAHelp' is declared but its value is never read` warning is just a TypeScript warning and doesn't affect functionality
- The package includes a `prepare` script that should run the build automatically during installation
- If the automatic build fails, use the manual build steps above
- The verification script (`verify-installation.js`) can be used to check if the package is properly installed

## 🚀 **Next Steps:**

1. Try **Solution 1** first (reinstall with force)
2. If that doesn't work, try **Solution 2** (manual build)
3. For development, use **Solution 3** (local installation)
4. Always verify with **Solution 4** (verification script)

The package is fully functional once properly installed with the build files present!
