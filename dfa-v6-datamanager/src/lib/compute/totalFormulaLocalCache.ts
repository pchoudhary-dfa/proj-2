/**
 * Browser-only cache for Total formula source IUS list.
 * The Toolkit API does not yet return source IUS on GET; after a successful save we
 * mirror them here so the same browser can reopen the compute tab with the list prefilled.
 * This can diverge if formulas are changed elsewhere or in another browser.
 */

const PREFIX = "dfa-v6-total-formula-src:v1:";

type CachedPayload = {
  source_ius_list: string[];
  savedAt: number;
};

export function totalFormulaCacheKey(dwId: string, targetIusGid: string): string {
  return `${PREFIX}${dwId}:${targetIusGid}`;
}

export function readTotalFormulaSources(
  dwId: string,
  targetIusGid: string
): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(totalFormulaCacheKey(dwId, targetIusGid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!parsed || !Array.isArray(parsed.source_ius_list)) return null;
    return parsed.source_ius_list.filter((x) => typeof x === "string" && x.length > 0);
  } catch {
    return null;
  }
}

export function writeTotalFormulaSources(
  dwId: string,
  targetIusGid: string,
  sourceIusList: string[]
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedPayload = {
      source_ius_list: sourceIusList,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(
      totalFormulaCacheKey(dwId, targetIusGid),
      JSON.stringify(payload)
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearTotalFormulaSources(dwId: string, targetIusGid: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(totalFormulaCacheKey(dwId, targetIusGid));
  } catch {
    /* ignore */
  }
}
