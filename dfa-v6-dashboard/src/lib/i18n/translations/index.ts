import translations from "./translations.json";

const fallbackTranslations = translations as Record<string, string>;

/**
 * Returns the English fallback map. The locale parameter is accepted
 * but ignored — the backend provides locale-specific text. This
 * fallback only fills in gaps or is used when the API fails.
 */
export function getTranslationsFallback(_locale: string): Record<string, string> {
  return fallbackTranslations;
}
