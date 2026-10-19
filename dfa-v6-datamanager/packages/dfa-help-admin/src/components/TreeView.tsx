import React, { useState } from 'react';
import { KeyNode } from '../types';

interface TreeViewProps {
  nodes: KeyNode[];
  onNodeSelect: (node: KeyNode) => void;
  onNodeDelete: (nodeId: number) => void;
  onNodeCreate: (adaptationId: number, parentId: number, title: string) => void;
  selectedNode?: KeyNode;
  adaptationId?: number;
}

const TreeViewItem: React.FC<{
  node: KeyNode;
  level: number;
  onNodeSelect: (node: KeyNode) => void;
  onNodeDelete: (nodeId: number) => void;
  onNodeCreate: (adaptationId: number, parentId: number, title: string) => void;
  selectedNode?: KeyNode;
  adaptationId?: number;
  showLevelInput: boolean;
  isFirstAtLevel: boolean;
  parentNodeId?: number; // Add this to track the parent node ID for this level
}> = ({ node, level, onNodeSelect, onNodeDelete, onNodeCreate, selectedNode, adaptationId, showLevelInput, isFirstAtLevel, parentNodeId }) => {
  const isSelected = selectedNode?.id === node.id;
  const [isExpanded, setIsExpanded] = useState(false); // Default collapsed
  const [showAddChildInput, setShowAddChildInput] = useState(false); // New state for child input
  
  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection when clicking expand/collapse
    setIsExpanded(!isExpanded);
  };
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection when clicking delete
    const isConfirmed = window.confirm(`Are you sure you want to delete "${node.title}"?`);
    if (isConfirmed) {
      onNodeDelete(node.id);
    }
  };

  const handlePlusIconClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection when clicking plus icon
    
    if (node.children.length > 0) {
      // If item has children, expand/collapse
      toggleExpanded(e);
    } else {
      // If item has no children, show add child input
      setShowAddChildInput(true);
    }
  };
  
  return (
    <div className="tree-item">
      {/* Show level input ABOVE the first item of each level */}
      {showLevelInput && level > 0 && isFirstAtLevel && (
        <div 
          className="tree-level-input-container"
          style={{ paddingLeft: `${(level - 1) * 20}px`, marginBottom: '8px' }}
        >
          <LevelInput 
            level={level}
            parentId={parentNodeId || 0} // Use the parent node ID for this level
            adaptationId={adaptationId}
            onNodeCreate={onNodeCreate}
          />
        </div>
      )}

      <div 
        className={`tree-node ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={() => {
          console.log('🌳 TreeView: Node clicked:', node.title, 'ID:', node.id);
          onNodeSelect(node);
        }}
      >
        {/* Single Plus Icon - handles both expand/collapse and add child */}
        <span 
          className="tree-plus-icon"
          onClick={handlePlusIconClick}
          style={{ cursor: 'pointer', marginRight: '8px' }}
          title={node.children.length > 0 ? 
            (isExpanded ? 'Collapse' : 'Expand') : 
            'Add child item'
          }
        >
          {node.children.length > 0 ? (isExpanded ? '➖' : '➕') : '➕'}
        </span>

        <span className="tree-label">{node.title}</span>
        
        {/* Delete icon */}
        <span 
          className="tree-delete-icon"
          onClick={handleDelete}
          title="Delete this record"
        >
          🗑️
        </span>
      </div>

      {/* Add Child Input - appears below the current node */}
      {showAddChildInput && (
        <div 
          className="tree-child-input-container"
          style={{ paddingLeft: `${(level + 1) * 20}px`, marginTop: '4px', marginBottom: '4px' }}
        >
          <LevelInput 
            level={level + 1}
            parentId={node.id} // Use current node as parent for child
            adaptationId={adaptationId}
            onNodeCreate={(adaptationId, parentId, title) => {
              onNodeCreate(adaptationId, parentId, title);
              setShowAddChildInput(false); // Hide input after creation
            }}
          />
        </div>
      )}

      {/* Existing children */}
      {node.children.length > 0 && isExpanded && (
        <div className="tree-children">
          {node.children.map((child, index) => (
            <TreeViewItem
              key={child.id}
              node={child}
              level={level + 1}
              onNodeSelect={onNodeSelect}
              onNodeDelete={onNodeDelete}
              onNodeCreate={onNodeCreate}
              selectedNode={selectedNode}
              adaptationId={adaptationId}
              showLevelInput={true} // Show for all child levels
              isFirstAtLevel={index === 0} // Only first child shows input above
              parentNodeId={node.id} // Pass the current node as parent for children
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Separate component for level input
const LevelInput: React.FC<{
  level: number;
  parentId: number;
  adaptationId?: number;
  onNodeCreate: (adaptationId: number, parentId: number, title: string) => void;
}> = ({ level, parentId, adaptationId, onNodeCreate }) => {
  const [newItemTitle, setNewItemTitle] = useState('');

  const handleCreateItem = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newItemTitle.trim()) {
      if (adaptationId) {
        console.log('🆕 Creating item at level:', level, 'with parent ID:', parentId);
        onNodeCreate(adaptationId, parentId, newItemTitle.trim());
        setNewItemTitle('');
      }
    } else if (e.key === 'Escape') {
      setNewItemTitle('');
    }
  };

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection when clicking input
  };

  return (
    <div className="tree-level-input" onClick={handleInputClick}>
      <input
        type="text"
        className="tree-input"
        placeholder="Type new item title and press Enter..."
        value={newItemTitle}
        onChange={(e) => setNewItemTitle(e.target.value)}
        onKeyDown={handleCreateItem}
        onBlur={() => {
          // Keep the input visible even when not focused
          // Only clear if user explicitly presses Escape
        }}
      />
    </div>
  );
};

export const TreeView: React.FC<TreeViewProps> = ({ 
  nodes, 
  onNodeSelect, 
  onNodeDelete,
  onNodeCreate,
  selectedNode,
  adaptationId
}) => {
  return (
    <div className="tree-view">
      <div className="tree-container">
        {nodes.map((node, index) => (
          <TreeViewItem
            key={node.id}
            node={node}
            level={0}
            onNodeSelect={onNodeSelect}
            onNodeDelete={onNodeDelete}
            onNodeCreate={onNodeCreate}
            selectedNode={selectedNode}
            adaptationId={adaptationId}
            showLevelInput={false} // No input for top level
            isFirstAtLevel={index === 0}
            parentNodeId={undefined} // No parent for top level nodes
          />
        ))}
      </div>
    </div>
  );
};
