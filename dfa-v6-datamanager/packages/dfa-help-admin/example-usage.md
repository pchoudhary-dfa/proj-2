# Example Usage in Next.js Project

## 1. Install the Package

First, install the package in your Next.js project:

```bash
npm install dfa-help-admin
```

## 2. Import and Use

```tsx
// pages/dfa-help.tsx or app/dfa-help/page.tsx
'use client';

import React from 'react';
import { DFAHelpAdmin } from 'dfa-help-admin';
import 'dfa-help-admin/dist/styles.css';

export default function DFAHelpPage() {
  const handleUpdate = (response) => {
    console.log('Update successful:', response);
    // Handle successful update
  };

  const handleError = (error) => {
    console.error('Error occurred:', error);
    // Handle error
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">DFA Help Management</h1>
      
      <DFAHelpAdmin
        onUpdate={handleUpdate}
        onError={handleError}
        className="custom-dfa-styles"
        apiBaseUrl="https://your-api.com/api"
        bearerToken="your-bearer-token"
      />
    </div>
  );
}
```

## 3. Custom Styling

You can override the default styles by targeting the component's CSS classes:

```css
/* Your custom CSS */
.custom-dfa-styles .dfa-header {
  background: #1a365d; /* Custom header color */
}

.custom-dfa-styles .btn-primary {
  background: #e53e3e; /* Custom primary button color */
}
```

## 4. API Configuration

The component uses the following API endpoints by default:

- Base URL: `https://help-api.dataforall.org/api`
- Adaptations: `GET /api/adaptations`
- Keys: `GET /api/keys?adaptation_id={id}`
- Key Data: `GET /api/keydata/{keyId}`
- Update: `POST /api/update`
- Delete: `DELETE /api/delete?id={id}`

## 5. Environment Variables

You can configure the API base URL by setting an environment variable:

```env
# .env.local
NEXT_PUBLIC_DFA_API_BASE_URL=https://help-api.dataforall.org/api
NEXT_PUBLIC_DFA_BEARER_TOKEN=your-bearer-token
```

## 6. TypeScript Support

The package includes full TypeScript support:

```tsx
import { 
  DFAHelpAdmin, 
  UpdateResponse, 
  DFAHelpAdminProps 
} from 'dfa-help-admin';

interface CustomProps extends DFAHelpAdminProps {
  customProp?: string;
}

const CustomDFAHelp: React.FC<CustomProps> = ({ customProp, ...props }) => {
  const handleUpdate = (response: UpdateResponse) => {
    // Fully typed response
    if (response.success) {
      console.log('Success:', response.message);
    }
  };

  return <DFAHelpAdmin {...props} onUpdate={handleUpdate} />;
};
```

## 7. Integration with Existing Components

You can integrate the DFA Help Admin with your existing components:

```tsx
import { DFAHelpAdmin } from 'dfa-help-admin';
import { Button } from '@/components/Button';

export default function IntegratedPage() {
  const [showDFA, setShowDFA] = useState(false);

  return (
    <div>
      <Button onClick={() => setShowDFA(!showDFA)}>
        {showDFA ? 'Hide' : 'Show'} DFA Help
      </Button>
      
      {showDFA && (
        <div className="mt-4">
          <DFAHelpAdmin
            onUpdate={(response) => {
              console.log('DFA updated:', response);
              setShowDFA(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
```

## 8. Error Handling

Implement proper error handling for production use:

```tsx
const handleError = (error: string) => {
  // Log error to monitoring service
  console.error('DFA Help Admin Error:', error);
  
  // Show user-friendly error message
  toast.error('Failed to load help content. Please try again later.');
  
  // Report to error tracking service
  Sentry.captureException(new Error(error));
};
```

## 9. Performance Optimization

For better performance, consider lazy loading:

```tsx
import dynamic from 'next/dynamic';

const DFAHelpAdmin = dynamic(
  () => import('dfa-help-admin').then(mod => ({ default: mod.DFAHelpAdmin })),
  { 
    loading: () => <div>Loading DFA Help Admin...</div>,
    ssr: false // Disable SSR if not needed
  }
);
```

## 10. Testing

Test the integration in your development environment:

```tsx
// Test the component with mock data
const MockDFAHelp = () => (
  <DFAHelpAdmin
    onUpdate={(response) => {
      // Test update callback
      expect(response.success).toBe(true);
    }}
    onError={(error) => {
      // Test error callback
      expect(error).toBeDefined();
    }}
  />
);
```

This integration provides a seamless way to manage DFA help content within your Next.js application while maintaining the existing design system and user experience.
