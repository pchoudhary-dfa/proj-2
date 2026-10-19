import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useRef, useEffect } from 'react';

const TreeViewItem = ({ node, level, onNodeSelect, onNodeDelete, onNodeCreate, selectedNode, adaptationId, showLevelInput, isFirstAtLevel, parentNodeId }) => {
    const isSelected = selectedNode?.id === node.id;
    const [isExpanded, setIsExpanded] = useState(false); // Default collapsed
    const [showAddChildInput, setShowAddChildInput] = useState(false); // New state for child input
    const toggleExpanded = (e) => {
        e.stopPropagation(); // Prevent node selection when clicking expand/collapse
        setIsExpanded(!isExpanded);
    };
    const handleDelete = (e) => {
        e.stopPropagation(); // Prevent node selection when clicking delete
        const isConfirmed = window.confirm(`Are you sure you want to delete "${node.title}"?`);
        if (isConfirmed) {
            onNodeDelete(node.id);
        }
    };
    const handlePlusIconClick = (e) => {
        e.stopPropagation(); // Prevent node selection when clicking plus icon
        if (node.children.length > 0) {
            // If item has children, expand/collapse
            toggleExpanded(e);
        }
        else {
            // If item has no children, show add child input
            setShowAddChildInput(true);
        }
    };
    return (jsxs("div", { className: "tree-item", children: [showLevelInput && level > 0 && isFirstAtLevel && (jsx("div", { className: "tree-level-input-container", style: { paddingLeft: `${(level - 1) * 20}px`, marginBottom: '8px' }, children: jsx(LevelInput, { level: level, parentId: parentNodeId || 0, adaptationId: adaptationId, onNodeCreate: onNodeCreate }) })), jsxs("div", { className: `tree-node ${isSelected ? 'selected' : ''}`, style: { paddingLeft: `${level * 20}px` }, onClick: () => {
                    console.log('🌳 TreeView: Node clicked:', node.title, 'ID:', node.id);
                    onNodeSelect(node);
                }, children: [jsx("span", { className: "tree-plus-icon", onClick: handlePlusIconClick, style: { cursor: 'pointer', marginRight: '8px' }, title: node.children.length > 0 ?
                            (isExpanded ? 'Collapse' : 'Expand') :
                            'Add child item', children: node.children.length > 0 ? (isExpanded ? '➖' : '➕') : '➕' }), jsx("span", { className: "tree-label", children: node.title }), jsx("span", { className: "tree-delete-icon", onClick: handleDelete, title: "Delete this record", children: "\uD83D\uDDD1\uFE0F" })] }), showAddChildInput && (jsx("div", { className: "tree-child-input-container", style: { paddingLeft: `${(level + 1) * 20}px`, marginTop: '4px', marginBottom: '4px' }, children: jsx(LevelInput, { level: level + 1, parentId: node.id, adaptationId: adaptationId, onNodeCreate: (adaptationId, parentId, title) => {
                        onNodeCreate(adaptationId, parentId, title);
                        setShowAddChildInput(false); // Hide input after creation
                    } }) })), node.children.length > 0 && isExpanded && (jsx("div", { className: "tree-children", children: node.children.map((child, index) => (jsx(TreeViewItem, { node: child, level: level + 1, onNodeSelect: onNodeSelect, onNodeDelete: onNodeDelete, onNodeCreate: onNodeCreate, selectedNode: selectedNode, adaptationId: adaptationId, showLevelInput: true, isFirstAtLevel: index === 0, parentNodeId: node.id }, child.id))) }))] }));
};
// Separate component for level input
const LevelInput = ({ level, parentId, adaptationId, onNodeCreate }) => {
    const [newItemTitle, setNewItemTitle] = useState('');
    const handleCreateItem = (e) => {
        if (e.key === 'Enter' && newItemTitle.trim()) {
            if (adaptationId) {
                console.log('🆕 Creating item at level:', level, 'with parent ID:', parentId);
                onNodeCreate(adaptationId, parentId, newItemTitle.trim());
                setNewItemTitle('');
            }
        }
        else if (e.key === 'Escape') {
            setNewItemTitle('');
        }
    };
    const handleInputClick = (e) => {
        e.stopPropagation(); // Prevent node selection when clicking input
    };
    return (jsx("div", { className: "tree-level-input", onClick: handleInputClick, children: jsx("input", { type: "text", className: "tree-input", placeholder: "Type new item title and press Enter...", value: newItemTitle, onChange: (e) => setNewItemTitle(e.target.value), onKeyDown: handleCreateItem, onBlur: () => {
                // Keep the input visible even when not focused
                // Only clear if user explicitly presses Escape
            } }) }));
};
const TreeView = ({ nodes, onNodeSelect, onNodeDelete, onNodeCreate, selectedNode, adaptationId }) => {
    return (jsx("div", { className: "tree-view", children: jsx("div", { className: "tree-container", children: nodes.map((node, index) => (jsx(TreeViewItem, { node: node, level: 0, onNodeSelect: onNodeSelect, onNodeDelete: onNodeDelete, onNodeCreate: onNodeCreate, selectedNode: selectedNode, adaptationId: adaptationId, showLevelInput: false, isFirstAtLevel: index === 0, parentNodeId: undefined }, node.id))) }) }));
};

const Form = ({ selectedNode, selectedAdaptation, adaptationCode, allNodes, onSave, onTitleChange }) => {
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
    const descEditorRef = useRef(null);
    const purposeEditorRef = useRef(null);
    // Use refs to store current content without triggering re-renders
    const descContentRef = useRef('');
    const purposeContentRef = useRef('');
    useEffect(() => {
        if (selectedNode && !isTitleUpdate) {
            console.log('🔍 Form: selectedNode received:', selectedNode);
            console.log('🔍 Form: selectedNode.key:', selectedNode.key);
            console.log('🔍 Form: selectedNode.apiData:', selectedNode.apiData);
            // Find the translation for the active tab
            const translation = selectedNode.apiData?.translations?.find((t) => t.locale === activeTab);
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
            let keysArray = [];
            if (apiRelatedKeys && Array.isArray(apiRelatedKeys)) {
                keysArray = apiRelatedKeys;
                console.log('🔍 Using API related_keys array');
            }
            else if (nodeRelatedKeys && Array.isArray(nodeRelatedKeys)) {
                keysArray = nodeRelatedKeys;
                console.log('🔍 Using node related_keys array');
            }
            else if (apiRelatedKeys && typeof apiRelatedKeys === 'string') {
                // If it's already a string, use it directly
                relatedKeysString = apiRelatedKeys;
                console.log('🔍 API related_keys is already a string:', relatedKeysString);
            }
            else if (nodeRelatedKeys && typeof nodeRelatedKeys === 'string') {
                // If it's already a string, use it directly
                relatedKeysString = nodeRelatedKeys;
                console.log('🔍 Node related_keys is already a string:', relatedKeysString);
            }
            // Process array if we have one
            if (keysArray.length > 0) {
                console.log('🔍 Processing keys array with length:', keysArray.length);
                relatedKeysString = keysArray
                    .map((key, index) => {
                    console.log(`🔍 Processing key ${index}:`, key);
                    console.log(`🔍 Key type:`, typeof key);
                    console.log(`🔍 Key constructor:`, key?.constructor?.name);
                    console.log(`🔍 Key keys:`, key ? Object.keys(key) : 'null/undefined');
                    if (typeof key === 'object' && key !== null) {
                        // For objects with 'key' property (like {key: "BYD-DASH", translations: [...]})
                        if (key.key)
                            return key.key;
                        // Try to extract meaningful information from the object
                        if (key.name)
                            return key.name;
                        if (key.title)
                            return key.title;
                        if (key.code)
                            return key.code;
                        if (key.id)
                            return `key_${key.id}`;
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
    // Function to find parent node in the full tree
    const findParentNode = (nodes, parentId) => {
        for (const node of nodes) {
            if (node.id === parentId) {
                return node;
            }
            if (node.children && node.children.length > 0) {
                const found = findParentNode(node.children, parentId);
                if (found)
                    return found;
            }
        }
        return null;
    };
    // Function to toggle between HTML code view and rich text view
    const toggleHtmlCode = (editorRef) => {
        if (!editorRef.current)
            return;
        const editor = editorRef.current;
        const isHtmlMode = editor.dataset.htmlMode === 'true';
        const applyButton = editor.parentElement?.querySelector('.apply-html-btn');
        if (isHtmlMode) {
            // Switch back to rich text mode
            const htmlCode = editor.textContent || '';
            editor.innerHTML = htmlCode;
            editor.dataset.htmlMode = 'false';
            editor.contentEditable = 'true';
            editor.classList.remove('html-code-mode');
            if (applyButton)
                applyButton.style.display = 'none';
        }
        else {
            // Switch to HTML code mode
            editor.dataset.richTextContent = editor.innerHTML;
            editor.innerHTML = editor.innerHTML.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            editor.dataset.htmlMode = 'true';
            editor.contentEditable = 'true'; // Keep it editable
            editor.classList.add('html-code-mode');
            if (applyButton)
                applyButton.style.display = 'inline-block';
        }
    };
    const applyHtmlChanges = (editorRef) => {
        if (!editorRef.current)
            return;
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
        const applyButton = editor.parentElement?.querySelector('.apply-html-btn');
        if (applyButton)
            applyButton.style.display = 'none';
        // Trigger input event to update form data
        const inputEvent = new Event('input', { bubbles: true });
        editor.dispatchEvent(inputEvent);
    };
    // Function to insert image in the HTML editor
    const insertImage = (editorRef) => {
        if (!editorRef.current)
            return;
        const imageUrl = prompt('Enter image URL:');
        if (!imageUrl)
            return;
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
        }
        else {
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
    const handlePaste = (event, editorRef) => {
        if (!editorRef.current)
            return;
        const items = event.clipboardData?.items;
        if (!items)
            return;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            // Check if the pasted item is an image
            if (item.type.indexOf('image') !== -1) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const base64String = e.target?.result;
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
                            }
                            else {
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
    const handleDragOver = (event) => {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    };
    const handleDragLeave = (event) => {
        event.currentTarget.classList.remove('drag-over');
    };
    const handleDrop = (event, editorRef) => {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        if (!editorRef.current)
            return;
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            // Check if the dropped file is an image
            if (file.type.indexOf('image') !== -1) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64String = e.target?.result;
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
                        }
                        else {
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
    const handleClassChange = (e, editorRef) => {
        if (!editorRef.current)
            return;
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
        }
        else if (selectedClass === 'title') {
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
        if (!selectedNode || !formData.code)
            return;
        let key = '';
        if (selectedNode.parent_id) {
            // Child key: parent key + "-" + item code
            const parentId = typeof selectedNode.parent_id === 'string' ? parseInt(selectedNode.parent_id) : selectedNode.parent_id;
            const parentNode = findParentNode(allNodes, parentId);
            if (parentNode && parentNode.key) {
                key = parentNode.key + "-" + formData.code;
                console.log('🔑 Child key generated:', key, 'from parent key:', parentNode.key, 'and item code:', formData.code);
            }
            else {
                console.error('❌ Failed to find parent node or parent key');
                return;
            }
        }
        else {
            // Top level key: adaptation code + "-" + item code
            key = adaptationCode + "-" + formData.code;
            console.log('🔑 Top level key generated:', key, 'from adaptation code:', adaptationCode, 'and item code:', formData.code);
        }
        if (key) {
            setGeneratedKey(key);
            console.log('🔑 Final generated key:', key);
            // Automatically submit the data after generating the key
            await submitData(key);
        }
        else {
            console.error('❌ Failed to generate key');
        }
    };
    const submitData = async (key) => {
        if (!selectedNode)
            return;
        // Use the latest content from refs
        const latestDesc = descContentRef.current || formData.desc;
        const latestPurpose = purposeContentRef.current || formData.purpose;
        // Prepare payload according to documentation format
        const payload = {
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
        }
        catch (error) {
            console.error('Save failed:', error);
        }
        finally {
            setIsSaving(false);
        }
    };
    // Enhanced HTML editor functions
    const applyFormat = (editorRef, format, value) => {
        if (!editorRef.current)
            return;
        const editor = editorRef.current;
        editor.focus();
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0)
            return;
        selection.getRangeAt(0);
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
    const updateFormData = (editorRef) => {
        if (!editorRef.current)
            return;
        const content = editorRef.current.innerHTML;
        const fieldName = editorRef === descEditorRef ? 'desc' : 'purpose';
        setFormData(prev => ({
            ...prev,
            [fieldName]: content
        }));
    };
    const handleEditorKeyDown = (e, editorRef) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyFormat(editorRef, 'paragraph');
        }
    };
    const handleEditorInput = (editorRef) => {
        // Store content in ref without updating state to prevent cursor jumping
        if (editorRef.current) {
            const content = editorRef.current.innerHTML;
            if (editorRef === descEditorRef) {
                descContentRef.current = content;
            }
            else {
                purposeContentRef.current = content;
            }
        }
    };
    const handleEditorBlur = (editorRef) => {
        // Update form data when editor loses focus
        if (editorRef.current) {
            const content = editorRef.current.innerHTML;
            const fieldName = editorRef === descEditorRef ? 'desc' : 'purpose';
            // Update both ref and state
            if (editorRef === descEditorRef) {
                descContentRef.current = content;
            }
            else {
                purposeContentRef.current = content;
            }
            setFormData(prev => ({
                ...prev,
                [fieldName]: content
            }));
        }
    };
    if (!selectedNode) {
        return (jsx("div", { className: "form-container", children: jsxs("div", { className: "form-placeholder", children: [jsx("h3", { children: "Select a node to edit" }), jsx("p", { children: "Choose a node from the tree view to edit its content." })] }) }));
    }
    return (jsxs("div", { className: "form-container", children: [jsxs("h2", { className: "form-title", children: [selectedNode.title || selectedNode.key || 'Select Node', " >> Edit Content"] }), jsxs("div", { className: "form-tabs", children: [jsx("button", { type: "button", className: `tab ${activeTab === 'en' ? 'active' : ''}`, onClick: () => setActiveTab('en'), children: "English" }), jsx("button", { type: "button", className: `tab ${activeTab === 'fr' ? 'active' : ''}`, onClick: () => setActiveTab('fr'), children: "French" }), jsx("button", { type: "button", className: `tab ${activeTab === 'es' ? 'active' : ''}`, onClick: () => setActiveTab('es'), children: "Spanish" }), jsx("button", { type: "button", className: `tab ${activeTab === 'ar' ? 'active' : ''}`, onClick: () => setActiveTab('ar'), children: "Arabic" }), jsx("button", { type: "button", className: `tab ${activeTab === 'pt' ? 'active' : ''}`, onClick: () => setActiveTab('pt'), children: "Portuguese" }), jsx("button", { type: "button", className: `tab ${activeTab === 'rs' ? 'active' : ''}`, onClick: () => setActiveTab('rs'), children: "Russian" })] }), jsxs("form", { className: "form", children: [jsxs("div", { className: "form-group", children: [jsxs("label", { htmlFor: "code", children: ["Code (10) ", jsx("span", { className: "required", children: "*" })] }), jsx("input", { type: "text", id: "code", value: formData.code, onChange: (e) => setFormData({ ...formData, code: e.target.value }), className: "form-input", placeholder: "Enter code (max 10 characters)", maxLength: 10, required: true })] }), jsxs("div", { className: "form-group", children: [jsxs("label", { htmlFor: "title", children: ["Title ", jsx("span", { className: "required", children: "*" })] }), jsx("input", { type: "text", id: "title", value: formData.title, onChange: (e) => setFormData({ ...formData, title: e.target.value }), className: "form-input", placeholder: "Enter title", required: true })] }), jsxs("div", { className: "form-group", children: [jsxs("label", { htmlFor: "desc", children: ["Description (HTML) ", jsx("span", { className: "required", children: "*" })] }), jsxs("div", { className: "html-editor", children: [jsxs("div", { className: "editor-toolbar", children: [jsx("button", { type: "button", onClick: () => applyFormat(descEditorRef, 'bold'), className: "toolbar-btn", title: "Bold", children: jsx("strong", { children: "B" }) }), jsx("button", { type: "button", onClick: () => applyFormat(descEditorRef, 'italic'), className: "toolbar-btn", title: "Italic", children: jsx("em", { children: "I" }) }), jsx("button", { type: "button", onClick: () => applyFormat(descEditorRef, 'underline'), className: "toolbar-btn", title: "Underline", children: jsx("u", { children: "U" }) }), jsx("button", { type: "button", onClick: () => applyFormat(descEditorRef, 'unorderedList'), className: "toolbar-btn", title: "Bullet List", children: "\u2022 List" }), jsx("button", { type: "button", onClick: () => applyFormat(descEditorRef, 'orderedList'), className: "toolbar-btn", title: "Numbered List", children: "1. List" }), jsx("button", { type: "button", onClick: () => applyFormat(descEditorRef, 'link'), className: "toolbar-btn", title: "Insert Link", children: "\uD83D\uDD17 Link" }), jsx("button", { type: "button", onClick: () => applyFormat(descEditorRef, 'heading1'), className: "toolbar-btn", title: "Heading 1", children: "H1" }), jsx("button", { type: "button", onClick: () => applyFormat(descEditorRef, 'heading2'), className: "toolbar-btn", title: "Heading 2", children: "H2" }), jsx("button", { type: "button", onClick: () => toggleHtmlCode(descEditorRef), className: "toolbar-btn", title: "HTML Code", children: "</>" }), jsx("button", { type: "button", onClick: () => applyHtmlChanges(descEditorRef), className: "toolbar-btn apply-html-btn", title: "Apply HTML Changes", style: { display: 'none' }, children: "Apply" }), jsx("button", { type: "button", onClick: () => insertImage(descEditorRef), className: "toolbar-btn", title: "Insert Image", children: "\uD83D\uDDBC\uFE0F Image" }), jsxs("select", { onChange: (e) => handleClassChange(e, descEditorRef), className: "toolbar-select", title: "Apply/Remove Classes", children: [jsx("option", { value: "", children: "Classes..." }), jsx("option", { value: "title", children: "Title" }), jsx("option", { value: "clear", children: "Clear class" })] })] }), jsx("div", { ref: descEditorRef, id: "desc-editor", className: "editor-content", contentEditable: true, suppressContentEditableWarning: true, onInput: () => handleEditorInput(descEditorRef), onBlur: () => handleEditorBlur(descEditorRef), onFocus: () => { }, onKeyDown: (e) => handleEditorKeyDown(e, descEditorRef), onPaste: (e) => handlePaste(e, descEditorRef), onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: (e) => handleDrop(e, descEditorRef) })] })] }), jsxs("div", { className: "form-group", children: [jsxs("label", { htmlFor: "purpose", children: ["Purpose ", jsx("span", { className: "required", children: "*" })] }), jsxs("div", { className: "html-editor", children: [jsxs("div", { className: "editor-toolbar", children: [jsx("button", { type: "button", onClick: () => applyFormat(purposeEditorRef, 'bold'), className: "toolbar-btn", title: "Bold", children: jsx("strong", { children: "B" }) }), jsx("button", { type: "button", onClick: () => applyFormat(purposeEditorRef, 'italic'), className: "toolbar-btn", title: "Italic", children: jsx("em", { children: "I" }) }), jsx("button", { type: "button", onClick: () => applyFormat(purposeEditorRef, 'underline'), className: "toolbar-btn", title: "Underline", children: jsx("u", { children: "U" }) }), jsx("button", { type: "button", onClick: () => applyFormat(purposeEditorRef, 'unorderedList'), className: "toolbar-btn", title: "Bullet List", children: "\u2022 List" }), jsx("button", { type: "button", onClick: () => applyFormat(purposeEditorRef, 'orderedList'), className: "toolbar-btn", title: "Numbered List", children: "1. List" }), jsx("button", { type: "button", onClick: () => applyFormat(purposeEditorRef, 'link'), className: "toolbar-btn", title: "Insert Link", children: "\uD83D\uDD17 Link" }), jsx("button", { type: "button", onClick: () => applyFormat(purposeEditorRef, 'heading1'), className: "toolbar-btn", title: "Heading 1", children: "H1" }), jsx("button", { type: "button", onClick: () => applyFormat(purposeEditorRef, 'heading2'), className: "toolbar-btn", title: "Heading 2", children: "H2" }), jsx("button", { type: "button", onClick: () => toggleHtmlCode(purposeEditorRef), className: "toolbar-btn", title: "HTML Code", children: "</>" }), jsx("button", { type: "button", onClick: () => applyHtmlChanges(purposeEditorRef), className: "toolbar-btn apply-html-btn", title: "Apply HTML Changes", style: { display: 'none' }, children: "Apply" }), jsx("button", { type: "button", onClick: () => insertImage(purposeEditorRef), className: "toolbar-btn", title: "Insert Image", children: "\uD83D\uDDBC\uFE0F Image" }), jsxs("select", { onChange: (e) => handleClassChange(e, purposeEditorRef), className: "toolbar-select", title: "Apply/Remove Classes", children: [jsx("option", { value: "", children: "Classes..." }), jsx("option", { value: "title", children: "Title" }), jsx("option", { value: "clear", children: "Clear class" })] })] }), jsx("div", { ref: purposeEditorRef, id: "purpose-editor", className: "editor-content", contentEditable: true, suppressContentEditableWarning: true, onInput: () => handleEditorInput(purposeEditorRef), onBlur: () => handleEditorBlur(purposeEditorRef), onFocus: () => { }, onKeyDown: (e) => handleEditorKeyDown(e, purposeEditorRef), onPaste: (e) => handlePaste(e, purposeEditorRef), onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: (e) => handleDrop(e, purposeEditorRef) })] })] }), jsxs("div", { className: "form-group", children: [jsx("label", { htmlFor: "related_keys", children: "Related Keys" }), jsx("input", { type: "text", id: "related_keys", value: formData.related_keys, onChange: (e) => setFormData({ ...formData, related_keys: e.target.value }), className: "form-input", placeholder: "Enter related keys", required: true })] }), jsx("div", { className: "form-actions", children: jsxs("div", { className: "key-section", children: [jsx("button", { type: "button", onClick: generateKey, className: "btn btn-secondary", disabled: !formData.code || !formData.title || !formData.desc, children: "Save Key" }), jsx("div", { className: "key-displays", children: jsxs("div", { className: "api-key", children: [jsx("strong", { children: "API Key:" }), " ", generatedKey || selectedNode?.key || 'No key available'] }) })] }) })] })] }));
};

/**
 * DFA Help Admin - Main component for content management
 */
const DFAHelpAdmin = ({ className = '', apiBaseUrl = 'https://help-api.dataforall.org/api', bearerToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2hlbHAtYXBpLmRhdGFmb3JhbGwub3JnL2FwaS9sb2dpbiIsImlhdCI6MTc1NTg0MzcwOSwiZXhwIjoxNzg3Mzc5NzA5LCJuYmYiOjE3NTU4NDM3MDksImp0aSI6IndQS2c0N2hRaWI0aHlmRDIiLCJzdWIiOiIxIiwicHJ2IjoiMjNiZDVjODk0OWY2MDBhZGIzOWU3MDFjNDAwODcyZGI3YTU5NzZmNyJ9.k_0Iuu7GkHXZFNBj2AZIwqgG23kCEZDxHJAmQ5e7rnQ', onUpdate, onError, showHeader = false }) => {
    const [adaptations, setAdaptations] = useState([]);
    const [selectedAdaptationId, setSelectedAdaptationId] = useState('');
    const [selectedAdaptationCode, setSelectedAdaptationCode] = useState('');
    const [keys, setKeys] = useState([]);
    const [selectedNode, setSelectedNode] = useState(undefined);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
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
            const data = await response.json();
            setAdaptations(data.data);
            // Auto-select the first adaptation if available
            if (data.data.length > 0) {
                const firstAdaptation = data.data[0];
                setSelectedAdaptationId(firstAdaptation.id.toString());
                setSelectedAdaptationCode(firstAdaptation.code);
            }
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            onError?.(errorMessage);
        }
        finally {
            setLoading(false);
        }
    };
    const fetchKeys = async (adaptationId, keepSelectedNode = false) => {
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
            const data = await response.json();
            console.log('✅ Keys fetched successfully:', data.data.length, 'items');
            setKeys(data.data);
            // Only reset selected node when changing adaptation, not when refreshing
            if (!keepSelectedNode) {
                setSelectedNode(undefined);
                console.log('🔄 Selected node reset (adaptation changed)');
            }
            else {
                console.log('🔄 Selected node preserved (refreshing after create)');
            }
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('❌ Failed to fetch keys:', err);
            setError(errorMessage);
            onError?.(errorMessage);
        }
        finally {
            setLoading(false);
        }
    };
    const handleAdaptationChange = (event) => {
        const adaptationId = event.target.value;
        const adaptation = adaptations.find(a => a.id.toString() === adaptationId);
        setSelectedAdaptationId(adaptationId);
        setSelectedAdaptationCode(adaptation?.code || '');
        // Fetch keys for the new adaptation (this will reset selected node)
        if (adaptationId) {
            fetchKeys(adaptationId, false); // Pass false to reset selected node
        }
    };
    const handleNodeSelect = async (node) => {
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
                const data = await response.json();
                console.log('✅ Detailed data fetched:', data);
                // Get the default language (en) translation
                const defaultLang = 'en';
                const translation = data.data.translations.find(t => t.locale === defaultLang);
                // Update the selected node with detailed data
                const detailedNode = {
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
            }
            else {
                const errorText = await response.text();
                console.error('❌ Key data API error:', errorText);
                console.warn('⚠️ Using basic node data (description and purpose may be empty)');
            }
        }
        catch (err) {
            err instanceof Error ? err.message : 'Unknown error';
            console.error('📡 Key data fetch error:', err);
            console.warn('⚠️ Using basic node data (description and purpose may be empty)');
        }
        finally {
            setLoading(false);
        }
        // Log the state change
        console.log('🔍 Selected node state updated');
    };
    const handleNodeDelete = async (nodeId) => {
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
                const removeNodeFromTree = (nodes, targetId) => {
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
            }
            else {
                const errorText = await response.text();
                console.error('❌ Delete API error:', errorText);
                throw new Error(`Failed to delete record: ${response.status} ${response.statusText}`);
            }
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('🗑️ Delete error:', err);
            setError(errorMessage);
            onError?.(errorMessage);
            alert(`Failed to delete record: ${errorMessage}`);
        }
        finally {
            setLoading(false);
        }
    };
    const handleSave = async (payload) => {
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
            const result = await response.json();
            onUpdate?.(result);
            // Show success message
            alert('Key saved successfully!');
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            onError?.(errorMessage);
            throw err;
        }
        finally {
            setLoading(false);
        }
    };
    const handleNodeCreate = async (adaptationId, parentId, title) => {
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
            }
            else {
                console.warn('⚠️ No selected adaptation ID, cannot refresh tree view');
            }
            // Show success message
            alert('New item created successfully! The tree view has been refreshed.');
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('❌ Failed to create item:', err);
            setError(errorMessage);
            onError?.(errorMessage);
            alert(`Failed to create item: ${errorMessage}`);
        }
        finally {
            setLoading(false);
        }
    };
    // Function to handle title changes and update tree view
    const handleTitleChange = (nodeId, newTitle) => {
        console.log('🔄 Updating title in tree view:', { nodeId, newTitle });
        // Update the title in the keys array
        const updateNodeTitle = (nodes, targetId, newTitle) => {
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
    return (jsxs("div", { className: `dfa-help-admin ${className}`, children: [showHeader && (jsx("header", { className: "dfa-header", children: jsx("h1", { className: "dfa-title", children: "DFA Help Admin" }) })), jsxs("div", { className: `dfa-content ${showHeader ? '' : 'no-header'}`, children: [jsxs("div", { className: `dfa-left-panel ${showHeader ? 'with-header' : 'no-header'}`, children: [jsxs("div", { className: "adaptation-selector", children: [jsx("label", { htmlFor: "adaptation", className: "selector-label", children: "Select Adaptation:" }), jsxs("select", { id: "adaptation", value: selectedAdaptationId, onChange: handleAdaptationChange, className: "adaptation-dropdown", disabled: loading, children: [jsx("option", { value: "", children: "Choose an adaptation..." }), adaptations.map((adaptation) => (jsx("option", { value: adaptation.id, children: adaptation.name }, adaptation.id)))] })] }), loading && jsx("div", { className: "loading-spinner" }), error && jsx("div", { className: "error-message", children: error }), keys.length > 0 && (jsx(TreeView, { nodes: keys, onNodeSelect: handleNodeSelect, onNodeDelete: handleNodeDelete, onNodeCreate: handleNodeCreate, selectedNode: selectedNode, adaptationId: parseInt(selectedAdaptationId) }))] }), jsx("div", { className: "dfa-body-panel", children: !selectedNode ? (jsxs("div", { className: "content-placeholder", children: [jsx("h3", { children: "Content Area" }), jsx("p", { children: "Click on a node from the tree view to edit its content." })] })) : (jsx(Form, { selectedNode: selectedNode, selectedAdaptation: selectedAdaptationCode, adaptationCode: selectedAdaptationCode, allNodes: keys, onSave: handleSave, onTitleChange: handleTitleChange })) })] })] }));
};

export { DFAHelpAdmin };
//# sourceMappingURL=index.js.map
