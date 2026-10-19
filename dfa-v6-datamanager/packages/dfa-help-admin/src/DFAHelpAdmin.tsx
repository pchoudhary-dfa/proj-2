/**
 * DFA Help Admin Component
 * 
 * A comprehensive content management interface for DFA Help Service
 * with tree view navigation, multi-language editing, and API integration.
 */
import React, { useState, useEffect } from 'react';
import { TreeView } from './components/TreeView';
import { Form } from './components/Form';
import { 
  Adaptation, 
  AdaptationsResponse, 
  KeyNode, 
  KeysResponse, 
  UpdatePayload, 
  UpdateResponse,
  KeyDataResponse,
  DFAHelpAdminProps 
} from './types';

const API_BASE_URL = 'https://help-api.dataforall.org/api';
const BEARER_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2hlbHAtYXBpLmRhdGFmb3JhbGwub3JnL2FwaS9sb2dpbiIsImlhdCI6MTc1NTg0MzcwOSwiZXhwIjoxNzg3Mzc5NzA5LCJuYmYiOjE3NTU4NDM3MDksImp0aSI6IndQS2c0N2hRaWI0aHlmRDIiLCJzdWIiOiIxIiwicHJ2IjoiMjNiZDVjODk0OWY2MDBhZGIzOWU3MDFjNDAwODcyZGI3YTU5NzZmNyJ9.k_0Iuu7GkHXZFNBj2AZIwqgG23kCEZDxHJAmQ5e7rnQ';

/**
 * DFA Help Admin - Main component for content management
 */
export const DFAHelpAdmin: React.FC<DFAHelpAdminProps> = ({
  className = '',
  apiBaseUrl = 'https://help-api.dataforall.org/api',
  bearerToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2hlbHAtYXBpLmRhdGFmb3JhbGwub3JnL2FwaS9sb2dpbiIsImlhdCI6MTc1NTg0MzcwOSwiZXhwIjoxNzg3Mzc5NzA5LCJuYmYiOjE3NTU4NDM3MDksImp0aSI6IndQS2c0N2hRaWI0aHlmRDIiLCJzdWIiOiIxIiwicHJ2IjoiMjNiZDVjODk0OWY2MDBhZGIzOWU3MDFjNDAwODcyZGI3YTU5NzZmNyJ9.k_0Iuu7GkHXZFNBj2AZIwqgG23kCEZDxHJAmQ5e7rnQ',
  onUpdate,
  onError,
  showHeader = false
}) => {
  const [adaptations, setAdaptations] = useState<Adaptation[]>([]);
  const [selectedAdaptationId, setSelectedAdaptationId] = useState<string>('');
  const [selectedAdaptationCode, setSelectedAdaptationCode] = useState<string>('');
  const [keys, setKeys] = useState<KeyNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<KeyNode | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Use the configurable API base URL
  const API_BASE_URL = apiBaseUrl;
  const BEARER_TOKEN = bearerToken;

  // Fetch adaptations on component mount
  useEffect(() => {
    fetchAdaptations();
  }, []);

  // Fetch keys when adaptation changes
  useEffect(() => {
    if (selectedAdaptationId) {
      fetchKeys(selectedAdaptationId);
    }
  }, [selectedAdaptationId]);

  const fetchAdaptations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/adaptations`, {
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch adaptations');
      }
      
      const data: AdaptationsResponse = await response.json();
      setAdaptations(data.data);
      
      // Auto-select the first adaptation if available
      if (data.data.length > 0) {
        const firstAdaptation = data.data[0];
        setSelectedAdaptationId(firstAdaptation.id.toString());
        setSelectedAdaptationCode(firstAdaptation.code);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchKeys = async (adaptationId: string, keepSelectedNode: boolean = false) => {
    try {
      console.log('📡 Fetching keys for adaptation:', adaptationId);
      setLoading(true);
      
      const response = await fetch(`${API_BASE_URL}/keys/${adaptationId}`, {
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch keys');
      }
      
      const data: KeysResponse = await response.json();
      console.log('✅ Keys fetched successfully:', data.data.length, 'items');
      setKeys(data.data);
      
      // Only reset selected node when changing adaptation, not when refreshing
      if (!keepSelectedNode) {
        setSelectedNode(undefined);
        console.log('🔄 Selected node reset (adaptation changed)');
      } else {
        console.log('🔄 Selected node preserved (refreshing after create)');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Failed to fetch keys:', err);
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAdaptationChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const adaptationId = event.target.value;
    const adaptation = adaptations.find(a => a.id.toString() === adaptationId);
    
    setSelectedAdaptationId(adaptationId);
    setSelectedAdaptationCode(adaptation?.code || '');
    
    // Fetch keys for the new adaptation (this will reset selected node)
    if (adaptationId) {
      fetchKeys(adaptationId, false); // Pass false to reset selected node
    }
  };

  const handleNodeSelect = async (node: KeyNode) => {
    console.log('🔍 handleNodeSelect called with node:', node);
    console.log('🔍 Node ID:', node.id);
    console.log('🔍 Node Title:', node.title);
    console.log('🔍 Node Code:', node.code);
    console.log('🔍 Node Key:', node.key); // Add this line to debug
    console.log('🔍 Full Node Object:', JSON.stringify(node, null, 2)); // Add this line to debug
    
    // Set the selected node
    setSelectedNode(node);
    
    // Fetch detailed data for the selected node
    try {
      console.log('📡 Fetching detailed data for key ID:', node.id);
      setLoading(true);
      
      const response = await fetch(`${API_BASE_URL}/keydata/${node.id}`, {
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data: KeyDataResponse = await response.json();
        console.log('✅ Detailed data fetched:', data);
        
        // Get the default language (en) translation
        const defaultLang = 'en';
        const translation = data.data.translations.find(t => t.locale === defaultLang);
        
        // Update the selected node with detailed data
        const detailedNode: KeyNode = {
          ...node,
          key: node.key, // Preserve the key property
          title: translation?.title || data.data.title || node.title,
          desc: translation?.desc || '',
          purpose: translation?.purpose || '',
          related_keys: data.data.related_keys,
          // Store the full API response for form population
          apiData: data.data,
        };
        
        setSelectedNode(detailedNode);
        console.log('🔍 Selected node updated with detailed data');
      } else {
        const errorText = await response.text();
        console.error('❌ Key data API error:', errorText);
        console.warn('⚠️ Using basic node data (description and purpose may be empty)');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('📡 Key data fetch error:', err);
      console.warn('⚠️ Using basic node data (description and purpose may be empty)');
    } finally {
      setLoading(false);
    }
    
    // Log the state change
    console.log('🔍 Selected node state updated');
  };

  const handleNodeDelete = async (nodeId: number) => {
    try {
      console.log('🗑️ Deleting node with ID:', nodeId);
      setLoading(true);
      
      const response = await fetch(`${API_BASE_URL}/delete/${nodeId}/`, {
        method: 'DELETE',
        // method: 'PUT',
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        console.log('✅ Node deleted successfully');
        
        // Remove the deleted node from the keys array
        const removeNodeFromTree = (nodes: KeyNode[], targetId: number): KeyNode[] => {
          return nodes.filter(node => {
            if (node.id === targetId) {
              return false; // Remove this node
            }
            if (node.children.length > 0) {
              node.children = removeNodeFromTree(node.children, targetId);
            }
            return true;
          });
        };
        
        const updatedKeys = removeNodeFromTree([...keys], nodeId);
        setKeys(updatedKeys);
        
        // If the deleted node was selected, clear the selection
        if (selectedNode?.id === nodeId) {
          setSelectedNode(undefined);
        }
        
        // Show success message
        alert('Record deleted successfully!');
      } else {
        const errorText = await response.text();
        console.error('❌ Delete API error:', errorText);
        throw new Error(`Failed to delete record: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('🗑️ Delete error:', err);
      setError(errorMessage);
      onError?.(errorMessage);
      alert(`Failed to delete record: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (payload: UpdatePayload): Promise<void> => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/update/${payload.id}/`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to save data');
      }

      const result: UpdateResponse = await response.json();
      onUpdate?.(result);
      
      // Show success message
      alert('Key saved successfully!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      onError?.(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleNodeCreate = async (adaptationId: number, parentId: number, title: string): Promise<void> => {
    try {
      console.log('🆕 Creating new item:', { adaptationId, parentId, title });
      setLoading(true);
      
      const response = await fetch(`${API_BASE_URL}/create/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adaptation_id: adaptationId,
          parent_id: parentId,
          title: title
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Create API error:', response.status, errorText);
        throw new Error(`Failed to create new item: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ New item created successfully:', result);
      
      // Clear any previous errors
      setError('');
      
      // Refresh the keys to show the new item
      if (selectedAdaptationId) {
        console.log('🔄 Refreshing tree view to show new item...');
        await fetchKeys(selectedAdaptationId, true); // Pass true to keep selected node
        console.log('✅ Tree view refreshed');
      } else {
        console.warn('⚠️ No selected adaptation ID, cannot refresh tree view');
      }
      
      // Show success message
      alert('New item created successfully! The tree view has been refreshed.');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Failed to create item:', err);
      setError(errorMessage);
      onError?.(errorMessage);
      alert(`Failed to create item: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Function to handle title changes and update tree view
  const handleTitleChange = (nodeId: number, newTitle: string) => {
    console.log('🔄 Updating title in tree view:', { nodeId, newTitle });
    
    // Update the title in the keys array
    const updateNodeTitle = (nodes: KeyNode[], targetId: number, newTitle: string): KeyNode[] => {
      return nodes.map(node => {
        if (node.id === targetId) {
          return { ...node, title: newTitle };
        }
        if (node.children.length > 0) {
          return { ...node, children: updateNodeTitle(node.children, targetId, newTitle) };
        }
        return node;
      });
    };
    
    const updatedKeys = updateNodeTitle([...keys], nodeId, newTitle);
    setKeys(updatedKeys);
    
    // Also update the selectedNode if it's the one being edited
    if (selectedNode?.id === nodeId) {
      setSelectedNode({ ...selectedNode, title: newTitle });
    }
    
    console.log('✅ Title updated in tree view');
  };

  return (
    <div className={`dfa-help-admin ${className}`}>
      {/* Header */}
      {showHeader && (
        <header className="dfa-header">
          <h1 className="dfa-title">DFA Help Admin</h1>
        </header>
      )}

      <div className={`dfa-content ${showHeader ? '' : 'no-header'}`}>
        {/* Left Panel */}
        <div className={`dfa-left-panel ${showHeader ? 'with-header' : 'no-header'}`}>
          <div className="adaptation-selector">
            <label htmlFor="adaptation" className="selector-label">
              Select Adaptation:
            </label>
            <select
              id="adaptation"
              value={selectedAdaptationId}
              onChange={handleAdaptationChange}
              className="adaptation-dropdown"
              disabled={loading}
            >
              <option value="">Choose an adaptation...</option>
              {adaptations.map((adaptation) => (
                <option key={adaptation.id} value={adaptation.id}>
                  {adaptation.name}
                </option>
              ))}
            </select>
          </div>

          {loading && <div className="loading-spinner"></div>}
          
          {error && <div className="error-message">{error}</div>}

          {keys.length > 0 && (
            <TreeView
              nodes={keys}
              onNodeSelect={handleNodeSelect}
              onNodeDelete={handleNodeDelete}
              onNodeCreate={handleNodeCreate}
              selectedNode={selectedNode}
              adaptationId={parseInt(selectedAdaptationId)}
            />
          )}
        </div>

        {/* Body Panel */}
        <div className="dfa-body-panel">
          {!selectedNode ? (
            <div className="content-placeholder">
              <h3>Content Area</h3>
              <p>Click on a node from the tree view to edit its content.</p>
            </div>
          ) : (
            <Form
              selectedNode={selectedNode}
              selectedAdaptation={selectedAdaptationCode}
              adaptationCode={selectedAdaptationCode}
              allNodes={keys}
              onSave={handleSave}
              onTitleChange={handleTitleChange}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      {/* <footer className="dfa-footer">
        <p className="version">v2.0.0</p>
      </footer> */}
    </div>
  );
};