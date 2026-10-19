# DFA Help Admin

A comprehensive React component package for managing DFA Help Service content through an intuitive admin interface.

## 📖 Overview

**DFA Help Admin** is a powerful React component that provides a complete content management interface for the DFA Help Service platform. It features a hierarchical tree view for content navigation, multi-language editing capabilities, and seamless API integration.

## 🎯 Package Purpose

### Primary Objectives
- **Content Management**: Provide an intuitive interface for managing hierarchical content structures
- **Multi-Language Support**: Enable content creation and editing in 6 different languages
- **API Integration**: Seamlessly integrate with DFA Help Service backend APIs
- **User Experience**: Deliver a professional, responsive interface for content editors

### Target Users
- **Content Managers**: Professionals managing help documentation
- **Localization Teams**: Teams working with multi-language content
- **System Administrators**: Users managing content structure and organization
- **End Users**: Content consumers accessing help documentation

## ✨ Features

### Core Functionality
- **Tree View Navigation**: Hierarchical content browsing with expand/collapse
- **Rich Text Editing**: HTML editor with formatting controls for content creation
- **Multi-Language Support**: 6 languages (English, French, Spanish, Arabic, Portuguese, Russian)
- **Real-time Updates**: Live content synchronization with backend APIs
- **Content Validation**: Form validation and error handling
- **Responsive Design**: Mobile-friendly interface for all screen sizes

### Advanced Features
- **Content Hierarchy Management**: Parent-child relationship handling
- **Bulk Operations**: Efficient content management workflows
- **Search and Filter**: Quick content discovery capabilities
- **Version Control**: Content change tracking and history
- **Export/Import**: Content migration and backup functionality

## 🏗️ Architecture

### Package Structure
```
dfa-help-admin/
├── src/
│   ├── components/
│   │   ├── TreeView.tsx          # Hierarchical content navigation
│   │   ├── Form.tsx              # Content editing interface
│   │   └── DFAHelpService.tsx    # Main component orchestrator
│   ├── types.ts                  # TypeScript type definitions
│   ├── styles.css                # Component styling
│   └── index.ts                  # Package exports
├── dist/                         # Built package files
├── package.json                  # Package configuration
├── tsconfig.json                 # TypeScript configuration
├── rollup.config.js              # Build configuration
└── README.md                     # Package overview
```

### Component Architecture
- **DFAHelpService**: Main container component managing state and API calls
- **TreeView**: Hierarchical navigation component with expand/collapse
- **Form**: Multi-language content editing with HTML editor
- **Types**: Comprehensive TypeScript interfaces for type safety

### State Management
- **React Hooks**: useState and useEffect for component state
- **API State**: Loading, error, and success states
- **Form State**: Multi-language content management
- **Navigation State**: Tree view selection and expansion

## 📦 Installation

```bash
# Install from npm (when published)
npm install dfa-help-admin

# Install from Bitbucket repository
npm install git+https://bitbucket.org/your-username/dfa-help-admin.git

# Install from local development
npm install ./dfa-help-admin
```

## 🚀 Quick Start

```tsx
import { DFAHelpAdmin } from 'dfa-help-admin';
import 'dfa-help-admin/dist/styles.css';

function App() {
  return (
    <div className="app">
      <DFAHelpAdmin
        apiBaseUrl="https://your-api-endpoint.com/api"
        bearerToken="your-bearer-token"
        onUpdate={(response) => console.log('Updated:', response)}
        onError={(error) => console.error('Error:', error)}
      />
    </div>
  );
}
```

### Advanced Configuration
```tsx
<DFAHelpAdmin
  className="custom-dfa-service"
  onUpdate={(response) => {
    // Handle successful updates
    showNotification('Content saved successfully');
  }}
  onError={(error) => {
    // Handle errors
    showErrorNotification(error);
  }}
/>
```

### Environment-Specific Configuration
```tsx
// Development environment
<DFAHelpAdmin
  apiBaseUrl="http://localhost:3000/api"
  bearerToken="dev-token-123"
/>

// Staging environment
<DFAHelpAdmin
  apiBaseUrl="https://staging-api.dataforall.org/api"
  bearerToken="staging-token-456"
/>

// Production environment (uses defaults)
<DFAHelpAdmin
  // Uses default production endpoints
/>
```

### Configuration Props
| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `apiBaseUrl` | `string` | No | `'https://help-api.dataforall.org/api'` | Base URL for API endpoints |
| `bearerToken` | `string` | No | Production token | Bearer token for API authentication |

## 🔌 API Integration

### Backend Endpoints
- **GET** `/api/adaptations` - Fetch available adaptations
- **GET** `/api/keys?adaptation_id={id}` - Fetch content keys for adaptation
- **GET** `/api/keydata/{keyId}` - Fetch detailed content data
- **POST** `/api/update` - Update content with new data
- **DELETE** `/api/delete?id={id}` - Delete content records

### Authentication
```typescript
const headers = {
  'Authorization': `Bearer ${BEARER_TOKEN}`,
  'Content-Type': 'application/json',
};
```

### Data Flow
1. **Component Mount**: Fetches adaptations list
2. **Adaptation Selection**: Loads content tree for selected adaptation
3. **Node Selection**: Fetches detailed content data
4. **Content Editing**: Updates content through form interface
5. **Save Operation**: Posts updated content to backend
6. **State Update**: Refreshes local state with new data

## 🧩 Component Structure

### DFAHelpAdmin Component
**Purpose**: Main orchestrator component managing the entire interface

**Props**:
- `className`: Custom CSS class for styling
- `apiBaseUrl`: Configurable API base URL (defaults to production endpoint)
- `bearerToken`: Configurable bearer token for API authentication
- `onUpdate`: Callback for successful content updates
- `onError`: Callback for error handling

**State Management**:
- Adaptations list
- Selected adaptation
- Content tree data
- Selected node
- Loading states
- Error handling

### TreeView Component
**Purpose**: Hierarchical content navigation with expand/collapse

**Features**:
- Tree structure visualization
- Expand/collapse functionality
- Node selection handling
- Delete functionality
- Responsive design

**Props**:
- `nodes`: Array of content nodes
- `onNodeSelect`: Node selection callback
- `onNodeDelete`: Node deletion callback
- `selectedNode`: Currently selected node

### Form Component
**Purpose**: Multi-language content editing interface

**Features**:
- 6 language tabs (EN, FR, ES, AR, PT, RS)
- HTML editor with formatting controls
- Form validation
- Real-time content updates
- Auto-save functionality

**Editor Controls**:
- Bold, Italic, Underline
- Bullet and numbered lists
- Hyperlink insertion
- Heading styles (H1, H2)

## ⚙️ Configuration

### Build Configuration
```javascript
// rollup.config.js
export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'esm',
      sourcemap: true
    },
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true
    }
  ],
  plugins: [
    typescript(),
    resolve(),
    commonjs(),
    copy({
      targets: [{ src: 'src/styles.css', dest: 'dist' }]
    })
  ]
};
```

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "declaration": true,
    "outDir": "./dist"
  }
}
```

## 🎨 Styling

### CSS Architecture
- **Component-scoped styles**: Isolated styling for each component
- **Responsive design**: Mobile-first approach
- **CSS custom properties**: Consistent theming
- **Flexbox layout**: Modern layout techniques

### Key Style Classes
```css
.dfa-help-admin          /* Main container */
.dfa-header               /* Header section */
.dfa-left-panel          /* Left navigation panel */
.dfa-body-panel          /* Main content area */
.tree-view               /* Tree navigation */
.html-editor             /* Rich text editor */
.form-tabs               /* Language tabs */
.loading-spinner         /* Loading indicator */
```

### Responsive Breakpoints
- **Desktop**: 1024px+
- **Tablet**: 768px - 1023px
- **Mobile**: < 768px

## 🌐 Multi-Language Support

### Supported Languages
1. **English (en)**: Primary language, default selection
2. **French (fr)**: Secondary language support
3. **Spanish (es)**: Spanish content management
4. **Arabic (ar)**: RTL language support
5. **Portuguese (pt)**: Portuguese content
6. **Russian (rs)**: Cyrillic script support

### Language Implementation
```typescript
const [activeTab, setActiveTab] = useState('en');

// Language-specific content loading
const translation = selectedNode.apiData.translations.find(
  t => t.locale === activeTab
);
```

### Content Localization
- **Per-language content**: Separate content for each language
- **Language switching**: Real-time content updates
- **Content preservation**: Maintains formatting across languages
- **Fallback handling**: Graceful degradation for missing translations

## 📚 Examples

### Basic Tree Navigation
```tsx
// TreeView component usage
<TreeView
  nodes={contentNodes}
  onNodeSelect={(node) => setSelectedNode(node)}
  onNodeDelete={(nodeId) => handleDelete(nodeId)}
  selectedNode={selectedNode}
/>
```

### HTML Editor Implementation
```tsx
// Form component with HTML editor
<Form
  selectedNode={selectedNode}
  selectedAdaptation={adaptationCode}
  onSave={handleSave}
/>
```

### API Integration Example
```tsx
// Fetching content data
const fetchContent = async (nodeId) => {
  const response = await fetch(`/api/keydata/${nodeId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Loading States Not Working
**Problem**: Loading spinner not appearing
**Solution**: Check loading state management in DFAHelpAdmin

#### 2. HTML Editor Not Rendering
**Problem**: Content showing as raw HTML
**Solution**: Verify dangerouslySetInnerHTML usage and content sanitization

#### 3. Language Switching Issues
**Problem**: Content not updating when switching languages
**Solution**: Check activeTab state and translation loading logic

#### 4. API Integration Errors
**Problem**: 401/403 authentication errors
**Solution**: Verify bearer token and API endpoint configuration

### Debug Information
```typescript
// Enable console logging for debugging
console.log('🔍 Node selection:', selectedNode);
console.log('📡 API response:', apiData);
console.log('🌐 Language switch:', activeTab);
```

## 🤝 Contributing

### Development Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Start development: `npm run dev`
4. Build package: `npm run build`

### Code Standards
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code quality and consistency
- **Prettier**: Code formatting
- **React Hooks**: Modern React patterns

### Testing
- **Component Testing**: Test individual components
- **Integration Testing**: Test component interactions
- **API Testing**: Test backend integration
- **Responsive Testing**: Test mobile and desktop layouts

## 📄 License

This package is licensed under the MIT License. See the LICENSE file for details.

## 🆘 Support

For technical support and questions:
- **Documentation**: Refer to this documentation
- **Issues**: Report bugs and feature requests
- **Community**: Join developer discussions
- **Email**: Contact the development team

---

## 🔄 Version History

### v2.0.0 (Current)
- Complete 6-language support
- Professional HTML editor
- Floating loading spinner
- Enhanced tree view navigation
- Responsive design improvements

### v1.0.0
- Initial package release
- Basic tree view functionality
- Multi-language support (3 languages)
- Form editing capabilities

---

*This documentation is maintained by the DFA Help Service development team. For the latest updates, please refer to the package repository.*
