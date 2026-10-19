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
  apiURL: string; // Mandatory
  helpIcon?: React.ReactNode; // Optional - overwrites default button icon
  iconType?: 'question' | 'info'; // Optional - built-in icon type if no icon provided
  colorCode?: string; // Optional - replaces theme color (primary background)
  colorHoverCode?: string; // Optional - hover background color for buttons
  colorTextCode?: string; // Optional - text (foreground) color for buttons/tabs
  headerBackgroundCode?: string; // Optional - header background color for panel
  // Help button defaults
  buttonShape?: 'circle' | 'rect'; // Optional - default shape of help button
  buttonWidth?: number | string; // Optional - default width (px number or CSS string)
  buttonHeight?: number | string; // Optional - default height (px number or CSS string)
  defaultLang?: string; // Optional - default language (default: 'en')
  enable?: boolean; // Optional - enable/disable help functionality (default: true)
  languages?: string[]; // Optional - available languages array
}

export interface DFAHelpRendererProps {
  helpKey: string;
  className?: string;
  /** When set, replaces the default purple help button styles (host app toolbar classes). */
  buttonClassName?: string;
  buttonIcon?: React.ReactNode; // Override global icon for this instance
  iconType?: 'question' | 'info'; // Optional - choose built-in icon
  buttonText?: string;
  buttonShape?: 'circle' | 'rect'; // Optional - override default shape
  buttonWidth?: number | string; // Optional - override default width
  buttonHeight?: number | string; // Optional - override default height
  panelTitle?: string;
  onPanelOpen?: () => void;
  onPanelClose?: () => void;
  onError?: (error: Error) => void;
  loadingMessage?: string;
  errorMessage?: string;
  emptyStateMessage?: string;
  enable?: boolean; // Override global enable setting for this instance
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
