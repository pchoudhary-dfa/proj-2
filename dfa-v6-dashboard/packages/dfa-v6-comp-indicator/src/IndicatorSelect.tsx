"use client";

/**
 * Indicator select UI (sidebar + list). Styling is token-driven via styles.css;
 * uses design tokens from packages/design-tokens/tokens.css when loaded by the app.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ListView, type ListViewApi, type ListViewItem } from "dfa-v6-comp-list-view";
import { IuTreeView } from "./IuTreeView";
import { buildIusGid } from "./iusGid";
import {
  fetchMockIndicators,
  SECTOR_OPTIONS,
  THEME_OPTIONS,
  GOAL_OPTIONS,
  MOCK_UNIT_META,
  type FetchParams,
} from "./mock/indicatorData";

export type IndicatorItem = { 
  id: string | number; 
  label: string; 
  nid?: number;
  unitGid?: string;
  unitName?: string;
  subgroupGid?: string;   // populated only when enableSubgroup=true
  subgroupName?: string;  // populated only when enableSubgroup=true
  iusNid?: number;        // IUS NID (primary key) - populated when enableSubgroup=true
};

/** Internal type for subgroup metadata from API response */
type SubgroupMeta = Record<string, {
  sg_nid?: number;
  sg_gid: string;
  sg_name: string;
  sg_order?: number;
}>;

/** Internal type for IU row data when enableSubgroup=true */
type IuRowData = {
  iuKey: string;           // indicatorGid_unitGid (used as expand key)
  indicatorGid: string;
  indicatorName: string;
  unitGid: string;
  unitName: string;
  nid?: number;
  subgroups: { sgGid: string; sgName: string; isDefault: boolean; iusNid?: number }[];
};

export type IndicatorSelectApi = {
  getSelected(): IndicatorItem[];
  clear(): void;
  setSelectedIds(ids: (string | number)[]): void;
};

/** Active sidebar tab: ``all`` or an indicator-classification type code (SC, GL, TH, …). */
type Category = "all" | string;

export type IndicatorSelectFetchParams = {
  search?: string;
  /** IC type code (SC, GL, TH, CF, IT, CN). Preferred over legacy sector/goal/theme. */
  icType?: string;
  /** Selected classification identifier (ic_nid or ic_gid). */
  icIdentifier?: string;
  /** @deprecated Prefer icType + icIdentifier */
  sector?: string;
  /** @deprecated Prefer icType + icIdentifier */
  theme?: string;
  /** @deprecated Prefer icType + icIdentifier */
  goal?: string;
};

export type ClassificationOption = { id: string | number; label: string };

/**
 * Classification option with optional nested hierarchy and IUS count.
 * Used in reference mode where the API returns hierarchical=true.
 */
type HierarchicalClassificationOption = ClassificationOption & {
  children: HierarchicalClassificationOption[];
  /** Total distinct IUS count across node and all descendants (from include_ic_ius_counts=true). */
  ic_ius_subtree_union_count?: number;
  isLeaf: boolean;
};

type IcTypeTab = { code: string; label: string };

/** Package-local reference API paths (aligned with app backend). No app imports. */
const REFERENCE_PATH_INDICATORS = "/indicators";
const REFERENCE_PATH_INDICATOR_CLASSIFICATIONS = "/indicator-classifications";
const REFERENCE_PATH_IC_TYPES = "/indicator-classifications/type";

/** Demo fallback when no warehouse baseUrl is configured. */
const MOCK_IC_TYPE_TABS: IcTypeTab[] = [
  { code: "SC", label: "Sector" },
  { code: "GL", label: "Goal" },
  { code: "TH", label: "Theme" },
];

const INDICATOR_CLASSIFICATION_DEFAULTS = {
  IC_TYPE_SECTOR: "SC",
  IC_TYPE_GOAL: "GL",
  IC_TYPE_THEME: "TH",
  IC_PARENT_ROOT: -1,
  pageSize: 100,
  page: 1,
  sort_field: "ic_order",
  sort_order: "asc" as const,
};

const INDICATORS_FLAT_IUS_PAGE_SIZE = 1000;

function legacyCategoryFromIcType(code: string): "sector" | "goal" | "theme" | null {
  if (code === INDICATOR_CLASSIFICATION_DEFAULTS.IC_TYPE_SECTOR) return "sector";
  if (code === INDICATOR_CLASSIFICATION_DEFAULTS.IC_TYPE_GOAL) return "goal";
  if (code === INDICATOR_CLASSIFICATION_DEFAULTS.IC_TYPE_THEME) return "theme";
  return null;
}

function mockOptionsForIcType(code: string): ClassificationOption[] {
  const legacy = legacyCategoryFromIcType(code);
  if (legacy === "sector") return SECTOR_OPTIONS;
  if (legacy === "goal") return GOAL_OPTIONS;
  if (legacy === "theme") return THEME_OPTIONS;
  return [];
}

function buildIndicatorFetchParams(
  activeCategory: Category,
  searchQuery: string,
  selectedIcIdByType: Record<string, string>
): IndicatorSelectFetchParams {
  if (activeCategory === "all") {
    return { search: searchQuery };
  }
  const icType = activeCategory;
  const icIdentifier = selectedIcIdByType[icType];
  const legacy = legacyCategoryFromIcType(icType);
  return {
    icType,
    icIdentifier,
    sector: legacy === "sector" ? icIdentifier : undefined,
    goal: legacy === "goal" ? icIdentifier : undefined,
    theme: legacy === "theme" ? icIdentifier : undefined,
  };
}

function mockFetchParamsFromIndicatorParams(
  params: IndicatorSelectFetchParams
): FetchParams {
  const icType = params.icType;
  const icId = params.icIdentifier ?? params.sector ?? params.goal ?? params.theme;
  if (icType === INDICATOR_CLASSIFICATION_DEFAULTS.IC_TYPE_SECTOR) {
    return { search: params.search, sector: icId };
  }
  if (icType === INDICATOR_CLASSIFICATION_DEFAULTS.IC_TYPE_GOAL) {
    return { search: params.search, goal: icId };
  }
  if (icType === INDICATOR_CLASSIFICATION_DEFAULTS.IC_TYPE_THEME) {
    return { search: params.search, theme: icId };
  }
  return {
    search: params.search,
    sector: params.sector,
    goal: params.goal,
    theme: params.theme,
  };
}

type BackendEnvelope<T> =
  | { success: true; data: T; message?: string; meta?: Record<string, unknown> }
  | { success: false; err_message: string; data?: null };

type UnitMeta = Record<string, { unit_nid?: number; unit_gid?: string; unit_name?: string; u_nid?: number; u_gid?: string; u_name?: string }>;

/**
 * Normalizes a backend indicator row and expands it to multiple items if it has multiple units.
 * When an indicator has multiple units, each unit gets its own list entry with a composite ID.
 * @param item - Raw indicator row from backend
 * @param unitMeta - meta.unit dict from backend response (optional)
 * @param enableUnit - When true, expand to IU pairs; when false, return indicator only
 * @returns Array of IndicatorItems (one per unit, or one if no units or enableUnit=false)
 */
function normalizeIndicatorFromBackend(item: Record<string, unknown>, unitMeta?: UnitMeta, enableUnit: boolean = true): IndicatorItem[] {
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
  
  // When enableUnit=false, return indicator only (no unit expansion)
  if (!enableUnit) {
    return [{
      id: baseId,
      label: indicatorName,
      ...(nid != null ? { nid } : {}),
    }];
  }
  
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
    
    const unitNid = unitInfo?.unit_nid ?? unitInfo?.u_nid;
    
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

/**
 * Parse backend response with subgroup data into IuRowData array.
 */
function parseIndicatorsWithSubgroups(
  data: Record<string, unknown>[],
  unitMeta: UnitMeta,
  subgroupMeta: SubgroupMeta
): IuRowData[] {
  const iuRows: IuRowData[] = [];

  for (const item of data) {
    const nid =
      (item.indicator_nid as number) ??
      (item.i_nid as number) ??
      (typeof item.nid === "number" ? item.nid : undefined);
    const indicatorGid =
      (item.indicator_gid as string) ??
      (item.i_gid as string) ??
      (nid != null ? String(nid) : "");
    const indicatorName =
      (item.indicator_name as string) ??
      (item.i_name as string) ??
      (item.short_name as string) ??
      indicatorGid;

    const sGidMap =
      (item.s_gid as Record<
        string,
        { sg_gid?: string[]; default_sg_gids?: string[]; ius_nid?: number[] }
      >) ?? {};

    for (const [unitGid, sgData] of Object.entries(sGidMap)) {
      const unitInfo = unitMeta?.[unitGid];
      const unitName =
        unitInfo?.unit_name ?? unitInfo?.u_name ?? unitGid;

      const sgGidList = sgData.sg_gid ?? [];
      const iusNidList = sgData.ius_nid ?? [];
      const defaultSgGids = new Set(sgData.default_sg_gids ?? []);

      const subgroups = sgGidList.map((sgGid, idx) => {
        const sgInfo = subgroupMeta[sgGid];
        const iusNid = iusNidList[idx];
        return {
          sgGid,
          sgName: sgInfo?.sg_name ?? sgGid,
          isDefault: defaultSgGids.has(sgGid),
          ...(iusNid != null ? { iusNid } : {}),
        };
      });

      if (subgroups.length > 0) {
        iuRows.push({
          iuKey: `${indicatorGid}_${unitGid}`,
          indicatorGid,
          indicatorName,
          unitGid,
          unitName,
          ...(nid != null ? { nid } : {}),
          subgroups,
        });
      }
    }
  }

  return iuRows;
}

/** Flat IUS rows for ListView (indicator|unit|subgroup GIDs). */
function parseIndicatorsToFlatIusItems(
  data: Record<string, unknown>[],
  unitMeta: UnitMeta,
  subgroupMeta: SubgroupMeta,
  opts: { restrictUnitGid?: string; excludeGids?: Set<string> } = {}
): IndicatorItem[] {
  const ru = opts.restrictUnitGid?.trim();
  const excludeSet = opts.excludeGids ?? new Set<string>();
  const out: IndicatorItem[] = [];

  for (const item of data) {
    const nid =
      (item.indicator_nid as number) ??
      (item.i_nid as number) ??
      (typeof item.nid === "number" ? item.nid : undefined);
    const indicatorGid =
      (item.indicator_gid as string) ??
      (item.i_gid as string) ??
      (nid != null ? String(nid) : "");
    const indicatorName =
      (item.indicator_name as string) ??
      (item.i_name as string) ??
      (item.short_name as string) ??
      indicatorGid;
    if (!indicatorGid) continue;

    const sGidMap =
      (item.s_gid as Record<
        string,
        { sg_gid?: string[]; default_sg_gids?: string[]; ius_nid?: number[] }
      >) ?? {};

    for (const [unitGid, sgData] of Object.entries(sGidMap)) {
      const uu = String(unitGid ?? "").trim();
      if (!uu) continue;
      if (ru && uu !== ru) continue;

      const unitInfo = unitMeta?.[uu];
      const unitName = unitInfo?.unit_name ?? unitInfo?.u_name ?? uu;
      const sgGidList = sgData.sg_gid ?? [];
      const iusNidList = sgData.ius_nid ?? [];

      for (let idx = 0; idx < sgGidList.length; idx += 1) {
        const sgGid = String(sgGidList[idx] ?? "").trim();
        if (!sgGid) continue;
        const iusGid = buildIusGid(indicatorGid, uu, sgGid);
        if (excludeSet.has(iusGid)) continue;
        const sgInfo = subgroupMeta[sgGid];
        const sgName = sgInfo?.sg_name ?? sgGid;
        const iusNid = iusNidList[idx];
        const label = [indicatorName, unitName, sgName].filter(Boolean).join(", ");
        out.push({
          id: iusGid,
          label,
          ...(nid != null ? { nid } : {}),
          unitGid: uu,
          unitName,
          subgroupGid: sgGid,
          subgroupName: sgName,
          ...(iusNid != null ? { iusNid } : {}),
        });
      }
    }
  }

  return out;
}

async function fetchFlatIusIndicatorPages(
  baseUrl: string,
  locale: string | undefined,
  headers: Record<string, string> | undefined,
  query: Record<string, string>
): Promise<{ data: Record<string, unknown>[]; unitMeta: UnitMeta; subgroupMeta: SubgroupMeta }> {
  const base = baseUrl.replace(/\/$/, "");
  const indicators: Record<string, unknown>[] = [];
  const unitMeta: UnitMeta = {};
  const subgroupMeta: SubgroupMeta = {};
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const sp = new URLSearchParams({
      subgroup: "true",
      ius: "true",
      default_subgroup_only: "false",
      sort_field: "i_order",
      sort_order: "asc",
      ...query,
    });
    const url = `${base}${REFERENCE_PATH_INDICATORS}?${sp.toString()}`;
    const res = await fetch(url, { headers: referenceFetchHeaders(locale, headers) });
    const json = (await res.json()) as BackendEnvelope<Record<string, unknown>[]>;
    if (!json || !json.success || !Array.isArray(json.data)) break;
    indicators.push(...json.data);
    Object.assign(unitMeta, (json.meta?.unit ?? {}) as UnitMeta);
    Object.assign(subgroupMeta, (json.meta?.subgroup ?? {}) as SubgroupMeta);
    totalPages = (json.meta?.total_pages as number | undefined) ?? 1;
    page += 1;
  }

  return { data: indicators, unitMeta, subgroupMeta };
}

function normalizeClassificationRow(row: Record<string, unknown>): ClassificationOption {
  const id = (row.ic_nid as number) ?? (row.ic_gid as string) ?? "";
  const label = (row.ic_name as string) ?? String(id);
  return { id, label };
}

/** Recursively collapse all nodes in a tree (set expanded=false on every node). */
function collapseAllChildren(groups: IcGroupState[]): IcGroupState[] {
  return groups.map((g) => ({
    ...g,
    expanded: false,
    children: g.children.length > 0 ? collapseAllChildren(g.children) : g.children,
  }));
}

/**
 * Restore cached indicator data on leaf nodes and auto-expand ancestor paths
 * that contain at least one selected item. Used on remount so the tree reopens
 * at the depth the user previously navigated to.
 *
 * Returns { groups, pendingLeafIds } — pendingLeafIds are leaf nodes that have
 * selected items but NO cached data, so loadIcGroup needs to run for them.
 */
function restoreCachedGroupState(
  groups: IcGroupState[],
  selectedIds: Set<string>,
  lookupItems: (icId: string) => IndicatorItem[] | undefined,
  lookupIuRows: (icId: string) => IuRowData[] | undefined,
): { groups: IcGroupState[]; pendingLeafIds: string[] } {
  const pendingLeafIds: string[] = [];

  function walk(nodes: IcGroupState[]): { nodes: IcGroupState[]; hasSelected: boolean } {
    let anySelected = false;
    const mapped = nodes.map((g) => {
      const idStr = String(g.ic.id);

      if (g.isLeaf) {
        const cachedItems = lookupItems(idStr);
        const cachedIuRows = lookupIuRows(idStr);
        const items = cachedItems ?? g.items;
        const iuRows = cachedIuRows ?? g.iuRows;
        const leafHasSelected =
          items.some((it) => selectedIds.has(String(it.id))) ||
          iuRows.some((row) =>
            selectedIds.has(row.iuKey) ||
            row.subgroups.some((sg) => selectedIds.has(sg.sgGid))
          );
        if (leafHasSelected) {
          anySelected = true;
          if (items.length === 0 && iuRows.length === 0) {
            pendingLeafIds.push(idStr);
          }
        }
        return {
          ...g,
          items,
          iuRows,
          loading: false,
          expanded: leafHasSelected ? true : g.expanded,
        };
      }

      const childResult = walk(g.children);
      if (childResult.hasSelected) anySelected = true;
      return {
        ...g,
        children: childResult.nodes,
        expanded: childResult.hasSelected ? true : g.expanded,
      };
    });
    return { nodes: mapped, hasSelected: anySelected };
  }

  const result = walk(groups);
  return { groups: result.nodes, pendingLeafIds };
}

/**
 * Recursively find and update a node in an IcGroupState tree by ic.id.
 * Returns a new array (immutably) with the matching node updated; returns original if not found.
 */
function findAndUpdateIcGroupRecursive(
  groups: IcGroupState[],
  icId: string,
  updater: (g: IcGroupState) => IcGroupState
): IcGroupState[] {
  let found = false;
  const next = groups.map((g) => {
    if (String(g.ic.id) === icId) {
      found = true;
      return updater(g);
    }
    if (g.children.length > 0) {
      const updatedChildren = findAndUpdateIcGroupRecursive(g.children, icId, updater);
      if (updatedChildren !== g.children) {
        found = true;
        return { ...g, children: updatedChildren };
      }
    }
    return g;
  });
  return found ? next : groups;
}

/**
 * Recursively build initial (collapsed, empty) IcGroupState nodes from a hierarchical option list.
 * Plain ClassificationOption entries (no children field) are treated as leaf nodes.
 */
function buildInitialGroupsRecursive(options: (HierarchicalClassificationOption | ClassificationOption)[]): IcGroupState[] {
  return options.map((ic) => {
    const hier = ic as HierarchicalClassificationOption;
    const rawChildren: (HierarchicalClassificationOption | ClassificationOption)[] = Array.isArray(hier.children) ? hier.children : [];
    const isLeaf = rawChildren.length === 0;
    return {
      ic: { id: ic.id, label: ic.label },
      expanded: false,
      loading: false,
      items: [],
      iuRows: [],
      expandedIus: new Set<string>(),
      children: isLeaf ? [] : buildInitialGroupsRecursive(rawChildren),
      isLeaf,
      isEmpty: false,
      ic_ius_subtree_union_count: typeof hier.ic_ius_subtree_union_count === "number" ? hier.ic_ius_subtree_union_count : undefined,
    };
  });
}

/** Recursively normalizes a hierarchical classification API response node. */
function normalizeHierarchicalClassificationRow(row: Record<string, unknown>): HierarchicalClassificationOption {
  const id = (row.ic_nid as number) ?? (row.ic_gid as string) ?? "";
  const label = (row.ic_name as string) ?? String(id);
  const rawChildren = Array.isArray(row.children) ? (row.children as Record<string, unknown>[]) : [];
  const children = rawChildren.map(normalizeHierarchicalClassificationRow);
  return {
    id,
    label,
    children,
    isLeaf: children.length === 0,
    ic_ius_subtree_union_count: typeof row.ic_ius_subtree_union_count === "number" ? row.ic_ius_subtree_union_count : undefined,
  };
}

// ---------------------------------------------------------------------------
// IC-grouped tree types (used in IC type tabs only)
// ---------------------------------------------------------------------------

/**
 * One entry in the IC-grouped tree: the IC classification node and its
 * lazily-loaded child indicators / IU rows.
 */
type IcGroupState = {
  ic: ClassificationOption;
  expanded: boolean;
  loading: boolean;
  /** Flat-IU items (regular + flatIusList modes). Populated only for leaf nodes. */
  items: IndicatorItem[];
  /** IU-subgroup rows (enableSubgroup mode). Populated only for leaf nodes. */
  iuRows: IuRowData[];
  /** expandedIus set local to this IC group (only relevant for enableSubgroup mode). */
  expandedIus: Set<string>;
  /** Nested child IC classification nodes. Empty for leaf nodes. */
  children: IcGroupState[];
  /** True when this node has no IC children (i.e. it can contain indicators). */
  isLeaf: boolean;
  /** True when this leaf has been fetched and returned 0 items after all filtering. Non-expandable. */
  isEmpty: boolean;
  /** Total distinct IUS count across this node and all descendants, from API. */
  ic_ius_subtree_union_count?: number;
};

function resolveLocaleAcceptLanguage(locale: string | undefined): string {
  return locale ?? (typeof navigator !== "undefined" ? navigator.language : "en");
}

/** Sets `Accept-Language` from `locale` and merges over optional app headers (auth, signing). */
function referenceFetchHeaders(
  locale: string | undefined,
  headers?: Record<string, string>,
): Record<string, string> {
  const acceptLanguage = resolveLocaleAcceptLanguage(locale);
  if (headers) {
    return { ...headers, "Accept-Language": acceptLanguage };
  }
  return { "Accept-Language": acceptLanguage };
}

export type IndicatorSelectProps = {
  /** When provided without fetchIndicators, options are fetched from baseUrl/indicators (reference mode). */
  baseUrl?: string;
  multiSelect?: boolean;
  /** Locale for `Accept-Language` on reference fetches (applied inside the component). */
  locale?: string;
  /** When proxy disabled: `buildHeaders()` from the app (auth/signing). Do not pass `acceptLanguage` here — use `locale`. */
  headers?: Record<string, string>;
  /** When provided, fetches from this function instead of baseUrl (override / custom backend). */
  fetchIndicators?: (params: IndicatorSelectFetchParams) => Promise<IndicatorItem[]>;
  /**
   * Cache scope for `fetchIndicators` results on the All tab. Required when the override
   * returns dynamic data (e.g. eligible IUS lists); omit for stable lists.
   */
  fetchIndicatorsCacheKey?: string;
  /** When provided, fetches IC dropdown options by type code (SC, GL, TH, …). */
  fetchClassificationOptions?: (icType: string) => Promise<ClassificationOption[]>;
  initialSelectedIds?: (string | number)[];
  initialSelectedItems?: IndicatorItem[];
  onReady?: (api: IndicatorSelectApi) => void;
  onChange?: (selected: IndicatorItem[]) => void;
  /** Optional custom loading UI (e.g. brand loader). When not provided, shows text-only loading state. */
  loadingComponent?: ReactNode;
  /** When true: expand indicators to IU rows (one per unit). Default: true. When false: show unique indicators only (original behavior). When enableSubgroup=true, this is forced to true. */
  enableUnit?: boolean;
  /** When true: fetch with subgroup=true, render IU+Subgroup tree, return IUS GIDs */
  enableSubgroup?: boolean;
  /** When true: fetch with subgroup=true and show a flat IUS list (ListView), not a tree. Mutually exclusive with enableSubgroup. */
  flatIusList?: boolean;
  /** When flatIusList: only include rows for this unit GID. */
  restrictUnitGid?: string;
  /** When flatIusList: exclude these IUS GIDs from the list. */
  excludeIusGids?: string[];
  strings?: {
    searchPlaceholder?: string;
    allTabLabel?: string;
    selectClassification?: string;
    pleaseSelectClassification?: string;
    chooseClassificationOption?: string;
    selectSector?: string;
    selectTheme?: string;
    selectGoal?: string;
    pleaseSelectSector?: string;
    pleaseSelectTheme?: string;
    pleaseSelectGoal?: string;
    loadingLabel?: string;
    emptyLabel?: string;
    summaryNone?: string;
    summaryOne?: string;
    summaryMany?: string;
    summarySelectedPanelTitle?: string;
    close?: string;
    selectAll?: string;
    deselectAll?: string;
  };
};

const defaultStrings = {
  searchPlaceholder: "Search indicators...",
  allTabLabel: "All",
  selectClassification: "Select {type}",
  pleaseSelectClassification: "Please select a {type} from the dropdown above",
  chooseClassificationOption: "— Choose {type} —",
  selectSector: "Select Sector",
  selectTheme: "Select Theme",
  selectGoal: "Select Goal",
  pleaseSelectSector: "Please select a sector from the dropdown above",
  pleaseSelectTheme: "Please select a theme from the dropdown above",
  pleaseSelectGoal: "Please select a goal from the dropdown above",
  loadingLabel: "Loading...",
  emptyLabel: "No indicators available.",
  summaryNone: "No indicators selected",
  summaryOne: "1 indicator selected",
  summaryMany: "{n} indicators selected",
  summarySelectedPanelTitle: "Selected indicators",
  close: "Close",
  selectAll: "Select All",
  deselectAll: "Deselect All",
};

/** In-memory cache for the default indicator list (all) per baseUrl|locale|enableSubgroup in reference mode. */
const indicatorListCache = new Map<string, IndicatorItem[]>();

/** Cache for IU rows with subgroup data per baseUrl|locale in reference mode. */
const iuRowsCache = new Map<string, IuRowData[]>();

/** Cache for indicators by classification in reference mode: baseUrl|locale|icId|enableSubgroup. */
const indicatorsByClassificationCache = new Map<string, IndicatorItem[]>();

/** Cache for IU rows by classification with subgroups. */
const iuRowsByClassificationCache = new Map<string, IuRowData[]>();

/** Cache for classification options in reference mode: baseUrl|locale|ic_type. */
const classificationOptionsCache = new Map<string, ClassificationOption[]>();

/** Cache for hierarchical classification options (reference mode, hierarchical=true): baseUrl|locale|ic_type|hierarchical. */
const hierarchicalClassificationCache = new Map<string, HierarchicalClassificationOption[]>();

/** Cache key when using fetchIndicators override so reopening modal does not refetch default list. */
const FETCH_INDICATORS_CACHE_KEY = "__fetchIndicators__";

export function IndicatorSelect({
  baseUrl,
  multiSelect = true,
  locale,
  headers: headersProp,
  fetchIndicators,
  fetchIndicatorsCacheKey,
  fetchClassificationOptions,
  initialSelectedIds = [],
  initialSelectedItems = [],
  onReady,
  onChange,
  loadingComponent,
  enableUnit = true,
  enableSubgroup = false,
  flatIusList = false,
  restrictUnitGid,
  excludeIusGids = [],
  strings: stringsProp,
}: IndicatorSelectProps) {
  const isReferenceMode = Boolean(baseUrl && !fetchIndicators);
  const usesClassificationApi = Boolean(baseUrl?.trim() || fetchClassificationOptions);
  const strings = { ...defaultStrings, ...stringsProp };
  const effectiveFlatIus = flatIusList && !enableSubgroup;
  
  // When enableSubgroup is true, force enableUnit to true for IUS tree rendering
  const effectiveEnableUnit = enableSubgroup ? true : enableUnit;
  // Use a stable primitive key so a new array ref with the same GIDs (e.g. `excludeIusGids={[]}`)
  // does not recreate excludeIusSet → flatIusOpts → fetchItems on every render (infinite loop).
  const excludeIusGidsKey = excludeIusGids.join(",");
  const excludeIusSet = useMemo(
    () => new Set(excludeIusGids.map(String)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [excludeIusGidsKey]
  );
  const flatIusOpts = useMemo(
    () => ({
      restrictUnitGid,
      excludeGids: excludeIusSet,
    }),
    [restrictUnitGid, excludeIusSet]
  );
  const normalizeSelectedIdSet = useCallback(
    (ids: Iterable<string>) => {
      const normalized = Array.from(new Set(Array.from(ids).map((id) => String(id))));
      if (multiSelect || enableSubgroup) {
        return new Set(normalized);
      }
      const lastSelectedId = normalized.length > 0 ? normalized[normalized.length - 1] : undefined;
      return lastSelectedId == null ? new Set<string>() : new Set([lastSelectedId]);
    },
    [enableSubgroup, multiSelect]
  );
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [icTypeTabs, setIcTypeTabs] = useState<IcTypeTab[]>([]);
  const [icTypesLoading, setIcTypesLoading] = useState(false);
  const [icOptionsByType, setIcOptionsByType] = useState<
    Record<string, ClassificationOption[]>
  >({});
  /** selectedIcIdByType is kept for legacy fetchClassificationOptions override compatibility. */
  const [selectedIcIdByType, setSelectedIcIdByType] = useState<Record<string, string>>(
    {}
  );
  const [optionsLoading, setOptionsLoading] = useState(false);
  /**
   * IC-grouped tree state per type code. Keyed by icType code, value is an array of IcGroupState
   * (one per classification option). Built when IC options are first loaded for a tab.
   */
  const [icGroupsByType, setIcGroupsByType] = useState<Record<string, IcGroupState[]>>({});


  /** Build initial group states — defined as stable useCallback wrapping the standalone function. */
  const buildInitialGroups = useCallback(
    (options: (HierarchicalClassificationOption | ClassificationOption)[]): IcGroupState[] =>
      buildInitialGroupsRecursive(options),
    []
  );

  // Stable ref to the standalone findAndUpdateIcGroup so callbacks can depend on it without recreating
  const findAndUpdateIcGroup = useCallback(
    (groups: IcGroupState[], icId: string, updater: (g: IcGroupState) => IcGroupState): IcGroupState[] =>
      findAndUpdateIcGroupRecursive(groups, icId, updater),
    []
  );

  /**
   * Fetch indicators for a single IC group entry (leaf node only) and update icGroupsByType state.
   * Noop for non-leaf nodes, already loaded nodes, or nodes already loading.
   */
  const loadIcGroup = useCallback(async (icType: string, icId: string | number) => {
    const idStr = String(icId);

    // Synchronously read current state via ref to decide if we should fetch.
    // Using the ref (not setState updater) avoids the React 18 batching race where
    // shouldFetch would be mutated inside an async updater queue and read before it runs.
    const findNode = (groups: IcGroupState[], id: string): IcGroupState | null => {
      for (const g of groups) {
        if (String(g.ic.id) === id) return g;
        if (g.children.length > 0) {
          const found = findNode(g.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const currentGroups = icGroupsByTypeRef.current[icType];
    if (!currentGroups) return;
    const currentNode = findNode(currentGroups, idStr);
    // Only leaf nodes load indicators; skip if already loaded, loading, or confirmed empty
    if (!currentNode || !currentNode.isLeaf) return;
    if (currentNode.loading || currentNode.items.length > 0 || currentNode.iuRows.length > 0 || currentNode.isEmpty) return;

    // Mark as loading (but do NOT expand yet — expand only after data arrives)
    setIcGroupsByType((prev) => {
      const groups = prev[icType];
      if (!groups) return prev;
      const next = findAndUpdateIcGroup(groups, idStr, (g) => {
        if (!g.isLeaf || g.loading || g.items.length > 0 || g.iuRows.length > 0 || g.isEmpty) return g;
        return { ...g, loading: true };
      });
      return { ...prev, [icType]: next };
    });

    // Determine whether we actually need to fetch (re-read current state)
    // We do the fetch unconditionally here — the guard above prevents duplicate calls
    // by only setting loading=true when not already loading/loaded.

    let items: IndicatorItem[] = [];
    let iuRows: IuRowData[] = [];

    try {
      if (fetchIndicators) {
        const legacy = legacyCategoryFromIcType(icType);
        const params: IndicatorSelectFetchParams = {
          icType,
          icIdentifier: idStr,
          sector: legacy === "sector" ? idStr : undefined,
          goal: legacy === "goal" ? idStr : undefined,
          theme: legacy === "theme" ? idStr : undefined,
        };
        const result = await fetchIndicators(params);
        items = result;
      } else if (baseUrl?.trim()) {
        const base = baseUrl.replace(/\/$/, "");
        const acceptLanguage = resolveLocaleAcceptLanguage(locale);
        const refCacheKey = enableSubgroup
          ? `${base}|${acceptLanguage}|sg`
          : effectiveFlatIus
            ? `${base}|${acceptLanguage}|flat-ius|${restrictUnitGid ?? ""}|${[...excludeIusSet].sort().join(",")}`
            : effectiveEnableUnit
              ? `${base}|${acceptLanguage}|iu`
              : `${base}|${acceptLanguage}|i`;
        const byClassCacheKey = `${refCacheKey}|${idStr}`;

        if (effectiveFlatIus) {
          const cached = indicatorsByClassificationCache.get(byClassCacheKey);
          if (cached) {
            items = cached;
          } else {
            const query: Record<string, string> = { ic_identifier: idStr };
            query.ic_type = icType;
            const { data, unitMeta, subgroupMeta } = await fetchFlatIusIndicatorPages(
              base, locale, headersProp, query
            );
            const flatItems = parseIndicatorsToFlatIusItems(data, unitMeta, subgroupMeta, flatIusOpts);
            flatItems.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
            indicatorsByClassificationCache.set(byClassCacheKey, flatItems);
            items = flatItems;
          }
        } else if (enableSubgroup) {
          const cached = iuRowsByClassificationCache.get(byClassCacheKey);
          if (cached) {
            iuRows = cached;
          } else {
            const url = `${base}${REFERENCE_PATH_INDICATORS}?ic_identifier=${encodeURIComponent(idStr)}&subgroup=true&ius=true`;
            const res = await fetch(url, { headers: referenceFetchHeaders(locale, headersProp) });
            const json = (await res.json()) as BackendEnvelope<Record<string, unknown>[]>;
            const unitMeta = (json.success ? (json.meta?.unit ?? {}) : {}) as UnitMeta;
            const subgroupMeta = (json.success ? (json.meta?.subgroup ?? {}) : {}) as SubgroupMeta;
            const rows = json && json.success && Array.isArray(json.data)
              ? parseIndicatorsWithSubgroups(json.data, unitMeta, subgroupMeta)
              : [];
            iuRowsByClassificationCache.set(byClassCacheKey, rows);
            iuRows = rows;
          }
        } else {
          const cached = indicatorsByClassificationCache.get(byClassCacheKey);
          if (cached) {
            items = cached;
          } else {
            const url = `${base}${REFERENCE_PATH_INDICATORS}?ic_identifier=${encodeURIComponent(idStr)}`;
            const res = await fetch(url, { headers: referenceFetchHeaders(locale, headersProp) });
            const json = (await res.json()) as BackendEnvelope<Record<string, unknown>[]>;
            const unitMeta = (json.success ? (json.meta?.unit ?? {}) : {}) as UnitMeta;
            const data = json && json.success && Array.isArray(json.data)
              ? json.data.flatMap((row) => normalizeIndicatorFromBackend(row, unitMeta, effectiveEnableUnit))
              : [];
            indicatorsByClassificationCache.set(byClassCacheKey, data);
            items = data;
          }
        }
      } else {
        // Mock mode — filter mock indicators by legacy ic type
        const legacy = legacyCategoryFromIcType(icType);
        const mockParams: FetchParams = legacy === "sector" ? { sector: idStr } : legacy === "goal" ? { goal: idStr } : legacy === "theme" ? { theme: idStr } : {};
        const rawMockData = await fetchMockIndicators(mockParams);
        items = rawMockData.flatMap((row) => normalizeIndicatorFromBackend(row, MOCK_UNIT_META, effectiveEnableUnit));
      }
    } catch {
      items = [];
      iuRows = [];
    }

    // Register all items in idToItemRef so getSelected() works across groups
    items.forEach((it) => {
      idToLabel.current.set(String(it.id), it.label);
      idToItemRef.current.set(String(it.id), it);
    });

    const hasData = items.length > 0 || iuRows.length > 0;

    setIcGroupsByType((prev) => {
      const groups = prev[icType];
      if (!groups) return prev;
      const next = findAndUpdateIcGroup(groups, idStr, (g) => ({
        ...g,
        loading: false,
        items,
        iuRows,
        // Always expand after fetch resolves (whether data or empty) so the chevron points down.
        expanded: true,
        isEmpty: !hasData,
      }));
      return { ...prev, [icType]: next };
    });
  }, [
    baseUrl, locale, headersProp, fetchIndicators,
    enableSubgroup, effectiveFlatIus, effectiveEnableUnit,
    flatIusOpts, restrictUnitGid, excludeIusSet,
    findAndUpdateIcGroup,
  ]);
  const [items, setItems] = useState<IndicatorItem[]>([]);
  const [iuRowsData, setIuRowsData] = useState<IuRowData[]>([]);  // for enableSubgroup mode
  const [expandedIus, setExpandedIus] = useState<Set<string>>(new Set());  // for enableSubgroup mode
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    normalizeSelectedIdSet(
      initialSelectedIds.length > 0
        ? initialSelectedIds.map(String)
        : initialSelectedItems.map((i) => String(i.id))
    )
  );
  const listRef = useRef<ListViewApi | null>(null);
  const [showSelectedPanel, setShowSelectedPanel] = useState(false);
  const [panelDraftItems, setPanelDraftItems] = useState<IndicatorItem[]>([]);
  const panelDraftItemsRef = useRef<IndicatorItem[]>([]);
  panelDraftItemsRef.current = panelDraftItems;
  const [panelAnimatedOpen, setPanelAnimatedOpen] = useState(false);
  const idToLabel = useRef(new Map<string, string>());
  /** Full item (id, label, nid) for every indicator we have seen. Used by getSelected so all selected ids get correct nid even when items is filtered (e.g. search). */
  const idToItemRef = useRef(new Map<string, IndicatorItem>());
  const itemsRef = useRef<IndicatorItem[]>([]);
  itemsRef.current = items;
  const selectedIdsRef = useRef<Set<string>>(new Set());
  selectedIdsRef.current = selectedIds;
  /** Sync ref for icGroupsByType — lets loadIcGroup read current state synchronously before committing setState. */
  const icGroupsByTypeRef = useRef<Record<string, IcGroupState[]>>({});
  icGroupsByTypeRef.current = icGroupsByType;

  const sidebarIcTypeTabs = useMemo(() => {
    if (icTypeTabs.length > 0) return icTypeTabs;
    if (!usesClassificationApi) return MOCK_IC_TYPE_TABS;
    return [];
  }, [icTypeTabs, usesClassificationApi]);

  const activeIcTypeLabel = useMemo(() => {
    if (activeCategory === "all") return "";
    return sidebarIcTypeTabs.find((tab) => tab.code === activeCategory)?.label ?? activeCategory;
  }, [activeCategory, sidebarIcTypeTabs]);

  const formatStringToken = useCallback((template: string, typeLabel: string) => {
    return template.replace(/\{type\}/g, typeLabel);
  }, []);

  /** Incremented each time fetchItems is triggered; used to discard stale async responses. */
  const fetchGenRef = useRef(0);

  const fetchItems = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    const isStale = () => gen !== fetchGenRef.current;

    const params = buildIndicatorFetchParams(
      activeCategory,
      searchQuery,
      selectedIcIdByType
    );
    if (fetchIndicators) {
      const fetchCacheKey =
        fetchIndicatorsCacheKey?.trim() || FETCH_INDICATORS_CACHE_KEY;
      if (activeCategory === "all") {
        const cached = indicatorListCache.get(fetchCacheKey);
        if (cached !== undefined) {
          if (isStale()) return;
          let list = cached;
          if (params.search?.trim()) {
            const lower = params.search.trim().toLowerCase();
            list = list.filter((it) => it.label.toLowerCase().includes(lower));
          }
          setItems(list);
          list.forEach((it) => {
            idToLabel.current.set(String(it.id), it.label);
            idToItemRef.current.set(String(it.id), it);
          });
          setLoading(false);
          return;
        }
      }
      setLoading(true);
      try {
        const normalized = await fetchIndicators(
          activeCategory === "all" ? { ...params, search: undefined } : params
        );
        if (isStale()) return;
        if (activeCategory === "all") indicatorListCache.set(fetchCacheKey, normalized);
        let list = normalized;
        if (activeCategory === "all" && params.search?.trim()) {
          const lower = params.search.trim().toLowerCase();
          list = list.filter((it) => it.label.toLowerCase().includes(lower));
        }
        setItems(list);
        list.forEach((it) => {
          idToLabel.current.set(String(it.id), it.label);
          idToItemRef.current.set(String(it.id), it);
        });
      } catch {
        if (isStale()) return;
        setItems([]);
      } finally {
        if (!isStale()) setLoading(false);
      }
      return;
    }

    if (isReferenceMode && baseUrl) {
      const base = baseUrl.replace(/\/$/, "");
      const acceptLanguage = resolveLocaleAcceptLanguage(locale);
      const refCacheKey = enableSubgroup
        ? `${base}|${acceptLanguage}|sg`
        : effectiveFlatIus
          ? `${base}|${acceptLanguage}|flat-ius|${restrictUnitGid ?? ""}|${[...excludeIusSet].sort().join(",")}`
          : effectiveEnableUnit
            ? `${base}|${acceptLanguage}|iu`
            : `${base}|${acceptLanguage}|i`;

      if (activeCategory === "all") {
        if (enableSubgroup) {
          // Subgroup mode: check IU rows cache
          const cachedIuRows = iuRowsCache.get(refCacheKey);
          if (cachedIuRows !== undefined) {
            if (isStale()) return;
            setIuRowsData(cachedIuRows);
            setLoading(false);
            return;
          }
        } else if (effectiveFlatIus) {
          const cached = indicatorListCache.get(refCacheKey);
          if (cached !== undefined) {
            if (isStale()) return;
            let list = cached;
            if (params.search?.trim()) {
              const lower = params.search.trim().toLowerCase();
              list = list.filter((it) => it.label.toLowerCase().includes(lower));
            }
            setItems(list);
            list.forEach((it) => {
              idToLabel.current.set(String(it.id), it.label);
              idToItemRef.current.set(String(it.id), it);
            });
            setLoading(false);
            return;
          }
        } else {
          // Regular mode: check items cache
          const cached = indicatorListCache.get(refCacheKey);
          if (cached !== undefined) {
            if (isStale()) return;
            let list = cached;
            if (params.search?.trim()) {
              const lower = params.search.trim().toLowerCase();
              list = list.filter((it) => it.label.toLowerCase().includes(lower));
            }
            setItems(list);
            list.forEach((it) => {
              idToLabel.current.set(String(it.id), it.label);
              idToItemRef.current.set(String(it.id), it);
            });
            setLoading(false);
            return;
          }
        }
        setLoading(true);
        try {
          if (effectiveFlatIus) {
            const { data, unitMeta, subgroupMeta } = await fetchFlatIusIndicatorPages(
              base,
              locale,
              headersProp,
              {}
            );
            if (isStale()) return;
            const flatItems = parseIndicatorsToFlatIusItems(
              data,
              unitMeta,
              subgroupMeta,
              flatIusOpts
            );
            flatItems.sort((a, b) =>
              a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
            );
            indicatorListCache.set(refCacheKey, flatItems);
            let list = flatItems;
            if (params.search?.trim()) {
              const lower = params.search.trim().toLowerCase();
              list = list.filter((it) => it.label.toLowerCase().includes(lower));
            }
            setItems(list);
            list.forEach((it) => {
              idToLabel.current.set(String(it.id), it.label);
              idToItemRef.current.set(String(it.id), it);
            });
          } else {
          const url = `${base}${REFERENCE_PATH_INDICATORS}${enableSubgroup ? "?subgroup=true&ius=true" : ""}`;
          const res = await fetch(url, { headers: referenceFetchHeaders(locale, headersProp) });
          const json = (await res.json()) as BackendEnvelope<Record<string, unknown>[]>;
          if (isStale()) return;
          const unitMeta = (json.success ? (json.meta?.unit ?? {}) : {}) as UnitMeta;
          
          if (enableSubgroup) {
            // Parse subgroup data
            const subgroupMeta = (json.success ? (json.meta?.subgroup ?? {}) : {}) as SubgroupMeta;
            const iuRows =
              json && json.success && Array.isArray(json.data)
                ? parseIndicatorsWithSubgroups(json.data, unitMeta, subgroupMeta)
                : [];
            iuRowsCache.set(refCacheKey, iuRows);
            setIuRowsData(iuRows);
          } else {
            // Regular IU mode (or indicator-only mode when effectiveEnableUnit=false)
            const data =
              json && json.success && Array.isArray(json.data)
                ? json.data.flatMap((row) => normalizeIndicatorFromBackend(row, unitMeta, effectiveEnableUnit))
                : [];
            indicatorListCache.set(refCacheKey, data);
            let list = data;
            if (params.search?.trim()) {
              const lower = params.search.trim().toLowerCase();
              list = list.filter((it) => it.label.toLowerCase().includes(lower));
            }
            setItems(list);
            list.forEach((it) => {
              idToLabel.current.set(String(it.id), it.label);
              idToItemRef.current.set(String(it.id), it);
            });
          }
          }
        } catch {
          if (isStale()) return;
          if (enableSubgroup) {
            setIuRowsData([]);
          } else {
            setItems([]);
          }
        } finally {
          if (!isStale()) setLoading(false);
        }
        return;
      }

      const icId = activeCategory === "all" ? undefined : selectedIcIdByType[activeCategory];
      if (!icId) {
        if (enableSubgroup) {
          setIuRowsData([]);
        } else {
          setItems([]);
        }
        setLoading(false);
        return;
      }
      const byClassCacheKey = `${refCacheKey}|${icId}`;
      
      if (enableSubgroup) {
        const cachedIuRows = iuRowsByClassificationCache.get(byClassCacheKey);
        if (cachedIuRows !== undefined) {
          setIuRowsData(cachedIuRows);
          setLoading(false);
          return;
        }
      } else if (effectiveFlatIus) {
        const cachedByClass = indicatorsByClassificationCache.get(byClassCacheKey);
        if (cachedByClass !== undefined) {
          setItems(cachedByClass);
          cachedByClass.forEach((it) => {
            idToLabel.current.set(String(it.id), it.label);
            idToItemRef.current.set(String(it.id), it);
          });
          setLoading(false);
          return;
        }
      } else {
        const cachedByClass = indicatorsByClassificationCache.get(byClassCacheKey);
        if (cachedByClass !== undefined) {
          setItems(cachedByClass);
          cachedByClass.forEach((it) => {
            idToLabel.current.set(String(it.id), it.label);
            idToItemRef.current.set(String(it.id), it);
          });
          setLoading(false);
          return;
        }
      }
      
      setLoading(true);
      try {
        if (effectiveFlatIus) {
          const icType = activeCategory === "all" ? undefined : activeCategory;
          const query: Record<string, string> = {
            ic_identifier: String(icId),
          };
          if (icType) query.ic_type = icType;
          const { data, unitMeta, subgroupMeta } = await fetchFlatIusIndicatorPages(
            base,
            locale,
            headersProp,
            query
          );
          if (isStale()) return;
          const flatItems = parseIndicatorsToFlatIusItems(
            data,
            unitMeta,
            subgroupMeta,
            flatIusOpts
          );
          flatItems.sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
          );
          indicatorsByClassificationCache.set(byClassCacheKey, flatItems);
          setItems(flatItems);
          flatItems.forEach((it) => {
            idToLabel.current.set(String(it.id), it.label);
            idToItemRef.current.set(String(it.id), it);
          });
        } else {
        // Use /indicators with ic_identifier query param to get meta.unit in response
        const subgroupParam = enableSubgroup ? "&subgroup=true&ius=true" : "";
        const url = `${base}${REFERENCE_PATH_INDICATORS}?ic_identifier=${encodeURIComponent(icId)}${subgroupParam}`;
        const res = await fetch(url, { headers: referenceFetchHeaders(locale, headersProp) });
        const json = (await res.json()) as BackendEnvelope<Record<string, unknown>[]>;
        if (isStale()) return;
        const unitMeta = (json.success ? (json.meta?.unit ?? {}) : {}) as UnitMeta;
        
        if (enableSubgroup) {
          const subgroupMeta = (json.success ? (json.meta?.subgroup ?? {}) : {}) as SubgroupMeta;
          const iuRows =
            json && json.success && Array.isArray(json.data)
              ? parseIndicatorsWithSubgroups(json.data, unitMeta, subgroupMeta)
              : [];
          iuRowsByClassificationCache.set(byClassCacheKey, iuRows);
          setIuRowsData(iuRows);
        } else {
          const data =
            json && json.success && Array.isArray(json.data)
              ? json.data.flatMap((row) => normalizeIndicatorFromBackend(row, unitMeta, effectiveEnableUnit))
              : [];
          indicatorsByClassificationCache.set(byClassCacheKey, data);
          setItems(data);
          data.forEach((it) => {
            idToLabel.current.set(String(it.id), it.label);
            idToItemRef.current.set(String(it.id), it);
          });
        }
        }
      } catch {
        if (isStale()) return;
        if (enableSubgroup) {
          setIuRowsData([]);
        } else {
          setItems([]);
        }
      } finally {
        if (!isStale()) setLoading(false);
      }
      return;
    }

    const cacheKey = effectiveEnableUnit ? "mock_iu" : "mock_i";
    if (activeCategory === "all") {
      const cached = indicatorListCache.get(cacheKey);
      if (cached !== undefined) {
        if (isStale()) return;
        let list = cached;
        if (params.search?.trim()) {
          const lower = params.search.trim().toLowerCase();
          list = list.filter((it) => it.label.toLowerCase().includes(lower));
        }
        setItems(list);
        list.forEach((it) => {
            idToLabel.current.set(String(it.id), it.label);
            idToItemRef.current.set(String(it.id), it);
          });
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    const rawMockData = await fetchMockIndicators(
      activeCategory === "all"
        ? { search: params.search }
        : mockFetchParamsFromIndicatorParams(params)
    );
    if (isStale()) return;
    const normalized = rawMockData.flatMap((row) => normalizeIndicatorFromBackend(row, MOCK_UNIT_META, effectiveEnableUnit));
    if (activeCategory === "all") indicatorListCache.set(cacheKey, normalized);
    let list = normalized;
    if (activeCategory === "all" && params.search?.trim()) {
      const lower = params.search.trim().toLowerCase();
      list = list.filter((it) => it.label.toLowerCase().includes(lower));
    }
    setItems(list);
    list.forEach((it) => {
            idToLabel.current.set(String(it.id), it.label);
            idToItemRef.current.set(String(it.id), it);
          });
    setLoading(false);
  }, [
    baseUrl,
    locale,
    headersProp,
    fetchIndicators,
    fetchIndicatorsCacheKey,
    isReferenceMode,
    enableSubgroup,
    effectiveFlatIus,
    flatIusOpts,
    restrictUnitGid,
    excludeIusSet,
    effectiveEnableUnit,
    activeCategory,
    searchQuery,
    selectedIcIdByType,
  ]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Load enabled IC type captions for sidebar tabs (warehouse API or demo fallback).
  useEffect(() => {
    if (!baseUrl?.trim()) {
      if (!fetchClassificationOptions) {
        setIcTypeTabs(MOCK_IC_TYPE_TABS);
      } else {
        setIcTypeTabs([]);
      }
      return;
    }
    let cancelled = false;
    setIcTypesLoading(true);
    const base = baseUrl.replace(/\/$/, "");
    const url = `${base}${REFERENCE_PATH_IC_TYPES}`;
    fetch(url, { headers: referenceFetchHeaders(locale, headersProp) })
      .then((res) => res.json())
      .then((json: unknown) => {
        if (cancelled) return;
        const envelope = json as BackendEnvelope<Record<string, string>>;
        const data =
          envelope?.success && envelope.data && typeof envelope.data === "object"
            ? envelope.data
            : {};
        setIcTypeTabs(
          Object.entries(data).map(([code, label]) => ({
            code,
            label: String(label),
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setIcTypeTabs([]);
      })
      .finally(() => {
        if (!cancelled) setIcTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, locale, headersProp, fetchClassificationOptions]);

  // Load classification options when switching IC type tabs, then build icGroupsByType.
  useEffect(() => {
    const icType = activeCategory;
    if (icType === "all") return;

    const existing = icOptionsByType[icType];
    if (existing !== undefined) return;

    /**
     * Apply flat classification options (from fetchClassificationOptions override or mock).
     * Treats every option as a leaf node since we have no hierarchy info.
     */
    const applyFlatOptions = (data: ClassificationOption[], cancelled: () => boolean) => {
      if (cancelled()) return;
      setIcOptionsByType((prev) => ({ ...prev, [icType]: data }));
      // Build as flat (all leaves) — no hierarchy available from the override
      const flatAsHierarchical: HierarchicalClassificationOption[] = data.map((opt) => ({
        ...opt,
        children: [],
        isLeaf: true,
      }));
      setIcGroupsByType((prev) => {
        if (prev[icType]) return prev;
        return { ...prev, [icType]: buildInitialGroups(flatAsHierarchical) };
      });
    };

    /**
     * Apply hierarchical classification options (from reference mode, hierarchical=true).
     * Recursively builds nested IcGroupState tree.
     */
    const applyHierarchicalOptions = (data: HierarchicalClassificationOption[], cancelled: () => boolean) => {
      if (cancelled()) return;
      // Also populate flat icOptionsByType for legacy compatibility (fetchItems uses selectedIcIdByType)
      const flat = data.map((opt) => ({ id: opt.id, label: opt.label }));
      setIcOptionsByType((prev) => ({ ...prev, [icType]: flat }));
      setIcGroupsByType((prev) => {
        if (prev[icType]) return prev;
        return { ...prev, [icType]: buildInitialGroups(data) };
      });
    };

    // fetchClassificationOptions override — flat, treat all as leaves
    if (fetchClassificationOptions) {
      let isCancelled = false;
      setOptionsLoading(true);
      fetchClassificationOptions(icType)
        .then((data) => applyFlatOptions(data, () => isCancelled))
        .finally(() => { if (!isCancelled) setOptionsLoading(false); });
      return () => { isCancelled = true; };
    }

    if (baseUrl?.trim()) {
      const base = baseUrl.replace(/\/$/, "");
      const acceptLanguage = resolveLocaleAcceptLanguage(locale);
      const cacheKey = `${base}|${acceptLanguage}|${icType}|hierarchical`;
      const cachedHierarchical = hierarchicalClassificationCache.get(cacheKey);
      if (cachedHierarchical !== undefined) {
        applyHierarchicalOptions(cachedHierarchical, () => false);
        return;
      }
      let isCancelled = false;
      setOptionsLoading(true);
      const q = new URLSearchParams({
        ic_type: icType,
        hierarchical: "true",
        include_ic_ius_counts: "true",
        sort_field: INDICATOR_CLASSIFICATION_DEFAULTS.sort_field,
        sort_order: INDICATOR_CLASSIFICATION_DEFAULTS.sort_order,
      });
      const url = `${base}${REFERENCE_PATH_INDICATOR_CLASSIFICATIONS}?${q.toString()}`;
      fetch(url, { headers: referenceFetchHeaders(locale, headersProp) })
        .then((res) => res.json())
        .then((json: unknown) => {
          const envelope = json as BackendEnvelope<Record<string, unknown>[]>;
          const hierarchicalData =
            envelope?.success && Array.isArray(envelope.data)
              ? envelope.data.map(normalizeHierarchicalClassificationRow)
              : [];
          hierarchicalClassificationCache.set(cacheKey, hierarchicalData);
          applyHierarchicalOptions(hierarchicalData, () => isCancelled);
        })
        .finally(() => { if (!isCancelled) setOptionsLoading(false); });
      return () => { isCancelled = true; };
    }

    // Mock mode: build from mock options (flat, all leaves)
    const mockOptions = mockOptionsForIcType(icType);
    applyFlatOptions(mockOptions, () => false);
  }, [
    activeCategory,
    baseUrl,
    locale,
    headersProp,
    fetchClassificationOptions,
    icOptionsByType,
    selectedIcIdByType,
    buildInitialGroups,
  ]);

  // After icGroupsByType is built for the active IC category, restore cached indicator
  // data into leaf nodes and auto-expand ancestor paths that contain selected items.
  // This runs on remount (modal reopen) so the user sees the tree expanded to their selections.
  const restorationDoneRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const icType = activeCategory;
    if (icType === "all") return;
    const groups = icGroupsByType[icType];
    if (!groups || groups.length === 0) return;
    if (selectedIdsRef.current.size === 0) return;
    if (restorationDoneRef.current.has(icType)) return;
    restorationDoneRef.current.add(icType);

    const base = baseUrl?.trim() ? baseUrl.replace(/\/$/, "") : "";
    const acceptLanguage = resolveLocaleAcceptLanguage(locale);

    const makeCacheKey = (icId: string): string => {
      const refCacheKey = enableSubgroup
        ? `${base}|${acceptLanguage}|sg`
        : effectiveFlatIus
          ? `${base}|${acceptLanguage}|flat-ius|${restrictUnitGid ?? ""}|${[...excludeIusSet].sort().join(",")}`
          : effectiveEnableUnit
            ? `${base}|${acceptLanguage}|iu`
            : `${base}|${acceptLanguage}|i`;
      return `${refCacheKey}|${icId}`;
    };

    const lookupItems = (icId: string) => indicatorsByClassificationCache.get(makeCacheKey(icId));
    const lookupIuRows = (icId: string) => iuRowsByClassificationCache.get(makeCacheKey(icId));

    const { groups: restored, pendingLeafIds } = restoreCachedGroupState(
      groups, selectedIdsRef.current, lookupItems, lookupIuRows
    );

    // Register restored items in idToItemRef so getSelected() works immediately
    const registerItems = (nodes: IcGroupState[]) => {
      for (const n of nodes) {
        if (n.isLeaf) {
          n.items.forEach((it) => {
            idToLabel.current.set(String(it.id), it.label);
            idToItemRef.current.set(String(it.id), it);
          });
        } else {
          registerItems(n.children);
        }
      }
    };
    registerItems(restored);

    setIcGroupsByType((prev) => ({ ...prev, [icType]: restored }));

    // For leaves with selections but no cached data, trigger lazy load
    for (const leafId of pendingLeafIds) {
      loadIcGroup(icType, leafId);
    }
  }, [activeCategory, icGroupsByType, baseUrl, locale, enableSubgroup, effectiveFlatIus, effectiveEnableUnit, restrictUnitGid, excludeIusSet, loadIcGroup]);

  // Value-stable signature so we don't re-run when parent passes new array ref with same ids (avoids infinite setState loop)
  const initialSelectionSignature =
    initialSelectedIds.length > 0
      ? [...initialSelectedIds].map(String).sort().join(",")
      : initialSelectedItems.map((i) => String(i.id)).sort().join(",");

  // Resolve initial selection from props only when initial props change (e.g. modal opened with selection).
  // Do NOT run when items change (e.g. user typing in search), so we never overwrite in-session selection.
  useEffect(() => {
    const rawIds =
      initialSelectedIds.length > 0
        ? initialSelectedIds.map(String)
        : initialSelectedItems.map((i) => String(i.id));
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) {
      if (rawIds.length > 0) setSelectedIds(normalizeSelectedIdSet(rawIds));
      initialSelectedItems.forEach((i) => {
        idToLabel.current.set(String(i.id), i.label);
        idToItemRef.current.set(String(i.id), i);
      });
      return;
    }
    const resolved = rawIds.map((idStr) => {
      const initialItem = initialSelectedItems.find((i) => String(i.id) === idStr);
      let match = currentItems.find(
        (it) =>
          String(it.id) === idStr ||
          (it.nid != null && (String(it.nid) === idStr || it.nid === Number(idStr)))
      );
      if (!match && initialItem?.label != null) {
        const wantLabel = initialItem.label.trim().toLowerCase();
        match = currentItems.find(
          (it) => it.label?.trim().toLowerCase() === wantLabel
        );
      }
      return match ? String(match.id) : idStr;
    });
    const nextSet = normalizeSelectedIdSet(resolved);
    if (nextSet.size > 0) {
      setSelectedIds((prev) => {
        if (prev.size !== nextSet.size) return nextSet;
        for (const id of nextSet) if (!prev.has(id)) return nextSet;
        return prev;
      });
    }
    resolved.forEach((id) => {
      const it = currentItems.find((i) => String(i.id) === id) ?? initialSelectedItems.find((i) => String(i.id) === id);
      if (it) {
        idToLabel.current.set(id, it.label);
        idToItemRef.current.set(id, it);
      }
    });
    initialSelectedItems.forEach((i) => {
        idToLabel.current.set(String(i.id), i.label);
        idToItemRef.current.set(String(i.id), i);
      });
  }, [initialSelectionSignature, normalizeSelectedIdSet]);

  // Keep idToLabel in sync when items change (e.g. after search); never touch selectedIds here.
  useEffect(() => {
    items.forEach((it) => {
      idToLabel.current.set(String(it.id), it.label);
      idToItemRef.current.set(String(it.id), it);
    });
  }, [items]);

  // When items load or change (e.g. first fetch, search, category switch): resolve current selection
  // against the current list so checkboxes show (same pattern as AreaSelect).
  const itemsReadyKey = items.length;
  useEffect(() => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) return;
    const currentSelected = selectedIdsRef.current;
    const normalizedId = (s: string) => String(s).trim().toLowerCase();
    const resolved = Array.from(currentSelected).map((idStr) => {
      let match = currentItems.find(
        (it) =>
          String(it.id) === idStr ||
          (it.nid != null && (String(it.nid) === idStr || it.nid === Number(idStr)))
      );
      if (!match) {
        const wantLabel = idToLabel.current.get(idStr)?.trim().toLowerCase();
        if (wantLabel) {
          match = currentItems.find((it) => it.label?.trim().toLowerCase() === wantLabel);
        }
      }
      if (!match) {
        const wantId = normalizedId(idStr);
        match = currentItems.find((it) => normalizedId(String(it.id)) === wantId);
      }
      return match ? String(match.id) : idStr;
    });
    const nextSet = normalizeSelectedIdSet(resolved);
    setSelectedIds((prev) => {
      if (prev.size !== nextSet.size || [...prev].some((id) => !nextSet.has(id))) return nextSet;
      return prev;
    });
    resolved.forEach((id) => {
      const it = currentItems.find((i) => String(i.id) === id);
      if (it) {
        idToLabel.current.set(id, it.label);
        idToItemRef.current.set(id, it);
      }
    });
  }, [itemsReadyKey, normalizeSelectedIdSet]);

  const getSelected = useCallback((): IndicatorItem[] => {
    // When the selected-indicators panel is open, return the draft so modal Apply uses current panel selection.
    if (showSelectedPanel) {
      return panelDraftItemsRef.current.map((it) => ({
        id: it.id,
        label: it.label ?? idToLabel.current.get(String(it.id)) ?? String(it.id),
        ...("nid" in it && it.nid != null ? { nid: it.nid as number } : {}),
        ...("unitGid" in it && it.unitGid != null ? { unitGid: it.unitGid as string } : {}),
        ...("unitName" in it && it.unitName != null ? { unitName: it.unitName as string } : {}),
        ...("subgroupGid" in it && it.subgroupGid != null ? { subgroupGid: it.subgroupGid as string } : {}),
        ...("subgroupName" in it && it.subgroupName != null ? { subgroupName: it.subgroupName as string } : {}),
        ...("iusNid" in it && it.iusNid != null ? { iusNid: it.iusNid as number } : {}),
      }));
    }
    
    if (enableSubgroup) {
      const resultItems: IndicatorItem[] = [];
      
      // All selections are IUS-level (specific subgroups)
      selectedIds.forEach(iusGid => {
        const parts = iusGid.split("|");
        if (parts.length === 3) {
          const [iGid, uGid, sgGid] = parts;
          const iuRow = iuRowsData.find(r => r.indicatorGid === iGid && r.unitGid === uGid);
          const sg = iuRow?.subgroups.find(s => s.sgGid === sgGid);
          resultItems.push({
            id: iusGid,
            label: `${iuRow?.indicatorName ?? iGid}, ${iuRow?.unitName ?? uGid} - ${sg?.sgName ?? sgGid}`,
            ...(iuRow?.nid != null ? { nid: iuRow.nid } : {}),
            unitGid: uGid,
            unitName: iuRow?.unitName,
            subgroupGid: sgGid,
            subgroupName: sg?.sgName,
            ...(sg?.iusNid != null ? { iusNid: sg.iusNid } : {}),
          });
        }
      });
      
      return resultItems;
    }
    
    // Regular IU mode (enableSubgroup=false) — includes flatIusList fields when present
    return Array.from(selectedIds).map((id) => {
      const it = idToItemRef.current.get(id) ?? items.find((i) => String(i.id) === id);
      return {
        id,
        label: it?.label ?? idToLabel.current.get(id) ?? id,
        ...(it?.nid != null ? { nid: it.nid } : {}),
        ...(it?.unitGid != null ? { unitGid: it.unitGid } : {}),
        ...(it?.unitName != null ? { unitName: it.unitName } : {}),
        ...(it?.subgroupGid != null ? { subgroupGid: it.subgroupGid } : {}),
        ...(it?.subgroupName != null ? { subgroupName: it.subgroupName } : {}),
        ...(it?.iusNid != null ? { iusNid: it.iusNid } : {}),
      };
    });
  }, [selectedIds, items, showSelectedPanel, enableSubgroup, iuRowsData]);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    listRef.current?.clearData();
    onChange?.([]);
  }, [onChange]);

  const setSelectedIdsProp = useCallback(
    (ids: (string | number)[]) => {
      setSelectedIds(normalizeSelectedIdSet(ids.map(String)));
    },
    [normalizeSelectedIdSet]
  );

  const apiRef = useRef<IndicatorSelectApi>({
    getSelected,
    clear,
    setSelectedIds: setSelectedIdsProp,
  });
  apiRef.current.getSelected = getSelected;
  apiRef.current.clear = clear;
  apiRef.current.setSelectedIds = setSelectedIdsProp;

  useEffect(() => {
    onReady?.(apiRef.current);
  }, [onReady]);

  const handleListReady = useCallback((api: ListViewApi) => {
    listRef.current = api;
  }, []);

  const handleSelectionChange = useCallback(
    (selected: ListViewItem[]) => {
      const nextSelected = multiSelect ? selected : selected.slice(-1);
      setSelectedIds(new Set(nextSelected.map((s) => String(s.id))));
      // ListView only returns {id, label}. Restore full IndicatorItem (nid, unitGid, unitName…)
      // by checking: (1) idToItemRef cache, (2) current loaded items list.
      // This ensures nid/unitGid are present even if the item was restored from initialSelectedItems.
      const enriched = nextSelected.map((s) => {
        const sid = String(s.id);
        const fromRef = idToItemRef.current.get(sid);
        // Prefer a loaded item from current items list (has nid) over cached initialSelectedItem (may lack nid)
        const fromLoaded = itemsRef.current.find((i) => String(i.id) === sid);
        return fromLoaded ?? fromRef ?? (s as IndicatorItem);
      });
      onChange?.(enriched);
    },
    [multiSelect, onChange]
  );

  // IU tree handlers (enableSubgroup mode)
  const handleToggleExpand = useCallback((iuKey: string) => {
    setExpandedIus(prev => {
      const next = new Set(prev);
      if (next.has(iuKey)) {
        next.delete(iuKey);
      } else {
        next.add(iuKey);
      }
      return next;
    });
  }, []);

  const handleIuCheck = useCallback((row: IuRowData, checked: boolean) => {
    // Build all IUS GIDs for this IU row
    const iusGids = row.subgroups.map(sg => `${row.indicatorGid}|${row.unitGid}|${sg.sgGid}`);
    
    setSelectedIds(prev => {
      let next: Set<string>;
      
      if (multiSelect) {
        next = new Set(prev);
      } else {
        // Single-select: when checking, clear other IUs; when unchecking, keep only this IU's selections to remove
        if (checked) {
          next = new Set<string>();
        } else {
          // Keep prev so we can remove from it
          next = new Set(prev);
        }
      }
      
      if (checked) {
        // Add all subgroups for this IU
        iusGids.forEach(gid => next.add(gid));
      } else {
        // Remove all subgroups for this IU
        iusGids.forEach(gid => next.delete(gid));
      }
      
      return next;
    });
    
    // Build selected items after updates (use queueMicrotask to wait for state updates)
    queueMicrotask(() => {
      const resultItems: IndicatorItem[] = [];
      
      // Calculate new selection state
      let newSelectedGids: Set<string>;
      if (multiSelect) {
        newSelectedGids = new Set(selectedIds);
      } else {
        if (checked) {
          newSelectedGids = new Set<string>();
        } else {
          newSelectedGids = new Set(selectedIds);
        }
      }
      
      if (checked) {
        iusGids.forEach(gid => newSelectedGids.add(gid));
      } else {
        iusGids.forEach(gid => newSelectedGids.delete(gid));
      }
      
      newSelectedGids.forEach(gid => {
        const parts = gid.split("|");
        if (parts.length === 3) {
          const [iGid, uGid, sgGid] = parts;
          const iuRow = iuRowsData.find(r => r.indicatorGid === iGid && r.unitGid === uGid);
          const sg = iuRow?.subgroups.find(s => s.sgGid === sgGid);
          resultItems.push({
            id: gid,
            label: `${iuRow?.indicatorName ?? iGid}, ${iuRow?.unitName ?? uGid} - ${sg?.sgName ?? sgGid}`,
            ...(iuRow?.nid != null ? { nid: iuRow.nid } : {}),
            unitGid: uGid,
            unitName: iuRow?.unitName,
            subgroupGid: sgGid,
            subgroupName: sg?.sgName,
            ...(sg?.iusNid != null ? { iusNid: sg.iusNid } : {}),
          });
        }
      });
      
      onChange?.(resultItems);
    });
  }, [iuRowsData, selectedIds, multiSelect, onChange]);

  const handleSubgroupCheck = useCallback((iusGid: string, checked: boolean) => {
    // Parse the new selection's IU key (indicatorGid|unitGid)
    const newParts = iusGid.split("|");
    const newIuKey = newParts.length >= 2 ? `${newParts[0]}|${newParts[1]}` : "";
    
    setSelectedIds(prev => {
      let next: Set<string>;
      
      if (multiSelect) {
        // Multi-select: can select across multiple IUs
        next = new Set(prev);
      } else {
        // Single-select mode: can select multiple subgroups but only within ONE IU
        // If selecting from a different IU, clear previous selections
        const existingFromSameIu = Array.from(prev).filter(gid => {
          const parts = gid.split("|");
          const existingIuKey = parts.length >= 2 ? `${parts[0]}|${parts[1]}` : "";
          return existingIuKey === newIuKey;
        });
        next = new Set(existingFromSameIu);
      }
      
      if (checked) {
        next.add(iusGid);
      } else {
        next.delete(iusGid);
      }
      return next;
    });
    
    // Build selected items after updates (use queueMicrotask to wait for state updates)
    queueMicrotask(() => {
      const resultItems: IndicatorItem[] = [];
      
      // Calculate new selection state
      let currentGids: Set<string>;
      if (multiSelect) {
        currentGids = checked 
          ? new Set([...selectedIds, iusGid])
          : new Set(Array.from(selectedIds).filter(g => g !== iusGid));
      } else {
        // Single-select: keep only from same IU
        const existingFromSameIu = Array.from(selectedIds).filter(gid => {
          const parts = gid.split("|");
          const existingIuKey = parts.length >= 2 ? `${parts[0]}|${parts[1]}` : "";
          return existingIuKey === newIuKey;
        });
        currentGids = new Set(existingFromSameIu);
        if (checked) {
          currentGids.add(iusGid);
        } else {
          currentGids.delete(iusGid);
        }
      }
        
      currentGids.forEach(gid => {
        const parts = gid.split("|");
        if (parts.length === 3) {
          const [iGid, uGid, sgGid] = parts;
          const iuRow = iuRowsData.find(r => r.indicatorGid === iGid && r.unitGid === uGid);
          const sg = iuRow?.subgroups.find(s => s.sgGid === sgGid);
          resultItems.push({
            id: gid,
            label: `${iuRow?.indicatorName ?? iGid}, ${iuRow?.unitName ?? uGid} - ${sg?.sgName ?? sgGid}`,
            ...(iuRow?.nid != null ? { nid: iuRow.nid } : {}),
            unitGid: uGid,
            unitName: iuRow?.unitName,
            subgroupGid: sgGid,
            subgroupName: sg?.sgName,
            ...(sg?.iusNid != null ? { iusNid: sg.iusNid } : {}),
          });
        }
      });
      
      onChange?.(resultItems);
    });
  }, [iuRowsData, multiSelect, selectedIds, onChange]);

  // IC group tree handlers — used on IC type tabs
  const handleIcGroupToggle = useCallback((icType: string, icId: string | number) => {
    const idStr = String(icId);

    const currentGroups = icGroupsByTypeRef.current[icType];
    const findNode = (groups: IcGroupState[], id: string): IcGroupState | null => {
      for (const g of groups) {
        if (String(g.ic.id) === id) return g;
        if (g.children.length > 0) { const f = findNode(g.children, id); if (f) return f; }
      }
      return null;
    };
    const node = currentGroups ? findNode(currentGroups, idStr) : null;

    // A leaf that has never been fetched: no items, not loading, not confirmed empty.
    // For these, loadIcGroup owns the expand decision (expands only if data arrives).
    // Everything else — branch nodes, loaded leaves, empty leaves — just toggle expanded.
    const needsFetch = node?.isLeaf && !node.isEmpty && !node.loading && node.items.length === 0 && node.iuRows.length === 0;

    if (needsFetch) {
      // Silent fetch — do not expand now; loadIcGroup will expand if data arrives
      loadIcGroup(icType, icId);
    } else {
      // Toggle expanded state directly — covers branch nodes, loaded leaves, and empty leaves
      setIcGroupsByType((prev) => {
        const groups = prev[icType];
        if (!groups) return prev;
        const next = findAndUpdateIcGroup(groups, idStr, (g) => {
          const nowExpanded = !g.expanded;
          if (nowExpanded) return { ...g, expanded: true };
          return { ...g, expanded: false, children: collapseAllChildren(g.children) };
        });
        return { ...prev, [icType]: next };
      });
    }
  }, [loadIcGroup, findAndUpdateIcGroup]);

  /** Toggle an IU expand key inside a specific IC group (enableSubgroup mode). */
  const handleIcGroupIuToggle = useCallback((icType: string, icId: string | number, iuKey: string) => {
    const idStr = String(icId);
    setIcGroupsByType((prev) => {
      const groups = prev[icType];
      if (!groups) return prev;
      const next = findAndUpdateIcGroup(groups, idStr, (g) => {
        const nextExpandedIus = new Set(g.expandedIus);
        if (nextExpandedIus.has(iuKey)) nextExpandedIus.delete(iuKey);
        else nextExpandedIus.add(iuKey);
        return { ...g, expandedIus: nextExpandedIus };
      });
      return { ...prev, [icType]: next };
    });
  }, [findAndUpdateIcGroup]);

  /**
   * Group-aware ListView selection handler used inside IC grouped tree.
   * Merges the new selection for the visible group's items into the global selectedIds,
   * preserving selections from other groups.
   */
  const handleIcGroupListSelectionChange = useCallback(
    (groupItemIds: Set<string>, selected: ListViewItem[]) => {
      // In single-select mode ListView already ensures selected.length <= 1,
      // but we still need to clear ALL previously selected ids (across all groups),
      // not just the current group's items.
      const nextSelected = multiSelect ? selected : selected.slice(-1);
      const nextGroupIds = new Set(nextSelected.map((s) => String(s.id)));
      // Register labels — but do NOT overwrite idToItemRef with plain ListViewItem objects
      // since loadIcGroup already stored full IndicatorItems (with nid, unitGid, etc.) there.
      nextSelected.forEach((s) => {
        idToLabel.current.set(String(s.id), s.label);
        if (!idToItemRef.current.has(String(s.id))) {
          idToItemRef.current.set(String(s.id), s as IndicatorItem);
        }
      });
      // Single-select: replace entire selection with just this item (clears other groups too).
      // Multi-select: merge — remove this group's old items, add the new selection.
      let nextFull: Set<string>;
      if (!multiSelect) {
        nextFull = nextGroupIds;
      } else {
        nextFull = new Set(selectedIdsRef.current);
        for (const id of groupItemIds) nextFull.delete(id);
        for (const id of nextGroupIds) nextFull.add(id);
      }
      setSelectedIds(nextFull);
      const allSelected = Array.from(nextFull).map((id) => {
        const it = idToItemRef.current.get(id);
        return it ?? { id, label: idToLabel.current.get(id) ?? id };
      });
      onChange?.(allSelected as IndicatorItem[]);
    },
    [multiSelect, onChange]
  );

  /** Select-all / deselect-all for the All tab (visible / search-filtered items only). */
  const handleAllTabSelectAll = useCallback(
    (checked: boolean) => {
      if (enableSubgroup) {
        const lower = searchQuery.trim().toLowerCase();
        const visibleRows = !lower
          ? iuRowsData
          : iuRowsData.filter((row) => {
              const matchesIu =
                row.indicatorName.toLowerCase().includes(lower) ||
                row.unitName.toLowerCase().includes(lower);
              const matchesSubgroup = row.subgroups.some((sg) =>
                sg.sgName.toLowerCase().includes(lower)
              );
              return matchesIu || matchesSubgroup;
            });
        const visibleGids = visibleRows.flatMap((row) =>
          row.subgroups.map((sg) => `${row.indicatorGid}|${row.unitGid}|${sg.sgGid}`)
        );
        const nextFull = new Set(selectedIdsRef.current);
        if (checked) visibleGids.forEach((g) => nextFull.add(g));
        else visibleGids.forEach((g) => nextFull.delete(g));
        setSelectedIds(nextFull);

        const iuRowLookup = new Map(
          iuRowsData.map((row) => [`${row.indicatorGid}|${row.unitGid}`, row])
        );
        const resultItems: IndicatorItem[] = [];
        nextFull.forEach((gid) => {
          const parts = gid.split("|");
          if (parts.length === 3) {
            const [iGid, uGid, sgGid] = parts;
            const iuRow = iuRowLookup.get(`${iGid}|${uGid}`);
            const sg = iuRow?.subgroups.find((s) => s.sgGid === sgGid);
            resultItems.push({
              id: gid,
              label: `${iuRow?.indicatorName ?? iGid}, ${iuRow?.unitName ?? uGid} - ${sg?.sgName ?? sgGid}`,
              ...(iuRow?.nid != null ? { nid: iuRow.nid } : {}),
              unitGid: uGid,
              unitName: iuRow?.unitName,
              subgroupGid: sgGid,
              subgroupName: sg?.sgName,
              ...(sg?.iusNid != null ? { iusNid: sg.iusNid } : {}),
            });
          }
        });
        onChange?.(resultItems);
      } else {
        const visibleItems = itemsRef.current;
        const visibleIds = visibleItems.map((it) => String(it.id));
        const nextFull = new Set(selectedIdsRef.current);
        if (checked) {
          visibleIds.forEach((id) => {
            nextFull.add(id);
            const it = visibleItems.find((i) => String(i.id) === id);
            if (it) {
              idToLabel.current.set(id, it.label);
              idToItemRef.current.set(id, it);
            }
          });
        } else {
          visibleIds.forEach((id) => nextFull.delete(id));
        }
        setSelectedIds(nextFull);
        const allSelected = Array.from(nextFull).map((id) => {
          const it = idToItemRef.current.get(id);
          return it ?? { id, label: idToLabel.current.get(id) ?? id };
        });
        onChange?.(allSelected as IndicatorItem[]);
      }
    },
    [enableSubgroup, searchQuery, iuRowsData, onChange]
  );

  /** Select-all / deselect-all for a leaf IC group. Uses group's own items/iuRows. */
  const handleIcGroupSelectAll = useCallback(
    (_icType: string, group: IcGroupState, checked: boolean) => {
      if (enableSubgroup) {
        // Collect all IUS GIDs from the group's own iuRows (not the All-tab iuRowsData)
        const allGids = group.iuRows.flatMap((row) =>
          row.subgroups.map((sg) => `${row.indicatorGid}|${row.unitGid}|${sg.sgGid}`)
        );
        const nextFull = new Set(selectedIdsRef.current);
        if (checked) allGids.forEach((g) => nextFull.add(g));
        else allGids.forEach((g) => nextFull.delete(g));
        setSelectedIds(nextFull);

        // Build result items from all selected IUS GIDs, looking up from group's iuRows first,
        // then from idToItemRef as fallback for items from other groups
        const groupIuRowLookup = new Map(
          group.iuRows.map((row) => [`${row.indicatorGid}|${row.unitGid}`, row])
        );
        const resultItems: IndicatorItem[] = [];
        nextFull.forEach((gid) => {
          const parts = gid.split("|");
          if (parts.length === 3) {
            const [iGid, uGid, sgGid] = parts;
            const iuRow = groupIuRowLookup.get(`${iGid}|${uGid}`);
            const sg = iuRow?.subgroups.find((s) => s.sgGid === sgGid);
            resultItems.push({
              id: gid,
              label: `${iuRow?.indicatorName ?? iGid}, ${iuRow?.unitName ?? uGid} - ${sg?.sgName ?? sgGid}`,
              ...(iuRow?.nid != null ? { nid: iuRow.nid } : {}),
              unitGid: uGid,
              unitName: iuRow?.unitName,
              subgroupGid: sgGid,
              subgroupName: sg?.sgName,
              ...(sg?.iusNid != null ? { iusNid: sg.iusNid } : {}),
            });
          }
        });
        onChange?.(resultItems);
      } else {
        const groupItemIds = group.items.map((it) => String(it.id));
        const nextFull = new Set(selectedIdsRef.current);
        if (checked) {
          groupItemIds.forEach((id) => {
            nextFull.add(id);
            const it = group.items.find((i) => String(i.id) === id);
            if (it) {
              idToLabel.current.set(id, it.label);
              idToItemRef.current.set(id, it);
            }
          });
        } else {
          groupItemIds.forEach((id) => nextFull.delete(id));
        }
        setSelectedIds(nextFull);
        const allSelected = Array.from(nextFull).map((id) => {
          const it = idToItemRef.current.get(id);
          return it ?? { id, label: idToLabel.current.get(id) ?? id };
        });
        onChange?.(allSelected as IndicatorItem[]);
      }
    },
    [enableSubgroup, onChange]
  );

  const applyDraftAndClose = useCallback(() => {
    handleSelectionChange(panelDraftItemsRef.current as ListViewItem[]);
    setShowSelectedPanel(false);
    setPanelAnimatedOpen(false);
  }, [handleSelectionChange]);

  const handleSummaryClick = useCallback(() => {
    const current = getSelected();
    panelDraftItemsRef.current = current;
    setPanelDraftItems(current);
    setShowSelectedPanel(true);
  }, [getSelected]);

  useEffect(() => {
    if (showSelectedPanel) {
      setPanelAnimatedOpen(false);
      requestAnimationFrame(() => setPanelAnimatedOpen(true));
    } else {
      setPanelAnimatedOpen(false);
    }
  }, [showSelectedPanel]);

  useEffect(() => {
    // Close panel if all selections are cleared
    if (selectedIds.size === 0 && showSelectedPanel) {
      setShowSelectedPanel(false);
      setPanelAnimatedOpen(false);
    }
  }, [selectedIds.size, showSelectedPanel]);

  useEffect(() => {
    if (!multiSelect && showSelectedPanel) {
      setShowSelectedPanel(false);
      setPanelAnimatedOpen(false);
    }
  }, [multiSelect, showSelectedPanel]);

  // When the selected panel is open, show count from draft so deselecting in the panel updates the count immediately.
  const selectedCount = showSelectedPanel 
    ? panelDraftItems.length 
    : selectedIds.size;
  const summaryText =
    selectedCount === 0
      ? strings.summaryNone
      : `${selectedCount} ${selectedCount === 1 ? "indicator" : "indicators"} selected`;
  const summaryInner =
    selectedCount === 0 ? (
      <>{strings.summaryNone}</>
    ) : (
      <>
        <span className="dtk-ind-count">{selectedCount}</span>
        {" "}{selectedCount === 1 ? "indicator" : "indicators"} selected
      </>
    );

  const showList =
    activeCategory === "all" ||
    Boolean(selectedIcIdByType[activeCategory]?.trim());

  const emptyMessage =
    activeCategory === "all"
      ? strings.emptyLabel
      : formatStringToken(strings.pleaseSelectClassification, activeIcTypeLabel);

  const classificationOptionsForActiveType =
    usesClassificationApi || fetchClassificationOptions
      ? icOptionsByType[activeCategory] ?? []
      : mockOptionsForIcType(activeCategory);

  const classificationSelectLabel = (() => {
    if (activeCategory === "all") return "";
    const legacy = legacyCategoryFromIcType(activeCategory);
    if (legacy === "sector") return strings.selectSector;
    if (legacy === "goal") return strings.selectGoal;
    if (legacy === "theme") return strings.selectTheme;
    return formatStringToken(strings.selectClassification, activeIcTypeLabel);
  })();

  // Filter IU rows for search in enableSubgroup mode
  const filteredIuRows = useMemo(() => {
    if (!enableSubgroup || !searchQuery.trim()) {
      return iuRowsData;
    }
    
    const lower = searchQuery.trim().toLowerCase();
    return iuRowsData.filter(row => {
      // Check if indicator name or unit name matches
      const matchesIu = row.indicatorName.toLowerCase().includes(lower) || 
                        row.unitName.toLowerCase().includes(lower);
      
      // Check if any subgroup name matches
      const matchesSubgroup = row.subgroups.some(sg => 
        sg.sgName.toLowerCase().includes(lower)
      );
      
      return matchesIu || matchesSubgroup;
    });
  }, [iuRowsData, searchQuery, enableSubgroup]);

  const showAllTabSelectAllControls =
    activeCategory === "all" &&
    multiSelect &&
    showList &&
    !loading &&
    (enableSubgroup ? filteredIuRows.length > 0 : items.length > 0);

  return (
    <div className="dtk-ind-root">
      <aside className="dtk-ind-sidebar">
        <button
          type="button"
          className={`dtk-ind-tab ${activeCategory === "all" ? "dtk-ind-tab-active" : ""}`}
          onClick={() => setActiveCategory("all")}
        >
          {strings.allTabLabel}
        </button>
        {sidebarIcTypeTabs.map((tab) => (
          <button
            key={tab.code}
            type="button"
            className={`dtk-ind-tab ${activeCategory === tab.code ? "dtk-ind-tab-active" : ""}`}
            onClick={() => setActiveCategory(tab.code)}
            disabled={icTypesLoading && icTypeTabs.length === 0}
          >
            {tab.label}
          </button>
        ))}
      </aside>
      <div className="dtk-ind-main">
        <div className="dtk-ind-content">
          <div className="dtk-ind-controls">
            {activeCategory === "all" && (
            <div className="dtk-ind-search-wrap">
              <span className="dtk-ind-search-icon" aria-hidden />
              <input
                type="text"
                className="dtk-ind-search"
                placeholder={strings.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={strings.searchPlaceholder}
              />
              {searchQuery.trim() ? (
                <button
                  type="button"
                  className="dtk-ind-search-clear"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  title="Clear"
                >
                  ×
                </button>
              ) : null}
            </div>
          )}
          </div>
          <div className="dtk-ind-list-wrap">
          {activeCategory === "all" && !showList && (
            <div className="dtk-ind-empty">{emptyMessage}</div>
          )}
          {activeCategory === "all" && showList && loading && (
            loadingComponent ? (
              <div className="dtk-ind-loading-slot">{loadingComponent}</div>
            ) : (
              <div className="dtk-ind-empty dtk-ind-loading">{strings.loadingLabel}</div>
            )
          )}
          {activeCategory === "all" && showList && !loading && enableSubgroup && filteredIuRows.length === 0 && (
            <div className="dtk-ind-empty">{strings.emptyLabel}</div>
          )}
          {activeCategory === "all" && showList && !loading && !enableSubgroup && items.length === 0 && (
            <div className="dtk-ind-empty">{strings.emptyLabel}</div>
          )}
          {activeCategory === "all" && showList && !loading && enableSubgroup && filteredIuRows.length > 0 && (
            <div className="dtk-ind-all-list-block">
              {showAllTabSelectAllControls && (
                <div className="dtk-ic-group-select-all-row">
                  <button
                    type="button"
                    className="dtk-ic-group-select-all"
                    onClick={() => handleAllTabSelectAll(true)}
                  >
                    {strings.selectAll}
                  </button>
                  <button
                    type="button"
                    className="dtk-ic-group-select-all"
                    onClick={() => handleAllTabSelectAll(false)}
                  >
                    {strings.deselectAll}
                  </button>
                </div>
              )}
              <div className="dtk-ind-all-list-content">
                <IuTreeView
                  iuRows={filteredIuRows}
                  selectedGids={selectedIds}
                  expandedIus={expandedIus}
                  onToggleExpand={handleToggleExpand}
                  onIuCheck={handleIuCheck}
                  onSubgroupCheck={handleSubgroupCheck}
                />
              </div>
            </div>
          )}
          {activeCategory === "all" && showList && !loading && !enableSubgroup && items.length > 0 && (
            <div className="dtk-ind-all-list-block">
              {showAllTabSelectAllControls && (
                <div className="dtk-ic-group-select-all-row">
                  <button
                    type="button"
                    className="dtk-ic-group-select-all"
                    onClick={() => handleAllTabSelectAll(true)}
                  >
                    {strings.selectAll}
                  </button>
                  <button
                    type="button"
                    className="dtk-ic-group-select-all"
                    onClick={() => handleAllTabSelectAll(false)}
                  >
                    {strings.deselectAll}
                  </button>
                </div>
              )}
              <div className="dtk-ind-all-list-content">
                <ListView
                  items={items}
                  multiSelect={multiSelect}
                  selectedIds={Array.from(selectedIds)}
                  onSelectionChange={handleSelectionChange}
                  onReady={handleListReady}
                />
              </div>
            </div>
          )}
          {/* IC type tab: grouped tree view — recursive multi-level hierarchy */}
          {activeCategory !== "all" && (() => {
            const groups = icGroupsByType[activeCategory];
            if (!groups) {
              return optionsLoading
                ? (loadingComponent
                    ? <div className="dtk-ind-loading-slot">{loadingComponent}</div>
                    : <div className="dtk-ind-empty dtk-ind-loading">{strings.loadingLabel}</div>)
                : <div className="dtk-ind-empty">{strings.emptyLabel}</div>;
            }
            const searchLower = searchQuery.trim().toLowerCase();

            /** Count selected items in a leaf group. */
            const countLeafSelected = (group: IcGroupState): number => {
              if (enableSubgroup) {
                let n = 0;
                for (const row of group.iuRows) {
                  for (const sg of row.subgroups) {
                    if (selectedIds.has(`${row.indicatorGid}|${row.unitGid}|${sg.sgGid}`)) n++;
                  }
                }
                return n;
              }
              let n = 0;
              for (const it of group.items) {
                if (selectedIds.has(String(it.id))) n++;
              }
              return n;
            };

            /** Recursively count selected items across all descendant leaf groups. */
            const countSubtreeSelected = (group: IcGroupState): number => {
              if (group.isLeaf) return countLeafSelected(group);
              return group.children.reduce((acc, child) => acc + countSubtreeSelected(child), 0);
            };

            /** Recursively render a single IC node at the given depth. */
            const renderIcNode = (group: IcGroupState, depth: number): React.ReactNode => {
              const icIdStr = String(group.ic.id);
              const isExpanded = group.expanded;
              const icSelectedCount = countSubtreeSelected(group);

              // For leaf nodes, apply search filter to content
              let childItems = group.items;
              let childIuRows = group.iuRows;
              if (group.isLeaf && searchLower) {
                if (enableSubgroup) {
                  childIuRows = childIuRows.filter((row) =>
                    row.indicatorName.toLowerCase().includes(searchLower) ||
                    row.unitName.toLowerCase().includes(searchLower) ||
                    row.subgroups.some((sg) => sg.sgName.toLowerCase().includes(searchLower))
                  );
                } else {
                  childItems = childItems.filter((it) =>
                    it.label.toLowerCase().includes(searchLower)
                  );
                }
              }

              const groupItemIdSet = new Set(group.items.map((it) => String(it.id)));

              const isLeafLoading = group.isLeaf && group.loading;
              const isInteractive = !isLeafLoading;

              // Select All / Deselect All: only when a loaded, non-empty leaf is expanded
              const showSelectAllControls =
                multiSelect &&
                group.isLeaf &&
                isExpanded &&
                !group.loading &&
                !group.isEmpty &&
                (group.items.length > 0 || group.iuRows.length > 0);

              return (
                <div key={icIdStr} className="dtk-ic-group" data-depth={depth}>
                  {/* IC classification header row */}
                  <div
                    className={`dtk-ic-group-header${isExpanded ? " dtk-ic-group-header-open" : ""}${depth > 0 ? " dtk-ic-group-header-nested" : ""}`}
                    style={{ paddingLeft: `calc(var(--spacing-panel-x, 1rem) + ${depth} * 1rem)` }}
                  >
                    {/* Expand/collapse toggle — chevron, spinner while loading, dimmed when empty */}
                    <button
                      type="button"
                      className="dtk-ic-group-toggle"
                      onClick={isInteractive ? () => handleIcGroupToggle(activeCategory, group.ic.id) : undefined}
                      aria-expanded={isExpanded}
                      aria-label={isLeafLoading ? strings.loadingLabel : isExpanded ? "Collapse" : "Expand"}
                      disabled={isLeafLoading}
                    >
                      {isLeafLoading ? (
                        <svg className="dtk-ic-group-chevron-svg dtk-ic-group-chevron-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2a10 10 0 1 0 10 10" />
                        </svg>
                      ) : (
                        <svg
                          className={`dtk-ic-group-chevron-svg${isExpanded ? " dtk-ic-group-chevron-open" : ""}`}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      )}
                    </button>
                    {/* Label — click to expand/collapse (not interactive while loading) */}
                    <span
                      className="dtk-ic-group-label"
                      onClick={isInteractive ? () => handleIcGroupToggle(activeCategory, group.ic.id) : undefined}
                      style={{ cursor: isInteractive ? "pointer" : "default" }}
                    >
                      {group.ic.label}
                    </span>
                    {icSelectedCount > 0 && (
                      <span className="dtk-ic-group-badge">{icSelectedCount}</span>
                    )}
                  </div>
                  {/* Select All / Deselect All text links — only on loaded leaf nodes in multiSelect mode */}
                  {showSelectAllControls && (
                    <div
                      className="dtk-ic-group-select-all-row"
                      style={{ paddingLeft: `calc(var(--spacing-panel-x, 0.75rem) + ${depth + 1} * 1rem)` }}
                    >
                      <button
                        type="button"
                        className="dtk-ic-group-select-all"
                        onClick={(e) => { e.stopPropagation(); handleIcGroupSelectAll(activeCategory, group, true); }}
                      >
                        {strings.selectAll}
                      </button>
                      <button
                        type="button"
                        className="dtk-ic-group-select-all"
                        onClick={(e) => { e.stopPropagation(); handleIcGroupSelectAll(activeCategory, group, false); }}
                      >
                        {strings.deselectAll}
                      </button>
                    </div>
                  )}

                  {/* Children — shown when expanded and not in the silent-loading phase.
                      For leaf nodes, we suppress the children area while loading to avoid
                      the Loader taking up space and causing a layout jump before the
                      result arrives. The loading state is shown on the chevron instead. */}
                  {isExpanded && !isLeafLoading && (
                    <div className="dtk-ic-group-children">
                      {/* Branch node: render sub-classification children */}
                      {!group.isLeaf && group.children.map((child) => renderIcNode(child, depth + 1))}

                      {/* Leaf node: render indicators — wrapped in a depth-indented container */}
                      {group.isLeaf && (
                        <div style={{ paddingLeft: `${(depth + 1) * 1.25}rem` }}>
                          {group.loading && (
                            <div className="dtk-ic-leaf-loading">
                              {loadingComponent
                                ? loadingComponent
                                : <span className="dtk-ind-empty dtk-ind-loading">{strings.loadingLabel}</span>}
                            </div>
                          )}
                          {!group.loading && enableSubgroup && childIuRows.length > 0 && (
                            <IuTreeView
                              iuRows={childIuRows}
                              selectedGids={selectedIds}
                              expandedIus={group.expandedIus}
                              onToggleExpand={(iuKey) => handleIcGroupIuToggle(activeCategory, group.ic.id, iuKey)}
                              onIuCheck={handleIuCheck}
                              onSubgroupCheck={handleSubgroupCheck}
                            />
                          )}
                          {!group.loading && !enableSubgroup && childItems.length > 0 && (
                            <ListView
                              items={childItems}
                              multiSelect={multiSelect}
                              selectedIds={Array.from(selectedIds).filter((id) =>
                                childItems.some((it) => String(it.id) === id)
                              )}
                              onSelectionChange={(selected) =>
                                handleIcGroupListSelectionChange(groupItemIdSet, selected)
                              }
                              onReady={handleListReady}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div className="dtk-ic-tree-root">
                {groups.map((group) => renderIcNode(group, 0))}
              </div>
            );
          })()}
        </div>
          {multiSelect && showSelectedPanel && (
            <div
              className={`dtk-ind-selected-panel ${panelAnimatedOpen ? "dtk-ind-selected-panel-is-open" : ""}`}
              role="dialog"
              aria-label={strings.summarySelectedPanelTitle}
            >
              <div className="dtk-ind-selected-panel-header">
                <span className="dtk-ind-selected-panel-title">{strings.summarySelectedPanelTitle}</span>
                <button
                  type="button"
                  className="dtk-ind-selected-panel-close"
                  onClick={applyDraftAndClose}
                  aria-label={strings.close}
                  title={strings.close}
                >
                  ×
                </button>
              </div>
              <div className="dtk-ind-selected-panel-list">
                {panelDraftItems.length === 0 ? (
                  <div className="dtk-ind-empty">{strings.summaryNone}</div>
                ) : (
                  <ListView
                    items={panelDraftItems}
                    multiSelect={multiSelect}
                    selectedIds={panelDraftItems.map((i) => i.id)}
                    onSelectionChange={(selected) => {
                    panelDraftItemsRef.current = selected;
                    setPanelDraftItems(selected);
                  }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div
          className={`dtk-ind-summary${multiSelect && selectedCount > 0 ? " dtk-ind-summary-clickable" : ""}`}
          onClick={multiSelect && selectedCount > 0 ? handleSummaryClick : undefined}
          role={multiSelect && selectedCount > 0 ? "button" : undefined}
          tabIndex={multiSelect && selectedCount > 0 ? 0 : undefined}
          aria-label={multiSelect && selectedCount > 0 ? strings.summarySelectedPanelTitle : undefined}
          onKeyDown={multiSelect && selectedCount > 0 ? (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSummaryClick(); } } : undefined}
        >
          {summaryInner}
        </div>
      </div>
    </div>
  );
}
