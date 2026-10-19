import { DFAHelpConfig } from '../types';
declare class DFAHelpManager {
    private static instance;
    private config;
    private constructor();
    static getInstance(): DFAHelpManager;
    init(config: DFAHelpConfig): void;
    getConfig(): DFAHelpConfig | null;
    isEnabled(): boolean;
    getApiURL(): string;
    getDefaultLanguage(): string;
    getAvailableLanguages(): string[];
    getHelpIcon(): React.ReactNode | undefined;
    getIconType(): 'question' | 'info' | undefined;
    private applyThemeColors;
    private lightenColor;
    private darkenColor;
}
export declare const dfaHelpManager: DFAHelpManager;
export declare const initDFAHelp: (config: DFAHelpConfig) => void;
export declare const getDFAHelpConfig: () => DFAHelpConfig | null;
export declare const isDFAHelpEnabled: () => boolean;
export declare const getDFAHelpApiURL: () => string;
export declare const getDFAHelpDefaultLanguage: () => string;
export declare const getDFAHelpLanguages: () => string[];
export declare const getDFAHelpIcon: () => import("react").ReactNode;
export declare const getDFAHelpIconType: () => "question" | "info" | undefined;
export {};
//# sourceMappingURL=dfa-help-init.d.ts.map