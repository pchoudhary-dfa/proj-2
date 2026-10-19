/** Prefer API ``display_name`` (legacy ``Log 1``, ``Log 2``, …). */
export function formatLogDisplayName(
  row: { name?: string | null; display_name?: string | null },
  fallbackIndex?: number
): string {
  const display = row.display_name?.trim();
  if (display) return display;
  const name = row.name?.trim();
  if (name && /^Log \d+$/i.test(name)) return name;
  if (fallbackIndex != null && fallbackIndex >= 0) {
    return `Log ${fallbackIndex + 1}`;
  }
  return name || "—";
}
