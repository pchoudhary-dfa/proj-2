import React, { useState, useEffect, useRef } from 'react';
import { KeyNode, UpdatePayload } from '../types';

interface FormProps {
  selectedNode: KeyNode | null;
  selectedAdaptation: string;
  adaptationCode: string; // Add adaptation code
  allNodes: KeyNode[]; // Add full tree structure
  onSave: (payload: UpdatePayload) => Promise<void>;
  onTitleChange?: (nodeId: number, newTitle: string) => void; // Add callback for title changes
}

export const Form: React.FC<FormProps> = ({ 
  selectedNode, 
  selectedAdaptation, 
  adaptationCode,
  allNodes,
  onSave,
  onTitleChange
}) => {
  const [activeTab, setActiveTab] = useState('en');
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    desc: '',
    purpose: '',
    related_keys: ''
  });
  const [generatedKey, setGeneratedKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTitleUpdate, setIsTitleUpdate] = useState(false); // Flag to track title updates
  const descEditorRef = useRef<HTMLDivElement>(null);
  const purposeEditorRef = useRef<HTMLDivElement>(null);
  
  // Use refs to store current content without triggering re-renders
  const descContentRef = useRef('');
  const purposeContentRef = useRef('');

  useEffect(() => {
    if (selectedNode && !isTitleUpdate) {
      console.log('🔍 Form: selectedNode received:', selectedNode);
      console.log('🔍 Form: selectedNode.key:', selectedNode.key);
      console.log('🔍 Form: selectedNode.apiData:', selectedNode.apiData);
      
      // Find the translation for the active tab
      const translation = selectedNode.apiData?.translations?.find((t: any) => t.locale === activeTab);
      
      const newDesc = translation?.desc || '';
      const newPurpose = translation?.purpose || '';
      
      // Update refs first
      descContentRef.current = newDesc;
      purposeContentRef.current = newPurpose;
      
      // Handle related_keys - convert array to comma-separated string, handling objects
      let relatedKeysString = '';
      
      // Check multiple possible sources and formats for related_keys
      const apiRelatedKeys = selectedNode.apiData?.related_keys;
      const nodeRelatedKeys = selectedNode.related_keys;
      
      console.log('🔍 Full selectedNode:', selectedNode);
      console.log('🔍 Full apiData:', selectedNode.apiData);
      console.log('🔍 API related_keys:', apiRelatedKeys);
      console.log('🔍 Node related_keys:', nodeRelatedKeys);
      
      // Try to get related_keys from various sources
      let keysArray: any[] = [];
      
      if (apiRelatedKeys && Array.isArray(apiRelatedKeys)) {
        keysArray = apiRelatedKeys;
        console.log('🔍 Using API related_keys array');
      } else if (nodeRelatedKeys && Array.isArray(nodeRelatedKeys)) {
        keysArray = nodeRelatedKeys;
        console.log('🔍 Using node related_keys array');
      } else if (apiRelatedKeys && typeof apiRelatedKeys === 'string') {
        // If it's already a string, use it directly
        relatedKeysString = apiRelatedKeys;
        console.log('🔍 API related_keys is already a string:', relatedKeysString);
      } else if (nodeRelatedKeys && typeof nodeRelatedKeys === 'string') {
        // If it's already a string, use it directly
        relatedKeysString = nodeRelatedKeys;
        console.log('🔍 Node related_keys is already a string:', relatedKeysString);
      }
      
      // Process array if we have one
      if (keysArray.length > 0) {
        console.log('🔍 Processing keys array with length:', keysArray.length);
        
        relatedKeysString = keysArray
          .map((key: any, index: number) => {
            console.log(`🔍 Processing key ${index}:`, key);
            console.log(`🔍 Key type:`, typeof key);
            console.log(`🔍 Key constructor:`, key?.constructor?.name);
            console.log(`🔍 Key keys:`, key ? Object.keys(key) : 'null/undefined');
            
            if (typeof key === 'object' && key !== null) {
              // For objects with 'key' property (like {key: "BYD-DASH", translations: [...]})
              if (key.key) return key.key;
              // Try to extract meaningful information from the object
              if (key.name) return key.name;
              if (key.title) return key.title;
              if (key.code) return key.code;
              if (key.id) return `key_${key.id}`;
              
              // If none of the above, use JSON.stringify
              const jsonStr = JSON.stringify(key);
              console.log(`🔍 JSON stringified key:`, jsonStr);
              return jsonStr;
            }
            return String(key);
          })
          .join(', ');
      }
      
      console.log('🔍 Final related_keys string:', relatedKeysString);
      
      setFormData({
        code: selectedNode.apiData?.code || selectedNode.code || '',
        title: translation?.title || selectedNode.title || '',
        desc: newDesc,
        purpose: newPurpose,
        related_keys: relatedKeysString
      });
      
      // Manually set content in editors after a short delay
      setTimeout(() => {
        if (descEditorRef.current) {
          descEditorRef.current.innerHTML = newDesc;
        }
        if (purposeEditorRef.current) {
          purposeEditorRef.current.innerHTML = newPurpose;
        }
      }, 50);
    }
  }, [selectedNode, activeTab]);

  // Function to handle title changes and update tree view
  const handleTitleChange = (newTitle: string) => {
    if (selectedNode && onTitleChange) {
      onTitleChange(selectedNode.id, newTitle);
    }
  };

  // Function to find parent node in the full tree
  const findParentNode = (nodes: KeyNode[], parentId: number): KeyNode | null => {
    for (const node of nodes) {
      if (node.id === parentId) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = findParentNode(node.children, parentId);
        if (found) return found;
      }
    }
    return null;
  };

  // Function to toggle between HTML code view and rich text view
  const toggleHtmlCode = (editorRef: React.RefObject<HTMLDivElement>) => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const isHtmlMode = editor.dataset.htmlMode === 'true';
    const applyButton = editor.parentElement?.querySelector('.apply-html-btn') as HTMLButtonElement;
    
    if (isHtmlMode) {
      // Switch back to rich text mode
      const htmlCode = editor.textContent || '';
      editor.innerHTML = htmlCode;
      editor.dataset.htmlMode = 'false';
      editor.contentEditable = 'true';
      editor.classList.remove('html-code-mode');
      if (applyButton) applyButton.style.display = 'none';
    } else {
      // Switch to HTML code mode
      editor.dataset.richTextContent = editor.innerHTML;
      editor.innerHTML = editor.innerHTML.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      editor.dataset.htmlMode = 'true';
      editor.contentEditable = 'true'; // Keep it editable
      editor.classList.add('html-code-mode');
      if (applyButton) applyButton.style.display = 'inline-block';
    }
  };

  const applyHtmlChanges = (editorRef: React.RefObject<HTMLDivElement>) => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const htmlCode = editor.textContent || '';
    
    // Convert HTML entities back to actual HTML
    const decodedHtml = htmlCode
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    // Apply the HTML changes
    editor.innerHTML = decodedHtml;
    editor.dataset.htmlMode = 'false';
    editor.contentEditable = 'true';
    editor.classList.remove('html-code-mode');
    
    // Hide the Apply button
    const applyButton = editor.parentElement?.querySelector('.apply-html-btn') as HTMLButtonElement;
    if (applyButton) applyButton.style.display = 'none';
    
    // Trigger input event to update form data
    const inputEvent = new Event('input', { bubbles: true });
    editor.dispatchEvent(inputEvent);
  };

  // Function to insert image in the HTML editor
  const insertImage = (editorRef: React.RefObject<HTMLDivElement>) => {
    if (!editorRef.current) return;
    
    const imageUrl = prompt('Enter image URL:');
    if (!imageUrl) return;
    
    const imageAlt = prompt('Enter image alt text (optional):') || '';
    
    // Create image HTML
    const imgTag = `<img src="${imageUrl}" alt="${imageAlt}" style="max-width: 100%; height: auto;" />`;
    
    // Insert at cursor position or at the end
    const editor = editorRef.current;
    const selection = window.getSelection();
    
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const imgElement = document.createElement('div');
      imgElement.innerHTML = imgTag;
      range.insertNode(imgElement.firstChild || imgElement);
      range.collapse(false);
    } else {
      // If no selection, append to the end
      editor.innerHTML += imgTag;
    }
    
    // Trigger input event to update form data
    const inputEvent = new Event('input', { bubbles: true });
    editor.dispatchEvent(inputEvent);
    
    // Focus back to editor
    editor.focus();
  };

  // Function to handle paste events and convert images to base64
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>, editorRef: React.RefObject<HTMLDivElement>) => {
    if (!editorRef.current) return;
    
    const items = event.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if the pasted item is an image
      if (item.type.indexOf('image') !== -1) {
        event.preventDefault();
        
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64String = e.target?.result as string;
            const imageAlt = prompt('Enter image alt text (optional):') || '';
            
            // Create image HTML with base64 source
            const imgTag = `<img src="${base64String}" alt="${imageAlt}" style="max-width: 100%; height: auto;" />`;
            
            // Insert at cursor position
            const editor = editorRef.current;
            if (editor) {
              const selection = window.getSelection();
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const imgElement = document.createElement('div');
                imgElement.innerHTML = imgTag;
                range.insertNode(imgElement.firstChild || imgElement);
                range.collapse(false);
              } else {
                // If no selection, append to the end
                editor.innerHTML += imgTag;
              }
              
              // Trigger input event to update form data
              const inputEvent = new Event('input', { bubbles: true });
              editor.dispatchEvent(inputEvent);
              
              // Focus back to editor
              editor.focus();
            }
          };
          reader.readAsDataURL(file);
        }
        break;
      }
    }
  };

  // Function to handle drag and drop events for images
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, editorRef: React.RefObject<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    if (!editorRef.current) return;
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      
      // Check if the dropped file is an image
      if (file.type.indexOf('image') !== -1) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64String = e.target?.result as string;
          const imageAlt = prompt('Enter image alt text (optional):') || '';
          
          // Create image HTML with base64 source
          const imgTag = `<img src="${base64String}" alt="${imageAlt}" style="max-width: 100%; height: auto;" />`;
          
          // Insert at cursor position or at the end
          const editor = editorRef.current;
          if (editor) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.deleteContents();
              const imgElement = document.createElement('div');
              imgElement.innerHTML = imgTag;
              range.insertNode(imgElement.firstChild || imgElement);
              range.collapse(false);
            } else {
              // If no selection, append to the end
              editor.innerHTML += imgTag;
            }
            
            // Trigger input event to update form data
            const inputEvent = new Event('input', { bubbles: true });
            editor.dispatchEvent(inputEvent);
            
            // Focus back to editor
            editor.focus();
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Function to handle class changes for selected text
  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>, editorRef: React.RefObject<HTMLDivElement>) => {
    if (!editorRef.current) return;

    const selectedClass = e.target.value;
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      alert('Please select some text first');
      e.target.value = ''; // Reset dropdown
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();

    if (selectedText.trim() === '') {
      alert('Please select some text first');
      e.target.value = ''; // Reset dropdown
      return;
    }

    if (selectedClass === 'clear') {
      // Remove all classes from selected text
      const span = document.createElement('span');
      span.textContent = selectedText;
      range.deleteContents();
      range.insertNode(span);
    } else if (selectedClass === 'title') {
      // Apply title class to selected text
      const span = document.createElement('span');
      span.className = 'dfaHelpTitleOFEditor';
      span.textContent = selectedText;
      range.deleteContents();
      range.insertNode(span);
    }

    // Reset dropdown
    e.target.value = '';
    
    // Trigger input event to update form data
    const inputEvent = new Event('input', { bubbles: true });
    editor.dispatchEvent(inputEvent);
    
    // Focus back to editor
    editor.focus();
  };

  const generateKey = async () => {
    if (!selectedNode || !formData.code) return;
    
    let key = '';
    
    if (selectedNode.parent_id) {
      // Child key: parent key + "-" + item code
      const parentId = typeof selectedNode.parent_id === 'string' ? parseInt(selectedNode.parent_id) : selectedNode.parent_id;
      const parentNode = findParentNode(allNodes, parentId);
      if (parentNode && parentNode.key) {
        key = parentNode.key + "-" + formData.code;
        console.log('🔑 Child key generated:', key, 'from parent key:', parentNode.key, 'and item code:', formData.code);
      } else {
        console.error('❌ Failed to find parent node or parent key');
        return;
      }
    } else {
      // Top level key: adaptation code + "-" + item code
      key = adaptationCode + "-" + formData.code;
      console.log('🔑 Top level key generated:', key, 'from adaptation code:', adaptationCode, 'and item code:', formData.code);
    }
    
    if (key) {
      setGeneratedKey(key);
      console.log('🔑 Final generated key:', key);
      
      // Automatically submit the data after generating the key
      await submitData(key);
    } else {
      console.error('❌ Failed to generate key');
    }
  };

  const submitData = async (key: string) => {
    if (!selectedNode) return;
    
    // Use the latest content from refs
    const latestDesc = descContentRef.current || formData.desc;
    const latestPurpose = purposeContentRef.current || formData.purpose;
    
    // Prepare payload according to documentation format
    const payload: UpdatePayload = {
      code: formData.code,
      desc: latestDesc,
      id: selectedNode.id,
      key: key,
      lang: activeTab,
      purpose: latestPurpose,
      related_keys: formData.related_keys,
      title: formData.title
    };
    
    try {
      setIsSaving(true);
      await onSave(payload);
      
      // Update the tree view title after successful save
      if (onTitleChange && formData.title !== selectedNode.title) {
        setIsTitleUpdate(true); // Set flag to prevent form re-population
        onTitleChange(selectedNode.id, formData.title);
        // Reset the flag after a short delay to allow future form updates
        setTimeout(() => setIsTitleUpdate(false), 100);
      }
      
      // Don't clear form fields - keep them visible for user reference
      // setFormData({
      //   code: '',
      //   title: '',
      //   desc: '',
      //   purpose: '',
      //   related_keys: ''
      // }); // Removed to keep form data visible
      
      // Keep the generated key visible in the API Key panel
      // setGeneratedKey(''); // Already removed earlier
      
      // Don't clear refs - keep content visible
      // descContentRef.current = '';
      // purposeContentRef.current = '';
      
      // Don't clear editors - keep content visible
      // if (descEditorRef.current) {
      //   descEditorRef.current.innerHTML = '';
      // }
      // if (purposeEditorRef.current) {
      //   purposeEditorRef.current.innerHTML = '';
      // }
      
      console.log('✅ Data saved successfully, form fields remain visible');
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Enhanced HTML editor functions
  const applyFormat = (editorRef: React.RefObject<HTMLDivElement>, format: string, value?: string) => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    editor.focus();
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    switch (format) {
      case 'bold':
        document.execCommand('bold', false);
        break;
      case 'italic':
        document.execCommand('italic', false);
        break;
      case 'underline':
        document.execCommand('underline', false);
        break;
      case 'unorderedList':
        document.execCommand('insertUnorderedList', false);
        break;
      case 'orderedList':
        document.execCommand('insertOrderedList', false);
        break;
      case 'link':
        const url = prompt('Enter URL:');
        if (url) {
          document.execCommand('createLink', false, url);
        }
        break;
      case 'heading1':
        document.execCommand('formatBlock', false, 'h1');
        break;
      case 'heading2':
        document.execCommand('formatBlock', false, 'h2');
        break;
      case 'paragraph':
        document.execCommand('formatBlock', false, 'p');
        break;
    }
    
    // Update form data after formatting
    updateFormData(editorRef);
  };

  const updateFormData = (editorRef: React.RefObject<HTMLDivElement>) => {
    if (!editorRef.current) return;
    
    const content = editorRef.current.innerHTML;
    const fieldName = editorRef === descEditorRef ? 'desc' : 'purpose';
    
    setFormData(prev => ({
      ...prev,
      [fieldName]: content
    }));
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent, editorRef: React.RefObject<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFormat(editorRef, 'paragraph');
    }
  };

  const handleEditorInput = (editorRef: React.RefObject<HTMLDivElement>) => {
    // Store content in ref without updating state to prevent cursor jumping
    if (editorRef.current) {
      const content = editorRef.current.innerHTML;
      if (editorRef === descEditorRef) {
        descContentRef.current = content;
      } else {
        purposeContentRef.current = content;
      }
    }
  };

  const handleEditorBlur = (editorRef: React.RefObject<HTMLDivElement>) => {
    // Update form data when editor loses focus
    if (editorRef.current) {
      const content = editorRef.current.innerHTML;
      const fieldName = editorRef === descEditorRef ? 'desc' : 'purpose';
      
      // Update both ref and state
      if (editorRef === descEditorRef) {
        descContentRef.current = content;
      } else {
        purposeContentRef.current = content;
      }
      
      setFormData(prev => ({
        ...prev,
        [fieldName]: content
      }));
    }
  };

  if (!selectedNode) {
    return (
      <div className="form-container">
        <div className="form-placeholder">
          <h3>Select a node to edit</h3>
          <p>Choose a node from the tree view to edit its content.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-container">
      <h2 className="form-title">
        {selectedNode.title || selectedNode.key || 'Select Node'} &gt;&gt; Edit Content
      </h2>
      
      {/* Language Tabs */}
      <div className="form-tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'en' ? 'active' : ''}`}
          onClick={() => setActiveTab('en')}
        >
          English
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'fr' ? 'active' : ''}`}
          onClick={() => setActiveTab('fr')}
        >
          French
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'es' ? 'active' : ''}`}
          onClick={() => setActiveTab('es')}
        >
          Spanish
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'ar' ? 'active' : ''}`}
          onClick={() => setActiveTab('ar')}
        >
          Arabic
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'pt' ? 'active' : ''}`}
          onClick={() => setActiveTab('pt')}
        >
          Portuguese
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'rs' ? 'active' : ''}`}
          onClick={() => setActiveTab('rs')}
        >
          Russian
        </button>
      </div>

      <form className="form">
        <div className="form-group">
          <label htmlFor="code">
            Code (10) <span className="required">*</span>
          </label>
          <input
            type="text"
            id="code"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="form-input"
            placeholder="Enter code (max 10 characters)"
            maxLength={10}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="title">
            Title <span className="required">*</span>
          </label>
          <input
            type="text"
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="form-input"
            placeholder="Enter title"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="desc">
            Description (HTML) <span className="required">*</span>
          </label>
          <div className="html-editor">
            <div className="editor-toolbar">
              <button 
                type="button" 
                onClick={() => applyFormat(descEditorRef, 'bold')} 
                className="toolbar-btn" 
                title="Bold"
              >
                <strong>B</strong>
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(descEditorRef, 'italic')} 
                className="toolbar-btn" 
                title="Italic"
              >
                <em>I</em>
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(descEditorRef, 'underline')} 
                className="toolbar-btn" 
                title="Underline"
              >
                <u>U</u>
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(descEditorRef, 'unorderedList')} 
                className="toolbar-btn" 
                title="Bullet List"
              >
                • List
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(descEditorRef, 'orderedList')} 
                className="toolbar-btn" 
                title="Numbered List"
              >
                1. List
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(descEditorRef, 'link')} 
                className="toolbar-btn" 
                title="Insert Link"
              >
                🔗 Link
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(descEditorRef, 'heading1')} 
                className="toolbar-btn" 
                title="Heading 1"
              >
                H1
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(descEditorRef, 'heading2')} 
                className="toolbar-btn" 
                title="Heading 2"
              >
                H2
              </button>
              <button 
                type="button" 
                onClick={() => toggleHtmlCode(descEditorRef)} 
                className="toolbar-btn" 
                title="HTML Code"
              >
                &lt;/&gt;
              </button>
              <button 
                type="button" 
                onClick={() => applyHtmlChanges(descEditorRef)} 
                className="toolbar-btn apply-html-btn" 
                title="Apply HTML Changes"
                style={{ display: 'none' }}
              >
                Apply
              </button>
              <button 
                type="button" 
                onClick={() => insertImage(descEditorRef)} 
                className="toolbar-btn" 
                title="Insert Image"
              >
                🖼️ Image
              </button>
              <select 
                onChange={(e) => handleClassChange(e, descEditorRef)} 
                className="toolbar-select"
                title="Apply/Remove Classes"
              >
                <option value="">Classes...</option>
                <option value="title">Title</option>
                <option value="clear">Clear class</option>
              </select>
            </div>
            <div 
              ref={descEditorRef}
              id="desc-editor"
              className="editor-content"
              contentEditable
              suppressContentEditableWarning
              onInput={() => handleEditorInput(descEditorRef)}
              onBlur={() => handleEditorBlur(descEditorRef)}
              onFocus={() => {}} // Removed saveCursorPosition(descEditorRef)
              onKeyDown={(e) => handleEditorKeyDown(e, descEditorRef)}
              onPaste={(e) => handlePaste(e, descEditorRef)}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, descEditorRef)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="purpose">
            Purpose <span className="required">*</span>
          </label>
          <div className="html-editor">
            <div className="editor-toolbar">
              <button 
                type="button" 
                onClick={() => applyFormat(purposeEditorRef, 'bold')} 
                className="toolbar-btn" 
                title="Bold"
              >
                <strong>B</strong>
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(purposeEditorRef, 'italic')} 
                className="toolbar-btn" 
                title="Italic"
              >
                <em>I</em>
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(purposeEditorRef, 'underline')} 
                className="toolbar-btn" 
                title="Underline"
              >
                <u>U</u>
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(purposeEditorRef, 'unorderedList')} 
                className="toolbar-btn" 
                title="Bullet List"
              >
                • List
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(purposeEditorRef, 'orderedList')} 
                className="toolbar-btn" 
                title="Numbered List"
              >
                1. List
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(purposeEditorRef, 'link')} 
                className="toolbar-btn" 
                title="Insert Link"
              >
                🔗 Link
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(purposeEditorRef, 'heading1')} 
                className="toolbar-btn" 
                title="Heading 1"
              >
                H1
              </button>
              <button 
                type="button" 
                onClick={() => applyFormat(purposeEditorRef, 'heading2')} 
                className="toolbar-btn" 
                title="Heading 2"
              >
                H2
              </button>
              <button 
                type="button" 
                onClick={() => toggleHtmlCode(purposeEditorRef)} 
                className="toolbar-btn" 
                title="HTML Code"
              >
                &lt;/&gt;
              </button>
              <button 
                type="button" 
                onClick={() => applyHtmlChanges(purposeEditorRef)} 
                className="toolbar-btn apply-html-btn" 
                title="Apply HTML Changes"
                style={{ display: 'none' }}
              >
                Apply
              </button>
              <button 
                type="button" 
                onClick={() => insertImage(purposeEditorRef)} 
                className="toolbar-btn" 
                title="Insert Image"
              >
                🖼️ Image
              </button>
              <select 
                onChange={(e) => handleClassChange(e, purposeEditorRef)} 
                className="toolbar-select"
                title="Apply/Remove Classes"
              >
                <option value="">Classes...</option>
                <option value="title">Title</option>
                <option value="clear">Clear class</option>
              </select>
            </div>
            <div 
              ref={purposeEditorRef}
              id="purpose-editor"
              className="editor-content"
              contentEditable
              suppressContentEditableWarning
              onInput={() => handleEditorInput(purposeEditorRef)}
              onBlur={() => handleEditorBlur(purposeEditorRef)}
              onFocus={() => {}} // Removed saveCursorPosition(purposeEditorRef)
              onKeyDown={(e) => handleEditorKeyDown(e, purposeEditorRef)}
              onPaste={(e) => handlePaste(e, purposeEditorRef)}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, purposeEditorRef)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="related_keys">Related Keys</label>
          <input
            type="text"
            id="related_keys"
            value={formData.related_keys}
            onChange={(e) => setFormData({ ...formData, related_keys: e.target.value })}
            className="form-input"
            placeholder="Enter related keys"
            required
          />
        </div>

        <div className="form-actions">
          <div className="key-section">
            <button
              type="button"
              onClick={generateKey}
              className="btn btn-secondary"
              disabled={!formData.code || !formData.title || !formData.desc}
            >
              Save Key
            </button>
            
            <div className="key-displays">
              {/* Always show the Item Key panel */}
              <div className="api-key">
                <strong>API Key:</strong> {generatedKey || selectedNode?.key || 'No key available'}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};