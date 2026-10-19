# DFA Mailer Templates

A React component package for managing email templates with full CRUD operations. This package provides a beautiful, responsive table interface for managing email templates with the DFA Mailer backend API.

## Features

- 📋 **Table View**: Clean, responsive table displaying all email templates
- ➕ **Add Templates**: Create new email templates with form validation
- ✏️ **Edit Templates**: Modify existing templates inline
- 🗑️ **Delete Templates**: Remove templates with confirmation dialog
- ✅ **Form Validation**: Client-side validation for all required fields
- 📱 **Responsive Design**: Works perfectly on desktop and mobile devices
- 🎨 **Modern UI**: Beautiful design following current UI/UX best practices
- 🔄 **Loading States**: Smooth loading indicators during operations
- ⚠️ **Error Handling**: Comprehensive error handling with user feedback

## Installation

```bash
npm install dfa-mailer-templates
```

## Quick Start

```jsx
import React from 'react';
import { EmailTemplatesTable } from 'dfa-mailer-templates';

function App() {
  const handleError = (error: string) => {
    console.error('Error:', error);
    // Show error notification to user
  };

  const handleSuccess = (message: string) => {
    console.log('Success:', message);
    // Show success notification to user
  };

  return (
    <div>
      <EmailTemplatesTable 
        apiBaseUrl="http://localhost:8000/api/dfa-mailer"
        onError={handleError}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

export default App;
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `apiBaseUrl` | `string` | Yes | Base URL for the DFA Mailer API (e.g., "http://localhost:8000/api/dfa-mailer") |
| `onError` | `(error: string) => void` | No | Callback function called when an error occurs |
| `onSuccess` | `(message: string) => void` | No | Callback function called when an operation succeeds |

## API Endpoints

The component expects the following API endpoints to be available:

- `GET /templates/` - Get all templates
- `POST /templates/` - Create a new template
- `PUT /templates/{id}/` - Update a template
- `DELETE /templates/{id}/` - Delete a template

## Template Data Structure

```typescript
interface EmailTemplate {
  id: number;
  template_key: string;
  language: string;
  name: string;
  subject: string;
  html_content: string;
  text_content?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

## Example API Response

```json
{
  "id": 2,
  "template_key": "new_mail",
  "language": "en",
  "name": "New Mail Template",
  "subject": "New Mail Subject",
  "html_content": "<p>Dear {{ tag_name }}, welcome on board, cursor ai</p>",
  "text_content": "Dear {{ tag_name }}, welcome on board, cursor ai",
  "is_active": true,
  "created_at": "2025-09-19T04:28:54.802374Z",
  "updated_at": "2025-09-19T05:35:11.980678Z"
}
```

## Development

### Building the Package

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Running the Example

```bash
cd example
npm install
npm start
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Dependencies

- React 16.8+
- Axios (for API calls)

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
