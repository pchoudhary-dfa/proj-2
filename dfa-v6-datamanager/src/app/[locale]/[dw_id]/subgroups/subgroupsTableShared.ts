import type {
  SubgroupRaw,
  SgCategoryValueFlat,
  SubgroupsListMeta,
  SubgroupsMetaCategoryValue,
} from "@/lib/api/types";
import type { GidManagerDrawerRow } from "@/components/GidManagerDrawer";

function getSubgroupGid(s: SubgroupRaw): string | null {
  const gid = s.sg_gid ?? s.subgroup_val_gid ?? s.sv_gid ?? null;
  return gid != null && gid !== "" ? gid : null;
}

function getSubgroupName(s: SubgroupRaw): string {
  return (
    (s.sg_name ?? s.subgroup_val ?? s.sv_name ?? s.sg_gid ?? s.subgroup_val_gid ?? s.sv_gid ?? "") ||
    ""
  );
}

function getSubgroupListOrder(s: SubgroupRaw): number | null {
  /** Combination rows: sv_order; some list payloads use sg_order on sg_* rows. */
  const raw = s.sv_order ?? s.subgroup_val_order ?? s.sg_order;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function getSubgroupsMetaValueGid(v: SubgroupsMetaCategoryValue): string {
  const g = v.sg_catg_val_gid ?? v.sg_val_gid;
  return g != null && String(g) !== "" ? String(g) : "";
}

function getSubgroupsMetaValueName(v: SubgroupsMetaCategoryValue): string {
  const n = v.sg_catg_val_name ?? v.sg_val_name;
  return n != null ? String(n) : "";
}

/** Separates kind prefix from gid in subgroup GID drawer row ids. */
export const SG_GID_DRAWER_SEP = "\u001f";

export function subgroupListGidDrawerRowId(kind: "cat" | "val", gid: string): string {
  return `${kind}${SG_GID_DRAWER_SEP}${gid}`;
}

export function parseSubgroupListGidDrawerRowId(
  rowId: string
): { kind: "cat" | "val"; gid: string } | null {
  const i = rowId.indexOf(SG_GID_DRAWER_SEP);
  if (i < 0) return null;
  const kind = rowId.slice(0, i);
  const gid = rowId.slice(i + SG_GID_DRAWER_SEP.length);
  if (kind === "cat" || kind === "val") return { kind, gid };
  return null;
}

/** Subgroup value rows in the GID manager (excludes category / dimension header rows). */
export function countSubgroupGidDrawerValueRows(rows: GidManagerDrawerRow[]): number {
  return rows.reduce((n, r) => n + (parseSubgroupListGidDrawerRowId(r.id)?.kind === "val" ? 1 : 0), 0);
}

/** Prefix for rows built from GET /dw/{{dw_id}}/subgroups (ut_subgroup_vals combinations). */
export const SG_LIST_COMB_PREFIX = "sglist";

/** Stable row id for one subgroup list API item (combination row). */
export function subgroupListCombinationDrawerRowId(raw: SubgroupRaw): string {
  const nid = raw.subgroup_val_nid ?? (typeof raw.sv_nid === "number" ? raw.sv_nid : undefined);
  if (nid != null && Number.isFinite(Number(nid))) {
    return `${SG_LIST_COMB_PREFIX}${SG_GID_DRAWER_SEP}n:${nid}`;
  }
  const gid = getSubgroupGid(raw) ?? "";
  return `${SG_LIST_COMB_PREFIX}${SG_GID_DRAWER_SEP}g:${gid}`;
}

/**
 * Parse row ids from `mapSubgroupListRawToGidDrawerRows` for PATCH
 * `/subgroups/{identifier}` (subgroup_val_nid or subgroup_val_gid from GET /subgroups).
 */
export function parseSubgroupListCombinationDrawerRowId(
  rowId: string
): { valueIdentifier: string } | null {
  const prefix = `${SG_LIST_COMB_PREFIX}${SG_GID_DRAWER_SEP}`;
  if (!rowId.startsWith(prefix)) return null;
  const rest = rowId.slice(prefix.length);
  if (rest.startsWith("n:")) {
    const id = rest.slice(2).trim();
    return id ? { valueIdentifier: id } : null;
  }
  if (rest.startsWith("g:")) {
    const id = rest.slice(2).trim();
    return id ? { valueIdentifier: id } : null;
  }
  return null;
}

/** Map GET /subgroups `data` to GID manager rows (name + subgroup_val_gid). */
export function mapSubgroupListRawToGidDrawerRows(items: SubgroupRaw[]): GidManagerDrawerRow[] {
  const out: GidManagerDrawerRow[] = [];
  for (let idx = 0; idx < items.length; idx++) {
    const s = items[idx];
    const gid = getSubgroupGid(s) ?? "";
    if (!gid) continue;
    const name = getSubgroupName(s).trim() || gid || `Subgroup ${idx + 1}`;
    const ord = getSubgroupListOrder(s);
    out.push({
      id: subgroupListCombinationDrawerRowId(s),
      name,
      gid,
      order: ord != null ? String(ord) : "",
      isSystem: s.is_system ?? false,
    });
  }
  return out;
}

/**
 * Build GID manager rows from GET /subgroups list `meta` (sg_categories + sg_category_values).
 * This matches what the grid request returns; use when sg-categories-values dimensions are empty.
 */
export function buildSubgroupGidDrawerRowsFromListMeta(
  meta: Pick<SubgroupsListMeta, "sg_categories" | "sg_category_values"> | null | undefined
): GidManagerDrawerRow[] {
  if (!meta?.sg_category_values || Object.keys(meta.sg_category_values).length === 0) {
    return [];
  }

  const cats = meta.sg_categories ?? {};
  const byCat = new Map<string, { name: string; gid: string }[]>();

  for (const v of Object.values(meta.sg_category_values)) {
    const catGid = v.sg_cat_gid;
    const valGid = getSubgroupsMetaValueGid(v);
    const valName = getSubgroupsMetaValueName(v);
    if (!catGid || !valGid) continue;
    const list = byCat.get(catGid) ?? [];
    if (!list.some((x) => x.gid === valGid)) {
      list.push({ name: valName, gid: valGid });
    }
    byCat.set(catGid, list);
  }

  const allCatGids = new Set([...Object.keys(cats), ...byCat.keys()]);
  const orderedCatGids = [...allCatGids].sort((a, b) => {
    const da = cats[a]?.sg_cat_nid ?? 0;
    const db = cats[b]?.sg_cat_nid ?? 0;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });

  const out: GidManagerDrawerRow[] = [];
  for (const catGid of orderedCatGids) {
    const cat = cats[catGid];
    const catName = cat?.sg_cat_name ?? catGid;
    out.push({
      id: subgroupListGidDrawerRowId("cat", catGid),
      name: catName,
      gid: catGid,
    });
    const vals = (byCat.get(catGid) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const val of vals) {
      out.push({
        id: subgroupListGidDrawerRowId("val", val.gid),
        name: val.name,
        gid: val.gid,
      });
    }
  }
  return out;
}

export type SubgroupTableRow = {
  subgroupRaw: SubgroupRaw;
  rowId: string;
  subgroupName: string;
  /** Maps dimension sg_cat_gid -> display value name (or null if not applicable). */
  dimensionValues: Record<string, string | null>;
  /** Maps dimension sg_cat_gid -> dimension value gid (or null). Used for inline edit payloads. */
  dimensionValueGids: Record<string, string | null>;
};

export type DimensionCategory = {
  gid: string;
  name: string;
  nid?: number;
  order?: number;
  usedInCount?: number;
  isSystem?: boolean;
  values: DimensionValueItem[];
};

export type DimensionValueItem = {
  gid: string;
  name: string;
  usedInCount?: number;
  isSystem?: boolean;
};

export type SgCategoryOrderMeta = {
  gid: string;
  name: string;
  nid?: number;
  order?: number;
  usedInCount?: number;
  isSystem?: boolean;
};

function parseUsedInCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const subgroupCount = (value as { subgroup_count?: unknown }).subgroup_count;
  if (typeof subgroupCount !== "number" || !Number.isFinite(subgroupCount)) return undefined;
  return Math.max(0, subgroupCount);
}

/**
 * Build DimensionCategory[] from the flat sg-categories-values response.
 * Groups values by sg_cat_gid and resolves category names from sg_cat_info.
 */
export function normalizeDimensionCategories(
  flatValues: SgCategoryValueFlat[],
  sgCatInfo: Record<string, string>,
  categoryMetaByGid?: Record<string, SgCategoryOrderMeta>
): DimensionCategory[] {
  const grouped = new Map<
    string,
    { nid: number; values: DimensionValueItem[] }
  >();

  for (const v of flatValues) {
    if (!v.sg_cat_gid || !v.sg_catg_val_gid) continue;
    let entry = grouped.get(v.sg_cat_gid);
    if (!entry) {
      entry = { nid: v.sg_cat_nid, values: [] };
      grouped.set(v.sg_cat_gid, entry);
    }
    entry.values.push({
      gid: v.sg_catg_val_gid,
      name: v.sg_catg_val_name,
      usedInCount: parseUsedInCount(v.used_in),
      isSystem: v.is_system ?? false,
    });
  }

  const orderedCatGids = Array.from(
    new Set([
      ...Object.keys(categoryMetaByGid ?? {}),
      ...Object.keys(sgCatInfo),
    ])
  );

  const dims: DimensionCategory[] = [];
  for (const catGid of orderedCatGids) {
    const apiMeta = categoryMetaByGid?.[catGid];
    const catName = apiMeta?.name ?? sgCatInfo[catGid] ?? catGid;
    const entry = grouped.get(catGid);
    dims.push({
      gid: catGid,
      name: catName,
      nid: apiMeta?.nid ?? entry?.nid,
      order: apiMeta?.order,
      usedInCount: apiMeta?.usedInCount,
      isSystem: apiMeta?.isSystem ?? false,
      values: entry?.values ?? [],
    });
  }

  // Keep a deterministic category order so subgroup combinations are built
  // in the same order regardless of selection sequence in the UI.
  return dims.sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Build table rows from raw subgroup list + dimension categories.
 * Resolves dimension cell values via sg_cat_val_gids and the sg_category_values lookup map.
 */
/** Same identifier as {@link buildSubgroupRows} `rowId` (for highlights / focus after create). */
export function getSubgroupTableRowId(s: SubgroupRaw): string {
  const id =
    s.subgroup_val_nid ?? s.sv_nid ?? s.sg_nid ?? s.subgroup_val_gid;
  if (id != null && String(id) !== "") {
    return String(id);
  }
  return String(Math.random());
}

/**
 * Stable key for "recently created" highlighting: prefer combination GID when present so
 * rows still match after refetch when the list uses subgroup_val_nid as row id.
 */
export function subgroupListRowRecentKey(raw: SubgroupRaw): string {
  const gid = getSubgroupGid(raw);
  if (gid) return `g:${gid}`;
  return `r:${getSubgroupTableRowId(raw)}`;
}

export function buildSubgroupRows(
  raw: SubgroupRaw[],
  dimensions: DimensionCategory[],
  sgCategoryValues: Record<string, SubgroupsMetaCategoryValue>
): SubgroupTableRow[] {
  return raw.map((s) => {
    const name =
      s.subgroup_val ??
      s.sv_name ??
      s.sg_name ??
      s.subgroup_val_gid ??
      "";
    const rowId = getSubgroupTableRowId(s);

    const dimensionValues: Record<string, string | null> = {};
    const dimensionValueGids: Record<string, string | null> = {};
    for (const dim of dimensions) {
      dimensionValues[dim.gid] = null;
      dimensionValueGids[dim.gid] = null;
    }

    if (s.sg_cat_val_gids) {
      for (const valGid of s.sg_cat_val_gids) {
        const catVal = sgCategoryValues[valGid];
        if (catVal) {
          dimensionValues[catVal.sg_cat_gid] = getSubgroupsMetaValueName(catVal) || null;
          dimensionValueGids[catVal.sg_cat_gid] = valGid;
        }
      }
    }

    return { subgroupRaw: s, rowId, subgroupName: String(name), dimensionValues, dimensionValueGids };
  });
}
