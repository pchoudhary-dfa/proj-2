export const locales = ["en", "ar", "fr", "pt", "tto"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

const RTL_LOCALES: ReadonlySet<string> = new Set(["ar", "he", "fa", "ur"]);

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

