# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-09-02

### 🎨 Major Design Update
- **Redesigned Help Panel**: Updated to match professional help interface design
- **Clean Content Layout**: Simplified structure with large title, description, purpose, and related keys
- **Line Separators**: Added visual dividers between content sections
- **Improved Typography**: Enhanced title styling (28px, bold) and content readability
- **Removed Metadata Clutter**: Cleaned up interface by removing technical metadata from main content

### ✨ Enhanced Features
- **Standalone CSS File**: Added complete `styles.css` file with all CSS classes
- **CSS Import Options**: Multiple ways to include styles (import, HTML link, CSS classes)
- **Enhanced Debugging**: Added comprehensive console logging for API calls and component behavior
- **Better Error Handling**: Improved error messages and debugging information
- **Installation Scripts**: Added automated installation and verification scripts

### 🔧 Technical Improvements
- **Package Structure**: Updated to include standalone CSS file in distribution
- **Build Process**: Enhanced build configuration with proper file inclusion
- **Documentation**: Comprehensive README with CSS styling instructions
- **Troubleshooting**: Added detailed debugging guides and installation troubleshooting

### 📦 Installation & Usage
- **Git Installation**: Fixed git URL format for proper package installation
- **CSS Styling**: Multiple options for including and customizing styles
- **Debug Tools**: Added verification scripts and debugging components

## [1.0.0] - 2024-01-01

### Added
- Initial release of DFA Help Renderer package
- Runtime API integration for fetching help content
- Multi-language support with tabbed interface
- Global configuration system with initialization
- Customizable theming with CSS custom properties
- TypeScript support with full type definitions
- JavaScript compatibility for both JS and TS Next.js projects
- Font size controls in help panel
- Related keys display with interactive elements
- Responsive design for mobile and desktop
- Error handling and loading states
- Accessibility features (ARIA labels, keyboard navigation)

### Features
- **DFAHelpRenderer Component**: Main component for rendering help buttons
- **HelpPanel Component**: Slide-out panel for displaying help content
- **Global Configuration**: `initDFAHelp()` function for app-wide settings
- **API Integration**: Fetches content from configurable API endpoints
- **Multi-language**: Automatic language detection and switching
- **Theme Support**: Customizable colors and icons
- **Content Structure**: Displays Title, Description, Purpose, and Related Keys
- **Build System**: Rollup configuration for CJS and ESM builds
