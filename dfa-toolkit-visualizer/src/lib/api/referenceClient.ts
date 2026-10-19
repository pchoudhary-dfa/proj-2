/**
 * Client-side fetchers for Data Warehouse reference APIs (indicators, areas).
 * Browser calls the Next.js proxy (same origin, no CORS); proxy forwards to backend.
 * Pass dwId from app config (e.g. useCore().dataWarehouseId) so DWS_DEFAULT from DB is used.
 */

import {
  REFERENCE_PATH_AREA_LEVELS,
  REFERENCE_PATH_AREAS,
  REFERENCE_PATH_INDICATORS,
} from "@/lib/constants";
import { getReferenceApiClientBaseUrl } from "@/lib/appConfig/utils";
import { apiGet } from "@/lib/api/client";

/** Backend envelope */
type BackendEnvelope<T> =
  | { success: true; data: T; message?: string; meta?: Record<string, unknown> }
  | { success: false; err_message: string; data?: null };

/** Indicator option shape for the indicator select component. nid used to match chip keywordId (nid) to list item. */
export type IndicatorOption = { 
  id: string | number; 
  label: string; 
  nid?: number;
  unitGid?: string;
  unitName?: string;
};

/** Area tree node shape for the area select component */
export type AreaTreeNode = {
  id: string;
  label: string;
  type?: string;
  hasChildren?: boolean;
  path?: string;
  nid?: number;
};

// --- Indicators ---

type UnitMetaRef = Record<string, { unit_nid?: number; unit_gid?: string; unit_name?: string; u_nid?: number; u_gid?: string; u_name?: string }>;

/**
 * Converts a raw indicator row to one or more IndicatorOptions, expanding by units.
 * @param item - Raw indicator row from backend
 * @param unitMeta - meta.unit dict from backend response (optional)
 * @returns Array of IndicatorOptions (one per unit, or one if no units)
 */
function indicatorToOption(item: Record<string, unknown>, unitMeta?: UnitMetaRef): IndicatorOption[] {
  const nid =
    (item.indicator_nid as number) ??
    (item.i_nid as number) ??
    (typeof item.nid === "number" ? item.nid : undefined);
  const baseId =
    (item.indicator_gid as string) ??
    (item.i_gid as string) ??
    (nid != null ? String(nid) : "");
  const indicatorName =
    (item.indicator_name as string) ??
    (item.i_name as string) ??
    (item.short_name as string) ??
    baseId;
  
  // Extract unit GIDs from the indicator row (try both u_gid and unit_gid)
  const unitGids = (item.u_gid as string[] | undefined) ?? (item.unit_gid as string[] | undefined);
  
  // If no units, return a single entry without unit information
  if (!unitGids || unitGids.length === 0) {
    return [{
      id: baseId,
      label: indicatorName,
      ...(nid != null ? { nid } : {}),
    }];
  }
  
  // Expand to multiple items, one per unit
  return unitGids.map((unitGid) => {
    const unitInfo = unitMeta?.[unitGid];
    const unitName = 
      unitInfo?.unit_name ?? 
      unitInfo?.u_name ?? 
      unitGid;
    
    // Always create composite ID when unit exists to ensure uniqueness
    const compositeId = `${baseId}_${unitGid}`;
    
    // Format label with unit: "Indicator Name, Unit Name"
    const label = `${indicatorName}, ${unitName}`;
    
    return {
      id: compositeId,
      label,
      ...(nid != null ? { nid } : {}),
      unitGid,
      unitName,
    };
  });
}

const indicatorsCache = new Map<string, IndicatorOption[]>();

/**
 * Fetches all indicators from the backend (cached per locale and dwId).
 * Used by the visualizer page for share-URL hydration (resolving selected indicator labels).
 */
export async function fetchIndicatorsFromBackend(
  acceptLanguage: string,
  options?: { dwId?: string }
): Promise<IndicatorOption[]> {
  const locale = acceptLanguage?.split(",")[0]?.trim() || "en";
  const dwId = options?.dwId ?? "";
  const cacheKey = `${locale}:${dwId}`;
  const cached = indicatorsCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const baseUrl = getReferenceApiClientBaseUrl(dwId);
  const url = `${baseUrl}${REFERENCE_PATH_INDICATORS}`;
  const result = await apiGet<BackendEnvelope<Record<string, unknown>[]>>(url, {
    acceptLanguage,
  });
  if (!result.ok || !result.data?.success || !Array.isArray(result.data.data)) return [];
  const unitMeta = (result.data.meta?.unit ?? result.data.meta?.u_info ?? {}) as UnitMetaRef;
  const items = result.data.data.flatMap((row) => indicatorToOption(row, unitMeta));
  indicatorsCache.set(cacheKey, items);
  return items;
}

// --- Areas ---

type AreaLevelRow = { al_nid?: number; al_level: number; al_name: string };

type NormalizedArea = {
  nid: number;
  parentNid: number | null;
  id: string;
  name: string;
  level: number;
};

function normalizeArea(a: Record<string, unknown>): NormalizedArea {
  const nid = Number(a.ar_nid ?? a.a_nid ?? 0) || 0;
  const rawParent = a.ar_parent_nid ?? a.a_parent_nid;
  const parentNum =
    typeof rawParent === "number" && !Number.isNaN(rawParent) ? rawParent : Number(rawParent);
  const parentNid =
    rawParent == null ||
    (typeof parentNum === "number" && (Number.isNaN(parentNum) || parentNum === 0 || parentNum === nid))
      ? null
      : parentNum;
  const id = (a.ar_id as string) ?? (a.a_id as string) ?? String(nid);
  const name = ((a.ar_name ?? a.a_name) as string) || id;
  const level = Number(a.ar_level ?? a.a_level ?? 0) || 0;
  return { nid, parentNid, id, name, level };
}

function areaToNode(
  id: string,
  label: string,
  level: number,
  hasChildren: boolean,
  levelToName: Map<number, string>,
  nid?: number
): AreaTreeNode {
  return {
    id,
    label,
    type: levelToName.get(level) ?? "Unknown",
    hasChildren,
    ...(nid != null ? { nid } : {}),
  };
}

/** Enriched area info exposed for map choropleth logic (level + parent resolution). */
export type AreaLookupEntry = {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  nid: number;
};

type AreasCacheEntry = {
  getRoots: () => AreaTreeNode[];
  getChildren: (parentId: string) => AreaTreeNode[];
  getFlat: (level?: string, search?: string) => AreaTreeNode[];
  getLevelOptions: () => { value: string; label: string }[];
  getAreaLookup: () => Map<string, AreaLookupEntry>;
};

const areasCache = new Map<string, AreasCacheEntry>();

/**
 * Fetches all areas and area-levels from the backend and builds tree (cached per locale and dwId).
 * Returns getRoots(), getChildren(parentId), getFlat(level?, search?), getLevelOptions() for use by AreaSelect.
 */
export async function fetchAreasTreeFromBackend(
  acceptLanguage: string,
  options?: { dwId?: string }
): Promise<Omit<AreasCacheEntry, never>> {
  const locale = acceptLanguage?.split(",")[0]?.trim() || "en";
  const dwId = options?.dwId ?? "";
  const cacheKey = `${locale}:${dwId}`;
  const cached = areasCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const baseUrl = getReferenceApiClientBaseUrl(dwId);
  const areasUrl = `${baseUrl}${REFERENCE_PATH_AREAS}`;
  const areaLevelsUrl = `${baseUrl}${REFERENCE_PATH_AREA_LEVELS}`;

  const [areasResult, levelsResult] = await Promise.all([
    apiGet<BackendEnvelope<Record<string, unknown>[]>>(areasUrl, { acceptLanguage }),
    apiGet<BackendEnvelope<AreaLevelRow[]>>(areaLevelsUrl, { acceptLanguage }),
  ]);

  const levelToName = new Map<number, string>();
  const levelOptions: { value: string; label: string }[] = [
    { value: "", label: "All Levels (Tree View)" },
  ];
  if (levelsResult.ok && levelsResult.data?.success && Array.isArray(levelsResult.data.data)) {
    const sorted = [...levelsResult.data.data].sort((a, b) => a.al_level - b.al_level);
    for (const item of sorted) {
      levelToName.set(item.al_level, item.al_name);
      levelOptions.push({ value: item.al_name, label: item.al_name });
    }
  }

  if (!areasResult.ok || !areasResult.data?.success || !Array.isArray(areasResult.data.data)) {
    return {
      getRoots: () => [],
      getChildren: () => [],
      getFlat: () => [],
      getLevelOptions: () => levelOptions,
      getAreaLookup: () => new Map(),
    };
  }

  const areas = areasResult.data.data.map(normalizeArea);
  const byNid = new Map(areas.map((a) => [a.nid, a]));
  const byId = new Map(areas.map((a) => [a.id, a]));
  const childrenByParentNid = new Map<number, NormalizedArea[]>();
  for (const a of areas) {
    const key = a.parentNid ?? 0;
    if (!childrenByParentNid.has(key)) childrenByParentNid.set(key, []);
    childrenByParentNid.get(key)!.push(a);
  }
  const hasChildren = (nid: number) => (childrenByParentNid.get(nid)?.length ?? 0) > 0;

  const PATH_SEP = "\u2192";
  const idToPath = new Map<string, string>();
  function getPath(id: string): string {
    const cached = idToPath.get(id);
    if (cached !== undefined) return cached;
    const a = byId.get(id);
    if (!a) return id;
    const parts = [a.name];
    let p = a.parentNid;
    while (p != null && p !== 0) {
      const parentArea = byNid.get(p);
      if (!parentArea) break;
      parts.unshift(parentArea.name);
      p = parentArea.parentNid ?? 0;
      if (p === 0) break;
    }
    const path = parts.join(` ${PATH_SEP} `);
    idToPath.set(id, path);
    return path;
  }

  function getRoots(): AreaTreeNode[] {
    let roots = areas.filter((a) => a.parentNid == null);
    if (roots.length === 0 && areas.length > 0) {
      const minLevel = Math.min(...areas.map((a) => a.level));
      roots = areas.filter((a) => a.level === minLevel);
    }
    return roots.map((a) =>
      areaToNode(a.id, a.name, a.level, hasChildren(a.nid), levelToName, a.nid)
    );
  }

  function getChildren(parentId: string): AreaTreeNode[] {
    const parentArea = byId.get(parentId) ?? byNid.get(Number(parentId));
    if (!parentArea) return [];
    const children = childrenByParentNid.get(parentArea.nid) ?? [];
    return children.map((a) =>
      areaToNode(a.id, a.name, a.level, hasChildren(a.nid), levelToName, a.nid)
    );
  }

  function getFlat(level?: string, search?: string): AreaTreeNode[] {
    let items = areas.map((a) => ({
      ...areaToNode(a.id, a.name, a.level, hasChildren(a.nid), levelToName, a.nid),
      path: getPath(a.id),
    }));
    if (level) {
      items = items.filter((n) => n.type === level);
    }
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((n) => n.label.toLowerCase().includes(q));
    }
    return items;
  }

  function getLevelOptions(): { value: string; label: string }[] {
    return levelOptions;
  }

  function getAreaLookup(): Map<string, AreaLookupEntry> {
    const lookup = new Map<string, AreaLookupEntry>();
    for (const a of areas) {
      const parent = a.parentNid != null ? byNid.get(a.parentNid) : undefined;
      lookup.set(a.id, {
        id: a.id,
        name: a.name,
        level: a.level,
        parentId: parent?.id ?? null,
        nid: a.nid,
      });
    }
    return lookup;
  }

  const entry: AreasCacheEntry = { getRoots, getChildren, getFlat, getLevelOptions, getAreaLookup };
  areasCache.set(cacheKey, entry);
  return entry;
}
