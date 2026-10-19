/**
 * Single (en) JSON translation fallback. Merged with API response in CoreContext:
 * merged = { ...jsonFallback, ...api } so API overrides JSON.
 * Same fallback is used for every locale when API fails or key is missing.
 */

import translations from "./translations.json";

const fallbackTranslations = translations as Record<string, string>;

/**
 * Returns the single fallback map. Used to merge with API translations
 * so missing API keys fall back to these values. Locale is ignored; backend
 * provides locale-specific translations when available.
 */
export function getTranslationsFallback(_locale: string): Record<string, string> {
  return fallbackTranslations;
}
