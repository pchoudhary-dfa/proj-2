// Include global styles in the bundle
import './styles';

// Export all components
export { default as DFAHelpRenderer } from './components/DFAHelpRenderer';
export { default as HelpPanel } from './components/HelpPanel';

// Export all types
export * from './types';

// Export utilities and initialization
export {
  initDFAHelp,
  getDFAHelpConfig,
  isDFAHelpEnabled,
  getDFAHelpApiURL,
  getDFAHelpDefaultLanguage,
  getDFAHelpLanguages,
  getDFAHelpIcon
} from './utils/dfa-help-init';

// Default export for easier importing
export { default } from './components/DFAHelpRenderer';
