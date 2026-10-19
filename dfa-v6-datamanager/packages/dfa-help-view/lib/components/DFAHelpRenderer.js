import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, useEffect, useMemo } from 'react';
import HelpPanel from './HelpPanel';
import { isDFAHelpEnabled, getDFAHelpApiURL, getDFAHelpIcon, getDFAHelpLanguages, getDFAHelpDefaultLanguage, getDFAHelpIconType } from '../utils/dfa-help-init';
import styles from '../styles/DFAHelpRenderer.module.css';
const DFAHelpRenderer = ({ helpKey, className = '', buttonClassName, buttonIcon, iconType, buttonText = 'Help', buttonShape, buttonWidth, buttonHeight, panelTitle = 'Help', onPanelOpen, onPanelClose, onError, loadingMessage = 'Loading help content...', errorMessage = 'Failed to load help content', emptyStateMessage = 'No help content available.', enable, // Override global enable setting
languages: languagesProp, }) => {
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [helpData, setHelpData] = useState(null);
    const [processedData, setProcessedData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentLanguage, setCurrentLanguage] = useState('');
    const [navigationHistory, setNavigationHistory] = useState([]);
    const [currentKey, setCurrentKey] = useState('');
    // Check if help is enabled (global or local override)
    const isEnabled = enable !== undefined ? enable : isDFAHelpEnabled();
    const configLanguages = getDFAHelpLanguages();
    const defaultLanguage = getDFAHelpDefaultLanguage();
    const availableLanguages = useMemo(() => {
        const fromConfig = languagesProp && languagesProp.length > 0 ? languagesProp : configLanguages;
        const fromApi = processedData?.availableLanguages ?? [];
        const merged = Array.from(new Set([...fromConfig, ...fromApi]));
        return merged.length > 0 ? merged : fromConfig;
    }, [languagesProp, configLanguages, processedData?.availableLanguages]);
    const globalIcon = getDFAHelpIcon();
    const globalIconType = getDFAHelpIconType();
    // Debug: Log available languages
    // console.log('🔍 DFAHelpRenderer: Available languages from config:', availableLanguages);
    useEffect(() => {
        setCurrentLanguage(defaultLanguage);
    }, [defaultLanguage]);
    // Process the API response data
    const processHelpData = useCallback((data, language) => {
        const translation = data.translations.find(t => t.locale === language) || data.translations[0];
        const availableLangs = data.translations.map(t => t.locale);
        // Process related_keys with translations
        const relatedKeys = (data.related_keys || []).map(key => {
            if (typeof key === 'string') {
                return { key, title: key };
            }
            if (key && typeof key === 'object' && key !== null) {
                const relatedKey = key;
                const keyString = relatedKey.key || String(key);
                // Find translation for the related key
                if (relatedKey.translations && relatedKey.translations.length > 0) {
                    const relatedTranslation = relatedKey.translations.find(t => t.locale === language) || relatedKey.translations[0];
                    return {
                        key: keyString,
                        title: relatedTranslation?.title || keyString
                    };
                }
                return { key: keyString, title: keyString };
            }
            return { key: String(key || ''), title: String(key || '') };
        }).filter(relatedKey => relatedKey.key); // Remove empty keys
        return {
            title: translation?.title || data.title,
            description: translation?.desc || '',
            purpose: translation?.purpose || '',
            relatedKeys: relatedKeys,
            currentTranslation: translation || null,
            availableLanguages: availableLangs
        };
    }, []);
    const fetchHelpData = useCallback(async (keyToFetch, language, addToHistory = true) => {
        const targetKey = keyToFetch || helpKey;
        // console.log('🔍 DFA Help: fetchHelpData called with key:', targetKey, 'language:', language);
        if (!targetKey) {
            const error = new Error('Help key is required');
            console.error('❌ DFA Help: Help key is missing');
            setError(error.message);
            onError?.(error);
            return;
        }
        // console.log('🔍 DFA Help: Help key:', targetKey);
        setLoading(true);
        setError(null);
        try {
            const apiURL = getDFAHelpApiURL();
            const targetLanguage = language || currentLanguage || defaultLanguage;
            const fullURL = `${apiURL}/${targetKey}/`;
            // console.log('🌐 DFA Help: Making API call to:', fullURL);
            // console.log('🌐 DFA Help: Target language:', targetLanguage);
            const response = await fetch(fullURL);
            // console.log('📡 DFA Help: Response status:', response.status);
            // console.log('📡 DFA Help: Response ok:', response.ok);
            if (!response.ok) {
                if (response.status === 404) {
                    // Treat 404 as no content available (empty state)
                    if (addToHistory && helpData && processedData) {
                        const historyEntry = {
                            key: currentKey || helpKey,
                            data: helpData,
                            processedData: processedData
                        };
                        setNavigationHistory(prev => [...prev, historyEntry]);
                    }
                    setHelpData(null);
                    setProcessedData(null);
                    setCurrentKey(targetKey);
                    setError(null);
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            // Handle 204 No Content
            if (response.status === 204) {
                if (addToHistory && helpData && processedData) {
                    const historyEntry = {
                        key: currentKey || helpKey,
                        data: helpData,
                        processedData: processedData
                    };
                    setNavigationHistory(prev => [...prev, historyEntry]);
                }
                setHelpData(null);
                setProcessedData(null);
                setCurrentKey(targetKey);
                setError(null);
                return;
            }
            const result = await response.json();
            // console.log('📦 DFA Help: API response:', result);
            if (result.success && result.data) {
                // console.log('✅ DFA Help: Data received successfully');
                // Add to navigation history if requested
                if (addToHistory && helpData && processedData) {
                    const historyEntry = {
                        key: currentKey || helpKey,
                        data: helpData,
                        processedData: processedData
                    };
                    setNavigationHistory(prev => [...prev, historyEntry]);
                }
                setHelpData(result.data);
                setCurrentKey(targetKey);
                const processed = processHelpData(result.data, targetLanguage);
                setProcessedData(processed);
            }
            else {
                // Treat missing/unsuccessful data as empty state instead of error
                if (addToHistory && helpData && processedData) {
                    const historyEntry = {
                        key: currentKey || helpKey,
                        data: helpData,
                        processedData: processedData
                    };
                    setNavigationHistory(prev => [...prev, historyEntry]);
                }
                setHelpData(null);
                setProcessedData(null);
                setCurrentKey(targetKey);
                setError(null);
            }
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
            console.log('❌ DFA Help: API call failed:', errorMessage);
            setError(errorMessage);
            onError?.(err instanceof Error ? err : new Error(errorMessage));
        }
        finally {
            setLoading(false);
        }
    }, [helpKey, currentLanguage, defaultLanguage, onError, processHelpData, helpData, processedData, currentKey]);
    const handleButtonClick = useCallback(() => {
        // console.log('🖱️ DFA Help: Button clicked, isPanelOpen:', isPanelOpen);
        if (!isPanelOpen) {
            // console.log('🖱️ DFA Help: Opening panel and fetching data...');
            setIsPanelOpen(true);
            onPanelOpen?.();
            fetchHelpData();
        }
        else {
            // console.log('🖱️ DFA Help: Closing panel...');
            setIsPanelOpen(false);
            onPanelClose?.();
        }
    }, [isPanelOpen, onPanelOpen, onPanelClose, fetchHelpData]);
    const handlePanelClose = useCallback(() => {
        setIsPanelOpen(false);
        onPanelClose?.();
    }, [onPanelClose]);
    const handleLanguageChange = useCallback((language) => {
        setCurrentLanguage(language);
        if (helpData) {
            const processed = processHelpData(helpData, language);
            setProcessedData(processed);
        }
    }, [helpData, processHelpData]);
    const handleRelatedKeyClick = useCallback((relatedKey) => {
        // console.log('🔗 DFA Help: Related key clicked:', relatedKey);
        fetchHelpData(relatedKey, currentLanguage, true);
    }, [fetchHelpData, currentLanguage]);
    const handleBackNavigation = useCallback(() => {
        // console.log('⬅️ DFA Help: Back navigation clicked');
        if (navigationHistory.length > 0) {
            const previousEntry = navigationHistory[navigationHistory.length - 1];
            setNavigationHistory(prev => prev.slice(0, -1));
            setHelpData(previousEntry.data);
            setProcessedData(previousEntry.processedData);
            setCurrentKey(previousEntry.key);
            // console.log('⬅️ DFA Help: Navigated back to:', previousEntry.key);
        }
    }, [navigationHistory]);
    // Don't render if disabled
    if (!isEnabled) {
        console.log('🚫 DFA Help: Component disabled, not rendering');
        return null;
    }
    // console.log('✅ DFA Help: Component enabled, rendering with helpKey:', helpKey);
    // Use local buttonIcon if provided, otherwise use global icon, otherwise use default
    const resolvedIconType = iconType || globalIconType || 'question';
    const questionIcon = (_jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }), _jsx("line", { x1: "12", y1: "17", x2: "12.01", y2: "17" })] }));
    const infoIcon = (_jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("line", { x1: "12", y1: "8", x2: "12", y2: "8" }), _jsx("line", { x1: "12", y1: "12", x2: "12", y2: "16" })] }));
    const builtinIcon = resolvedIconType === 'info' ? infoIcon : questionIcon;
    const displayIcon = buttonIcon || globalIcon || builtinIcon;
    const useHostButton = Boolean(buttonClassName);
    // Compute inline styles for button size/shape (default package styling only)
    const computedButtonStyle = useHostButton
        ? undefined
        : {
            width: typeof buttonWidth === 'number' ? `${buttonWidth}px` : buttonWidth,
            height: typeof buttonHeight === 'number' ? `${buttonHeight}px` : buttonHeight,
            borderRadius: buttonShape === 'circle' ? '50%' : (buttonShape === 'rect' ? '6px' : undefined),
            padding: (buttonWidth || buttonHeight) ? '4px' : '8px'
        };
    const resolvedButtonClass = useHostButton
        ? `${buttonClassName} ${className}`.trim()
        : `${styles.helpButton} ${className}`.trim();
    return (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", className: resolvedButtonClass, onClick: handleButtonClick, "aria-label": "Open help", title: buttonText, style: computedButtonStyle, children: [displayIcon, buttonText ? (_jsx("span", { className: useHostButton ? undefined : styles.buttonText, children: buttonText })) : null] }), _jsx(HelpPanel, { isOpen: isPanelOpen, onClose: handlePanelClose, data: helpData, processedData: processedData, loading: loading, error: error, title: panelTitle, loadingMessage: loadingMessage, errorMessage: errorMessage, emptyStateMessage: emptyStateMessage, languages: availableLanguages, currentLanguage: currentLanguage, onLanguageChange: handleLanguageChange, onRelatedKeyClick: handleRelatedKeyClick, onBackNavigation: handleBackNavigation, canGoBack: navigationHistory.length > 0 })] }));
};
export default DFAHelpRenderer;
//# sourceMappingURL=DFAHelpRenderer.js.map