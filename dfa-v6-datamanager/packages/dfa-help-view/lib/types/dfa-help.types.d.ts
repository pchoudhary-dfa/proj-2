export interface DFAHelpTranslation {
    locale: string;
    title: string;
    desc: string;
    purpose: string;
}
export interface DFAHelpRelatedKey {
    key: string;
    translations?: DFAHelpTranslation[];
}
export interface DFAHelpData {
    id: number;
    key: string;
    code: string;
    parentKey?: string;
    parent_id?: number;
    related_keys: (string | DFAHelpRelatedKey)[];
    title: string;
    translations: DFAHelpTranslation[];
}
export interface DFAHelpAPIResponse {
    success: boolean;
    status: number;
    message: string;
    data: DFAHelpData;
}
export interface DFAHelpConfig {
    apiURL: string;
    helpIcon?: React.ReactNode;
    iconType?: 'question' | 'info';
    colorCode?: string;
    colorHoverCode?: string;
    colorTextCode?: string;
    headerBackgroundCode?: string;
    buttonShape?: 'circle' | 'rect';
    buttonWidth?: number | string;
    buttonHeight?: number | string;
    defaultLang?: string;
    enable?: boolean;
    languages?: string[];
}
export interface DFAHelpRendererProps {
    helpKey: string;
    className?: string;
    /** When set, replaces the default purple help button styles (host app toolbar classes). */
    buttonClassName?: string;
    buttonIcon?: React.ReactNode;
    iconType?: 'question' | 'info';
    buttonText?: string;
    buttonShape?: 'circle' | 'rect';
    buttonWidth?: number | string;
    buttonHeight?: number | string;
    panelTitle?: string;
    onPanelOpen?: () => void;
    onPanelClose?: () => void;
    onError?: (error: Error) => void;
    loadingMessage?: string;
    errorMessage?: string;
    emptyStateMessage?: string;
    enable?: boolean;
    /** When set, overrides global initDFAHelp languages (enables language tabs when length > 1). */
    languages?: string[];
}
export interface HelpPanelProps {
    isOpen: boolean;
    onClose: () => void;
    data: DFAHelpData | null;
    processedData: ProcessedHelpData | null;
    loading: boolean;
    error: string | null;
    title?: string;
    className?: string;
    languages?: string[];
    currentLanguage?: string;
    onLanguageChange?: (language: string) => void;
    onRelatedKeyClick?: (key: string) => void;
    onBackNavigation?: () => void;
    canGoBack?: boolean;
    loadingMessage?: string;
    errorMessage?: string;
    emptyStateMessage?: string;
}
export interface ProcessedRelatedKey {
    key: string;
    title: string;
}
export interface ProcessedHelpData {
    title: string;
    description: string;
    purpose: string;
    relatedKeys: ProcessedRelatedKey[];
    currentTranslation: DFAHelpTranslation | null;
    availableLanguages: string[];
}
export interface NavigationHistory {
    key: string;
    data: DFAHelpData;
    processedData: ProcessedHelpData;
}
//# sourceMappingURL=dfa-help.types.d.ts.map