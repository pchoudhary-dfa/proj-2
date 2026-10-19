# DFA Help Renderer

A Next.js package for rendering DFA Help content with runtime API integration, multi-language support, and customizable theming.

## Features

- **Runtime Help Renderer**: Fetches help content dynamically from your API
- **Multi-language Support**: Built-in support for multiple languages with tabbed interface
- **Customizable Theme**: Configurable colors and icons to match your application
- **Global Configuration**: Initialize once and use across your entire application
- **TypeScript Support**: Full TypeScript definitions included
- **JavaScript Compatible**: Works seamlessly in both JS and TS Next.js projects

## Installation

### Option 1: Install from NPM Registry (Recommended)
```bash
npm install @dfa/dfa-help-renderer
```

### Option 2: Install from Git Repository
```bash
# For Bitbucket, use the git+https format
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git

# If you get build errors, try with --force
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force
```

### Option 3: Install from Local Package
```bash
# First, build the package locally
npm run build

# Then install from the local directory
npm install /path/to/dfa-help-view
```

## Quick Start

### 1. Initialize the Package

```javascript
// pages/_app.js or app/layout.js
import { initDFAHelp } from '@dfa/dfa-help-renderer';
import '@dfa/dfa-help-renderer/dist/cjs/index.css'; // Import CSS styles

initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata', // Required
  iconType: 'info', // Optional: built-in icon ('question' | 'info')
  colorCode: '#007bff', // Optional: primary background color
  colorHoverCode: '#0069d9', // Optional: hover background color
  colorTextCode: '#ffffff', // Optional: button/active tab text color
  headerBackgroundCode: '#f8f9fa', // Optional: panel header background (keeps default if omitted)
  defaultLang: 'en', // Optional
  languages: ['en', 'es', 'fr'] // Optional
});
```

### 2. Use the Help Renderer

```javascript
// In any component
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function MyComponent() {
  return (
    <div>
      <h1>My Page</h1>
      <DFAHelpRenderer helpKey="my-help-key" buttonText="Help" />
    </div>
  );
}
```

## API Response Format

The package expects your API to return data in this format:

```json
{
  "success": true,
  "status": 200,
  "message": "Key Data retrieved successfully",
  "data": {
    "id": 89,
    "key": "NIS-SETUP-FUNCTIONAL-RATE-CARD",
    "code": "FUNCTIONAL-RATE-CARD",
    "parentKey": "NIS-SETUP",
    "related_keys": [],
    "title": "Functional Rate Card",
    "translations": [
      {
        "locale": "en",
        "title": "Functional Rate Card",
        "desc": "<p>Help content here</p>",
        "purpose": "Purpose of this help item"
      }
    ]
  }
}
```

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `apiURL` | string | Yes | - | Base API URL for help content |
| `helpIcon` | ReactNode | No | Default icon | Custom help icon |
| `iconType` | 'question' \| 'info' | No | 'question' | Built-in icon type when no custom icon is provided |
| `colorCode` | string | No | #6f42c1 | Primary background color for buttons/highlights |
| `colorHoverCode` | string | No | lighter(colorCode) | Hover background color for buttons/highlights |
| `colorTextCode` | string | No | #ffffff | Foreground/text color for buttons and active tabs |
| `headerBackgroundCode` | string | No | #f8f9fa | Panel header background color |
| `defaultLang` | string | No | 'en' | Default language |
| `enable` | boolean | No | true | Enable/disable help globally |
| `languages` | string[] | No | ['en'] | Available languages |

## Component Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `helpKey` | string | Yes | - | Unique key for help content |
| `buttonText` | string | No | 'Help' | Button text |
| `buttonIcon` | ReactNode | No | Global icon | Custom icon for this instance |
| `iconType` | 'question' \| 'info' | No | Global setting | Built-in icon for this instance |
| `buttonShape` | 'circle' \| 'rect' | No | 'rect' | Shape of the help button |
| `buttonWidth` | number \| string | No | - | Button width (px or CSS size) |
| `buttonHeight` | number \| string | No | - | Button height (px or CSS size) |
| `enable` | boolean | No | Global setting | Override global enable setting |
| `onPanelOpen` | function | No | - | Callback when panel opens |
| `onPanelClose` | function | No | - | Callback when panel closes |
| `onError` | function | No | - | Error callback |
### Help Button Customization

You can control the shape and size of the help button per instance:

```tsx
<DFAHelpRenderer
  helpKey="my-help-key"
  buttonText="Help"
  buttonShape="circle"      // 'circle' | 'rect'
  buttonWidth={40}           // number (px) or string ('2.5rem', '40px')
  buttonHeight={40}
/>
```

Notes:
- When `buttonShape` is `circle`, a 50% border radius is applied.
- Width/height accept numbers (interpreted as px) or CSS size strings.
- Works for both icon-only and text buttons.


## Complete Usage Examples

### JavaScript Next.js Application

#### 1. App Initialization (pages/_app.js)

```javascript
import { initDFAHelp } from '@dfa/dfa-help-renderer';
import '@dfa/dfa-help-renderer/dist/cjs/index.css'; // Import CSS styles

// Initialize DFA Help with your configuration
initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata', // Required
  helpIcon: null, // Use default icon
  colorCode: '#007bff', // Your brand color
  defaultLang: 'en', // Default language
  enable: true, // Enable help globally
  languages: ['en', 'es', 'fr'] // Available languages
});

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

#### 2. Dashboard Page (pages/dashboard.js)

```javascript
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function Dashboard() {
  const handlePanelOpen = () => {
    console.log('Help panel opened');
  };

  const handlePanelClose = () => {
    console.log('Help panel closed');
  };

  const handleError = (error) => {
    console.error('Help API error:', error);
  };

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome to your dashboard!</p>
      
      {/* Basic help button */}
      <DFAHelpRenderer
        helpKey="dashboard-overview"
        buttonText="Help"
        panelTitle="Dashboard Help"
        onPanelOpen={handlePanelOpen}
        onPanelClose={handlePanelClose}
        onError={handleError}
      />
      
      {/* Icon-only floating button */}
      <DFAHelpRenderer
        helpKey="user-settings"
        buttonText=""
        className="floating-help-button"
      />
    </div>
  );
}
```

#### 3. Form Component (components/UserForm.js)

```javascript
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function UserForm() {
  return (
    <form>
      <div className="form-group">
        <label htmlFor="email">Email Address</label>
        <input type="email" id="email" name="email" />
        <DFAHelpRenderer 
          helpKey="email-field-help" 
          buttonText=""
          className="inline-help-icon"
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="password">Password</label>
        <input type="password" id="password" name="password" />
        <DFAHelpRenderer 
          helpKey="password-requirements" 
          buttonText=""
          className="inline-help-icon"
        />
      </div>
    </form>
  );
}
```

#### 4. Navigation Component (components/Navigation.js)

```javascript
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function Navigation() {
  return (
    <nav className="main-navigation">
      <div className="nav-items">
        <a href="/dashboard">Dashboard</a>
        <a href="/profile">Profile</a>
        <a href="/settings">Settings</a>
      </div>
      
      <div className="nav-help">
        <DFAHelpRenderer 
          helpKey="navigation-help" 
          buttonText="Help"
          className="nav-help-button"
        />
      </div>
    </nav>
  );
}
```

### TypeScript Next.js Application

#### 1. App Initialization (pages/_app.tsx)

```typescript
import { initDFAHelp, DFAHelpConfig } from '@dfa/dfa-help-renderer';
import '@dfa/dfa-help-renderer/dist/cjs/index.css'; // Import CSS styles

// Initialize DFA Help with your configuration
const dfaHelpConfig: DFAHelpConfig = {
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata', // Required
  helpIcon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
    </svg>
  ), // Custom icon
  colorCode: '#28a745', // Green theme (primary)
  colorHoverCode: '#218838', // Hover color
  colorTextCode: '#ffffff', // Foreground/text color
  defaultLang: 'en', // Default language
  enable: true, // Enable help globally
  languages: ['en', 'es', 'fr', 'de'] // Multiple languages
};

initDFAHelp(dfaHelpConfig);

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

#### 2. Dashboard Page (pages/dashboard.tsx)

```typescript
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function Dashboard() {
  const handlePanelOpen = () => {
    console.log('Help panel opened');
  };

  const handlePanelClose = () => {
    console.log('Help panel closed');
  };

  const handleError = (error: Error) => {
    console.error('Help API error:', error);
  };

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome to your dashboard!</p>
      
      {/* Help button with custom configuration */}
      <DFAHelpRenderer
        helpKey="dashboard-overview"
        buttonText="Need Help?"
        panelTitle="Dashboard Help"
        onPanelOpen={handlePanelOpen}
        onPanelClose={handlePanelClose}
        onError={handleError}
        loadingMessage="Loading help content..."
        errorMessage="Unable to load help content"
        emptyStateMessage="No help content available for this section"
      />
      
      {/* Multiple help buttons for different sections */}
      <div className="help-buttons">
        <DFAHelpRenderer helpKey="user-profile" buttonText="Profile Help" />
        <DFAHelpRenderer helpKey="settings" buttonText="Settings Help" />
        <DFAHelpRenderer helpKey="billing" buttonText="Billing Help" />
      </div>
      
      {/* Override global icon for this specific instance */}
      <DFAHelpRenderer
        helpKey="special-help"
        buttonIcon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        }
        buttonText="Special Help"
      />
    </div>
  );
}
```

#### 3. Form Component (components/UserForm.tsx)

```typescript
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function UserForm() {
  return (
    <form>
      <div className="form-group">
        <label htmlFor="email">Email Address</label>
        <input type="email" id="email" name="email" />
        <DFAHelpRenderer 
          helpKey="email-field-help" 
          buttonText=""
          className="inline-help-icon"
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="password">Password</label>
        <input type="password" id="password" name="password" />
        <DFAHelpRenderer 
          helpKey="password-requirements" 
          buttonText=""
          className="inline-help-icon"
        />
      </div>
    </form>
  );
}
```

#### 4. Navigation Component (components/Navigation.tsx)

```typescript
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function Navigation() {
  return (
    <nav className="main-navigation">
      <div className="nav-items">
        <a href="/dashboard">Dashboard</a>
        <a href="/profile">Profile</a>
        <a href="/settings">Settings</a>
      </div>
      
      <div className="nav-help">
        <DFAHelpRenderer 
          helpKey="navigation-help" 
          buttonText="Help"
          className="nav-help-button"
        />
      </div>
    </nav>
  );
}
```

### CSS Styling Examples

#### Custom Button Styles (styles/globals.css)

```css
/* Floating help button */
.floating-help-button {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  background: var(--dfa-help-primary-color, #6f42c1);
  color: white;
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  transition: all 0.2s;
}

.floating-help-button:hover {
  background: var(--dfa-help-primary-hover, #5a32a3);
  transform: scale(1.05);
}

/* Inline help icon */
.inline-help-icon {
  margin-left: 8px;
  background: none;
  border: none;
  color: #6c757d;
  cursor: pointer;
  padding: 4px;
  transition: color 0.2s;
}

.inline-help-icon:hover {
  color: var(--dfa-help-primary-color, #6f42c1);
}

/* Navigation help button */
.nav-help-button {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 8px 16px;
  color: #495057;
  transition: all 0.2s;
}

.nav-help-button:hover {
  background: var(--dfa-help-primary-color, #6f42c1);
  color: white;
  border-color: var(--dfa-help-primary-color, #6f42c1);
}
```

### Advanced Usage Examples

#### Conditional Help Rendering

```javascript
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function ConditionalHelp({ userRole, feature }) {
  // Only show help for premium users
  const showHelp = userRole === 'premium';
  
  return (
    <div>
      <h1>Feature: {feature}</h1>
      {showHelp && (
        <DFAHelpRenderer 
          helpKey={`${feature}-help`} 
          buttonText="Premium Help"
        />
      )}
    </div>
  );
}
```

#### Dynamic Help Keys

```javascript
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function DynamicHelp({ currentPage, userType }) {
  // Generate help key based on current context
  const helpKey = `${userType}-${currentPage}-help`;
  
  return (
    <div>
      <h1>Current Page: {currentPage}</h1>
      <DFAHelpRenderer 
        helpKey={helpKey} 
        buttonText={`${userType} Help`}
      />
    </div>
  );
}
```

#### Error Handling with Custom Messages

```javascript
import { DFAHelpRenderer } from '@dfa/dfa-help-renderer';

export default function ErrorHandlingExample() {
  const handleError = (error) => {
    // Log to your error tracking service
    console.error('Help system error:', error);
    
    // Show user-friendly notification
    alert('Unable to load help content. Please try again later.');
  };

  return (
    <div>
      <h1>Error Handling Example</h1>
      <DFAHelpRenderer 
        helpKey="error-handling-help"
        buttonText="Help"
        onError={handleError}
        errorMessage="Custom error message"
        emptyStateMessage="No help content available"
      />
    </div>
  );
}
```

## Publishing

### To NPM Registry
```bash
# Build the package
npm run build

# Login to npm (if not already logged in)
npm login

# Publish to npm registry
npm publish
```

### To Private Registry
```bash
# Build the package
npm run build

# Publish to your private registry
npm publish --registry https://your-private-registry.com
```

### From Git Repository
The package can also be installed directly from the Git repository:
```bash
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git
```

## Troubleshooting

### Installation Issues

#### Error: 404 Not Found - '@dfa/dfa-help-renderer@*' is not in this registry
**Solution:** The package is not published to npm yet. Use one of these alternatives:

```bash
# Option 1: Install from Git repository
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git

# Option 2: Install from local package
npm install /path/to/dfa-help-view

# Option 3: Use file protocol for local development
npm install file:../dfa-help-view
```

#### Error: 501 Not Implemented - GET https://git.communitysystemsfoundation.org/...
**Solution:** Use the correct git URL format:

```bash
# Wrong format
npm install https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git

# Correct format
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git
```

#### Authentication Issues with Private Repository
If you get authentication errors:

```bash
# For private repositories, you may need to configure git credentials
git config --global credential.helper store

# Or use SSH instead of HTTPS
npm install git+ssh://git@git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git
```

#### TypeScript Errors: Cannot find module '@dfa/dfa-help-renderer'
**Problem:** Package not properly installed or built
**Solutions:**

1. **Check if package is properly installed:**
```bash
ls node_modules/@dfa/dfa-help-renderer/
# Should show: dist/, lib/, package.json, README.md, etc.
```

2. **If only metadata files are present, reinstall:**
```bash
npm uninstall @dfa/dfa-help-renderer
npm install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git --force
```

3. **If build files are missing, manually build:**
```bash
cd node_modules/@dfa/dfa-help-renderer/
npm install
npm run build
```

4. **Alternative: Use local installation:**
```bash
# Clone the repository locally
git clone https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-view.git
cd dfa-help-view
npm install
npm run build

# Install from local directory
npm install /path/to/dfa-help-view
```

#### Error: 'initDFAHelp' is declared but its value is never read
**Problem:** TypeScript warning about unused import
**Solution:** This is just a warning, not an error. The function is used at runtime:

```javascript
import { initDFAHelp, DFAHelpRenderer } from '@dfa/dfa-help-renderer';

// This will be used at runtime, even if TypeScript shows a warning
initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata',
  // ... other config
});
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run in development mode
npm run dev
```

## CSS Styling

### Option 1: Use Standalone CSS File (Recommended)

The package includes a complete standalone CSS file with all styles:

```javascript
// Import the CSS file in your app
import '@dfa/dfa-help-renderer/dist/cjs/index.css';
```

Or include it in your HTML:

```html
<link rel="stylesheet" href="node_modules/@dfa/dfa-help-renderer/dist/cjs/index.css">
```

### Option 2: CSS Modules (Automatic)

The package automatically includes CSS modules, so no additional CSS import is needed if you're using the default styling.

### Option 3: Custom CSS Classes

You can also use the standalone CSS classes directly in your components:

```javascript
// Use predefined CSS classes
<DFAHelpRenderer 
  helpKey="help-key" 
  buttonText="Help"
  className="dfa-help-floating" // Floating button style
/>

<DFAHelpRenderer 
  helpKey="help-key" 
  buttonText=""
  className="dfa-help-inline" // Inline icon style
/>
```

### Available CSS Classes

#### Button Styles
- `.dfa-help-button` - Standard help button
- `.dfa-help-floating` - Floating help button (fixed position)
- `.dfa-help-inline` - Inline help icon
- `.dfa-help-button-icon-only` - Icon-only button

#### Panel Styles
- `.dfa-help-overlay` - Panel overlay background
- `.dfa-help-panel` - Main help panel
- `.dfa-help-header` - Panel header
- `.dfa-help-content` - Panel content area

#### Control Styles
- `.dfa-help-font-button` - Font size control buttons
- `.dfa-help-language-tab` - Language selection tabs
- `.dfa-help-close-button` - Close button
- `.dfa-help-back-button` - Back button

#### Content Styles
- `.dfa-help-section` - Content sections
- `.dfa-help-related-keys` - Related keys container
- `.dfa-help-metadata` - Metadata section

#### State Styles
- `.dfa-help-loading` - Loading state
- `.dfa-help-error` - Error state
- `.dfa-help-empty` - Empty state

### CSS Customization

The package uses CSS custom properties for theming:

```css
:root {
  --dfa-help-primary-color: #6f42c1;
  --dfa-help-primary-hover: #5a32a3;
  --dfa-help-primary-active: #4a2a8a;
  --dfa-help-text-color: #333333;
  --dfa-help-border-color: #e9ecef;
  --dfa-help-background-color: #ffffff;
  --dfa-help-header-background: #f8f9fa;
}
```

### Custom Styling Examples

#### Floating Help Button
```css
.custom-floating-help {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  background: var(--dfa-help-primary-color, #6f42c1);
  color: white;
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  transition: all 0.2s;
}
```

#### Inline Help Icon
```css
.custom-inline-help {
  margin-left: 8px;
  background: none;
  border: none;
  color: #6c757d;
  cursor: pointer;
  padding: 4px;
  transition: color 0.2s;
}

.custom-inline-help:hover {
  color: var(--dfa-help-primary-color, #6f42c1);
}
```

#### Navigation Help Button
```css
.custom-nav-help {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 8px 16px;
  color: #495057;
  transition: all 0.2s;
}

.custom-nav-help:hover {
  background: var(--dfa-help-primary-color, #6f42c1);
  color: white;
  border-color: var(--dfa-help-primary-color, #6f42c1);
}
```

## License

MIT
