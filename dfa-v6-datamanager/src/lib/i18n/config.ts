import { FALLBACK_DEFAULT_LOCALE } from "@/lib/constants";

/** Active UI locale codes come from GET /system-language (see `fetchAllowedLocaleCodes` in core API). */
export type Locale = string;

export const defaultLocale: Locale = FALLBACK_DEFAULT_LOCALE;

/** BCP 47–style single path segment (matches middleware / login URL parsing). */
export function isValidLocaleSegment(value: string): boolean {
  return /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(value);
}

/** True if `locale` is one of the backend system-language codes (case-insensitive). */
export function isAllowedAppLocale(
  locale: string,
  allowed: readonly string[]
): boolean {
  if (!allowed.length) return false;
  const lower = locale.toLowerCase();
  return allowed.some((code) => code.toLowerCase() === lower);
}
