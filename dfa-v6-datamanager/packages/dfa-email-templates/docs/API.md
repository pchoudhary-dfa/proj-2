# DFA Mailer Templates - API Documentation

## Overview

The DFA Mailer Templates package provides a React component for managing email templates with full CRUD operations. It's designed to work with the DFA Mailer backend API.

## Installation

```bash
npm install dfa-mailer-templates
```

## Components

### EmailTemplatesTable

The main component that displays a table of email templates with CRUD operations.

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `apiBaseUrl` | `string` | Yes | Base URL for the DFA Mailer API (e.g., "http://localhost:8000/api/dfa-mailer") |
| `onError` | `(error: string) => void` | No | Callback function called when an error occurs |
| `onSuccess` | `(message: string) => void` | No | Callback function called when an operation succeeds |

#### Example Usage

```tsx
import React from 'react';
import { EmailTemplatesTable } from 'dfa-mailer-templates';

function App() {
  const handleError = (error: string) => {
    console.error('Error:', error);
  };

  const handleSuccess = (message: string) => {
    console.log('Success:', message);
  };

  return (
    <EmailTemplatesTable 
      apiBaseUrl="http://localhost:8000/api/dfa-mailer"
      onError={handleError}
      onSuccess={handleSuccess}
    />
  );
}
```

### EmailTemplateForm

A form component for creating and editing email templates.

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `template` | `EmailTemplate \| null` | No | Template to edit (null for new template) |
| `onSubmit` | `(data: EmailTemplateFormData) => void` | Yes | Callback when form is submitted |
| `onCancel` | `() => void` | Yes | Callback when form is cancelled |

## Types

### EmailTemplate

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

### EmailTemplateFormData

```typescript
interface EmailTemplateFormData {
  template_key: string;
  language: string;
  name: string;
  subject: string;
  html_content: string;
  text_content?: string;
  is_active: boolean;
}
```

## API Endpoints

The component expects the following API endpoints to be available:

### GET /templates/
Retrieve all email templates.

**Response:**
```json
[
  {
    "id": 1,
    "template_key": "welcome_email",
    "language": "en",
    "name": "Welcome Email",
    "subject": "Welcome to our platform!",
    "html_content": "<p>Dear {{ user_name }}, welcome!</p>",
    "text_content": "Dear {{ user_name }}, welcome!",
    "is_active": true,
    "created_at": "2025-01-19T10:00:00Z",
    "updated_at": "2025-01-19T10:00:00Z"
  }
]
```

### POST /templates/
Create a new email template.

**Request Body:**
```json
{
  "template_key": "welcome_email",
  "language": "en",
  "name": "Welcome Email",
  "subject": "Welcome to our platform!",
  "html_content": "<p>Dear {{ user_name }}, welcome!</p>",
  "text_content": "Dear {{ user_name }}, welcome!",
  "is_active": true
}
```

### PUT /templates/{id}/
Update an existing email template.

**Request Body:** Same as POST

### DELETE /templates/{id}/
Delete an email template.

**Response:** 204 No Content

## Features

- **Table View**: Displays all email templates in a responsive table
- **Add Template**: Create new email templates with validation
- **Edit Template**: Modify existing templates inline
- **Delete Template**: Remove templates with confirmation
- **Form Validation**: Client-side validation for all required fields
- **Responsive Design**: Works on desktop and mobile devices
- **Error Handling**: Comprehensive error handling with user feedback
- **Loading States**: Loading indicators during API operations

## Styling

The component comes with built-in CSS that follows modern design principles:

- Clean, minimal design
- Responsive layout
- Hover effects and transitions
- Status badges for active/inactive templates
- Modal forms with overlay
- Form validation styling

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Dependencies

- React 16.8+
- Axios (for API calls)

## Development

To build the package:

```bash
npm run build
```

To run in development mode:

```bash
npm run dev
```
