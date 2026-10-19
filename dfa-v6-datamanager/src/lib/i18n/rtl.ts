import type { SystemLanguageRow } from "@/lib/api/core";

function normalizeLocaleCode(s: string): string {
  return s.trim().replace(/_/g, "-").toLowerCase();
}

/**
 * Whether the UI should use RTL for this locale.
 * Uses GET /system-language `is_rtl` when the locale matches a row; otherwise treats Arabic (`ar`) as RTL.
 */
export function isRtlForLocale(
  locale: string,
  rows: readonly SystemLanguageRow[]
): boolean {
  const norm = normalizeLocaleCode(locale);
  const primary = norm.split("-")[0] ?? "";

  const active = rows.filter((r) => !r.is_deleted);

  const exact = active.find((r) => normalizeLocaleCode(r.locale) === norm);
  if (exact) return Boolean(exact.is_rtl);

  const byPrimary = active.find((r) => {
    const p = normalizeLocaleCode(r.locale).split("-")[0] ?? "";
    return p === primary;
  });
  if (byPrimary) return Boolean(byPrimary.is_rtl);

  return primary === "ar";
}
