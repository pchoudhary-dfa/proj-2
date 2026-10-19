# DFA Help Admin

A React component for managing DFA (Data For All) help content with tree view navigation and form editing capabilities.

## Features

- **Adaptation Selection**: Dropdown to select from available adaptations
- **Tree View Navigation**: Hierarchical display of keys with parent-child relationships
- **Multi-language Support**: Tabs for English, French, Spanish, Arabic, Portuguese, and Russian content
- **Form Management**: Edit code, title, description, purpose, and related keys
- **Automatic Key Generation**: Smart key generation based on adaptation and parent codes
- **API Integration**: Seamless integration with DFA Help API endpoints
- **Responsive Design**: Mobile-friendly interface with clean, modern styling

## Installation

```bash
npm install dfa-help-admin
```

## Usage

```tsx
import React from 'react';
import { DFAHelpAdmin } from 'dfa-help-admin';
import 'dfa-help-admin/dist/styles.css';

function App() {
  const handleUpdate = (response) => {
    console.log('Update successful:', response);
  };

  const handleError = (error) => {
    console.error('Error occurred:', error);
  };

  return (
    <DFAHelpAdmin
      onUpdate={handleUpdate}
      onError={handleError}
      className="custom-styles"
      apiBaseUrl="https://your-api.com/api"
      bearerToken="your-bearer-token"
    />
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `className` | `string` | No | Additional CSS classes for styling |
| `apiBaseUrl` | `string` | No | Base URL for API endpoints (defaults to DFA Help API) |
| `bearerToken` | `string` | No | Bearer token for API authentication (defaults to DFA Help token) |
| `onUpdate` | `(response: UpdateResponse) => void` | No | Callback when data is successfully saved |
| `onError` | `(error: string) => void` | No | Callback when an error occurs |

## API Endpoints

The component integrates with the following DFA Help API endpoints:

- `GET /api/adaptations` - Fetch available adaptations
- `GET /api/keys?adaptation_id={id}` - Fetch keys for selected adaptation
- `GET /api/keydata/{keyId}` - Fetch detailed key data
- `POST /api/update` - Save updated key data
- `DELETE /api/delete?id={id}` - Delete key records

## Data Structure

### Adaptation
```typescript
interface Adaptation {
  id: number;
  code: string;
  name: string;
}
```

### Key Node
```typescript
interface KeyNode {
  id: number;
  key: string;
  code: string;
  related_keys: string | string[];
  parent_id: string | null;
  title: string;
  children: KeyNode[];
}
```

### Update Payload
```typescript
interface UpdatePayload {
  id: number;
  key: string;
  code: string;
  lang: string;
  title: string;
  desc: string;
  purpose: string;
  related_keys: string;
}
```

## Key Generation Logic

- **Top-level keys**: `{Adaptation Code}-{Key Code}`
- **Child keys**: `{Parent Code}-{Key Code}`

Example:
- Adaptation: "BYD", Code: "DASH" → Generated Key: "BYD-DASH"
- Parent: "DASH", Code: "ADDASH" → Generated Key: "DASH-ADDASH"

## Styling

The component includes built-in CSS styles that can be customized. Import the styles:

```tsx
import 'dfa-help-admin/dist/styles.css';
```

### CSS Custom Properties

You can override default styles using CSS custom properties or by targeting the component's CSS classes.

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Setup

```bash
cd dfa-help-admin
npm install
```

### Build

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions, please create an issue in the GitHub repository.
