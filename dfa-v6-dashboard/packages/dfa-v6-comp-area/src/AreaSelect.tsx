"use client";

/**
 * Area select UI (level filter, search, tree list, summary).
 * Styling is token-driven via styles.css; uses design tokens from
 * packages/design-tokens/tokens.css when loaded by the app.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TreeView, type TreeNode, type TreeViewApi } from "dfa-v6-comp-treeview";
import { ListView, type ListViewItem } from "dfa-v6-comp-list-view";

export type AreaItem = { id: string; label: string; type?: string; nid?: number };

export type AreaSelectApi = {
  getSelected(): AreaItem[];
  clear(): void;
  setSelectedIds(ids: (string | number)[]): void;
  expandAll(): void;
  collapseAll(): void;
  selectAll(): void;
  deselectAll(): void;
};

const REFERENCE_PATH_AREAS = "/areas";
const REFERENCE_PATH_AREA_LEVELS = "/area-levels";

/** Fallback when level options are not yet loaded from /area-levels (reference mode) or not provided. */
const LEVEL_OPTIONS_FALLBACK: { value: string; label: string }[] = [
  { value: "", label: "All Levels (Tree View)" },
];

export type AreaSelectFetchFlatParams = { level?: string; search?: string };

function resolveLocaleAcceptLanguage(locale: string | undefined): string {
  return locale ?? (typeof navigator !== "undefined" ? navigator.language : "en");
}

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

export type AreaSelectProps = {
  baseUrl?: string;
  multiSelect?: boolean;
  /** Locale for `Accept-Language` on reference fetches (applied inside the component). */
  locale?: string;
  /** When proxy disabled: `buildHeaders()` from the app. Do not pass `acceptLanguage` — use `locale`. */
  headers?: Record<string, string>;
  /** When provided, used instead of baseUrl for roots (e.g. direct backend call). */
  fetchRoots?: () => Promise<TreeNode[]>;
  /** When provided, used instead of baseUrl for loading children (e.g. direct backend call). */
  loadChildren?: (parentId: string) => Promise<TreeNode[]>;
  /** When provided, used instead of baseUrl for flat list by level/search (e.g. direct backend call). */
  fetchFlat?: (params: AreaSelectFetchFlatParams) => Promise<TreeNode[]>;
  /** Level filter dropdown options (e.g. from area-levels API). First option should be "All Levels (Tree View)" with value "". */
  levelOptions?: { value: string; label: string }[];
  initialSelectedIds?: (string | number)[];
  initialSelectedItems?: AreaItem[];
  onReady?: (api: AreaSelectApi) => void;
  onChange?: (items: AreaItem[]) => void;
  /** Optional custom loading UI (e.g. brand loader). When not provided, shows text-only loading state. */
  loadingComponent?: ReactNode;
  strings?: {
    filterByLevel?: string;
    searchPlaceholder?: string;
    expandAll?: string;
    collapseAll?: string;
    selectAll?: string;
    deselectAll?: string;
    emptyLabel?: string;
    loadingLabel?: string;
    summaryNone?: string;
    summaryOne?: string;
    summaryMany?: string;
    summarySelectedPanelTitle?: string;
    close?: string;
  };
};

const defaultStrings = {
  filterByLevel: "Filter by Level",
  searchPlaceholder: "Search areas...",
  expandAll: "Expand All",
  collapseAll: "Collapse All",
  selectAll: "Select All",
  deselectAll: "Deselect All",
  emptyLabel: "No areas to display.",
  loadingLabel: "Loading...",
  summaryNone: "No areas selected",
  summaryOne: "1 area selected",
  summaryMany: "{n} areas selected",
  summarySelectedPanelTitle: "Selected areas",
  close: "Close",
};

function buildUrl(
  baseUrl: string,
  params: { parent?: string; level?: string; search?: string }
): string {
  const base = baseUrl.replace(/\/$/, "");
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(base, origin);
  url.searchParams.set("parent", params.parent ?? "root");
  if (params.level) url.searchParams.set("level", params.level);
  if (params.search?.trim()) url.searchParams.set("search", params.search.trim());
  return url.pathname + url.search;
}

function toTreeNode(node: { id: string; label: string; type?: string; hasChildren?: boolean; path?: string; nid?: number }): TreeNode {
  return {
    id: node.id,
    label: node.label,
    type: node.type,
    hasChildren: node.hasChildren,
    path: node.path,
  };
}

/** In-memory cache for area roots per baseUrl so reopening the modal does not refetch. */
const areaRootsCache = new Map<string, TreeNode[]>();

/** When baseUrl is the reference DW base (no callbacks), we fetch /areas and /area-levels and build tree once per baseUrl. */
type ReferenceTree = {
  roots: TreeNode[];
  getChildren: (parentId: string) => TreeNode[];
  getFlat: (level?: string, search?: string) => TreeNode[];
  levelOptions: { value: string; label: string }[];
};
const referenceTreeCache = new Map<string, ReferenceTree>();

function normalizeArea(a: Record<string, unknown>): { nid: number; parentNid: number | null; id: string; name: string; level: number } {
  const nid = Number(a.ar_nid ?? a.a_nid ?? 0) || 0;
  const rawParent = a.ar_parent_nid ?? a.a_parent_nid;
  const parentNum = typeof rawParent === "number" && !Number.isNaN(rawParent) ? rawParent : Number(rawParent);
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

function buildReferenceTree(
  areas: { nid: number; parentNid: number | null; id: string; name: string; level: number }[],
  levelToName: Map<number, string>
): ReferenceTree {
  const byNid = new Map(areas.map((a) => [a.nid, a]));
  const byId = new Map(areas.map((a) => [a.id, a]));
  const childrenByParentNid = new Map<number, typeof areas>();
  for (const a of areas) {
    const key = a.parentNid ?? 0;
    if (!childrenByParentNid.has(key)) childrenByParentNid.set(key, []);
    childrenByParentNid.get(key)!.push(a);
  }
  const hasChildren = (nid: number) => (childrenByParentNid.get(nid)?.length ?? 0) > 0;

  const toNode = (a: (typeof areas)[0]): TreeNode & { nid?: number } => ({
    id: a.id,
    label: a.name,
    type: levelToName.get(a.level) ?? "Unknown",
    hasChildren: hasChildren(a.nid),
    nid: a.nid,
  });

  let roots = areas.filter((a) => a.parentNid == null);
  if (roots.length === 0 && areas.length > 0) {
    const minLevel = Math.min(...areas.map((a) => a.level));
    roots = areas.filter((a) => a.level === minLevel);
  }
  const rootNodes = roots.map((a) => toNode(a));

  const getChildren = (parentId: string): TreeNode[] => {
    const parent = byId.get(parentId) ?? byNid.get(Number(parentId));
    if (!parent) return [];
    const children = childrenByParentNid.get(parent.nid) ?? [];
    return children.map((a) => toNode(a));
  };

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

  const getFlat = (level?: string, search?: string): TreeNode[] => {
    let items = areas.map((a) => ({ ...toNode(a), path: getPath(a.id) }));
    if (level) items = items.filter((n) => n.type === level);
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((n) => n.label?.toLowerCase().includes(q));
    }
    return items;
  };

  const levelOptions: { value: string; label: string }[] = [
    { value: "", label: "All Levels (Tree View)" },
    ...Array.from(levelToName.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, name]) => ({ value: name, label: name })),
  ];

  return { roots: rootNodes, getChildren, getFlat, levelOptions };
}

export function AreaSelect({
  baseUrl = "/api/areas",
  multiSelect = true,
  locale,
  headers: headersProp,
  fetchRoots: fetchRootsProp,
  loadChildren: loadChildrenProp,
  fetchFlat: fetchFlatProp,
  levelOptions: levelOptionsProp,
  initialSelectedIds = [],
  initialSelectedItems = [],
  onReady,
  onChange,
  loadingComponent,
  strings: stringsProp,
}: AreaSelectProps) {
  const normalizeSelectedIds = useCallback(
    (ids: (string | number)[]) => {
      if (multiSelect) {
        return new Set(ids.map(String));
      }
      const lastSelectedId = ids.length > 0 ? ids[ids.length - 1] : undefined;
      return lastSelectedId == null ? new Set<string>() : new Set([String(lastSelectedId)]);
    },
    [multiSelect]
  );
  const strings = { ...defaultStrings, ...stringsProp };
  const treeChildActionLabels = useMemo(
    () => ({
      selectAll: strings.selectAll,
      deselectAll: strings.deselectAll,
    }),
    [strings.selectAll, strings.deselectAll]
  );
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [flatItems, setFlatItems] = useState<TreeNode[] | null>(null);
  const [filterLevel, setFilterLevel] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingRoots, setLoadingRoots] = useState(true);
  const [loadingFlat, setLoadingFlat] = useState(false);
  const [referenceLevelOptions, setReferenceLevelOptions] = useState<{ value: string; label: string }[]>([]);
  const levelOptionsResolved =
    levelOptionsProp && levelOptionsProp.length > 0
      ? levelOptionsProp
      : referenceLevelOptions.length > 0
        ? referenceLevelOptions
        : LEVEL_OPTIONS_FALLBACK;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initialIds =
      initialSelectedIds.length > 0
        ? initialSelectedIds
        : initialSelectedItems.map((i) => i.id);
    return normalizeSelectedIds(initialIds);
  });
  const treeRef = useRef<TreeViewApi | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const idToLabelRef = useRef(new Map<string, string>());
  const idToTypeRef = useRef(new Map<string, string>());
  const idToNidRef = useRef(new Map<string, number>());
  const selectedIdsRef = useRef<Set<string>>(new Set());
  selectedIdsRef.current = selectedIds;
  const [showSelectedPanel, setShowSelectedPanel] = useState(false);
  const [panelDraftItems, setPanelDraftItems] = useState<AreaItem[]>([]);
  const panelDraftItemsRef = useRef<AreaItem[]>([]);
  panelDraftItemsRef.current = panelDraftItems;
  const [panelAnimatedOpen, setPanelAnimatedOpen] = useState(false);
  /** When in reference mode (baseUrl with no callbacks), hold the in-memory tree for loadChildren/fetchFlat/levelOptions. */
  const referenceTreeRef = useRef<ReferenceTree | null>(null);

  const isReferenceMode = Boolean(
    baseUrl && !fetchRootsProp && !loadChildrenProp && !fetchFlatProp
  );
  const isTreeMode = filterLevel === "" && !searchQuery.trim();

  const fetchRoots = useCallback(async () => {
    if (fetchRootsProp) {
      setLoadingRoots(true);
      try {
        const nodes = await fetchRootsProp();
        setRoots(nodes);
        nodes.forEach((n) => {
          idToLabelRef.current.set(n.id, n.label);
          if (n.type) idToTypeRef.current.set(n.id, n.type);
          if ("nid" in n && typeof (n as { nid?: number }).nid === "number") idToNidRef.current.set(n.id, (n as { nid: number }).nid);
        });
      } catch {
        setRoots([]);
      } finally {
        setLoadingRoots(false);
      }
      return;
    }
    if (isReferenceMode) {
      const base = baseUrl.replace(/\/$/, "");
      const acceptLanguage = resolveLocaleAcceptLanguage(locale);
      const cacheKey = `${base}|${acceptLanguage}`;
      const cached = referenceTreeCache.get(cacheKey);
      if (cached !== undefined) {
        referenceTreeRef.current = cached;
        setReferenceLevelOptions(cached.levelOptions);
        setRoots(cached.roots);
        cached.roots.forEach((n) => {
          idToLabelRef.current.set(n.id, n.label);
          if (n.type) idToTypeRef.current.set(n.id, n.type);
          if ("nid" in n && typeof (n as { nid?: number }).nid === "number") idToNidRef.current.set(n.id, (n as { nid: number }).nid);
        });
        setLoadingRoots(false);
        return;
      }
      setLoadingRoots(true);
      try {
        const refHeaders = referenceFetchHeaders(locale, headersProp);
        const areasRes = await fetch(`${base}${REFERENCE_PATH_AREAS}`, { headers: refHeaders });
        const levelsRes = await fetch(`${base}${REFERENCE_PATH_AREA_LEVELS}`, { headers: referenceFetchHeaders(locale, headersProp) });
        const areasJson = (await areasRes.json()) as { success?: boolean; data?: unknown[] } | unknown[];
        const levelsJson = (await levelsRes.json()) as { success?: boolean; data?: { al_level: number; al_name: string }[] } | { al_level: number; al_name: string }[];
        const rawAreas: Record<string, unknown>[] = Array.isArray(areasJson)
          ? (areasJson as Record<string, unknown>[])
          : (areasJson?.success && Array.isArray((areasJson as { data: unknown[] }).data) ? (areasJson as { data: unknown[] }).data : []) as Record<string, unknown>[];
        const rawLevels = Array.isArray(levelsJson) ? levelsJson : (levelsJson?.success && Array.isArray((levelsJson as { data: unknown[] }).data) ? (levelsJson as { data: { al_level: number; al_name: string }[] }).data : []);
        const areas = rawAreas.map(normalizeArea);
        const levelToName = new Map<number, string>();
        for (const item of rawLevels) {
          const level = "al_level" in item ? item.al_level : (item as { level?: number }).level;
          const name = "al_name" in item ? item.al_name : (item as { name?: string }).name;
          if (level != null && name != null) levelToName.set(Number(level), String(name));
        }
        const tree = buildReferenceTree(areas, levelToName);
        referenceTreeCache.set(cacheKey, tree);
        referenceTreeRef.current = tree;
        setReferenceLevelOptions(tree.levelOptions);
        setRoots(tree.roots);
        tree.roots.forEach((n) => {
          idToLabelRef.current.set(n.id, n.label);
          if (n.type) idToTypeRef.current.set(n.id, n.type);
          if ("nid" in n && typeof (n as { nid?: number }).nid === "number") idToNidRef.current.set(n.id, (n as { nid: number }).nid);
        });
      } catch {
        setRoots([]);
      } finally {
        setLoadingRoots(false);
      }
      return;
    }
    const cached = areaRootsCache.get(baseUrl);
    if (cached !== undefined) {
      setRoots(cached);
      cached.forEach((n) => {
        idToLabelRef.current.set(n.id, n.label);
        if (n.type) idToTypeRef.current.set(n.id, n.type);
        if ("nid" in n && typeof (n as { nid?: number }).nid === "number") idToNidRef.current.set(n.id, (n as { nid: number }).nid);
      });
      setLoadingRoots(false);
      return;
    }
    setLoadingRoots(true);
    try {
      const url = buildUrl(baseUrl, { parent: "root" });
      const res = await fetch(url, { headers: referenceFetchHeaders(locale, headersProp) });
      const data = (await res.json()) as { id: string; label: string; type?: string; hasChildren?: boolean; nid?: number }[];
      const nodes = Array.isArray(data) ? data.map(toTreeNode) : [];
      areaRootsCache.set(baseUrl, nodes);
      setRoots(nodes);
      data.forEach((d) => {
        if (typeof d?.id === "string") {
          idToLabelRef.current.set(d.id, d.label ?? d.id);
          if (d.type) idToTypeRef.current.set(d.id, d.type);
          if (typeof d.nid === "number") idToNidRef.current.set(d.id, d.nid);
        }
      });
    } catch {
      setRoots([]);
    } finally {
      setLoadingRoots(false);
    }
  }, [baseUrl, locale, headersProp, fetchRootsProp, isReferenceMode]);

  useEffect(() => {
    fetchRoots();
  }, [fetchRoots]);

  const loadChildren = useCallback(
    async (parentId: string): Promise<TreeNode[]> => {
      if (loadChildrenProp) {
        const nodes = await loadChildrenProp(parentId);
        nodes.forEach((n) => {
          idToLabelRef.current.set(n.id, n.label);
          if (n.type) idToTypeRef.current.set(n.id, n.type);
          if ("nid" in n && typeof (n as { nid?: number }).nid === "number") idToNidRef.current.set(n.id, (n as { nid: number }).nid);
        });
        return nodes;
      }
      if (isReferenceMode && referenceTreeRef.current) {
        const nodes = referenceTreeRef.current.getChildren(parentId);
        nodes.forEach((n) => {
          idToLabelRef.current.set(n.id, n.label);
          if (n.type) idToTypeRef.current.set(n.id, n.type);
          if ("nid" in n && typeof (n as { nid?: number }).nid === "number") idToNidRef.current.set(n.id, (n as { nid: number }).nid);
        });
        return nodes;
      }
      const url = buildUrl(baseUrl, { parent: parentId });
      const res = await fetch(url, { headers: referenceFetchHeaders(locale, headersProp) });
      const data = (await res.json()) as { id: string; label: string; type?: string; hasChildren?: boolean; nid?: number }[];
      const nodes = Array.isArray(data) ? data.map(toTreeNode) : [];
      data.forEach((d) => {
        if (typeof d?.id === "string") {
          idToLabelRef.current.set(d.id, d.label ?? d.id);
          if (d.type) idToTypeRef.current.set(d.id, d.type);
          if (typeof d.nid === "number") idToNidRef.current.set(d.id, d.nid);
        }
      });
      return nodes;
    },
    [baseUrl, locale, headersProp, loadChildrenProp, isReferenceMode]
  );

  const fetchFlat = useCallback(async () => {
    if (fetchFlatProp) {
      setLoadingFlat(true);
      try {
        const nodes = await fetchFlatProp({
          level: filterLevel || undefined,
          search: searchQuery.trim() || undefined,
        });
        setFlatItems(nodes);
        nodes.forEach((n) => {
          idToLabelRef.current.set(n.id, n.label);
          if (n.type) idToTypeRef.current.set(n.id, n.type);
          if ("nid" in n && typeof (n as { nid?: number }).nid === "number") idToNidRef.current.set(n.id, (n as { nid: number }).nid);
        });
      } catch {
        setFlatItems([]);
      } finally {
        setLoadingFlat(false);
      }
      return;
    }
    if (isReferenceMode && referenceTreeRef.current) {
      setLoadingFlat(true);
      try {
        const nodes = referenceTreeRef.current.getFlat(
          filterLevel || undefined,
          searchQuery.trim() || undefined
        );
        setFlatItems(nodes);
        nodes.forEach((n) => {
          idToLabelRef.current.set(n.id, n.label);
          if (n.type) idToTypeRef.current.set(n.id, n.type);
          if ("nid" in n && typeof (n as { nid?: number }).nid === "number") idToNidRef.current.set(n.id, (n as { nid: number }).nid);
        });
      } catch {
        setFlatItems([]);
      } finally {
        setLoadingFlat(false);
      }
      return;
    }
    setLoadingFlat(true);
    try {
      const url = buildUrl(baseUrl, {
        parent: "root",
        level: filterLevel || undefined,
        search: searchQuery.trim() || undefined,
      });
      const res = await fetch(url, { headers: referenceFetchHeaders(locale, headersProp) });
      const data = (await res.json()) as { id: string; label: string; type?: string; hasChildren?: boolean; path?: string; nid?: number }[];
      const nodes = Array.isArray(data) ? data.map(toTreeNode) : [];
      setFlatItems(nodes);
      data.forEach((d) => {
        if (typeof d?.id === "string") {
          idToLabelRef.current.set(d.id, d.label ?? d.id);
          if (d.type) idToTypeRef.current.set(d.id, d.type);
          if (typeof d.nid === "number") idToNidRef.current.set(d.id, d.nid);
        }
      });
    } catch {
      setFlatItems([]);
    } finally {
      setLoadingFlat(false);
    }
  }, [baseUrl, locale, headersProp, filterLevel, searchQuery, fetchFlatProp, isReferenceMode]);

  useEffect(() => {
    if (!isTreeMode) {
      fetchFlat();
    } else {
      setFlatItems(null);
    }
  }, [isTreeMode, fetchFlat]);

  // Resolve initial selection so chip id/label matches list node (id or label) and checkbox shows checked
  const nodesForResolve = isTreeMode ? roots : (flatItems ?? []);
  const nodesForResolveRef = useRef(nodesForResolve);
  nodesForResolveRef.current = nodesForResolve;
  // In reference mode tree view, resolve against full flat list so child selections match (roots alone would miss them)
  const resolveNodes =
    isTreeMode && isReferenceMode && referenceTreeRef.current
      ? referenceTreeRef.current.getFlat()
      : nodesForResolve;
  const resolveNodesRef = useRef(resolveNodes);
  resolveNodesRef.current = resolveNodes;
  const nodesReadyKey = `${isTreeMode}:${resolveNodes.length}`;
  const initialSelectionKey = initialSelectedIds.length > 0
    ? initialSelectedIds.map(String).sort().join(",")
    : initialSelectedItems.map((i) => String(i.id)).sort().join(",");

  // Resolve initial selection only when initial props change (e.g. modal opened with selection).
  // Do NOT run when nodes/list change (e.g. user typing in search), so we never overwrite in-session selection.
  useEffect(() => {
    const nodes = resolveNodesRef.current;
    const rawIds =
      initialSelectedIds.length > 0
        ? initialSelectedIds.map(String)
        : initialSelectedItems.map((i) => String(i.id));
    if (nodes.length === 0) {
      initialSelectedItems.forEach((i) => {
        idToLabelRef.current.set(String(i.id), i.label);
        if (i.type) idToTypeRef.current.set(String(i.id), i.type);
      });
      if (rawIds.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(rawIds);
          if (prev.size !== next.size || [...prev].some((id) => !next.has(id))) return next;
          return prev;
        });
      }
      return;
    }
    const normalizedId = (s: string) => String(s).trim().toLowerCase();
    const resolved = rawIds.map((idStr) => {
      const initialItem = initialSelectedItems.find((i) => String(i.id) === idStr);
      let match = nodes.find((n) => String(n.id) === idStr);
      if (!match && initialItem?.label != null) {
        const wantLabel = initialItem.label.trim().toLowerCase();
        match = nodes.find(
          (n) => n.label?.trim().toLowerCase() === wantLabel
        );
      }
      if (!match && initialItem) {
        const wantId = normalizedId(idStr);
        match = nodes.find((n) => normalizedId(String(n.id)) === wantId);
      }
      return match ? String(match.id) : idStr;
    });
    if (resolved.length > 0) {
      setSelectedIds((prev) => {
        const next = new Set(resolved);
        if (prev.size !== next.size || [...prev].some((id) => !next.has(id))) return next;
        return prev;
      });
    }
    resolved.forEach((id) => {
      const node = nodes.find((n) => String(n.id) === id);
      const initialItem = initialSelectedItems.find((i) => String(i.id) === id);
      const src = node ?? initialItem;
      if (src) {
        idToLabelRef.current.set(id, src.label);
        if (src.type) idToTypeRef.current.set(id, src.type);
        if ("nid" in src && typeof (src as { nid?: number }).nid === "number") idToNidRef.current.set(id, (src as { nid: number }).nid);
        else if (initialItem?.nid != null) idToNidRef.current.set(id, initialItem.nid);
      }
    });
    initialSelectedItems.forEach((i) => {
      idToLabelRef.current.set(String(i.id), i.label);
      if (i.type) idToTypeRef.current.set(String(i.id), i.type);
      if (i.nid != null) idToNidRef.current.set(String(i.id), i.nid);
    });
  }, [initialSelectionKey]);

  // Keep label/type/nid refs in sync when nodes change (e.g. after search).
  useEffect(() => {
    const nodes = resolveNodesRef.current;
    nodes.forEach((n) => {
      if (typeof n?.id === "string") {
        const node = n as { label?: string; type?: string; nid?: number };
        idToLabelRef.current.set(n.id, node.label ?? n.id);
        if (node.type) idToTypeRef.current.set(n.id, node.type);
        if (typeof node.nid === "number") idToNidRef.current.set(n.id, node.nid);
      }
    });
  }, [nodesReadyKey]);

  // When nodes load or change (e.g. level switch): resolve current selection against the current node list
  // so checkboxes show (e.g. after roots load) and selection persists when switching level (match by id then label).
  useEffect(() => {
    const nodes = resolveNodesRef.current;
    const currentSelected = selectedIdsRef.current;
    if (nodes.length === 0) return;
    const normalizedId = (s: string) => String(s).trim().toLowerCase();
    const resolved = Array.from(currentSelected).map((idStr) => {
      let match = nodes.find((n) => String(n.id) === idStr);
      if (!match) {
        const wantLabel = idToLabelRef.current.get(idStr)?.trim().toLowerCase();
        if (wantLabel) match = nodes.find((n) => n.label?.trim().toLowerCase() === wantLabel);
      }
      if (!match) {
        const wantId = normalizedId(idStr);
        match = nodes.find((n) => normalizedId(String(n.id)) === wantId);
      }
      return match ? String(match.id) : idStr;
    });
    const nextSet = new Set(resolved);
    setSelectedIds((prev) => {
      if (prev.size !== nextSet.size || [...prev].some((id) => !nextSet.has(id))) return nextSet;
      return prev;
    });
    resolved.forEach((id) => {
      const node = nodes.find((n) => String(n.id) === id);
      if (node) {
        const n = node as { label?: string; type?: string; nid?: number };
        idToLabelRef.current.set(id, n.label ?? id);
        if (n.type) idToTypeRef.current.set(id, n.type);
        if (typeof n.nid === "number") idToNidRef.current.set(id, n.nid);
      }
    });
  }, [nodesReadyKey]);

  const getSelected = useCallback((): AreaItem[] => {
    if (showSelectedPanel) {
      return panelDraftItemsRef.current.map((it) => ({
        id: it.id,
        label: it.label ?? idToLabelRef.current.get(it.id) ?? it.id,
        type: it.type ?? idToTypeRef.current.get(it.id),
        ...(it.nid != null ? { nid: it.nid } : idToNidRef.current.has(it.id) ? { nid: idToNidRef.current.get(it.id)! } : {}),
      }));
    }
    return Array.from(selectedIds).map((id) => ({
      id,
      label: idToLabelRef.current.get(id) ?? id,
      type: idToTypeRef.current.get(id),
      ...(idToNidRef.current.has(id) ? { nid: idToNidRef.current.get(id)! } : {}),
    }));
  }, [selectedIds, showSelectedPanel]);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    treeRef.current?.clearData();
    onChange?.([]);
  }, [onChange]);

  const setSelectedIdsProp = useCallback(
    (ids: (string | number)[]) => {
      setSelectedIds(normalizeSelectedIds(ids));
    },
    [normalizeSelectedIds]
  );

  const handleSelectionChange = useCallback(
    (selected: TreeNode[]) => {
      const nextSelected = multiSelect ? selected : selected.slice(-1);
      setSelectedIds(new Set(nextSelected.map((s) => s.id)));
      const items: AreaItem[] = nextSelected.map((s) => ({
        id: s.id,
        label: s.label,
        type: s.type,
        ...(idToNidRef.current.has(s.id) ? { nid: idToNidRef.current.get(s.id)! } : {}),
      }));
      onChange?.(items);
    },
    [multiSelect, onChange]
  );

  const expandAll = useCallback(() => {
    treeRef.current?.expandAll();
  }, []);

  const collapseAll = useCallback(() => {
    treeRef.current?.collapseAll();
  }, []);

  const selectAll = useCallback(() => {
    treeRef.current?.selectAll();
  }, []);

  const deselectAll = useCallback(() => {
    treeRef.current?.deselectAll();
  }, []);

  const applyDraftAndClose = useCallback(() => {
    const draftItems = panelDraftItemsRef.current;
    const draftAsTree: TreeNode[] = draftItems.map((it) => ({
      id: it.id,
      label: it.label,
      type: it.type,
    }));
    handleSelectionChange(draftAsTree);
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

  const apiRef = useRef<AreaSelectApi>({
    getSelected,
    clear,
    setSelectedIds: setSelectedIdsProp,
    expandAll,
    collapseAll,
    selectAll,
    deselectAll,
  });
  apiRef.current.getSelected = getSelected;
  apiRef.current.clear = clear;
  apiRef.current.setSelectedIds = setSelectedIdsProp;
  apiRef.current.expandAll = expandAll;
  apiRef.current.collapseAll = collapseAll;
  apiRef.current.selectAll = selectAll;
  apiRef.current.deselectAll = deselectAll;

  useEffect(() => {
    onReady?.(apiRef.current);
  }, [onReady]);

  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selectedCount = showSelectedPanel ? panelDraftItems.length : selectedIds.size;
  const summaryInner =
    selectedCount === 0 ? (
      <>{strings.summaryNone}</>
    ) : (
      <>
        <span className="dtk-ar-count">{selectedCount}</span>
        {" "}{selectedCount === 1 ? "area" : "areas"} selected
      </>
    );

  const showTree = isTreeMode ? roots.length > 0 : false;
  const showFlat = !isTreeMode && (loadingFlat ? false : (flatItems?.length ?? 0) >= 0);

  return (
    <div className="dtk-ar-root">
      <div className="dtk-ar-stack">
        <div className="dtk-ar-controls">
          <label className="dtk-ar-label">{strings.filterByLevel}</label>
          <div className="dtk-ar-select-wrap">
            <select
              ref={selectRef}
              className="dtk-ar-select"
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              aria-label={strings.filterByLevel}
            >
              {levelOptionsResolved.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span
              className="dtk-ar-select-arrow-overlay"
              aria-hidden
              onClick={() => selectRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectRef.current?.click();
                }
              }}
            />
          </div>
          <div className="dtk-ar-search-wrap">
            <span className="dtk-ar-search-icon" aria-hidden />
            <input
              type="text"
              className="dtk-ar-search"
              placeholder={strings.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={strings.searchPlaceholder}
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                className="dtk-ar-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                title="Clear"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
        <div className="dtk-ar-content">
        <div className="dtk-ar-actions">
          {isTreeMode && (
            <>
              <button type="button" className="dtk-ar-action-link" onClick={expandAll}>
                {strings.expandAll}
              </button>
              <button type="button" className="dtk-ar-action-link" onClick={collapseAll}>
                {strings.collapseAll}
              </button>
            </>
          )}
          {multiSelect ? (
            <>
              <button type="button" className="dtk-ar-action-link" onClick={selectAll}>
                {strings.selectAll}
              </button>
              <button type="button" className="dtk-ar-action-link" onClick={deselectAll}>
                {strings.deselectAll}
              </button>
            </>
          ) : null}
        </div>
        <div className="dtk-ar-tree-wrap">
          {loadingRoots && isTreeMode ? (
            loadingComponent ? (
              <div className="dtk-ar-loading-slot">{loadingComponent}</div>
            ) : (
              <div className="dtk-ar-empty dtk-ar-loading">{strings.loadingLabel}</div>
            )
          ) : showTree ? (
            <TreeView
              ref={treeRef}
              roots={roots}
              loadChildren={loadChildren}
              multiSelect={multiSelect}
              selectedIds={selectedIdsArray}
              onSelectionChange={handleSelectionChange}
              childActionLabels={multiSelect ? treeChildActionLabels : undefined}
              showIdAfterLabel={true}
            />
          ) : showFlat ? (
            <TreeView
              ref={treeRef}
              roots={[]}
              flatItems={flatItems ?? []}
              multiSelect={multiSelect}
              selectedIds={selectedIdsArray}
              onSelectionChange={handleSelectionChange}
              showIdAfterLabel
            />
          ) : !isTreeMode && loadingFlat ? (
            loadingComponent ? (
              <div className="dtk-ar-loading-slot">{loadingComponent}</div>
            ) : (
              <div className="dtk-ar-empty dtk-ar-loading">{strings.loadingLabel}</div>
            )
          ) : (
            <div className="dtk-ar-empty">{strings.emptyLabel}</div>
          )}
        </div>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div
          className={`dtk-ar-summary${multiSelect && selectedCount > 0 ? " dtk-ar-summary-clickable" : ""}`}
          onClick={multiSelect && selectedCount > 0 ? handleSummaryClick : undefined}
          role={multiSelect && selectedCount > 0 ? "button" : undefined}
          tabIndex={multiSelect && selectedCount > 0 ? 0 : undefined}
          aria-label={multiSelect && selectedCount > 0 ? strings.summarySelectedPanelTitle : undefined}
          onKeyDown={multiSelect && selectedCount > 0 ? (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSummaryClick(); } } : undefined}
        >
          {summaryInner}
        </div>
        </div>
        {multiSelect && showSelectedPanel && (
          <div
            className={`dtk-ar-selected-panel ${panelAnimatedOpen ? "dtk-ar-selected-panel-is-open" : ""}`}
            role="dialog"
            aria-label={strings.summarySelectedPanelTitle}
          >
            <div className="dtk-ar-selected-panel-header">
              <span className="dtk-ar-selected-panel-title">{strings.summarySelectedPanelTitle}</span>
              <button
                type="button"
                className="dtk-ar-selected-panel-close"
                onClick={applyDraftAndClose}
                aria-label={strings.close}
                title={strings.close}
              >
                ×
              </button>
            </div>
            <div className="dtk-ar-selected-panel-list">
              {panelDraftItems.length === 0 ? (
                <div className="dtk-ar-empty">{strings.summaryNone}</div>
              ) : (
                <ListView
                  items={panelDraftItems as ListViewItem[]}
                  multiSelect={multiSelect}
                  selectedIds={panelDraftItems.map((i) => i.id)}
                  onSelectionChange={(selected) => {
                    const selectedIdSet = new Set(selected.map((s) => String(s.id)));
                    const filtered = panelDraftItemsRef.current.filter((item) => selectedIdSet.has(String(item.id)));
                    panelDraftItemsRef.current = filtered;
                    setPanelDraftItems(filtered);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
