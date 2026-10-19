import React from 'react';
import { EmailTemplatesTable } from 'dfa-mailer-templates';

function App() {
  const handleError = (error: string) => {
    console.error('Error:', error);
    // You can show a toast notification or handle the error as needed
    alert(`Error: ${error}`);
  };

  const handleSuccess = (message: string) => {
    console.log('Success:', message);
    // You can show a success notification
    alert(`Success: ${message}`);
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>
        DFA Mailer Templates Demo
      </h1>
      
      <EmailTemplatesTable 
        apiBaseUrl="http://localhost:8000/api/dfa-mailer"
        onError={handleError}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

export default App;
