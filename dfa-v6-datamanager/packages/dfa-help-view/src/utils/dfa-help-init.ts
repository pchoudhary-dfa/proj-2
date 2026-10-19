import { DFAHelpConfig } from '../types';

class DFAHelpManager {
  private static instance: DFAHelpManager;
  private config: DFAHelpConfig | null = null;

  private constructor() {}

  public static getInstance(): DFAHelpManager {
    if (!DFAHelpManager.instance) {
      DFAHelpManager.instance = new DFAHelpManager();
    }
    return DFAHelpManager.instance;
  }

  public init(config: DFAHelpConfig): void {
    // Validate required fields
    if (!config.apiURL) {
      throw new Error('apiURL is mandatory for DFA Help initialization');
    }

    // Set default values
    this.config = {
      defaultLang: 'en',
      enable: true,
      ...config
    };

    // Apply theme colors if provided
    if (this.config.colorCode) {
      this.applyThemeColors(this.config.colorCode, this.config.colorHoverCode, this.config.colorTextCode);
    }
    if (this.config.headerBackgroundCode && typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--dfa-help-header-background', this.config.headerBackgroundCode);
    }
  }

  public getConfig(): DFAHelpConfig | null {
    return this.config;
  }

  public isEnabled(): boolean {
    return this.config?.enable ?? true;
  }

  public getApiURL(): string {
    if (!this.config?.apiURL) {
      throw new Error('DFA Help not initialized. Call init() first.');
    }
    return this.config.apiURL;
  }

  public getDefaultLanguage(): string {
    return this.config?.defaultLang ?? 'en';
  }

  public getAvailableLanguages(): string[] {
    return this.config?.languages ?? ['en'];
  }

  public getHelpIcon(): React.ReactNode | undefined {
    return this.config?.helpIcon;
  }

  public getIconType(): 'question' | 'info' | undefined {
    return this.config?.iconType;
  }

  private applyThemeColors(colorCode: string, hoverColorCode?: string, textColorCode?: string): void {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--dfa-help-primary-color', colorCode);
      root.style.setProperty('--dfa-help-primary-hover', hoverColorCode || this.lightenColor(colorCode, 10));
      root.style.setProperty('--dfa-help-primary-active', this.darkenColor(colorCode, 10));
      if (textColorCode) {
        root.style.setProperty('--dfa-help-primary-foreground', textColorCode);
      }
    }
  }

  private lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (0x1000000 + (R > 255 ? 255 : R < 0 ? 0 : R) * 0x10000 +
      (G > 255 ? 255 : G < 0 ? 0 : G) * 0x100 +
      (B > 255 ? 255 : B < 0 ? 0 : B)).toString(16).slice(1);
  }
}

// Export singleton instance and init function
export const dfaHelpManager = DFAHelpManager.getInstance();

export const initDFAHelp = (config: DFAHelpConfig): void => {
  dfaHelpManager.init(config);
};

export const getDFAHelpConfig = () => dfaHelpManager.getConfig();
export const isDFAHelpEnabled = () => dfaHelpManager.isEnabled();
export const getDFAHelpApiURL = () => dfaHelpManager.getApiURL();
export const getDFAHelpDefaultLanguage = () => dfaHelpManager.getDefaultLanguage();
export const getDFAHelpLanguages = () => dfaHelpManager.getAvailableLanguages();
export const getDFAHelpIcon = () => dfaHelpManager.getHelpIcon();
export const getDFAHelpIconType = () => dfaHelpManager.getIconType();
