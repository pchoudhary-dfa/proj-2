# DFA Help Renderer - Installation Guide

## 🚀 Quick Installation

### For Hosting Applications (Recommended)

```bash
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git
```

## 📋 Installation Options

### Option 1: From Git Repository (Works Immediately)
```bash
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git
```

### Option 2: From Local Package (Development)
```bash
# Build the package first
npm run build

# Install from local directory
npm install /path/to/dfa-help-view
```

### Option 3: From NPM Registry (After Publishing)
```bash
npm install @dfa/dfa-help-renderer
```

## 🔧 Troubleshooting

### Error: 404 Not Found
**Problem:** Package not published to npm registry
**Solution:** Use git installation method above

### Error: 501 Not Implemented
**Problem:** Wrong git URL format
**Solution:** Use `git+https://` prefix

### Authentication Issues
**Problem:** Private repository access
**Solutions:**
```bash
# Configure git credentials
git config --global credential.helper store

# Or use SSH
npm install git+ssh://git@git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git
```

### TypeScript Errors: Cannot find module '@dfa/dfa-help-renderer'
**Problem:** Package not properly installed or built
**Solutions:**

1. **Check package installation:**
```bash
ls node_modules/@dfa/dfa-help-renderer/
# Should show: dist/, lib/, package.json, README.md, etc.
```

2. **If only metadata files present, reinstall:**
```bash
npm uninstall @dfa/dfa-help-renderer
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force
```

3. **If build files missing, manually build:**
```bash
cd node_modules/@dfa/dfa-help-renderer/
npm install
npm run build
```

4. **Verify installation:**
```bash
node verify-installation.js
```

### Error: 'initDFAHelp' is declared but its value is never read
**Problem:** TypeScript warning about unused import
**Solution:** This is just a warning, not an error. The function is used at runtime.

## ✅ Verification

After installation, test with:

```javascript
import { initDFAHelp, DFAHelpRenderer } from '@dfa/dfa-help-renderer';
import '@dfa/dfa-help-renderer/dist/cjs/index.css'; // Import CSS styles

// Initialize
initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata',
  colorCode: '#6f42c1',
  defaultLang: 'en',
  enable: true,
  languages: ['en', 'es', 'fr']
});

// Use in component
<DFAHelpRenderer helpKey="your-help-key" buttonText="Help" />
```

## 🎨 CSS Styling

### Import CSS Styles
```javascript
// Import the standalone CSS file
import '@dfa/dfa-help-renderer/dist/cjs/index.css';
```

### Or include in HTML
```html
<link rel="stylesheet" href="node_modules/@dfa/dfa-help-renderer/dist/cjs/index.css">
```

### Available CSS Classes
- `.dfa-help-button` - Standard help button
- `.dfa-help-floating` - Floating help button
- `.dfa-help-inline` - Inline help icon
- `.dfa-help-panel` - Help panel
- `.dfa-help-overlay` - Panel overlay

## 📦 Package Details

- **Name:** @dfa/dfa-help-renderer
- **Version:** 1.0.0
- **Repository:** https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git
- **Size:** 24.6 kB (compressed), 122.6 kB (unpacked)
- **Files:** 81 files included

## 🎯 Next Steps

1. **Install the package** using one of the methods above
2. **Initialize** in your app's `_app.js` or `layout.js`
3. **Add help buttons** to your components
4. **Configure your API** endpoint
5. **Customize** colors and languages as needed

## 📚 Full Documentation

See `README.md` for complete usage examples and API documentation.
