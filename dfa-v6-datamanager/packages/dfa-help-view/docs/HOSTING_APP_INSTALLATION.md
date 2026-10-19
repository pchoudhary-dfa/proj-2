# DFA Help Renderer - Hosting Application Installation

## 🚨 **Current Issue:**
```
ls: node_modules/@dfa/dfa-help-renderer/dist/: No such file or directory
```

This means the package is installed but missing the compiled build files.

## 🔧 **Solution Steps:**

### **Step 1: Navigate to Your Hosting Application Directory**
```bash
cd /path/to/your/hosting/application
```

### **Step 2: Check Current Installation**
```bash
ls node_modules/@dfa/dfa-help-renderer/
```

**Expected output should include:**
- `dist/` directory (currently missing)
- `package.json`
- `README.md`
- `src/` directory

### **Step 3: Fix the Installation**

#### **Option A: Automatic Fix (Recommended)**
```bash
# Copy the install script to your hosting app directory
# Then run:
node install-dfa-help.js
```

#### **Option B: Manual Fix**
```bash
# 1. Uninstall current package
npm uninstall @dfa/dfa-help-renderer

# 2. Reinstall with force
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force

# 3. Check if dist/ directory exists now
ls node_modules/@dfa/dfa-help-renderer/dist/

# 4. If still missing, build manually
cd node_modules/@dfa/dfa-help-renderer/
npm install
npm run build
cd ../../../
```

### **Step 4: Verify Installation**
```bash
# Check if dist directory exists
ls node_modules/@dfa/dfa-help-renderer/dist/

# Should show:
# cjs/
# esm/
```

```bash
# Check if main files exist
ls node_modules/@dfa/dfa-help-renderer/dist/cjs/
# Should show: index.js, index.d.ts, index.css
```

### **Step 5: Test in Your Application**
```javascript
// In your hosting application
import { initDFAHelp, DFAHelpRenderer } from '@dfa/dfa-help-renderer';

// This should work without TypeScript errors now
initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata',
  colorCode: '#6f42c1',
  defaultLang: 'en',
  enable: true,
  languages: ['en', 'es', 'fr']
});

// Use in your components
<DFAHelpRenderer helpKey="your-help-key" buttonText="Help" />
```

## 🎯 **Quick Commands for Your Hosting App:**

```bash
# Navigate to your hosting application
cd /path/to/your/hosting/application

# Fix the installation
npm uninstall @dfa/dfa-help-renderer
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force

# If dist/ is still missing, build manually
cd node_modules/@dfa/dfa-help-renderer/
npm install
npm run build
cd ../../../

# Verify
ls node_modules/@dfa/dfa-help-renderer/dist/
```

## ✅ **Success Indicators:**

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
├── package.json
├── README.md
└── src/
```

## 🚨 **If Still Having Issues:**

1. **Check Node.js version:** `node --version` (should be 14+)
2. **Clear npm cache:** `npm cache clean --force`
3. **Delete node_modules:** `rm -rf node_modules && npm install`
4. **Use local installation method** (see SOLUTION_SUMMARY.md)

The package will work once the `dist/` directory is properly created with the build files!
