# DFA Help Renderer - API Call Debugging Guide

## 🚨 **Issue: No API Call When Clicking Help Icon**

### **Possible Causes & Solutions:**

#### **1. Package Not Properly Installed**
**Symptoms:** No console logs, TypeScript errors
**Solution:**
```bash
# Check if package is installed correctly
ls node_modules/@dfa/dfa-help-renderer/dist/

# If missing, reinstall
npm uninstall @dfa/dfa-help-renderer
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force
```

#### **2. DFA Help Not Initialized**
**Symptoms:** Component renders but no API calls
**Solution:**
```javascript
// Make sure to initialize in your app
import { initDFAHelp } from '@dfa/dfa-help-renderer';

// Initialize BEFORE using components
initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata', // Required
  colorCode: '#6f42c1',
  defaultLang: 'en',
  enable: true,
  languages: ['en', 'es', 'fr']
});
```

#### **3. Component Not Enabled**
**Symptoms:** Component doesn't render at all
**Solution:**
```javascript
// Check if component is enabled
<DFAHelpRenderer 
  helpKey="your-key" 
  enable={true} // Explicitly enable
  buttonText="Help" 
/>
```

#### **4. Missing Help Key**
**Symptoms:** Console shows "Help key is missing"
**Solution:**
```javascript
// Make sure helpKey is provided
<DFAHelpRenderer 
  helpKey="your-actual-help-key" // Must be a valid string
  buttonText="Help" 
/>
```

#### **5. API URL Not Set**
**Symptoms:** Console shows API URL as undefined
**Solution:**
```javascript
// Make sure API URL is set in initialization
initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata', // Must be set
  // ... other config
});
```

## 🔍 **Debugging Steps:**

### **Step 1: Check Console Logs**
Open browser developer console and look for:
- `🔧 DFA Help: Initializing...`
- `✅ DFA Help: Component enabled, rendering with helpKey:`
- `🖱️ DFA Help: Button clicked`
- `🌐 DFA Help: Making API call to:`

### **Step 2: Test with Debug Component**
```javascript
import React from 'react';
import { initDFAHelp, DFAHelpRenderer } from '@dfa/dfa-help-renderer';

// Initialize with debugging
initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata',
  colorCode: '#6f42c1',
  defaultLang: 'en',
  enable: true,
  languages: ['en', 'es', 'fr']
});

function DebugTest() {
  return (
    <div>
      <h1>Debug Test</h1>
      <DFAHelpRenderer
        helpKey="test-key"
        buttonText="Test Help"
        onPanelOpen={() => console.log('Panel opened')}
        onPanelClose={() => console.log('Panel closed')}
        onError={(error) => console.error('Error:', error)}
      />
    </div>
  );
}
```

### **Step 3: Check Network Tab**
1. Open browser developer tools
2. Go to Network tab
3. Click the help button
4. Look for API calls to your endpoint

### **Step 4: Verify API Endpoint**
Test your API endpoint directly:
```bash
curl http://127.0.0.1:8000/api/dfahelp/keydata/your-help-key/
```

## 🎯 **Common Issues & Fixes:**

### **Issue: "Cannot find module '@dfa/dfa-help-renderer'"**
**Fix:**
```bash
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force
```

### **Issue: Component renders but no API call**
**Fix:** Check initialization order:
```javascript
// pages/_app.js or app/layout.js
import { initDFAHelp } from '@dfa/dfa-help-renderer';

// Initialize FIRST
initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata',
  // ... config
});

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

### **Issue: API call fails with CORS error**
**Fix:** Configure your API server to allow CORS:
```python
# In your Django/FastAPI server
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # Add your frontend URLs
]
```

### **Issue: API returns 404**
**Fix:** Check your API endpoint structure:
- Expected: `http://127.0.0.1:8000/api/dfahelp/keydata/{helpKey}/`
- Make sure the endpoint exists and accepts GET requests

## 📋 **Complete Working Example:**

```javascript
// pages/_app.js
import { initDFAHelp } from '@dfa/dfa-help-renderer';

initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata',
  colorCode: '#6f42c1',
  defaultLang: 'en',
  enable: true,
  languages: ['en', 'es', 'fr']
});

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

```javascript
// components/MyComponent.js
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function MyComponent() {
  return (
    <div>
      <h1>My Component</h1>
      <DFAHelpRenderer
        helpKey="my-component-help"
        buttonText="Help"
        onPanelOpen={() => console.log('Help panel opened')}
        onPanelClose={() => console.log('Help panel closed')}
        onError={(error) => console.error('Help error:', error)}
      />
    </div>
  );
}
```

## 🚀 **Quick Test:**

1. **Install the package:**
   ```bash
   npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force
   ```

2. **Add to your component:**
   ```javascript
   import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';
   <DFAHelpRenderer helpKey="test" buttonText="Help" />
   ```

3. **Check console for debug messages**
4. **Check Network tab for API calls**

The debugging logs will help identify exactly where the issue is occurring!
