import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';

const TreeViewItem = ({ node, level, onNodeSelect, selectedNode }) => {
    const isSelected = selectedNode?.id === node.id;
    return (jsxs("div", { className: "tree-item", children: [jsxs("div", { className: `tree-node ${isSelected ? 'selected' : ''}`, style: { paddingLeft: `${level * 20}px` }, onClick: () => onNodeSelect(node), children: [jsx("span", { className: "tree-icon", children: node.children.length > 0 ? '📁' : '📄' }), jsx("span", { className: "tree-label", children: node.title }), jsxs("span", { className: "tree-code", children: ["(", node.code, ")"] })] }), node.children.length > 0 && (jsx("div", { className: "tree-children", children: node.children.map((child) => (jsx(TreeViewItem, { node: child, level: level + 1, onNodeSelect: onNodeSelect, selectedNode: selectedNode }, child.id))) }))] }));
};
const TreeView = ({ nodes, onNodeSelect, selectedNode }) => {
    return (jsxs("div", { className: "tree-view", children: [jsx("h3", { className: "tree-title", children: "Keys Structure" }), jsx("div", { className: "tree-container", children: nodes.map((node) => (jsx(TreeViewItem, { node: node, level: 0, onNodeSelect: onNodeSelect, selectedNode: selectedNode }, node.id))) })] }));
};

const Form = ({ selectedNode, selectedAdaptation, onSave }) => {
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
    useEffect(() => {
        if (selectedNode) {
            setFormData({
                code: selectedNode.code || '',
                title: selectedNode.title || '',
                desc: '',
                purpose: '',
                related_keys: Array.isArray(selectedNode.related_keys)
                    ? selectedNode.related_keys.join(', ')
                    : selectedNode.related_keys || ''
            });
            setGeneratedKey('');
        }
    }, [selectedNode]);
    const generateKey = () => {
        if (!selectedNode || !selectedAdaptation)
            return;
        let key = '';
        if (selectedNode.parent_id === null) {
            // Top level key: Adaptation code + key Code
            key = `${selectedAdaptation}-${formData.code}`;
        }
        else {
            // Child key: Parent code + key Code
            const parentCode = selectedNode.code || '';
            key = `${parentCode}-${formData.code}`;
        }
        setGeneratedKey(key);
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!generatedKey) {
            alert('Please generate a key first');
            return;
        }
        setIsSaving(true);
        try {
            const payload = {
                key: generatedKey,
                lang: activeTab,
                code: formData.code,
                title: formData.title,
                desc: formData.desc,
                purpose: formData.purpose,
                related_keys: formData.related_keys
            };
            await onSave(payload);
        }
        catch (error) {
            console.error('Error saving:', error);
        }
        finally {
            setIsSaving(false);
        }
    };
    if (!selectedNode) {
        return (jsx("div", { className: "form-placeholder", children: jsx("p", { children: "Select a node from the tree view to edit" }) }));
    }
    return (jsxs("div", { className: "form-container", children: [jsxs("div", { className: "form-tabs", children: [jsx("button", { type: "button", className: `tab ${activeTab === 'en' ? 'active' : ''}`, onClick: () => setActiveTab('en'), children: "English" }), jsx("button", { type: "button", className: `tab ${activeTab === 'es' ? 'active' : ''}`, onClick: () => setActiveTab('es'), children: "Spanish" }), jsx("button", { type: "button", className: `tab ${activeTab === 'fr' ? 'active' : ''}`, onClick: () => setActiveTab('fr'), children: "French" })] }), jsxs("form", { onSubmit: handleSubmit, className: "form", children: [jsxs("div", { className: "form-group", children: [jsx("label", { htmlFor: "code", children: "Field Code (10)" }), jsx("input", { type: "text", id: "code", value: formData.code, onChange: (e) => setFormData({ ...formData, code: e.target.value }), maxLength: 10, required: true, className: "form-input" })] }), jsxs("div", { className: "form-group", children: [jsx("label", { htmlFor: "title", children: "Title" }), jsx("input", { type: "text", id: "title", value: formData.title, onChange: (e) => setFormData({ ...formData, title: e.target.value }), required: true, className: "form-input" })] }), jsxs("div", { className: "form-group", children: [jsx("label", { htmlFor: "desc", children: "Description (HTML) *" }), jsx("textarea", { id: "desc", value: formData.desc, onChange: (e) => setFormData({ ...formData, desc: e.target.value }), required: true, rows: 4, className: "form-textarea", placeholder: "Enter HTML description..." })] }), jsxs("div", { className: "form-group", children: [jsx("label", { htmlFor: "purpose", children: "Purpose (HTML)" }), jsx("textarea", { id: "purpose", value: formData.purpose, onChange: (e) => setFormData({ ...formData, purpose: e.target.value }), rows: 4, className: "form-textarea", placeholder: "Enter HTML purpose (optional)..." })] }), jsxs("div", { className: "form-group", children: [jsx("label", { htmlFor: "related_keys", children: "Related Keys" }), jsx("input", { type: "text", id: "related_keys", value: formData.related_keys, onChange: (e) => setFormData({ ...formData, related_keys: e.target.value }), className: "form-input", placeholder: "Enter related keys..." })] }), jsxs("div", { className: "form-actions", children: [jsx("button", { type: "button", onClick: generateKey, className: "btn btn-secondary", children: "Save Key" }), generatedKey && (jsxs("div", { className: "generated-key", children: [jsx("strong", { children: "Generated Key:" }), " ", generatedKey] }))] }), jsx("button", { type: "submit", disabled: isSaving || !generatedKey, className: "btn btn-primary", children: isSaving ? 'Saving...' : 'Save Data' })] })] }));
};

const API_BASE_URL = 'https://help-api.dataforall.org/api';
const DFAHelpService = ({ className = '', onUpdate, onError }) => {
    const [adaptations, setAdaptations] = useState([]);
    const [selectedAdaptationId, setSelectedAdaptationId] = useState('');
    const [selectedAdaptationCode, setSelectedAdaptationCode] = useState('');
    const [keys, setKeys] = useState([]);
    const [selectedNode, setSelectedNode] = useState(undefined);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
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
            const response = await fetch(`${API_BASE_URL}/adaptations`);
            if (!response.ok) {
                throw new Error('Failed to fetch adaptations');
            }
            const data = await response.json();
            setAdaptations(data.data);
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
    const fetchKeys = async (adaptationId) => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/keys?adaptation_id=${adaptationId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch keys');
            }
            const data = await response.json();
            setKeys(data.data);
            setSelectedNode(undefined); // Reset selected node when adaptation changes
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
    const handleAdaptationChange = (event) => {
        const adaptationId = event.target.value;
        const adaptation = adaptations.find(a => a.id.toString() === adaptationId);
        setSelectedAdaptationId(adaptationId);
        setSelectedAdaptationCode(adaptation?.code || '');
    };
    const handleNodeSelect = (node) => {
        setSelectedNode(node);
    };
    const handleSave = async (payload) => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/update`, {
                method: 'POST',
                headers: {
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
            alert('Data saved successfully!');
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
    return (jsxs("div", { className: `dfa-help-service ${className}`, children: [jsx("header", { className: "dfa-header", children: jsx("h1", { className: "dfa-title", children: "DFA Help Service" }) }), jsxs("div", { className: "dfa-content", children: [jsxs("div", { className: "dfa-left-panel", children: [jsxs("div", { className: "adaptation-selector", children: [jsx("label", { htmlFor: "adaptation", className: "selector-label", children: "Select Adaptation:" }), jsxs("select", { id: "adaptation", value: selectedAdaptationId, onChange: handleAdaptationChange, className: "adaptation-dropdown", disabled: loading, children: [jsx("option", { value: "", children: "Choose an adaptation..." }), adaptations.map((adaptation) => (jsx("option", { value: adaptation.id, children: adaptation.name }, adaptation.id)))] })] }), loading && jsx("div", { className: "loading", children: "Loading..." }), error && jsx("div", { className: "error-message", children: error }), keys.length > 0 && (jsx(TreeView, { nodes: keys, onNodeSelect: handleNodeSelect, selectedNode: selectedNode }))] }), jsx("div", { className: "dfa-body-panel", children: !selectedNode ? (jsxs("div", { className: "content-placeholder", children: [jsx("h3", { children: "Content Area" }), jsx("p", { children: "Click on a node from the tree view to edit its content." })] })) : (jsx(Form, { selectedNode: selectedNode, selectedAdaptation: selectedAdaptationCode, onSave: handleSave })) })] }), jsx("footer", { className: "dfa-footer", children: jsx("p", { className: "version", children: "v2.0.0" }) })] }));
};

export { DFAHelpService };
//# sourceMappingURL=index.esm.js.map
