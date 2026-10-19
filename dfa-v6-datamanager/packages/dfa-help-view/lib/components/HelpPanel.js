import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import styles from '../styles/HelpPanel.module.css';
const HelpPanel = ({ isOpen, onClose, data, processedData, loading, error, title = 'Help', loadingMessage = 'Loading...', errorMessage = 'Error loading content', emptyStateMessage = 'No content available', languages, currentLanguage, onLanguageChange, onRelatedKeyClick, onBackNavigation, canGoBack = false }) => {
    const MIN_FONT_SIZE = 9;
    const MAX_FONT_SIZE = 28;
    const [titleFontSize, setTitleFontSize] = useState(20);
    const [contentFontSize, setContentFontSize] = useState(12);
    const titleRef = useRef(null);
    const descRef = useRef(null);
    const purposeRef = useRef(null);
    // Treat HTTP 404 errors as "no content" to show empty state
    const is404 = typeof error === 'string' && /404/.test(error);
    // Helpers
    const clampFontSize = (px) => {
        return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, px));
    };
    const extractFontSizeFromHtml = (htmlContent) => {
        if (!htmlContent)
            return null;
        const match = htmlContent.match(/font-size\s*:\s*([0-9.]+)\s*px/i);
        if (match && match[1]) {
            const value = parseFloat(match[1]);
            if (!Number.isNaN(value))
                return clampFontSize(value);
        }
        return null;
    };
    // Function to update font sizes in HTML content
    const updateHtmlFontSize = (htmlContent, newFontSize) => {
        if (!htmlContent)
            return htmlContent;
        console.log('🔍 HelpPanel: Original HTML content:', htmlContent);
        // Replace inline font-size styles in the HTML
        const updatedContent = htmlContent.replace(/font-size\s*:\s*[^;]+/gi, `font-size: ${clampFontSize(newFontSize)}px !important`);
        console.log('🔍 HelpPanel: Updated HTML content:', updatedContent);
        console.log('🔍 HelpPanel: Applied font size:', newFontSize);
        return updatedContent;
    };
    // Derive initial font sizes from existing content/CSS
    useEffect(() => {
        // Content font size: prefer inline value from HTML, else computed style
        let derivedContentSize = extractFontSizeFromHtml(processedData?.description) ??
            extractFontSizeFromHtml(processedData?.purpose) ??
            null;
        if (derivedContentSize == null) {
            const el = descRef.current || purposeRef.current;
            if (el && typeof window !== 'undefined') {
                const computed = window.getComputedStyle(el);
                const px = parseFloat(computed.fontSize || '16');
                if (!Number.isNaN(px))
                    derivedContentSize = clampFontSize(px);
            }
        }
        if (derivedContentSize != null)
            setContentFontSize(derivedContentSize);
        // Title font size: from computed style of the title element
        if (titleRef.current && typeof window !== 'undefined') {
            const computed = window.getComputedStyle(titleRef.current);
            const px = parseFloat(computed.fontSize || '16');
            if (!Number.isNaN(px))
                setTitleFontSize(clampFontSize(px));
        }
    }, [processedData, currentLanguage, isOpen]);
    if (!isOpen)
        return null;
    const getLanguageName = (code) => {
        const languageNames = {
            'en': 'EN',
            'es': 'ES',
            'fr': 'FR',
            'de': 'DE',
            'it': 'IT',
            'pt': 'PO', // Portuguese as "PO" to match your design
            'ru': 'RU',
            'zh': 'ZH',
            'ja': 'JA',
            'ko': 'KO',
            'ar': 'AR',
            'hi': 'HI'
        };
        return languageNames[code] || code.toUpperCase();
    };
    const increaseFontSize = () => {
        console.log('🔍 HelpPanel: Increasing font sizes');
        setTitleFontSize(prev => {
            const newSize = clampFontSize(prev + 1);
            console.log('🔍 HelpPanel: New title font size:', newSize);
            return newSize;
        });
        setContentFontSize(prev => {
            const newSize = clampFontSize(prev + 1);
            console.log('🔍 HelpPanel: New content font size:', newSize);
            return newSize;
        });
    };
    const decreaseFontSize = () => {
        console.log('🔍 HelpPanel: Decreasing font sizes');
        setTitleFontSize(prev => {
            const newSize = clampFontSize(prev - 1);
            console.log('🔍 HelpPanel: New title font size:', newSize);
            return newSize;
        });
        setContentFontSize(prev => {
            const newSize = clampFontSize(prev - 1);
            console.log('🔍 HelpPanel: New content font size:', newSize);
            return newSize;
        });
    };
    return (_jsx("div", { className: styles.overlay, onClick: onClose, children: _jsxs("div", { className: styles.panel, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: styles.header, children: [_jsx("div", { className: styles.headerLeft, children: _jsx("button", { className: styles.backButton, onClick: canGoBack ? onBackNavigation : onClose, "aria-label": canGoBack ? "Back to previous" : "Close", children: _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M19 12H5M12 19l-7-7 7-7" }) }) }) }), _jsxs("div", { className: styles.headerCenter, children: [_jsxs("div", { className: styles.fontControls, children: [_jsx("button", { className: styles.fontButton, onClick: (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                console.log('🔍 HelpPanel: A+ button clicked');
                                                increaseFontSize();
                                            }, "aria-label": "Increase font size", children: "A+" }), _jsx("button", { className: styles.fontButton, onClick: (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                console.log('🔍 HelpPanel: A- button clicked');
                                                decreaseFontSize();
                                            }, "aria-label": "Decrease font size", children: "A-" })] }), languages && languages.length > 1 && (_jsxs("div", { className: styles.languageTabs, children: [(() => {
                                            console.log('🔍 HelpPanel: Available languages:', languages);
                                            console.log('🔍 HelpPanel: Current language:', currentLanguage);
                                            return null;
                                        })(), languages.map((lang) => (_jsx("button", { className: `${styles.languageTab} ${currentLanguage === lang ? styles.active : ''}`, onClick: () => onLanguageChange?.(lang), title: getLanguageName(lang), children: getLanguageName(lang) }, lang)))] }))] }), _jsx("div", { className: styles.headerRight, children: _jsx("button", { className: styles.closeButton, onClick: onClose, "aria-label": "Close help", children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) }) })] }), _jsxs("div", { className: styles.content, children: [(() => {
                            console.log('🔍 HelpPanel: Rendering with title font size:', titleFontSize, 'content font size:', contentFontSize);
                            return null;
                        })(), loading && (_jsxs("div", { className: styles.loading, children: [_jsx("div", { className: styles.spinner }), _jsx("p", { children: loadingMessage })] })), error && !is404 && (_jsxs("div", { className: styles.error, children: [_jsx("p", { children: errorMessage }), _jsx("p", { className: styles.errorDetail, children: error })] })), !loading && (is404 || (!error && !processedData)) && (_jsx("div", { className: styles.empty, children: _jsx("p", { children: emptyStateMessage }) })), !loading && !error && processedData && (_jsxs("div", { className: styles.helpContent, children: [(() => {
                                    console.log('🔍 HelpPanel: processedData:', processedData);
                                    console.log('🔍 HelpPanel: relatedKeys:', processedData.relatedKeys);
                                    return null;
                                })(), _jsx("h1", { ref: titleRef, className: styles.helpTitle, style: { fontSize: `${titleFontSize}px` }, children: processedData.title }), processedData.description && (_jsx("div", { className: styles.section, children: _jsx("div", { className: styles.sectionContent, style: { fontSize: `${contentFontSize}px` }, ref: descRef, dangerouslySetInnerHTML: {
                                            __html: updateHtmlFontSize(processedData.description, contentFontSize)
                                        } }) })), _jsx("div", { className: styles.separator }), processedData.purpose && (_jsx("div", { className: styles.section, children: _jsx("div", { className: styles.sectionContent, style: { fontSize: `${contentFontSize}px` }, ref: purposeRef, dangerouslySetInnerHTML: {
                                            __html: updateHtmlFontSize(processedData.purpose, contentFontSize)
                                        } }) })), _jsx("div", { className: styles.separator }), processedData.relatedKeys && processedData.relatedKeys.length > 0 && (_jsx("div", { className: styles.section, children: _jsx("div", { className: styles.relatedKeys, children: processedData.relatedKeys.map((relatedKey, index) => {
                                            if (!relatedKey.key)
                                                return null;
                                            return (_jsx("div", { className: styles.relatedKey, onClick: () => onRelatedKeyClick?.(relatedKey.key), style: { cursor: 'pointer' }, title: `Click to view help for: ${relatedKey.title}`, children: _jsx("span", { className: styles.keyCode, children: relatedKey.title }) }, index));
                                        }) }) }))] }))] })] }) }));
};
export default HelpPanel;
//# sourceMappingURL=HelpPanel.js.map