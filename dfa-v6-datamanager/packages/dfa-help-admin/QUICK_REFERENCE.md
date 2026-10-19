# DFA Help Admin - Quick Reference

A fast reference guide for developers using the `dfa-help-admin` package.

## 📦 Installation

```bash
# From Bitbucket repository
npm install git+https://bitbucket.org/your-username/dfa-help-admin.git

# From local development
npm install ./dfa-help-admin
```

## 🚀 Quick Start

```tsx
import { DFAHelpAdmin } from 'dfa-help-admin';
import 'dfa-help-admin/dist/styles.css';

<DFAHelpAdmin
  apiBaseUrl="https://your-api.com/api"
  bearerToken="your-token"
/>
```

## Component Props

```tsx
<DFAHelpAdmin
  className="custom-class"           // Optional CSS class
  apiBaseUrl="https://api.example.com/api"  // Optional API base URL
  bearerToken="your-token-here"      // Optional bearer token
  onUpdate={(response) => {}}        // Optional update callback
  onError={(error) => {}}            // Optional error callback
/>
```

### Configuration Options
- **`apiBaseUrl`**: Override default API endpoint for different environments
- **`bearerToken`**: Provide custom authentication token
- **Defaults**: Production endpoints if not specified

### TreeView
```tsx
interface TreeViewProps {
  nodes: KeyNode[];                     // Content nodes array
  onNodeSelect: (node: KeyNode) => void; // Node selection handler
  onNodeDelete: (nodeId: number) => void; // Node deletion handler
  selectedNode?: KeyNode;               // Currently selected node
}
```

### Form
```tsx
interface FormProps {
  selectedNode: KeyNode | null;         // Selected node for editing
  selectedAdaptation: string;           // Current adaptation code
  onSave: (payload: UpdatePayload) => Promise<void>; // Save handler
}
```

## 🌐 Supported Languages

| Language | Code | Direction |
|----------|------|-----------|
| English  | `en` | LTR       |
| French   | `fr` | LTR       |
| Spanish  | `es` | LTR       |
| Arabic   | `ar` | RTL       |
| Portuguese | `pt` | LTR     |
| Russian  | `rs` | LTR       |

## 🔌 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/adaptations` | Fetch adaptations list |
| GET | `/api/keys?adaptation_id={id}` | Fetch content tree |
| GET | `/api/keydata/{keyId}` | Fetch detailed content |
| POST | `/api/update` | Update content |
| DELETE | `/api/delete?id={id}` | Delete content |

## 📝 HTML Editor Controls

| Control | Function | Shortcut |
|---------|----------|----------|
| **B** | Bold text | - |
| **I** | Italic text | - |
| **U** | Underline text | - |
| **• List** | Bullet list | - |
| **1. List** | Numbered list | - |
| **🔗 Link** | Insert hyperlink | - |
| **H1** | Heading 1 | - |
| **H2** | Heading 2 | - |

## 🎨 CSS Classes

### Main Components
```css
.dfa-help-admin          /* Main container */
.dfa-header               /* Header section */
.dfa-left-panel          /* Left navigation */
.dfa-body-panel          /* Main content area */
```

### Tree View
```css
.tree-view               /* Tree container */
.tree-node               /* Individual node */
.tree-expand-icon        /* Expand/collapse icon */
.tree-delete-icon        /* Delete button */
.tree-children           /* Child nodes container */
```

### Form Elements
```css
.form-tabs               /* Language tabs */
.html-editor             /* HTML editor container */
.editor-toolbar          /* Editor toolbar */
.editor-content          /* Editor content area */
.toolbar-btn             /* Toolbar buttons */
```

### States
```css
.loading-spinner         /* Loading indicator */
.error-message           /* Error display */
.selected                /* Selected state */
```

## 🔧 Common Patterns

### Handle Node Selection
```tsx
const handleNodeSelect = (node: KeyNode) => {
  console.log('Selected node:', node.title);
  setSelectedNode(node);
};
```

### Handle Content Save
```tsx
const handleSave = async (payload: UpdatePayload) => {
  try {
    await onSave(payload);
    showSuccessMessage('Content saved successfully');
  } catch (error) {
    showErrorMessage('Failed to save content');
  }
};
```

### Handle Errors
```tsx
const handleError = (error: string) => {
  console.error('DFA Service Error:', error);
  // Show user-friendly error message
  showNotification(error, 'error');
};
```

## 🐛 Debug Tips

### Enable Console Logging
```tsx
// Add to your component for debugging
console.log('🔍 Node data:', selectedNode);
console.log('📡 API response:', apiData);
console.log('🌐 Active language:', activeTab);
```

### Check API Responses
```tsx
// Monitor API calls in browser dev tools
// Network tab will show all requests to DFA endpoints
```

### Verify Authentication
```tsx
// Check if bearer token is included in headers
// Look for 401/403 errors in console
```

## 📱 Responsive Design

### Breakpoints
- **Desktop**: 1024px+
- **Tablet**: 768px - 1023px
- **Mobile**: < 768px

### Mobile Considerations
- Tree view becomes vertical stack
- Form tabs wrap to multiple lines
- HTML editor toolbar adapts to screen size

## ⚡ Performance Tips

### Optimize Re-renders
```tsx
// Use React.memo for child components
const TreeViewItem = React.memo(({ node, ...props }) => {
  // Component implementation
});
```

### Debounce API Calls
```tsx
// Implement debouncing for frequent operations
const debouncedSave = useCallback(
  debounce((data) => handleSave(data), 500),
  []
);
```

### Lazy Load Content
```tsx
// Load detailed content only when needed
const loadNodeDetails = useCallback(async (nodeId) => {
  if (!nodeDetails[nodeId]) {
    const details = await fetchNodeDetails(nodeId);
    setNodeDetails(prev => ({ ...prev, [nodeId]: details }));
  }
}, [nodeDetails]);
```

## 🔒 Security Considerations

### API Authentication
- Always use HTTPS in production
- Implement token refresh logic
- Validate API responses
- Handle authentication errors gracefully

### Content Sanitization
- HTML content is rendered as-is
- Consider implementing content sanitization
- Validate user input before submission
- Escape special characters appropriately

## 📚 Additional Resources

- **Full Documentation**: `DOCUMENTATION.md`
- **Product Requirements**: `PRD.md`
- **Installation Guide**: `INSTALL.md`
- **Example Usage**: `example-usage.md`
- **Package Info**: `package.json`

## 🆘 Need Help?

1. **Check this Quick Reference** first
2. **Review Full Documentation** in `DOCUMENTATION.md`
3. **Check Console Logs** for error details
4. **Verify API Endpoints** are accessible
5. **Contact Development Team** for support

---

*This quick reference is part of the DFA Help Service package documentation. For comprehensive information, refer to `DOCUMENTATION.md`.*
