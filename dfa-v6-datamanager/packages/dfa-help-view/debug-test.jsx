import React from 'react';
import { initDFAHelp, DFAHelpRenderer } from './src/index';

// Initialize DFA Help with debugging
console.log('🔧 Initializing DFA Help...');
initDFAHelp({
  apiURL: 'http://127.0.0.1:8000/api/dfahelp/keydata',
  colorCode: '#6f42c1',
  defaultLang: 'en',
  enable: true,
  languages: ['en', 'es', 'fr']
});
console.log('✅ DFA Help initialized');

// Test component
function DebugTest() {
  const handlePanelOpen = () => {
    console.log('📂 Panel opened');
  };

  const handlePanelClose = () => {
    console.log('📁 Panel closed');
  };

  const handleError = (error) => {
    console.error('❌ Error occurred:', error);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>DFA Help Renderer Debug Test</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>Test 1: Basic Help Button</h2>
        <DFAHelpRenderer
          helpKey="test-help-key"
          buttonText="Test Help"
          onPanelOpen={handlePanelOpen}
          onPanelClose={handlePanelClose}
          onError={handleError}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>Test 2: Icon Only Button</h2>
        <DFAHelpRenderer
          helpKey="test-help-key-2"
          buttonText=""
          onPanelOpen={handlePanelOpen}
          onPanelClose={handlePanelClose}
          onError={handleError}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>Test 3: Custom Styled Button</h2>
        <DFAHelpRenderer
          helpKey="test-help-key-3"
          buttonText="Custom Help"
          className="custom-help-button"
          onPanelOpen={handlePanelOpen}
          onPanelClose={handlePanelClose}
          onError={handleError}
        />
      </div>

      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <h3>Debug Information:</h3>
        <p>Open your browser's developer console to see debug logs.</p>
        <p>Look for messages starting with:</p>
        <ul>
          <li>🔧 DFA Help initialization</li>
          <li>🖱️ Button click events</li>
          <li>🌐 API calls</li>
          <li>📡 Response data</li>
          <li>❌ Error messages</li>
        </ul>
      </div>
    </div>
  );
}

export default DebugTest;
