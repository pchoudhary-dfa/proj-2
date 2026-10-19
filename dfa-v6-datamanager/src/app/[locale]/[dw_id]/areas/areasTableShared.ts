// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

export type AreaRaw = {
  ar_nid: number;
  ar_parent_nid: number;
  ar_id: string;
  ar_name: string;
  ar_gid: string;
  ar_level: number;
  ar_short_name: string | null;
  ar_block_nids: string | null;
  ar_map: string | null;
  ar_is_global: boolean;
  ar_has_data: boolean;
  ar_latitude?: number | string | null;
  ar_longitude?: number | string | null;
};

export type AreaLevelRaw = {
  al_nid: number;
  al_level: number;
  al_name: string;
};

export type AreasListMeta = {
  total_count: number;
  total_count_unfiltered?: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type AreaLevelsListMeta = {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

// ---------------------------------------------------------------------------
// Local UI types (mapped from API)
// ---------------------------------------------------------------------------

export type AreaLevel = {
  id: string;
  nid: number;
  name: string;
  order: number;
};

export type AreaNode = {
  id: string;
  nid: number;
  gid: string;
  parentId: string | null;
  levelId: string;
  name: string;
  keyword: string;
  code: string;
  latitude: string;
  longitude: string;
  hasData: boolean;
};

export type AreaNodeTableRow = {
  rowId: string;
  kind: "node";
  node: AreaNode;
  level: AreaLevel;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  canAddChild: boolean;
  nextLevelName: string | null;
};

export type AreaAddTableRow = {
  rowId: string;
  kind: "add";
  parentId: string | null;
  levelId: string;
  levelName: string;
  depth: number;
  label: string;
};

export type AreaTableRow = AreaNodeTableRow | AreaAddTableRow;

export type AreaInlineDraft = {
  rowId: string;
  mode: "add" | "edit";
  parentId: string | null;
  levelId: string;
  sourceNodeId: string | null;
  name: string;
  keyword: string;
  code: string;
  latitude: string;
  longitude: string;
};

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

export function mapAreaLevelRaw(raw: AreaLevelRaw): AreaLevel {
  return {
    id: String(raw.al_nid),
    nid: raw.al_nid,
    name: raw.al_name,
    order: raw.al_level,
  };
}

export function mapAreaRaw(
  raw: AreaRaw,
  levelNidToId: Map<number, string>
): AreaNode {
  const levelId = levelNidToId.get(raw.ar_level) ?? String(raw.ar_level);
  const latitude =
    typeof raw.ar_latitude === "number"
      ? String(raw.ar_latitude)
      : typeof raw.ar_latitude === "string"
        ? raw.ar_latitude
        : "";
  const longitude =
    typeof raw.ar_longitude === "number"
      ? String(raw.ar_longitude)
      : typeof raw.ar_longitude === "string"
        ? raw.ar_longitude
        : "";
  return {
    id: String(raw.ar_nid),
    nid: raw.ar_nid,
    gid: raw.ar_gid,
    parentId: raw.ar_parent_nid <= 0 ? null : String(raw.ar_parent_nid),
    levelId,
    name: raw.ar_name,
    keyword: raw.ar_id,
    code: raw.ar_gid,
    latitude,
    longitude,
    hasData: raw.ar_has_data,
  };
}
