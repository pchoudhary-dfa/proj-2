# Installation and Build Guide

## Prerequisites

- Node.js 16+ 
- npm or yarn package manager

## Quick Start

### 1. Navigate to Package Directory

```bash
cd dfa-help-admin
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Package

```bash
npm run build
```

### 4. Test the Build

```bash
npm run dev
```

## Development Workflow

### Watch Mode

For development with auto-rebuild:

```bash
npm run dev
```

### Clean Build

To clean previous builds:

```bash
npm run clean
npm run build
```

### Publishing

To publish to npm:

```bash
npm publish
```

**Note:** This will automatically run the build process before publishing.

## Build Output

After building, the `dist/` folder will contain:

- `index.js` - CommonJS bundle
- `index.cjs` - CommonJS bundle (alternative)
- `index.d.ts` - TypeScript declarations
- Source maps for debugging

## File Structure

```
dfa-help-admin/
├── src/
│   ├── components/
│   │   ├── TreeView.tsx
│   │   └── Form.tsx
│   ├── DFAHelpAdmin.tsx
│   ├── types.ts
│   ├── index.ts
│   └── styles.css
├── dist/           # Built files
├── package.json
├── tsconfig.json
├── rollup.config.js
├── README.md
└── INSTALL.md
```

## Configuration Files

### TypeScript (tsconfig.json)

- Target: ES2020
- JSX: React JSX
- Declaration files enabled
- Strict mode enabled

### Rollup (rollup.config.js)

- CommonJS and ES Module outputs
- TypeScript compilation
- External React dependencies
- Source maps enabled

## Troubleshooting

### Build Errors

1. **TypeScript errors**: Check `tsconfig.json` configuration
2. **Rollup errors**: Verify `rollup.config.js` setup
3. **Missing dependencies**: Run `npm install` again

### Common Issues

- **Peer dependency warnings**: Normal for React packages
- **TypeScript strict mode**: Ensure all types are properly defined
- **CSS import issues**: Verify styles.css is included in build

### Performance Tips

- Use `npm run dev` for development
- Use `npm run build` for production builds
- Clean builds with `npm run clean` when needed

## Integration Testing

Test the built package in your Next.js project:

1. Build the package: `npm run build`
2. Copy `dist/` folder to your project
3. Import and test the component
4. Verify all functionality works as expected

## Support

For build or installation issues:

1. Check Node.js version compatibility
2. Verify all dependencies are installed
3. Check TypeScript configuration
4. Review Rollup configuration

## Next Steps

After successful build:

1. Test the component in your project
2. Customize styles as needed
3. Integrate with your existing components
4. Deploy to production
