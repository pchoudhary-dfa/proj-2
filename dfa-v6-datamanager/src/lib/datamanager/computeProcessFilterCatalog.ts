import { getRequest } from "@/lib/api/http";
import { fetchIusOptionsFromIndicators } from "@/lib/compute/iusFromIndicators";
import {
  getDWAPIURL,
  REFERENCE_PATH_AREAS,
  REFERENCE_PATH_AREA_LEVELS,
} from "@/lib/constants";

export type AreaLevelCatalogRow = {
  al_nid: number;
  al_level: number;
  al_name: string;
};

export type AreaCatalogRow = {
  ar_id: string;
  ar_gid: string;
  ar_name: string;
  ar_level: number;
};

function parseAreaLevels(json: unknown): AreaLevelCatalogRow[] {
  const j = json as Record<string, unknown>;
  if (j.success !== true || !Array.isArray(j.data)) return [];
  const out: AreaLevelCatalogRow[] = [];
  for (const item of j.data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const nid = Number(o.al_nid);
    const level = Number(o.al_level);
    const name = typeof o.al_name === "string" ? o.al_name.trim() : "";
    if (!Number.isFinite(nid) || !name) continue;
    out.push({
      al_nid: nid,
      al_level: Number.isFinite(level) ? level : nid,
      al_name: name,
    });
  }
  return out.sort((a, b) => a.al_level - b.al_level);
}

/** Area levels only (for compute formula UIs that do not need the full filter catalog). */
export async function fetchAreaLevelsOnly(
  dwId: string
): Promise<AreaLevelCatalogRow[]> {
  if (!dwId.trim()) return [];
  const json = await getRequest(
    getDWAPIURL(dwId, REFERENCE_PATH_AREA_LEVELS),
    undefined,
    { suppressErrorMessage: true }
  );
  return parseAreaLevels(json);
}

function parseAreasFlat(json: unknown): AreaCatalogRow[] {
  const j = json as Record<string, unknown>;
  if (j.success !== true || !Array.isArray(j.data)) return [];
  const out: AreaCatalogRow[] = [];
  for (const item of j.data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const ar_id =
      typeof o.ar_id === "string"
        ? o.ar_id.trim()
        : typeof o.area_id === "string"
          ? o.area_id.trim()
          : "";
    const ar_gid = typeof o.ar_gid === "string" ? o.ar_gid.trim() : "";
    const ar_name =
      typeof o.ar_name === "string"
        ? o.ar_name.trim()
        : typeof o.area_name === "string"
          ? o.area_name.trim()
          : ar_id || ar_gid;
    const ar_level = Number(o.ar_level);
    if (!ar_id && !ar_gid) continue;
    out.push({
      ar_id: ar_id || ar_gid,
      ar_gid: ar_gid || ar_id,
      ar_name: ar_name || ar_id || ar_gid,
      ar_level: Number.isFinite(ar_level) ? ar_level : 0,
    });
  }
  return out;
}

const AREAS_CATALOG_PAGE_SIZE = 500;

async function fetchAreasCatalogPage(
  dwId: string,
  page: number
): Promise<AreaCatalogRow[]> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_AREAS)}?${new URLSearchParams({
    page: String(page),
    page_size: String(AREAS_CATALOG_PAGE_SIZE),
    hierarchical: "false",
  })}`;
  const json = await getRequest(url, undefined, {
    suppressErrorMessage: true,
  });
  return parseAreasFlat(json);
}

/** Flat areas list for compute grid labels and filters (paginated). */
export async function fetchAllAreasCatalog(
  dwId: string
): Promise<AreaCatalogRow[]> {
  if (!dwId.trim()) return [];
  const all: AreaCatalogRow[] = [];
  for (let page = 1; page <= 200; page += 1) {
    const batch = await fetchAreasCatalogPage(dwId, page);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < AREAS_CATALOG_PAGE_SIZE) break;
  }
  return all;
}

/** Map area id / gid keys to display names (compute grids, log summary). */
export function buildAreaNameByKey(
  areas: ReadonlyArray<AreaCatalogRow>
): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of areas) {
    const name = (a.ar_name ?? "").trim() || a.ar_id || a.ar_gid;
    if (a.ar_id) m.set(a.ar_id, name);
    if (a.ar_gid) m.set(a.ar_gid, name);
  }
  return m;
}

function buildAreaKeyToLevel(areas: AreaCatalogRow[]): Map<string, number> {
  const areaKeyToLevel = new Map<string, number>();
  for (const a of areas) {
    if (!Number.isFinite(a.ar_level)) continue;
    if (a.ar_id) areaKeyToLevel.set(a.ar_id, a.ar_level);
    if (a.ar_gid) areaKeyToLevel.set(a.ar_gid, a.ar_level);
  }
  return areaKeyToLevel;
}

/**
 * Loads area levels, all flat areas (paginated), and IUS options (via GET /indicators?subgroup=true).
 */
export async function loadComputeProcessFilterCatalog(dwId: string): Promise<{
  areaLevels: AreaLevelCatalogRow[];
  areas: AreaCatalogRow[];
  iusOptions: Array<{ id: string; label: string }>;
  areaKeyToLevel: Map<string, number>;
}> {
  const empty = {
    areaLevels: [] as AreaLevelCatalogRow[],
    areas: [] as AreaCatalogRow[],
    iusOptions: [] as Array<{ id: string; label: string }>,
    areaKeyToLevel: new Map<string, number>(),
  };
  if (!dwId.trim()) return empty;

  const [levelsJson, iusOptions, areas] = await Promise.all([
    getRequest(getDWAPIURL(dwId, REFERENCE_PATH_AREA_LEVELS), undefined, {
      suppressErrorMessage: true,
    }),
    fetchIusOptionsFromIndicators(dwId),
    fetchAllAreasCatalog(dwId),
  ]);

  const areaLevels = parseAreaLevels(levelsJson);
  const areaKeyToLevel = buildAreaKeyToLevel(areas);

  return { areaLevels, areas, iusOptions, areaKeyToLevel };
}

function parseAreaListItemForLevel(
  r: Record<string, unknown>
): { id: string; name: string } | null {
  const idRaw =
    typeof r.ar_id === "string"
      ? r.ar_id
      : typeof r.area_id === "string"
        ? r.area_id
        : "";
  const id = idRaw.trim();
  if (!id) return null;
  const name =
    typeof r.ar_name === "string"
      ? r.ar_name.trim()
      : typeof r.area_name === "string"
        ? r.area_name.trim()
        : id;
  return { id, name };
}

/** Areas at a given area-level nid (same query as compute process create modal). */
export async function fetchAreasForLevelCatalog(
  dwId: string,
  levelNid: number
): Promise<Array<{ id: string; name: string }>> {
  if (!dwId.trim() || !Number.isFinite(levelNid)) return [];
  const sp = new URLSearchParams({
    level: String(levelNid),
    hierarchical: "false",
  });
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_AREAS)}?${sp.toString()}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success !== true || !Array.isArray(json.data)) return [];
  const out: Array<{ id: string; name: string }> = [];
  for (const item of json.data) {
    if (!item || typeof item !== "object") continue;
    const row = parseAreaListItemForLevel(item as Record<string, unknown>);
    if (row) out.push(row);
  }
  return out;
}
