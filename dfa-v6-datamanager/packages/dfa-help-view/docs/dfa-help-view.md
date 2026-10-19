# DFA Help Renderer - Next.js Package Creation Instructions

## Overview

This document provides comprehensive instructions for creating a Next.js package for the DFA Help renderer that can be used seamlessly in both JavaScript and TypeScript Next.js projects without requiring any code adjustments in the package itself.

## Package Features

The DFA Help renderer package provides the following key functionality:

1. **Runtime Help Renderer**: The package serves as a renderer for DFA Help content that fetches data dynamically at runtime
2. **Simple Integration**: Hosting applications only need to add a simple tag with a unique key
3. **Interactive Help Button**: Renders as an Info/Help icon button in the hosting application
4. **API-Driven Content**: Makes runtime API calls to fetch help content from configurable API endpoints
5. **Slide-out Panel**: Opens a right-hand side panel in the hosting application to display the help content
6. **Global Configuration**: Initialize once with settings that apply across the entire application
7. **Multi-language Support**: Built-in support for multiple languages with tabbed interface
8. **Customizable Theme**: Configurable colors and icons to match your application's design
9. **Conditional Rendering**: Enable/disable help functionality globally or per component

## Table of Contents

1. [Package Structure](#package-structure)
2. [TypeScript Configuration](#typescript-configuration)
3. [Build Configuration](#build-configuration)
4. [Package.json Configuration](#packagejson-configuration)
5. [Type Definitions](#type-definitions)
6. [Initialization & Configuration](#initialization--configuration)
7. [JavaScript Compatibility](#javascript-compatibility)
8. [Build Process](#build-process)
9. [Distribution](#distribution)
10. [Usage in Projects](#usage-in-projects)
11. [Testing Strategy](#testing-strategy)
12. [Best Practices](#best-practices)

## Package Structure

Create the following directory structure for your DFA Help renderer package:

```
dfa-help-renderer/
├── src/
│   ├── components/
│   │   ├── DFAHelpRenderer.tsx
│   │   ├── HelpSection.tsx
│   │   └── index.ts
│   ├── types/
│   │   ├── index.ts
│   │   └── dfa-help.types.ts
│   ├── utils/
│   │   ├── helpers.ts
│   │   └── index.ts
│   ├── styles/
│   │   ├── DFAHelpRenderer.module.css
│   │   └── globals.css
│   └── index.ts
├── lib/
│   ├── dfa-help-renderer.js
│   ├── dfa-help-renderer.d.ts
│   └── dfa-help-renderer.js.map
├── dist/
│   ├── cjs/
│   │   ├── index.js
│   │   └── index.d.ts
│   ├── esm/
│   │   ├── index.js
│   │   └── index.d.ts
│   └── types/
│       └── index.d.ts
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── rollup.config.js
├── .npmignore
├── README.md
└── CHANGELOG.md
```

## TypeScript Configuration

### Main tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "DOM.Iterable", "ES6"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "module": "ESNext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./lib",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "lib",
    "dist",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx"
  ]
}
```

### Build tsconfig.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./lib"
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "lib",
    "dist",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx"
  ]
}
```

## Build Configuration

### Rollup Configuration (rollup.config.js)

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import postcss from 'rollup-plugin-postcss';
import { terser } from 'rollup-plugin-terser';

const packageJson = require('./package.json');

export default [
  // CommonJS build
  {
    input: 'src/index.ts',
    output: {
      file: packageJson.main,
      format: 'cjs',
      sourcemap: true,
      name: 'DFAHelpRenderer'
    },
    plugins: [
      peerDepsExternal(),
      resolve({
        browser: true
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: true,
        declarationDir: './dist/cjs'
      }),
      postcss({
        extract: true,
        minimize: true
      }),
      terser()
    ],
    external: ['react', 'react-dom', 'next']
  },
  // ES Module build
  {
    input: 'src/index.ts',
    output: {
      file: packageJson.module,
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      peerDepsExternal(),
      resolve({
        browser: true
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: true,
        declarationDir: './dist/esm'
      }),
      postcss({
        extract: true,
        minimize: true
      }),
      terser()
    ],
    external: ['react', 'react-dom', 'next']
  }
];
```

## Package.json Configuration

```json
{
  "name": "@your-org/dfa-help-renderer",
  "version": "1.0.0",
  "description": "DFA Help renderer component for Next.js applications",
  "main": "dist/cjs/index.js",
  "module": "dist/esm/index.js",
  "types": "dist/cjs/index.d.ts",
  "files": [
    "dist",
    "lib",
    "README.md",
    "CHANGELOG.md"
  ],
  "scripts": {
    "build": "npm run build:types && npm run build:bundles",
    "build:types": "tsc --project tsconfig.build.json",
    "build:bundles": "rollup -c",
    "dev": "tsc --watch",
    "clean": "rimraf lib dist",
    "prepublishOnly": "npm run clean && npm run build",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src/**/*.{ts,tsx}",
    "lint:fix": "eslint src/**/*.{ts,tsx} --fix"
  },
  "keywords": [
    "react",
    "nextjs",
    "dfa",
    "help",
    "renderer",
    "typescript",
    "javascript"
  ],
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "peerDependencies": {
    "react": ">=16.8.0",
    "react-dom": ">=16.8.0",
    "next": ">=12.0.0"
  },
  "devDependencies": {
    "@rollup/plugin-commonjs": "^24.0.0",
    "@rollup/plugin-node-resolve": "^15.0.0",
    "@rollup/plugin-typescript": "^11.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "eslint-plugin-react": "^7.0.0",
    "eslint-plugin-react-hooks": "^4.0.0",
    "jest": "^29.0.0",
    "postcss": "^8.0.0",
    "rimraf": "^5.0.0",
    "rollup": "^3.0.0",
    "rollup-plugin-peer-deps-external": "^2.2.4",
    "rollup-plugin-postcss": "^4.0.0",
    "rollup-plugin-terser": "^7.0.0",
    "typescript": "^5.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/dfa-help-renderer.git"
  },
  "bugs": {
    "url": "https://github.com/your-org/dfa-help-renderer/issues"
  },
  "homepage": "https://github.com/your-org/dfa-help-renderer#readme"
}
```

## Type Definitions

### src/types/dfa-help.types.ts

```typescript
export interface DFAHelpTranslation {
  locale: string;
  title: string;
  desc: string;
  purpose: string;
}

export interface DFAHelpData {
  id: number;
  key: string;
  code: string;
  parentKey?: string;
  parent_id?: number;
  related_keys: string[];
  title: string;
  translations: DFAHelpTranslation[];
}

export interface DFAHelpAPIResponse {
  success: boolean;
  status: number;
  message: string;
  data: DFAHelpData;
}

export interface DFAHelpConfig {
  apiURL: string; // Mandatory
  helpIcon?: React.ReactNode; // Optional - overwrites default button icon
  colorCode?: string; // Optional - replaces theme color
  defaultLang?: string; // Optional - default language (default: 'en')
  enable?: boolean; // Optional - enable/disable help functionality (default: true)
  languages?: string[]; // Optional - available languages array
}

export interface DFAHelpRendererProps {
  helpKey: string;
  className?: string;
  buttonIcon?: React.ReactNode; // Override global icon for this instance
  buttonText?: string;
  panelTitle?: string;
  onPanelOpen?: () => void;
  onPanelClose?: () => void;
  onError?: (error: Error) => void;
  loadingMessage?: string;
  errorMessage?: string;
  emptyStateMessage?: string;
  enable?: boolean; // Override global enable setting for this instance
}

export interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: DFAHelpData | null;
  loading: boolean;
  error: string | null;
  title?: string;
  className?: string;
  languages?: string[];
  currentLanguage?: string;
  onLanguageChange?: (language: string) => void;
}

export interface ProcessedHelpData {
  title: string;
  description: string;
  purpose: string;
  relatedKeys: string[];
  currentTranslation: DFAHelpTranslation | null;
  availableLanguages: string[];
}
```

### src/types/index.ts

```typescript
export * from './dfa-help.types';
```

## API Response Structure

### Expected API Response Format

The DFA Help renderer expects the API to return data in the following JSON structure:

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
    "parent_id": 45,
    "related_keys": [
      {
        "key": "NIS-SETUP", 
        "translations":[{
          "locale": "en", 
          "title": "Configure"
          }
        ]
      }
    ],
    "title": "Functional Rate Card",
    "translations": [
      {
        "locale": "en",
        "title": "Functional Rate Card",
        "desc": "<p>Functional Rate Card</p>\n",
        "purpose": ""
      }
    ]
  }
}
```

### Panel Display Mapping

The help panel will display the content in the following structure:

1. **Title** - Displayed as the main heading (from `translations[].title` or `data.title`)
2. **Description** - Displayed in a "Description" section (from `translations[].desc`)
3. **Purpose** - Displayed in a "Purpose" section (from `translations[].purpose`)
4. **Related Keys** - Displayed as clickable key codes (from `data.related_keys[]`)

### Multi-language Support

The API response includes a `translations` array where each object contains:
- `locale`: Language code (e.g., "en", "es", "fr")
- `title`: Translated title
- `desc`: Translated description (HTML content)
- `purpose`: Translated purpose (HTML content)

The panel will automatically show language tabs based on available translations and allow users to switch between languages.

## Initialization & Configuration

### Global Configuration System

The DFA Help renderer package includes a global configuration system that allows you to initialize settings once and use them across your entire application.

### Configuration Interface

```typescript
interface DFAHelpConfig {
  apiURL: string; // Mandatory - Base API URL for help content
  helpIcon?: React.ReactNode; // Optional - Custom help icon (overwrites default)
  colorCode?: string; // Optional - Theme color (e.g., '#007bff', '#28a745')
  defaultLang?: string; // Optional - Default language (default: 'en')
  enable?: boolean; // Optional - Enable/disable help globally (default: true)
  languages?: string[]; // Optional - Available languages array (e.g., ['en', 'es', 'fr'])
}
```

### Initialization Function

```typescript
// src/utils/dfa-help-init.ts
import { DFAHelpConfig } from '../types';

class DFAHelpManager {
  private static instance: DFAHelpManager;
  private config: DFAHelpConfig | null = null;

  private constructor() {}

  public static getInstance(): DFAHelpManager {
    if (!DFAHelpManager.instance) {
      DFAHelpManager.instance = new DFAHelpManager();
    }
    return DFAHelpManager.instance;
  }

  public init(config: DFAHelpConfig): void {
    // Validate required fields
    if (!config.apiURL) {
      throw new Error('apiURL is mandatory for DFA Help initialization');
    }

    // Set default values
    this.config = {
      defaultLang: 'en',
      enable: true,
      ...config
    };

    // Apply theme colors if provided
    if (this.config.colorCode) {
      this.applyThemeColors(this.config.colorCode);
    }
  }

  public getConfig(): DFAHelpConfig | null {
    return this.config;
  }

  public isEnabled(): boolean {
    return this.config?.enable ?? true;
  }

  public getApiURL(): string {
    if (!this.config?.apiURL) {
      throw new Error('DFA Help not initialized. Call init() first.');
    }
    return this.config.apiURL;
  }

  public getDefaultLanguage(): string {
    return this.config?.defaultLang ?? 'en';
  }

  public getAvailableLanguages(): string[] {
    return this.config?.languages ?? ['en'];
  }

  public getHelpIcon(): React.ReactNode | undefined {
    return this.config?.helpIcon;
  }

  private applyThemeColors(colorCode: string): void {
    const root = document.documentElement;
    root.style.setProperty('--dfa-help-primary-color', colorCode);
    root.style.setProperty('--dfa-help-primary-hover', this.lightenColor(colorCode, 10));
    root.style.setProperty('--dfa-help-primary-active', this.darkenColor(colorCode, 10));
  }

  private lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (0x1000000 + (R > 255 ? 255 : R < 0 ? 0 : R) * 0x10000 +
      (G > 255 ? 255 : G < 0 ? 0 : G) * 0x100 +
      (B > 255 ? 255 : B < 0 ? 0 : B)).toString(16).slice(1);
  }
}

// Export singleton instance and init function
export const dfaHelpManager = DFAHelpManager.getInstance();

export const initDFAHelp = (config: DFAHelpConfig): void => {
  dfaHelpManager.init(config);
};

export const getDFAHelpConfig = () => dfaHelpManager.getConfig();
export const isDFAHelpEnabled = () => dfaHelpManager.isEnabled();
export const getDFAHelpApiURL = () => dfaHelpManager.getApiURL();
export const getDFAHelpDefaultLanguage = () => dfaHelpManager.getDefaultLanguage();
export const getDFAHelpLanguages = () => dfaHelpManager.getAvailableLanguages();
export const getDFAHelpIcon = () => dfaHelpManager.getHelpIcon();
```

### Main Export with Initialization

```typescript
// src/index.ts
export { default as DFAHelpRenderer } from './components/DFAHelpRenderer';
export { default as HelpPanel } from './components/HelpPanel';

// Export types
export * from './types';

// Export utilities and initialization
export {
  initDFAHelp,
  getDFAHelpConfig,
  isDFAHelpEnabled,
  getDFAHelpApiURL,
  getDFAHelpDefaultLanguage,
  getDFAHelpLanguages,
  getDFAHelpIcon
} from './utils/dfa-help-init';

// Default export for easier importing
export { default } from './components/DFAHelpRenderer';
```

## JavaScript Compatibility

### src/index.ts (Main Export File)

```typescript
// Export all components
export { default as DFAHelpRenderer } from './components/DFAHelpRenderer';
export { default as HelpSection } from './components/HelpSection';

// Export all types
export * from './types';

// Export utilities
export * from './utils';

// Default export for easier importing
export { default } from './components/DFAHelpRenderer';
```

### Component Implementation (src/components/DFAHelpRenderer.tsx)

```typescript
import React, { useState, useCallback, useEffect } from 'react';
import { DFAHelpRendererProps, DFAHelpData, DFAHelpAPIResponse, ProcessedHelpData } from '../types';
import HelpPanel from './HelpPanel';
import { 
  isDFAHelpEnabled, 
  getDFAHelpApiURL, 
  getDFAHelpIcon,
  getDFAHelpLanguages,
  getDFAHelpDefaultLanguage
} from '../utils/dfa-help-init';
import styles from '../styles/DFAHelpRenderer.module.css';

const DFAHelpRenderer: React.FC<DFAHelpRendererProps> = ({
  helpKey,
  className = '',
  buttonIcon,
  buttonText = 'Help',
  panelTitle = 'Help',
  onPanelOpen,
  onPanelClose,
  onError,
  loadingMessage = 'Loading help content...',
  errorMessage = 'Failed to load help content',
  emptyStateMessage = 'No help content available.',
  enable // Override global enable setting
}) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [helpData, setHelpData] = useState<DFAHelpData | null>(null);
  const [processedData, setProcessedData] = useState<ProcessedHelpData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLanguage, setCurrentLanguage] = useState<string>('');

  // Check if help is enabled (global or local override)
  const isEnabled = enable !== undefined ? enable : isDFAHelpEnabled();
  const availableLanguages = getDFAHelpLanguages();
  const defaultLanguage = getDFAHelpDefaultLanguage();
  const globalIcon = getDFAHelpIcon();

  useEffect(() => {
    setCurrentLanguage(defaultLanguage);
  }, [defaultLanguage]);

  // Process the API response data
  const processHelpData = useCallback((data: DFAHelpData, language: string): ProcessedHelpData => {
    const translation = data.translations.find(t => t.locale === language) || data.translations[0];
    const availableLangs = data.translations.map(t => t.locale);
    
    return {
      title: translation?.title || data.title,
      description: translation?.desc || '',
      purpose: translation?.purpose || '',
      relatedKeys: data.related_keys || [],
      currentTranslation: translation || null,
      availableLanguages: availableLangs
    };
  }, []);

  const fetchHelpData = useCallback(async (language?: string) => {
    if (!helpKey) {
      const error = new Error('Help key is required');
      setError(error.message);
      onError?.(error);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const apiURL = getDFAHelpApiURL();
      const targetLanguage = language || currentLanguage || defaultLanguage;
      
      const response = await fetch(`${apiURL}/${helpKey}/`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: DFAHelpAPIResponse = await response.json();
      
      if (result.success && result.data) {
        setHelpData(result.data);
        const processed = processHelpData(result.data, targetLanguage);
        setProcessedData(processed);
      } else {
        throw new Error(result.message || 'Failed to fetch help data');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setLoading(false);
    }
  }, [helpKey, currentLanguage, defaultLanguage, onError, processHelpData]);

  const handleButtonClick = useCallback(() => {
    if (!isPanelOpen) {
      setIsPanelOpen(true);
      onPanelOpen?.();
      fetchHelpData();
    } else {
      setIsPanelOpen(false);
      onPanelClose?.();
    }
  }, [isPanelOpen, onPanelOpen, onPanelClose, fetchHelpData]);

  const handlePanelClose = useCallback(() => {
    setIsPanelOpen(false);
    onPanelClose?.();
  }, [onPanelClose]);

  const handleLanguageChange = useCallback((language: string) => {
    setCurrentLanguage(language);
    if (helpData) {
      const processed = processHelpData(helpData, language);
      setProcessedData(processed);
    }
  }, [helpData, processHelpData]);

  // Don't render if disabled
  if (!isEnabled) {
    return null;
  }

  // Use local buttonIcon if provided, otherwise use global icon, otherwise use default
  const displayIcon = buttonIcon || globalIcon || (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  return (
    <>
      <button
        className={`${styles.helpButton} ${className}`}
        onClick={handleButtonClick}
        aria-label="Open help"
        title={buttonText}
      >
        {displayIcon}
        {buttonText && <span className={styles.buttonText}>{buttonText}</span>}
      </button>

      <HelpPanel
        isOpen={isPanelOpen}
        onClose={handlePanelClose}
        data={helpData}
        processedData={processedData}
        loading={loading}
        error={error}
        title={panelTitle}
        loadingMessage={loadingMessage}
        errorMessage={errorMessage}
        emptyStateMessage={emptyStateMessage}
        languages={processedData?.availableLanguages || availableLanguages}
        currentLanguage={currentLanguage}
        onLanguageChange={handleLanguageChange}
      />
    </>
  );
};

export default DFAHelpRenderer;
```

### Help Panel Component (src/components/HelpPanel.tsx)

```typescript
import React, { useState } from 'react';
import { HelpPanelProps, ProcessedHelpData } from '../types';
import styles from '../styles/HelpPanel.module.css';

const HelpPanel: React.FC<HelpPanelProps & { processedData: ProcessedHelpData | null }> = ({
  isOpen,
  onClose,
  data,
  processedData,
  loading,
  error,
  title = 'Help',
  loadingMessage = 'Loading...',
  errorMessage = 'Error loading content',
  emptyStateMessage = 'No content available',
  languages,
  currentLanguage,
  onLanguageChange
}) => {
  const [fontSize, setFontSize] = useState(16);

  if (!isOpen) return null;

  const getLanguageName = (code: string): string => {
    const languageNames: Record<string, string> = {
      'en': 'EN',
      'es': 'ES', 
      'fr': 'FR',
      'de': 'DE',
      'it': 'IT',
      'pt': 'PO', // Portuguese as "PO" to match your design
      'ru': 'RU',
      'zh': 'ZH',
      'ja': 'JA',
      'ko': 'KO',
      'ar': 'AR',
      'hi': 'HI'
    };
    return languageNames[code] || code.toUpperCase();
  };

  const increaseFontSize = () => {
    setFontSize(prev => Math.min(prev + 2, 24));
  };

  const decreaseFontSize = () => {
    setFontSize(prev => Math.max(prev - 2, 12));
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header with controls similar to the image */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerTitle}>Help</span>
            <button className={styles.backButton} onClick={onClose} aria-label="Back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
          </div>
          
          <div className={styles.headerCenter}>
            {/* Font size controls */}
            <div className={styles.fontControls}>
              <button 
                className={styles.fontButton} 
                onClick={increaseFontSize}
                aria-label="Increase font size"
              >
                A+
              </button>
              <button 
                className={styles.fontButton} 
                onClick={decreaseFontSize}
                aria-label="Decrease font size"
              >
                A-
              </button>
            </div>
            
            {/* Language selection tabs */}
            {languages && languages.length > 1 && (
              <div className={styles.languageTabs}>
                {languages.map((lang) => (
                  <button
                    key={lang}
                    className={`${styles.languageTab} ${currentLanguage === lang ? styles.active : ''}`}
                    onClick={() => onLanguageChange?.(lang)}
                    title={getLanguageName(lang)}
                  >
                    {getLanguageName(lang)}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className={styles.headerRight}>
            <button className={styles.closeButton} onClick={onClose} aria-label="Close help">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Main content area */}
        <div className={styles.content} style={{ fontSize: `${fontSize}px` }}>
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <p>{loadingMessage}</p>
            </div>
          )}
          
          {error && (
            <div className={styles.error}>
              <p>{errorMessage}</p>
              <p className={styles.errorDetail}>{error}</p>
            </div>
          )}
          
          {!loading && !error && !processedData && (
            <div className={styles.empty}>
              <p>{emptyStateMessage}</p>
            </div>
          )}
          
          {!loading && !error && processedData && (
            <div className={styles.helpContent}>
              {/* 1. Title */}
              <h1 className={styles.helpTitle}>{processedData.title}</h1>
              
              {/* 2. Description */}
              {processedData.description && (
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>Description</h2>
                  <div 
                    className={styles.sectionContent}
                    dangerouslySetInnerHTML={{ __html: processedData.description }}
                  />
                </div>
              )}
              
              {/* 3. Purpose */}
              {processedData.purpose && (
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>Purpose</h2>
                  <div 
                    className={styles.sectionContent}
                    dangerouslySetInnerHTML={{ __html: processedData.purpose }}
                  />
                </div>
              )}
              
              {/* 4. Related Keys */}
              {processedData.relatedKeys && processedData.relatedKeys.length > 0 && (
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>Related Keys</h2>
                  <div className={styles.relatedKeys}>
                    {processedData.relatedKeys.map((key, index) => (
                      <div key={index} className={styles.relatedKey}>
                        <span className={styles.keyCode}>{key}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Additional metadata */}
              {data && (
                <div className={styles.metadata}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Key:</span>
                    <span className={styles.metaValue}>{data.key}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Code:</span>
                    <span className={styles.metaValue}>{data.code}</span>
                  </div>
                  {data.parentKey && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Parent:</span>
                      <span className={styles.metaValue}>{data.parentKey}</span>
                    </div>
                  )}
                  {processedData.currentTranslation && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Language:</span>
                      <span className={styles.metaValue}>{getLanguageName(processedData.currentTranslation.locale)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HelpPanel;
```

## Build Process

### 1. Development Setup

```bash
# Install dependencies
npm install

# Start development mode with TypeScript compilation
npm run dev
```

### 2. Building the Package

```bash
# Clean previous builds
npm run clean

# Build TypeScript declarations and bundles
npm run build
```

### 3. Build Output

The build process creates:
- `dist/cjs/` - CommonJS build for Node.js environments
- `dist/esm/` - ES Module build for modern bundlers
- `lib/` - TypeScript compiled output with declarations

## Distribution

### Publishing to NPM

```bash
# Login to NPM (if not already logged in)
npm login

# Publish the package
npm publish

# For scoped packages
npm publish --access public
```

### .npmignore Configuration

```
src/
tsconfig*.json
rollup.config.js
.eslintrc*
.prettierrc*
jest.config.js
*.test.ts
*.test.tsx
*.spec.ts
*.spec.tsx
coverage/
.nyc_output/
node_modules/
.git/
.gitignore
README.md
CHANGELOG.md
```

## Usage in Projects

### Initialization (Required First Step)

Before using any DFA Help components, you must initialize the package with your configuration:

#### JavaScript Next.js Project

```javascript
// pages/_app.js or app/layout.js
import { initDFAHelp } from '@your-org/dfa-help-renderer';

// Initialize DFA Help with your configuration
initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata', // Mandatory
  helpIcon: null, // Optional - use default icon
  colorCode: '#007bff', // Optional - your brand color
  defaultLang: 'en', // Optional - default language
  enable: true, // Optional - enable help globally
  languages: ['en', 'es', 'fr'] // Optional - available languages
});

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

#### TypeScript Next.js Project

```typescript
// pages/_app.tsx or app/layout.tsx
import { initDFAHelp, DFAHelpConfig } from '@your-org/dfa-help-renderer';

// Initialize DFA Help with your configuration
const dfaHelpConfig: DFAHelpConfig = {
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata', // Mandatory
  helpIcon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
    </svg>
  ), // Optional - custom icon
  colorCode: '#28a745', // Optional - green theme
  defaultLang: 'en', // Optional
  enable: true, // Optional
  languages: ['en', 'es', 'fr', 'de'] // Optional - multiple languages
};

initDFAHelp(dfaHelpConfig);

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

### Using the Help Renderer

#### JavaScript Next.js Project

```javascript
// pages/dashboard.js or app/dashboard/page.js
import { DFAHelpRenderer } from '@your-org/dfa-help-renderer';

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
      
      {/* Simple help button with key */}
      <DFAHelpRenderer
        helpKey="dashboard-overview"
        buttonText="Help"
        panelTitle="Dashboard Help"
        onPanelOpen={handlePanelOpen}
        onPanelClose={handlePanelClose}
        onError={handleError}
      />
      
      {/* Or just an icon button */}
      <DFAHelpRenderer
        helpKey="user-settings"
        buttonText=""
        className="floating-help-button"
      />
      
      {/* Disable help for this specific instance */}
      <DFAHelpRenderer
        helpKey="disabled-help"
        enable={false}
      />
    </div>
  );
}
```

#### TypeScript Next.js Project

```typescript
// pages/dashboard.tsx or app/dashboard/page.tsx
import { DFAHelpRenderer } from '@your-org/dfa-help-renderer';

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

### Integration Examples

#### In a Form Component

```javascript
// components/UserForm.js
import { DFAHelpRenderer } from '@your-org/dfa-help-renderer';

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

#### In a Navigation Component

```typescript
// components/Navigation.tsx
import { DFAHelpRenderer } from '@your-org/dfa-help-renderer';

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

### CSS Import (Both JS and TS)

```javascript
// In your Next.js project's global CSS or component
import '@dfa/dfa-help-renderer/dist/cjs/index.css';
// or
import '@dfa/dfa-help-renderer/dist/esm/index.css';
```

### CSS Styling Examples

#### Help Panel Styles (src/styles/HelpPanel.module.css)

```css
/* Panel overlay and container */
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.panel {
  width: 500px;
  height: 100vh;
  background: #ffffff;
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

/* Header styling similar to the image */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  min-height: 60px;
}

.headerLeft {
  display: flex;
  align-items: center;
  gap: 12px;
}

.headerTitle {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.backButton {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--dfa-help-primary-color, #6f42c1);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.backButton:hover {
  background: var(--dfa-help-primary-hover, #5a32a3);
}

.headerCenter {
  display: flex;
  align-items: center;
  gap: 16px;
}

.fontControls {
  display: flex;
  gap: 4px;
}

.fontButton {
  width: 32px;
  height: 32px;
  border: 1px solid #dee2e6;
  background: white;
  color: #495057;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
}

.fontButton:hover {
  background: #f8f9fa;
  border-color: var(--dfa-help-primary-color, #6f42c1);
}

.languageTabs {
  display: flex;
  gap: 4px;
}

.languageTab {
  padding: 6px 12px;
  border: 1px solid #dee2e6;
  background: white;
  color: #495057;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
  min-width: 40px;
}

.languageTab:hover {
  background: #f8f9fa;
}

.languageTab.active {
  background: var(--dfa-help-primary-color, #6f42c1);
  color: white;
  border-color: var(--dfa-help-primary-color, #6f42c1);
}

.headerRight {
  display: flex;
  align-items: center;
}

.closeButton {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--dfa-help-primary-color, #6f42c1);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.closeButton:hover {
  background: var(--dfa-help-primary-hover, #5a32a3);
}

/* Content area */
.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  background: #fafafa;
  line-height: 1.6;
}

.helpContent {
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.helpTitle {
  font-size: 24px;
  font-weight: 700;
  color: #333;
  margin: 0 0 16px 0;
  line-height: 1.3;
}

.helpBody {
  color: #555;
  margin-bottom: 24px;
}

.helpBody h1, .helpBody h2, .helpBody h3 {
  color: #333;
  margin-top: 24px;
  margin-bottom: 12px;
}

.helpBody p {
  margin-bottom: 12px;
}

.helpBody ul, .helpBody ol {
  margin-bottom: 12px;
  padding-left: 24px;
}

.helpBody code {
  background: #f8f9fa;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.helpBody pre {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 16px;
}

/* Content sections */
.section {
  margin-bottom: 24px;
}

.sectionTitle {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--dfa-help-primary-color, #6f42c1);
}

.sectionContent {
  color: #555;
  line-height: 1.6;
}

.sectionContent h1, .sectionContent h2, .sectionContent h3 {
  color: #333;
  margin-top: 16px;
  margin-bottom: 8px;
}

.sectionContent p {
  margin-bottom: 12px;
}

.sectionContent ul, .sectionContent ol {
  margin-bottom: 12px;
  padding-left: 24px;
}

.sectionContent code {
  background: #f8f9fa;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.sectionContent pre {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 16px;
}

/* Related Keys section */
.relatedKeys {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.relatedKey {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 8px 12px;
  transition: all 0.2s;
}

.relatedKey:hover {
  background: var(--dfa-help-primary-color, #6f42c1);
  border-color: var(--dfa-help-primary-color, #6f42c1);
  color: white;
}

.keyCode {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 500;
}

/* Metadata section */
.metadata {
  border-top: 1px solid #e9ecef;
  padding-top: 16px;
  margin-top: 24px;
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
}

.metaItem {
  display: flex;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 8px;
}

.metaLabel {
  font-weight: 600;
  color: #666;
  min-width: 80px;
  font-size: 14px;
}

.metaValue {
  color: #333;
  font-size: 14px;
}

.tagList {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  background: var(--dfa-help-primary-color, #6f42c1);
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

/* Loading, error, and empty states */
.loading, .error, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  text-align: center;
  color: #666;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid var(--dfa-help-primary-color, #6f42c1);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  color: #dc3545;
}

.errorDetail {
  font-size: 14px;
  color: #666;
  margin-top: 8px;
}

/* Responsive design */
@media (max-width: 768px) {
  .panel {
    width: 100vw;
  }
  
  .header {
    padding: 12px 16px;
  }
  
  .content {
    padding: 16px;
  }
  
  .helpContent {
    padding: 16px;
  }
  
  .languageTabs {
    flex-wrap: wrap;
  }
  
  .languageTab {
    font-size: 11px;
    padding: 4px 8px;
    min-width: 36px;
  }
}
```

#### Custom Button Styles

```css
/* Custom styling for help buttons */
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

/* Override panel styles if needed */
.help-panel-override {
  --panel-width: 400px;
  --panel-bg: #ffffff;
  --panel-shadow: 0 0 20px rgba(0,0,0,0.15);
}
```

## Testing Strategy

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapping: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/setupTests.ts',
  ],
};
```

### Test Example

```typescript
// src/components/__tests__/DFAHelpRenderer.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DFAHelpRenderer from '../DFAHelpRenderer';
import { DFAHelpData, APIResponse } from '../../types';

// Mock fetch
global.fetch = jest.fn();

const mockHelpData: DFAHelpData = {
  id: '1',
  title: 'Test Help',
  content: 'Test content',
  category: 'Test Category',
  tags: ['test', 'help']
};

const mockAPIResponse: APIResponse = {
  success: true,
  data: mockHelpData
};

describe('DFAHelpRenderer', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('renders help button correctly', () => {
    render(<DFAHelpRenderer helpKey="test-key" />);
    expect(screen.getByRole('button', { name: /open help/i })).toBeInTheDocument();
  });

  it('opens panel and fetches data when button is clicked', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAPIResponse,
    });

    render(<DFAHelpRenderer helpKey="test-key" />);
    
    const helpButton = screen.getByRole('button', { name: /open help/i });
    fireEvent.click(helpButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/api/dfahelp/keydata/test-key/');
    });

    expect(screen.getByText('Test Help')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

    const onError = jest.fn();
    render(<DFAHelpRenderer helpKey="test-key" onError={onError} />);
    
    const helpButton = screen.getByRole('button', { name: /open help/i });
    fireEvent.click(helpButton);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it('closes panel when close button is clicked', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAPIResponse,
    });

    render(<DFAHelpRenderer helpKey="test-key" />);
    
    const helpButton = screen.getByRole('button', { name: /open help/i });
    fireEvent.click(helpButton);

    await waitFor(() => {
      expect(screen.getByText('Test Help')).toBeInTheDocument();
    });

    const closeButton = screen.getByRole('button', { name: /close help/i });
    fireEvent.click(closeButton);

    expect(screen.queryByText('Test Help')).not.toBeInTheDocument();
  });
});
```

## Best Practices

### 1. Type Safety
- Always export TypeScript types alongside components
- Use proper type definitions for all props and data structures
- Provide default values for optional props

### 2. Bundle Optimization
- Use tree-shaking friendly exports
- Minimize bundle size with proper external dependencies
- Provide both CJS and ESM builds

### 3. CSS Handling
- Use CSS modules for component-specific styles
- Provide global CSS as separate import
- Ensure styles work in both JS and TS projects

### 4. Documentation
- Provide comprehensive JSDoc comments
- Include usage examples for both JS and TS
- Document all props and their types

### 5. Version Management
- Use semantic versioning
- Maintain a detailed CHANGELOG
- Tag releases properly in Git

### 6. Testing
- Write unit tests for all components
- Test both JavaScript and TypeScript usage
- Ensure accessibility compliance

### 7. Performance
- Use React.memo for expensive components
- Implement proper key props for lists
- Optimize re-renders with useMemo and useCallback

## Troubleshooting

### Common Issues

1. **TypeScript errors in JS projects**: Ensure types are properly exported and declaration files are included
2. **CSS not loading**: Check that CSS files are properly bundled and exported
3. **Build failures**: Verify all peer dependencies are correctly specified
4. **Import errors**: Ensure both CJS and ESM builds are working correctly

### Debug Commands

```bash
# Check package contents
npm pack --dry-run

# Test local installation
npm link
npm link @your-org/dfa-help-renderer

# Verify TypeScript compilation
npx tsc --noEmit --project tsconfig.json
```

This comprehensive guide ensures your DFA Help renderer package works seamlessly in both JavaScript and TypeScript Next.js projects without requiring any code adjustments in the package itself.
