import React, { useState, useEffect, useRef } from 'react';
import { HelpPanelProps, ProcessedHelpData } from '../types';
import styles from '../styles/HelpPanel.module.css';

const HelpPanel: React.FC<HelpPanelProps> = ({
  isOpen,
  onClose,
  data,
  processedData,
  loading,
  error,
  title = 'Help',
  loadingMessage = 'Loading...',
  errorMessage = 'Error loading content',
  emptyStateMessage = 'No content available',
  languages,
  currentLanguage,
  onLanguageChange,
  onRelatedKeyClick,
  onBackNavigation,
  canGoBack = false
}) => {
  const MIN_FONT_SIZE = 9;
  const MAX_FONT_SIZE = 28;

  const [titleFontSize, setTitleFontSize] = useState<number>(20);
  const [contentFontSize, setContentFontSize] = useState<number>(12);

  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const descRef = useRef<HTMLDivElement | null>(null);
  const purposeRef = useRef<HTMLDivElement | null>(null);

  // Treat HTTP 404 errors as "no content" to show empty state
  const is404 = typeof error === 'string' && /404/.test(error);

  // Helpers
  const clampFontSize = (px: number): number => {
    return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, px));
  };

  const extractFontSizeFromHtml = (htmlContent?: string | null): number | null => {
    if (!htmlContent) return null;
    const match = htmlContent.match(/font-size\s*:\s*([0-9.]+)\s*px/i);
    if (match && match[1]) {
      const value = parseFloat(match[1]);
      if (!Number.isNaN(value)) return clampFontSize(value);
    }
    return null;
  };

  // Function to update font sizes in HTML content
  const updateHtmlFontSize = (htmlContent: string, newFontSize: number): string => {
    if (!htmlContent) return htmlContent;
    
    console.log('🔍 HelpPanel: Original HTML content:', htmlContent);
    
    // Replace inline font-size styles in the HTML
    const updatedContent = htmlContent.replace(
      /font-size\s*:\s*[^;]+/gi,
      `font-size: ${clampFontSize(newFontSize)}px !important`
    );
    
    console.log('🔍 HelpPanel: Updated HTML content:', updatedContent);
    console.log('🔍 HelpPanel: Applied font size:', newFontSize);
    
    return updatedContent;
  };

  // Derive initial font sizes from existing content/CSS
  useEffect(() => {
    // Content font size: prefer inline value from HTML, else computed style
    let derivedContentSize =
      extractFontSizeFromHtml(processedData?.description) ??
      extractFontSizeFromHtml(processedData?.purpose) ??
      null;

    if (derivedContentSize == null) {
      const el = descRef.current || purposeRef.current;
      if (el && typeof window !== 'undefined') {
        const computed = window.getComputedStyle(el);
        const px = parseFloat(computed.fontSize || '16');
        if (!Number.isNaN(px)) derivedContentSize = clampFontSize(px);
      }
    }
    if (derivedContentSize != null) setContentFontSize(derivedContentSize);

    // Title font size: from computed style of the title element
    if (titleRef.current && typeof window !== 'undefined') {
      const computed = window.getComputedStyle(titleRef.current);
      const px = parseFloat(computed.fontSize || '16');
      if (!Number.isNaN(px)) setTitleFontSize(clampFontSize(px));
    }
  }, [processedData, currentLanguage, isOpen]);

  if (!isOpen) return null;

  const getLanguageName = (code: string): string => {
    const languageNames: Record<string, string> = {
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

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header with controls similar to the image */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button 
              className={styles.backButton} 
              onClick={canGoBack ? onBackNavigation : onClose} 
              aria-label={canGoBack ? "Back to previous" : "Close"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
          </div>
          
          <div className={styles.headerCenter}>
            {/* Font size controls */}
            <div className={styles.fontControls}>
              <button 
                className={styles.fontButton} 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🔍 HelpPanel: A+ button clicked');
                  increaseFontSize();
                }}
                aria-label="Increase font size"
              >
                A+
              </button>
              <button 
                className={styles.fontButton} 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🔍 HelpPanel: A- button clicked');
                  decreaseFontSize();
                }}
                aria-label="Decrease font size"
              >
                A-
              </button>
            </div>
            
            {/* Language selection tabs */}
            {languages && languages.length > 1 && (
              <div className={styles.languageTabs}>
                {(() => {
                  console.log('🔍 HelpPanel: Available languages:', languages);
                  console.log('🔍 HelpPanel: Current language:', currentLanguage);
                  return null;
                })()}
                {languages.map((lang) => (
                  <button
                    key={lang}
                    className={`${styles.languageTab} ${currentLanguage === lang ? styles.active : ''}`}
                    onClick={() => onLanguageChange?.(lang)}
                    title={getLanguageName(lang)}
                  >
                    {getLanguageName(lang)}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className={styles.headerRight}>
            <button className={styles.closeButton} onClick={onClose} aria-label="Close help">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Main content area */}
        <div className={styles.content}>
          {/* Debug: Show current font sizes */}
          {(() => {
            console.log('🔍 HelpPanel: Rendering with title font size:', titleFontSize, 'content font size:', contentFontSize);
            return null;
          })()}
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <p>{loadingMessage}</p>
            </div>
          )}
          
          {error && !is404 && (
            <div className={styles.error}>
              <p>{errorMessage}</p>
              <p className={styles.errorDetail}>{error}</p>
            </div>
          )}
          
          {!loading && (is404 || (!error && !processedData)) && (
            <div className={styles.empty}>
              <p>{emptyStateMessage}</p>
            </div>
          )}
          
          {!loading && !error && processedData && (
            <div className={styles.helpContent}>
              {/* Debug logging */}
              {(() => {
                console.log('🔍 HelpPanel: processedData:', processedData);
                console.log('🔍 HelpPanel: relatedKeys:', processedData.relatedKeys);
                return null;
              })()}
              
              {/* Main Title - Large heading like in the second image */}
              <h1 ref={titleRef} className={styles.helpTitle} style={{ fontSize: `${titleFontSize}px` }}>{processedData.title}</h1>
              
              {/* Description Section */}
              {processedData.description && (
                <div className={styles.section}>
                  <div 
                    className={styles.sectionContent}
                    style={{ fontSize: `${contentFontSize}px` }}
                    ref={descRef}
                    dangerouslySetInnerHTML={{ 
                      __html: updateHtmlFontSize(processedData.description, contentFontSize)
                    }}
                  />
                </div>
              )}
              
              {/* Line separator */}
              <div className={styles.separator}></div>
              
              {/* Purpose Section */}
              {processedData.purpose && (
                <div className={styles.section}>
                  <div 
                    className={styles.sectionContent}
                    style={{ fontSize: `${contentFontSize}px` }}
                    ref={purposeRef}
                    dangerouslySetInnerHTML={{ 
                      __html: updateHtmlFontSize(processedData.purpose, contentFontSize)
                    }}
                  />
                </div>
              )}
              
              {/* Line separator */}
              <div className={styles.separator}></div>
              
              {/* Related Keys Section */}
              {processedData.relatedKeys && processedData.relatedKeys.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.relatedKeys}>
                    {processedData.relatedKeys.map((relatedKey, index) => {
                      if (!relatedKey.key) return null;
                      
                      return (
                        <div 
                          key={index} 
                          className={styles.relatedKey}
                          onClick={() => onRelatedKeyClick?.(relatedKey.key)}
                          style={{ cursor: 'pointer' }}
                          title={`Click to view help for: ${relatedKey.title}`}
                        >
                          <span className={styles.keyCode}>{relatedKey.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HelpPanel;
