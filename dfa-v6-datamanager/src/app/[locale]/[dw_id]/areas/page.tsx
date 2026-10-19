"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Drawer from "@/components/Drawer";
import { DeletePermanentConfirmModal } from "@/components/DeletePermanentConfirmModal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import {
  buildListRequestUrl,
  EditableDataGridThead,
  ServerDrivenListTbody,
  ServerDrivenTable,
  TV_ROW_NEWLY_ADDED_CLASS,
  useServerListQuery,
  type ServerListParseResult,
} from "@/components/TableView";
import { MainTabsBar } from "@/components/MainTabsBar";
import { textFieldClassName } from "@/components/TextField";
import { useCore } from "@/contexts/CoreContext";
import {
  useSidebar,
  type FileImportSubmitPayload,
} from "@/contexts/SidebarContext";
import { useDwCrudPermissions } from "@/hooks/useDwCrudPermissions";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import {
  deleteRequest,
  getFileResponse,
  getRequest,
  patchRequest,
  postRequest,
} from "@/lib/api/http";
import type {
  AreaLevelsMutationResult,
  AreasMutationResult,
  CreateAreaLevelPayload,
  CreateAreaPayload,
  ExportAreasParams,
  UpdateAreaLevelPayload,
  UpdateAreaPayload,
} from "@/lib/api/types";
import {
  getDWAPIURL,
  REFERENCE_PATH_AREAS,
  REFERENCE_PATH_AREA_LEVELS,
} from "@/lib/constants";
import { useAreaTableColumns } from "./areasGridColumns";
import type {
  AreaInlineDraft,
  AreaLevel,
  AreaLevelRaw,
  AreaNode,
  AreaRaw,
  AreasListMeta,
  AreaTableRow,
} from "./areasTableShared";
import { mapAreaLevelRaw, mapAreaRaw } from "./areasTableShared";
import {
  formatGridFooterTotalCount,
  parseListMetaTotals,
} from "@/lib/gridListMeta";

const initialAreaLevelsCache = new Map<string, AreaLevel[]>();
const initialAreaLevelsInFlight = new Map<string, Promise<AreaLevel[]>>();

async function createAreas(
  dwId: string,
  payload: CreateAreaPayload[]
): Promise<AreasMutationResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_AREAS);
  const data = payload.map((item) => ({
    ar_name: item.ar_name ?? item.area_name,
    ar_id: item.ar_id ?? item.area_id,
    ...(item.ar_parent_nid != null
      ? { ar_parent_nid: item.ar_parent_nid }
      : item.area_parent_nid != null
        ? { ar_parent_nid: item.area_parent_nid }
        : {}),
    ...(item.ar_short_name != null ? { ar_short_name: item.ar_short_name } : {}),
    ...(item.ar_block_nids != null
      ? { ar_block_nids: item.ar_block_nids }
      : item.block_nids != null
        ? { ar_block_nids: item.block_nids }
        : {}),
    ar_gid: item.ar_gid ?? "",
    ...(item.ar_is_global != null ? { ar_is_global: item.ar_is_global } : {}),
    ...(item.ar_latitude != null ? { ar_latitude: item.ar_latitude } : {}),
    ...(item.ar_longitude != null ? { ar_longitude: item.ar_longitude } : {}),
    ...(item.ar_lat_long_nid != null ? { ar_lat_long_nid: item.ar_lat_long_nid } : {}),
  }));
  const json = await postRequest(url, data, undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as AreasMutationResult;
}

async function updateArea(
  dwId: string,
  identifier: string,
  payload: UpdateAreaPayload
): Promise<AreasMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_AREAS)}/${encodeURIComponent(identifier)}`;
  const json = await patchRequest(
    url,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as AreasMutationResult;
}

async function deleteMultipleAreas(
  dwId: string,
  arGids: string[]
): Promise<AreasMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_AREAS)}/multiple-delete`;
  const json = await postRequest(
    url,
    { ar_gid: arGids },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as AreasMutationResult;
}

async function deleteArea(
  dwId: string,
  identifier: string
): Promise<AreasMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_AREAS)}/${encodeURIComponent(identifier)}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as AreasMutationResult;
  return json;
}

/**
 * GET /dw/{dw_id}/areas?export=true — returns XLSX.
 * Triggers a browser download. Call only in client components.
 */
async function downloadAreasExport(
  dwId: string,
  params: ExportAreasParams = {},
  messages: {
    requestFailed: string;
    exportFailed: string;
    unexpectedJsonResponse: string;
    unexpectedResponse: string;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set("export", "true");
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.level != null) searchParams.set("level", String(params.level));
  if (params.hierarchical != null) {
    searchParams.set("hierarchical", params.hierarchical ? "true" : "false");
  }

  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_AREAS)}?${searchParams.toString()}`;

  const res = await getFileResponse(url);

  const contentType = res.headers.get("Content-Type") ?? "";

  if (!res.ok) {
    if (contentType.includes("application/json")) {
      try {
        const json = (await res.json()) as {
          err_message?: string;
          message?: string;
        };
        return {
          ok: false,
          message:
            json.err_message ??
            json.message ??
            `${messages.requestFailed} (${res.status})`,
        };
      } catch {
        return {
          ok: false,
          message: `${messages.requestFailed} (${res.status})`,
        };
      }
    }
    return {
      ok: false,
      message: `${messages.exportFailed} (${res.status})`,
    };
  }

  if (contentType.includes("application/json")) {
    try {
      const json = (await res.json()) as { err_message?: string };
      return {
        ok: false,
        message: json.err_message ?? messages.unexpectedJsonResponse,
      };
    } catch {
      return { ok: false, message: messages.unexpectedResponse };
    }
  }

  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = "areas_export.xlsx";
  if (cd) {
    const quoted = cd.match(/filename="([^"]+)"/i);
    const unquoted = cd.match(/filename=([^;\s]+)/i);
    const raw = quoted?.[1] ?? unquoted?.[1];
    if (raw) filename = raw.replace(/^["']|["']$/g, "");
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);

  return { ok: true };
}

async function fetchAreaLevelsList(
  dwId: string,
  defaultErrorMessage: string,
  query?: Record<string, string | number | boolean | undefined | null>
): Promise<{
  success: boolean;
  data?: unknown[];
  meta?: Record<string, unknown>;
  err_message?: string;
}> {
  const base = getDWAPIURL(dwId, REFERENCE_PATH_AREA_LEVELS);
  const sp = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === "") continue;
      sp.set(k, String(v));
    }
  }
  const qs = sp.toString();
  const url = qs ? `${base}?${qs}` : base;

  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;

  if (json.success !== true) {
    return {
      success: false,
      err_message: (json.err_message as string | undefined) ?? defaultErrorMessage,
    };
  }

  return {
    success: true,
    data: json.data as unknown[],
    meta: json.meta as Record<string, unknown> | undefined,
  };
}

async function createAreaLevels(
  dwId: string,
  payload: CreateAreaLevelPayload[]
): Promise<AreaLevelsMutationResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_AREA_LEVELS);
  const json = await postRequest(url, payload, undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as AreaLevelsMutationResult;
}

async function updateAreaLevel(
  dwId: string,
  identifier: string,
  payload: UpdateAreaLevelPayload
): Promise<AreaLevelsMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_AREA_LEVELS)}/${encodeURIComponent(identifier)}`;
  const json = await patchRequest(
    url,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as AreaLevelsMutationResult;
}

async function deleteAreaLevel(
  dwId: string,
  identifier: string
): Promise<AreaLevelsMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_AREA_LEVELS)}/${encodeURIComponent(identifier)}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return json as AreaLevelsMutationResult;
  }
  return {
    success: true,
    ...(typeof json.message === "string" ? { message: json.message } : {}),
  } as AreaLevelsMutationResult;
}

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

const PAGE_SIZES = [25, 50, 100] as const;
const KEYBOARD_INPUT_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
].join(", ");

function isKeyboardInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(KEYBOARD_INPUT_SELECTOR) != null;
}

function buildRows(
  levels: AreaLevel[],
  nodes: AreaNode[],
  expandedIds: Set<string>,
  t: (key: string, fallback?: string) => string
): AreaTableRow[] {
  const levelById = new Map(levels.map((level) => [level.id, level] as const));
  const orderedLevels = [...levels].sort((a, b) => a.order - b.order);
  const nextLevelById = new Map<string, AreaLevel | null>();
  for (let i = 0; i < orderedLevels.length; i += 1) {
    nextLevelById.set(orderedLevels[i].id, orderedLevels[i + 1] ?? null);
  }

  const validNodes = nodes.filter((node) => levelById.has(node.levelId));
  const childrenByParent = new Map<string | null, AreaNode[]>();
  for (const node of validNodes) {
    const key = node.parentId;
    const list = childrenByParent.get(key) ?? [];
    list.push(node);
    childrenByParent.set(key, list);
  }

  const rows: AreaTableRow[] = [];

  const visit = (node: AreaNode, depth: number) => {
    const level = levelById.get(node.levelId);
    if (!level) return;
    const children = childrenByParent.get(node.id) ?? [];
    const nextLevel = nextLevelById.get(node.levelId) ?? null;
    const expanded = expandedIds.has(node.id);
    rows.push({
      rowId: node.id,
      kind: "node",
      node,
      level,
      depth,
      hasChildren: children.length > 0,
      expanded,
      canAddChild: Boolean(nextLevel),
      nextLevelName: nextLevel?.name ?? null,
    });
    if (!expanded) return;
    if (nextLevel) {
      rows.push({
        rowId: `add:${node.id}:${nextLevel.id}`,
        kind: "add",
        parentId: node.id,
        levelId: nextLevel.id,
        levelName: nextLevel.name,
        depth: depth + 1,
        label: `${t("ADD")} ${nextLevel.name}`,
      });
    }
    for (const child of children) {
      visit(child, depth + 1);
    }
  };

  const validNodeIds = new Set(validNodes.map((node) => node.id));
  const rootNodes = validNodes.filter(
    (node) => node.parentId == null || !validNodeIds.has(node.parentId)
  );
  const firstLevel = orderedLevels[0];
  if (firstLevel) {
    rows.push({
      rowId: `add:root:${firstLevel.id}`,
      kind: "add",
      parentId: null,
      levelId: firstLevel.id,
      levelName: firstLevel.name,
      depth: 0,
      label: `${t("ADD")} ${firstLevel.name}`,
    });
  }
  for (const root of rootNodes) {
    visit(root, 0);
  }
  return rows;
}

function buildFlatRowsForSelectedLevel(
  levels: AreaLevel[],
  nodes: AreaNode[],
  selectedLevelId: string
): AreaTableRow[] {
  const selectedLevel = levels.find((level) => level.id === selectedLevelId);
  if (!selectedLevel) return [];
  return nodes
    .filter((node) => node.levelId === selectedLevelId)
    .map((node) => ({
      rowId: node.id,
      kind: "node" as const,
      node,
      level: selectedLevel,
      depth: 0,
      hasChildren: false,
      expanded: false,
      canAddChild: false,
      nextLevelName: null,
    }));
}

function extractCreatedAreaFromMutation(data: unknown): {
  nid?: number;
  gid?: string;
  keyword?: string;
  name?: string;
  level?: number;
  parentNid?: number;
  latitude?: string;
  longitude?: string;
} | null {
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || typeof first !== "object") return null;
  const record = first as Record<string, unknown>;
  const nid = typeof record.ar_nid === "number" ? record.ar_nid : undefined;
  const gid = typeof record.ar_gid === "string" ? record.ar_gid : undefined;
  const keyword = typeof record.ar_id === "string" ? record.ar_id : undefined;
  const name = typeof record.ar_name === "string" ? record.ar_name : undefined;
  const level = typeof record.ar_level === "number" ? record.ar_level : undefined;
  const parentNid =
    typeof record.ar_parent_nid === "number" ? record.ar_parent_nid : undefined;
  const latitude =
    typeof record.ar_latitude === "number"
      ? String(record.ar_latitude)
      : typeof record.ar_latitude === "string"
        ? record.ar_latitude.trim()
        : undefined;
  const longitude =
    typeof record.ar_longitude === "number"
      ? String(record.ar_longitude)
      : typeof record.ar_longitude === "string"
        ? record.ar_longitude.trim()
        : undefined;
  return { nid, gid, keyword, name, level, parentNid, latitude, longitude };
}

const RECENT_CREATED_ROW_HIGHLIGHT_MS = 4500;

export default function AreasPage() {
  const {
    dwId,
    setBulkDelete,
    setToolbarExport,
    setToolbarImport,
    setFileImportSubmitHandler,
    setFileImportTemplateHandler,
  } = useSidebar();
  const { t } = useCore();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.template.areas);
  const { canCreate, canUpdate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.template.areas
  );

  const [levels, setLevels] = useState<AreaLevel[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);
  const [nameFilter, setNameFilter] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AreaInlineDraft | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [levelsDrawerOpen, setLevelsDrawerOpen] = useState(false);
  const [levelNameEdits, setLevelNameEdits] = useState<Record<string, string>>({});
  const [levelRenameSavingId, setLevelRenameSavingId] = useState<string | null>(null);
  const [newLevelName, setNewLevelName] = useState("");
  const [deleteLevelModalOpen, setDeleteLevelModalOpen] = useState(false);
  const [levelPendingDelete, setLevelPendingDelete] = useState<AreaLevel | null>(
    null
  );
  const [deleteLevelRunning, setDeleteLevelRunning] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [areasToDelete, setAreasToDelete] = useState<AreaNode[]>([]);
  const [treeNodes, setTreeNodes] = useState<AreaNode[]>([]);
  const [optimisticLevelRows, setOptimisticLevelRows] = useState<AreaNode[]>([]);
  const [optimisticLevelTotalCount, setOptimisticLevelTotalCount] = useState(0);
  const [optimisticLevelTotalCountUnfiltered, setOptimisticLevelTotalCountUnfiltered] =
    useState<number | undefined>(undefined);
  const [treeListTotalCount, setTreeListTotalCount] = useState(0);
  const [treeListTotalCountUnfiltered, setTreeListTotalCountUnfiltered] = useState<
    number | undefined
  >(undefined);
  const [optimisticLevelTotalPages, setOptimisticLevelTotalPages] = useState(1);
  const [treeLoadedParentIds, setTreeLoadedParentIds] = useState<Set<string>>(new Set());
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [recentCreatedRowIds, setRecentCreatedRowIds] = useState<string[]>([]);
  /** Flat level view: keep new area row directly under the add row until the warehouse changes. */
  const [pinnedAreaRowIds, setPinnedAreaRowIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentCreatedRowIds([]);
    setPinnedAreaRowIds([]);
  }, [dwId]);

  useEffect(() => {
    if (recentCreatedRowIds.length === 0) return;
    const snapshot = [...recentCreatedRowIds];
    const id = window.setTimeout(() => {
      setRecentCreatedRowIds((prev) =>
        prev.filter((k) => !snapshot.includes(k))
      );
    }, RECENT_CREATED_ROW_HIGHLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [recentCreatedRowIds]);

  const recentCreatedRowIdSet = useMemo(
    () => new Set(recentCreatedRowIds),
    [recentCreatedRowIds]
  );

  useEffect(() => {
    const onArrowNavigation = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement) {
        const isInputTarget =
          event.target.closest(
            "input, textarea, select, button, [contenteditable='true'], [role='textbox'], [role='combobox']"
          ) != null;
        if (isInputTarget) return;
      }
      setActiveRowId(null);
    };
    document.addEventListener("keydown", onArrowNavigation);
    return () => {
      document.removeEventListener("keydown", onArrowNavigation);
    };
  }, []);

  const levelsRef = useRef(levels);
  levelsRef.current = levels;
  const draftNameInputRef = useRef<HTMLInputElement>(null);
  const draftKeywordInputRef = useRef<HTMLInputElement>(null);
  const draftLatitudeInputRef = useRef<HTMLInputElement>(null);
  const draftLongitudeInputRef = useRef<HTMLInputElement>(null);
  const pendingDraftFocusFieldRef = useRef<
    "name" | "keyword" | "latitude" | "longitude" | null
  >(null);

  // ------------------------------------------------------------------
  // Fetch area-levels
  // ------------------------------------------------------------------
  const loadLevels = useCallback(async (options?: { force?: boolean }) => {
    if (!dwId) return;
    const force = options?.force === true;
    setLevelsLoading(true);
    try {
      if (force) {
        const result = await fetchAreaLevelsList(dwId, t("REQUEST_FAILED"));
        if (result.success && Array.isArray(result.data)) {
          const mapped = (result.data as AreaLevelRaw[]).map(mapAreaLevelRaw);
          mapped.sort((a, b) => a.order - b.order);
          initialAreaLevelsCache.set(dwId, mapped);
          setLevels(mapped);
        } else {
          toast.error(result.err_message ?? t("AREAS_LOAD_LEVELS_FAILED"));
        }
        return;
      }

      const cached = initialAreaLevelsCache.get(dwId);
      if (cached) {
        setLevels(cached);
        return;
      }

      let inflight = initialAreaLevelsInFlight.get(dwId);
      if (!inflight) {
        inflight = (async () => {
          const result = await fetchAreaLevelsList(dwId, t("REQUEST_FAILED"));
          if (result.success && Array.isArray(result.data)) {
            const mapped = (result.data as AreaLevelRaw[]).map(mapAreaLevelRaw);
            mapped.sort((a, b) => a.order - b.order);
            return mapped;
          }
          throw new Error(result.err_message ?? t("AREAS_LOAD_LEVELS_FAILED"));
        })();
        initialAreaLevelsInFlight.set(dwId, inflight);
      }

      const mapped = await inflight;
      initialAreaLevelsCache.set(dwId, mapped);
      setLevels(mapped);
    } catch (err) {
      toast.error(
        t(
          "AREAS_LOAD_LEVELS_FAILED",
          err instanceof Error ? err.message : t("AREAS_LOAD_LEVELS_FAILED")
        )
      );
    } finally {
      initialAreaLevelsInFlight.delete(dwId);
      setLevelsLoading(false);
    }
  }, [dwId, t]);

  useEffect(() => {
    void loadLevels();
  }, [loadLevels]);

  useEffect(() => {
    if (!levelsDrawerOpen) return;
    setLevelNameEdits((prev) => {
      const next: Record<string, string> = {};
      for (const l of levels) {
        next[l.id] = prev[l.id] ?? l.name;
      }
      return next;
    });
  }, [levelsDrawerOpen, levels]);

  // ------------------------------------------------------------------
  // Fetch areas (hierarchical=true for tree)
  // ------------------------------------------------------------------
  const areasListUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_AREAS) : ""),
    [dwId]
  );

  const parseAreasResponse = useCallback(
    (json: unknown): ServerListParseResult<AreaNode, AreasListMeta> => {
      const r = json as {
        success?: boolean;
        err_message?: string;
        data?: AreaRaw[];
        meta?: AreasListMeta;
      };
      if (!r || typeof r !== "object" || !r.success) {
        const msg =
          typeof r?.err_message === "string"
            ? r.err_message
            : t("AREAS_LOAD_FAILED");
        return { ok: false, message: msg };
      }

      const currentLevels = levelsRef.current;
      const levelNidToId = new Map<number, string>();
      for (const lvl of currentLevels) {
        levelNidToId.set(lvl.order, lvl.id);
      }

      const rows = (r.data ?? []).map((raw) => mapAreaRaw(raw, levelNidToId));
      const fallbackMeta = {
        total_count: rows.length,
        count: rows.length,
        page: 1,
        page_size: rows.length,
        total_pages: 1,
      };
      const meta = r.meta ?? fallbackMeta;
      const totals = parseListMetaTotals(meta);
      return {
        ok: true,
        rows,
        ...totals,
        meta,
      };
    },
    [t]
  );

  const loadAreasByQuery = useCallback(
    async (
      query: Record<string, string | number | boolean | undefined | null>
    ): Promise<ServerListParseResult<AreaNode, AreasListMeta>> => {
      if (!areasListUrl) return { ok: false, message: t("AREAS_URL_NOT_AVAILABLE") };
      const requestUrl = buildListRequestUrl(areasListUrl, query);
      try {
        const json = await getRequest(requestUrl, undefined, {
          suppressErrorMessage: true,
        });
        return parseAreasResponse(json);
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : t("AREAS_LOAD_FAILED"),
        };
      }
    },
    [areasListUrl, parseAreasResponse, t]
  );

  const treeSearchQuery = useMemo(() => {
    const name = nameFilter.trim();
    const keyword = keywordFilter.trim();
    if (name && keyword) return `${name} ${keyword}`;
    return name || keyword;
  }, [keywordFilter, nameFilter]);

  const areasQuery = useMemo(
    () => ({
      hierarchical: false,
      ...(selectedLevelId ? { page, page_size: pageSize } : {}),
      sort_order: "asc" as const,
      sort_field: "level" as const,
      ...(selectedLevelId
        ? (() => {
            const selectedLevel = levels.find((lvl) => lvl.id === selectedLevelId);
            return selectedLevel ? { level: selectedLevel.order } : {};
          })()
        : {}),
      ...(selectedLevelId && treeSearchQuery ? { search: treeSearchQuery } : {}),
    }),
    [levels, page, pageSize, selectedLevelId, treeSearchQuery]
  );

  const areasState = useServerListQuery<AreaNode, AreasListMeta>({
    listUrl: areasListUrl,
    query: areasQuery,
    parseListResponse: parseAreasResponse,
    enabled: Boolean(dwId && areasListUrl && !levelsLoading && selectedLevelId),
  });
  const { refetch: refetchAreas } = areasState;
  useEffect(() => {
    setOptimisticLevelRows(areasState.rows);
  }, [areasState.rows]);
  useEffect(() => {
    setOptimisticLevelTotalCount(areasState.totalCount);
    setOptimisticLevelTotalCountUnfiltered(areasState.totalCountUnfiltered);
  }, [areasState.totalCount, areasState.totalCountUnfiltered]);
  useEffect(() => {
    setOptimisticLevelTotalPages(areasState.totalPages || 1);
  }, [areasState.totalPages]);

  const loadRootAreas = useCallback(async () => {
    if (!dwId || !areasListUrl) return;
    setTreeLoading(true);
    setTreeError(null);
    setTreeLoadedParentIds(new Set());
    if (treeSearchQuery) {
      // While API-backed search is running, keep table in loading state
      // instead of showing stale/empty filtered rows.
      setTreeNodes([]);
    }
    try {
      const result = await loadAreasByQuery({
        hierarchical: false,
        ...(!treeSearchQuery ? { level: 1 } : {}),
        sort_order: "asc",
        sort_field: "level",
        ...(treeSearchQuery ? { search: treeSearchQuery } : {}),
      });
      if (!result.ok) {
        setTreeNodes([]);
        setTreeError(result.message);
        setTreeListTotalCount(0);
        setTreeListTotalCountUnfiltered(undefined);
        return;
      }
      setTreeNodes(result.rows);
      setTreeListTotalCount(result.totalCount);
      setTreeListTotalCountUnfiltered(result.totalCountUnfiltered);
      if (treeSearchQuery) {
        setExpandedIds(new Set());
      }
    } finally {
      setTreeLoading(false);
    }
  }, [areasListUrl, dwId, loadAreasByQuery, treeSearchQuery]);

  const fetchChildrenOnDemand = useCallback(
    async (parentNodeId: string) => {
      if (treeLoadedParentIds.has(parentNodeId)) return;
      const parent = treeNodes.find((n) => n.id === parentNodeId);
      if (!parent || !parent.gid) return;
      const result = await loadAreasByQuery({
        hierarchical: false,
        identifier: parent.gid,
        sort_order: "asc",
        sort_field: "level",
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setTreeNodes((prev) => {
        const byId = new Map(prev.map((node) => [node.id, node] as const));
        for (const row of result.rows) {
          byId.set(row.id, row);
        }
        return [...byId.values()];
      });
      setTreeLoadedParentIds((prev) => {
        const next = new Set(prev);
        next.add(parentNodeId);
        return next;
      });
    },
    [loadAreasByQuery, treeLoadedParentIds, treeNodes]
  );

  const refetchCurrentMode = useCallback(async () => {
    if (selectedLevelId) {
      await refetchAreas();
      return;
    }
    await loadRootAreas();
  }, [loadRootAreas, refetchAreas, selectedLevelId]);

  const areasFileImportSubmitHandler = useCallback(
    async ({ file }: FileImportSubmitPayload) => {
      if (!dwId || !file) return;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext !== "xlsx") {
        toast.error(t("AREAS_IMPORT_XLSX_ONLY"));
        throw new Error("areas-import-format");
      }
      const fd = new FormData();
      fd.append("file", file);
      const url = `${getDWAPIURL(dwId, REFERENCE_PATH_AREAS)}/import`;
      const json = (await postRequest(url, fd, undefined, undefined, {
        suppressErrorMessage: true,
      })) as {
        success?: boolean;
        message?: string;
        err_message?: string;
      };
      if (json.success !== true) {
        const err =
          typeof json.err_message === "string" && json.err_message.trim()
            ? json.err_message
            : typeof json.message === "string" && json.message.trim()
              ? json.message
              : t("AREAS_IMPORT_FAILED");
        toast.error(err);
        throw new Error("areas-import-failed");
      }
      toast.success(
        typeof json.message === "string" && json.message.trim()
          ? json.message
          : t("AREAS_IMPORT_SUCCESS")
      );
      await refetchCurrentMode();
    },
    [dwId, refetchCurrentMode, t]
  );

  const areasTemplateDownloadHandler = useCallback(() => {
    const a = document.createElement("a");
    a.href = "/template/areas_template.xlsx";
    a.download = "areas_template.xlsx";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  useEffect(() => {
    if (selectedLevelId || !dwId || levelsLoading) return;
    const timeoutId = window.setTimeout(() => {
      void loadRootAreas();
    }, 300);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [selectedLevelId, dwId, levelsLoading, loadRootAreas, treeSearchQuery]);

  const nodes = selectedLevelId ? optimisticLevelRows : treeNodes;

  useEffect(() => {
    if (!selectedLevelId) return;
    const stillExists = levels.some((level) => level.id === selectedLevelId);
    if (!stillExists) {
      setSelectedLevelId(null);
    }
  }, [levels, selectedLevelId]);

  useEffect(() => {
    setPage(1);
  }, [dwId, selectedLevelId]);

  // ------------------------------------------------------------------
  // Keep expanded/selected in sync with loaded nodes
  // ------------------------------------------------------------------
  useEffect(() => {
    const ids = new Set(nodes.map((n) => n.id));
    setExpandedIds((prev) => new Set([...prev].filter((id) => ids.has(id))));
    setSelectedRowIds((prev) => new Set([...prev].filter((id) => ids.has(id))));
  }, [nodes]);

  // ------------------------------------------------------------------
  // Build rows tree
  // ------------------------------------------------------------------
  const baseRows = useMemo(
    () =>
      selectedLevelId
        ? buildFlatRowsForSelectedLevel(levels, nodes, selectedLevelId)
        : buildRows(levels, nodes, expandedIds, t),
    [levels, nodes, expandedIds, selectedLevelId, t]
  );

  const hasColumnFilter = Boolean(
    nameFilter.trim() || keywordFilter.trim()
  );
  const filteredBaseRows = useMemo(() => {
    if (!selectedLevelId || !hasColumnFilter) return baseRows;
    const qName = nameFilter.trim().toLowerCase();
    const qKeyword = keywordFilter.trim().toLowerCase();
    return baseRows.filter((row) => {
      if (row.kind !== "node") return false;
      if (qName && !row.node.name.toLowerCase().includes(qName)) return false;
      if (qKeyword && !row.node.keyword.toLowerCase().includes(qKeyword)) return false;
      return true;
    });
  }, [baseRows, hasColumnFilter, nameFilter, keywordFilter, selectedLevelId]);

  const rows = useMemo(() => {
    if (
      !selectedLevelId ||
      pinnedAreaRowIds.length === 0
    ) {
      return filteredBaseRows;
    }
    const priority = new Map(pinnedAreaRowIds.map((id, i) => [id, i]));
    const head: AreaTableRow[] = [];
    const tail: AreaTableRow[] = [];
    for (const row of filteredBaseRows) {
      if (priority.has(row.rowId)) head.push(row);
      else tail.push(row);
    }
    head.sort(
      (a, b) =>
        (priority.get(a.rowId) ?? 0) - (priority.get(b.rowId) ?? 0)
    );
    return [...head, ...tail];
  }, [filteredBaseRows, pinnedAreaRowIds, selectedLevelId]);

  const levelCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const level of levels) counts.set(level.id, 0);
    for (const node of nodes) {
      counts.set(node.levelId, (counts.get(node.levelId) ?? 0) + 1);
    }
    return counts;
  }, [levels, nodes]);

  const visibleNodeRows = useMemo(
    () => rows.filter((row): row is Extract<AreaTableRow, { kind: "node" }> => row.kind === "node"),
    [rows]
  );

  const levelNodesBeforeClientFilter = useMemo(
    () =>
      selectedLevelId
        ? baseRows.filter(
            (row): row is Extract<AreaTableRow, { kind: "node" }> => row.kind === "node"
          ).length
        : 0,
    [baseRows, selectedLevelId]
  );

  const areasFooterFilteredCount = useMemo(() => {
    if (!selectedLevelId) {
      return treeSearchQuery ? treeListTotalCount : visibleNodeRows.length;
    }
    if (hasColumnFilter) return visibleNodeRows.length;
    return optimisticLevelTotalCount;
  }, [
    selectedLevelId,
    treeSearchQuery,
    treeListTotalCount,
    visibleNodeRows.length,
    hasColumnFilter,
    optimisticLevelTotalCount,
  ]);

  const areasFooterUnfilteredCount = useMemo(() => {
    if (!selectedLevelId) {
      return treeSearchQuery ? treeListTotalCountUnfiltered : undefined;
    }
    if (hasColumnFilter) {
      return optimisticLevelTotalCountUnfiltered ?? levelNodesBeforeClientFilter;
    }
    return optimisticLevelTotalCountUnfiltered;
  }, [
    selectedLevelId,
    treeSearchQuery,
    treeListTotalCountUnfiltered,
    hasColumnFilter,
    optimisticLevelTotalCountUnfiltered,
    levelNodesBeforeClientFilter,
  ]);

  // ------------------------------------------------------------------
  // Selection
  // ------------------------------------------------------------------
  const selectAll = () => {
    if (visibleNodeRows.length === 0) return;
    if (selectedRowIds.size === visibleNodeRows.length) {
      setSelectedRowIds(new Set());
      return;
    }
    setSelectedRowIds(new Set(visibleNodeRows.map((row) => row.rowId)));
  };

  const toggleSelect = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  // ------------------------------------------------------------------
  // Inline add / edit
  // ------------------------------------------------------------------
  const startAdd = (rowId: string) => {
    if (!canCreate) return;
    const addRow = baseRows.find(
      (row): row is Extract<AreaTableRow, { kind: "add" }> => row.kind === "add" && row.rowId === rowId
    );
    if (!addRow) return;
    pendingDraftFocusFieldRef.current = "name";
    setDraft({
      rowId: addRow.rowId,
      mode: "add",
      parentId: addRow.parentId,
      levelId: addRow.levelId,
      sourceNodeId: null,
      name: "",
      keyword: "",
      code: "",
      latitude: "",
      longitude: "",
    });
  };

  const startEdit = (
    rowId: string,
    focusField: "name" | "keyword" | "latitude" | "longitude" = "name"
  ) => {
    if (!canUpdate) return;
    const nodeRow = baseRows.find(
      (row): row is Extract<AreaTableRow, { kind: "node" }> =>
        row.kind === "node" && row.rowId === rowId
    );
    if (!nodeRow) return;
    pendingDraftFocusFieldRef.current = focusField;
    setActiveRowId(nodeRow.rowId);
    setDraft({
      rowId: nodeRow.rowId,
      mode: "edit",
      parentId: nodeRow.node.parentId,
      levelId: nodeRow.node.levelId,
      sourceNodeId: nodeRow.node.id,
      name: nodeRow.node.name,
      keyword: nodeRow.node.keyword,
      code: nodeRow.node.code,
      latitude: nodeRow.node.latitude,
      longitude: nodeRow.node.longitude,
    });
  };

  const cancelDraft = () => {
    pendingDraftFocusFieldRef.current = null;
    setDraft(null);
  };

  useLayoutEffect(() => {
    if (!draft) {
      pendingDraftFocusFieldRef.current = null;
      return;
    }
    const focusField = pendingDraftFocusFieldRef.current;
    pendingDraftFocusFieldRef.current = null;
    if (!focusField) return;
    const targetByField = {
      name: draftNameInputRef.current,
      keyword: draftKeywordInputRef.current,
      latitude: draftLatitudeInputRef.current,
      longitude: draftLongitudeInputRef.current,
    } as const;
    const target = targetByField[focusField];
    if (!target) return;
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      target.select();
    });
  }, [draft]);

  const patchNodeLocally = useCallback(
    (
      nodeId: string,
      patch: Pick<AreaNode, "name" | "keyword" | "latitude" | "longitude">
    ) => {
      if (selectedLevelId) return;
      setTreeNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)));
    },
    [selectedLevelId]
  );

  const removeNodesLocally = useCallback(
    (rootIds: Set<string>) => {
      if (selectedLevelId) return;
      const childIdsByParent = new Map<string, string[]>();
      for (const node of nodes) {
        if (!node.parentId) continue;
        const list = childIdsByParent.get(node.parentId) ?? [];
        list.push(node.id);
        childIdsByParent.set(node.parentId, list);
      }
      const toDelete = new Set(rootIds);
      const queue = [...rootIds];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;
        const childIds = childIdsByParent.get(current) ?? [];
        for (const childId of childIds) {
          if (toDelete.has(childId)) continue;
          toDelete.add(childId);
          queue.push(childId);
        }
      }

      setTreeNodes((prev) => prev.filter((node) => !toDelete.has(node.id)));
      setExpandedIds((prev) => new Set([...prev].filter((id) => !toDelete.has(id))));
      setSelectedRowIds((prev) => new Set([...prev].filter((id) => !toDelete.has(id))));
      setTreeLoadedParentIds((prev) => new Set([...prev].filter((id) => !toDelete.has(id))));
    },
    [nodes, selectedLevelId]
  );

  const saveDraft = async () => {
    if (!draft || !dwId) return;
    if (!draft.name.trim()) {
      toast.error(t("NAME_REQUIRED"));
      return;
    }
    if (!draft.keyword.trim()) {
      toast.error(t("AREAS_AREA_ID_REQUIRED"));
      return;
    }
    setSaveLoading(true);

    try {
      if (draft.mode === "add") {
        const parentNid = draft.parentId
          ? nodes.find((n) => n.id === draft.parentId)?.nid ?? -1
          : -1;
        const result = await createAreas(dwId, [
          {
            ar_name: draft.name.trim(),
            ar_id: draft.keyword.trim(),
            ar_parent_nid: parentNid,
            ar_gid: "",
            ...(draft.latitude.trim()
              ? { ar_latitude: parseFloat(draft.latitude.trim()) }
              : {}),
            ...(draft.longitude.trim()
              ? { ar_longitude: parseFloat(draft.longitude.trim()) }
              : {}),
          },
        ]);
        if (result.success) {
          toast.success(t("AREA_CREATED_SUCCESS"));
          setDraft(null);

          const expandPath = (targetParentId: string | null) => {
            if (!targetParentId) return;
            setExpandedIds((prev) => {
              const next = new Set(prev);
              let cursor: string | null = targetParentId;
              while (cursor) {
                next.add(cursor);
                cursor = nodes.find((n) => n.id === cursor)?.parentId ?? null;
              }
              return next;
            });
          };

          expandPath(draft.parentId);
          const created = extractCreatedAreaFromMutation(
            (result as { data?: unknown }).data
          );

          if (selectedLevelId) {
            await refetchAreas();
            if (created?.nid != null) {
              const rid = String(created.nid);
              setPage(1);
              setRecentCreatedRowIds([rid]);
              setPinnedAreaRowIds((prev) => [rid, ...prev.filter((x) => x !== rid)]);
              setActiveRowId(rid);
            }
          } else {
            const fallbackGid = created?.gid?.trim() || `TMP_GID_${Date.now()}`;
            const fallbackNid = created?.nid ?? -Date.now();
            const fallbackId = String(fallbackNid);

            const levelIdFromApi =
              created?.level != null
                ? levels.find((lvl) => lvl.order === created.level)?.id ?? draft.levelId
                : draft.levelId;

            const parentIdFromApi =
              created?.parentNid != null && created.parentNid > 0
                ? String(created.parentNid)
                : draft.parentId;

            const createdNode: AreaNode = {
              id: fallbackId,
              nid: fallbackNid,
              gid: fallbackGid,
              parentId: parentIdFromApi ?? null,
              levelId: levelIdFromApi,
              name: created?.name ?? draft.name.trim(),
              keyword: created?.keyword ?? draft.keyword.trim(),
              code: fallbackGid,
              latitude: created?.latitude ?? draft.latitude.trim(),
              longitude: created?.longitude ?? draft.longitude.trim(),
              hasData: false,
            };

            setTreeNodes((prev) => {
              const duplicateById = prev.some((n) => n.id === createdNode.id);
              const duplicateByGid = prev.some((n) => n.gid === createdNode.gid);
              if (duplicateById || duplicateByGid) {
                return prev.map((n) =>
                  n.id === createdNode.id || n.gid === createdNode.gid
                    ? { ...n, ...createdNode }
                    : n
                );
              }
              return [createdNode, ...prev];
            });
            setRecentCreatedRowIds([createdNode.id]);
            setActiveRowId(createdNode.id);

            if (draft.parentId) {
              setTreeLoadedParentIds((prev) => {
                const next = new Set(prev);
                next.add(draft.parentId!);
                return next;
              });
            }
          }
        } else {
          const msg =
            (result as { err_message?: string }).err_message ??
            t("AREAS_CREATE_FAILED");
          toast.error(msg);
        }
      } else {
        const sourceNode = nodes.find((n) => n.id === draft.sourceNodeId);
        if (!sourceNode) {
          toast.error(t("AREAS_SOURCE_NOT_FOUND"));
          setSaveLoading(false);
          return;
        }
        const result = await updateArea(dwId, String(sourceNode.nid), {
          ar_name: draft.name.trim(),
          ar_id: draft.keyword.trim(),
          ...(draft.latitude.trim()
            ? { ar_latitude: parseFloat(draft.latitude.trim()) }
            : {}),
          ...(draft.longitude.trim()
            ? { ar_longitude: parseFloat(draft.longitude.trim()) }
            : {}),
        });
        if (result.success) {
          const updated = extractCreatedAreaFromMutation(
            (result as { data?: unknown }).data
          );
          const nextName = updated?.name?.trim() || draft.name.trim();
          const nextKeyword = updated?.keyword?.trim() || draft.keyword.trim();
          const nextLatitude = updated?.latitude ?? draft.latitude.trim();
          const nextLongitude = updated?.longitude ?? draft.longitude.trim();

          if (selectedLevelId) {
            setOptimisticLevelRows((prev) =>
              prev.map((node) =>
                node.id === sourceNode.id
                  ? {
                      ...node,
                      name: nextName,
                      keyword: nextKeyword,
                      latitude: nextLatitude,
                      longitude: nextLongitude,
                    }
                  : node
              )
            );
          } else {
            patchNodeLocally(sourceNode.id, {
              name: nextName,
              keyword: nextKeyword,
              latitude: nextLatitude,
              longitude: nextLongitude,
            });
          }

          toast.success(t("AREAS_UPDATE_SUCCESS"));
          setDraft(null);
          if (selectedLevelId) {
            await refetchCurrentMode();
          }
          setActiveRowId(sourceNode.id);
        } else {
          const msg =
            (result as { err_message?: string }).err_message ??
            t("AREAS_UPDATE_FAILED");
          toast.error(msg);
        }
      }
    } catch (err) {
      const msg = t("ERROR_MESSAGE").replace(
        "{message}",
        err instanceof Error ? err.message : t("OPERATION_FAILED")
      );
      toast.error(msg);
    } finally {
      setSaveLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Delete selected areas
  // ------------------------------------------------------------------
  const openDeleteModal = useCallback(() => {
    if (selectedRowIds.size === 0) return;
    const selectedNodes = nodes.filter((n) => selectedRowIds.has(n.id));
    if (selectedNodes.length === 0) return;
    setAreasToDelete(selectedNodes);
    setDeleteModalOpen(true);
  }, [nodes, selectedRowIds]);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setAreasToDelete([]);
  }, []);

  const deleteSelected = useCallback(async () => {
    if (!dwId || areasToDelete.length === 0) return;

    setDeleteLoading(true);
    try {
      const failed: string[] = [];
      const deletedRootIds = new Set<string>();

      const gidRows = areasToDelete.filter((n) => Boolean(n.gid));
      const gids = gidRows
        .map((n) => n.gid)
        .filter((gid): gid is string => Boolean(gid));
      const nidOnlyRows = areasToDelete.filter((n) => !n.gid);

      if (gids.length > 0) {
        const result = await deleteMultipleAreas(dwId, gids);
        if (result.success) {
          for (const row of gidRows) {
            deletedRootIds.add(row.id);
          }
        } else {
          failed.push(
            (result as { err_message?: string }).err_message ??
              t("AREAS_DELETE_FAILED")
          );
        }
      }

      for (const row of nidOnlyRows) {
        const result = await deleteArea(dwId, String(row.nid));
        if (result.success) {
          deletedRootIds.add(row.id);
        } else {
          failed.push(
            `${row.name}: ${
              (result as { err_message?: string }).err_message ??
              t("AREAS_DELETE_FAILED")
            }`
          );
        }
      }

      if (deletedRootIds.size > 0) {
        if (selectedLevelId) {
          setOptimisticLevelRows((prev) =>
            prev.filter((node) => !deletedRootIds.has(node.id))
          );
          setOptimisticLevelTotalCount((prev) => {
            const nextCount = Math.max(0, prev - deletedRootIds.size);
            const nextPages = Math.max(1, Math.ceil(nextCount / pageSize));
            setOptimisticLevelTotalPages(nextPages);
            setPage((current) => Math.min(current, nextPages));
            return nextCount;
          });
        } else {
          removeNodesLocally(deletedRootIds);
        }
        setSelectedRowIds((prev) => {
          const next = new Set(prev);
          for (const id of deletedRootIds) next.delete(id);
          return next;
        });
        setAreasToDelete((prev) =>
          prev.filter((row) => !deletedRootIds.has(row.id))
        );
        toast.success(
          t("AREAS_DELETE_SUCCESS").replace(
            "{count}",
            String(deletedRootIds.size)
          )
        );
      }
      if (failed.length === 0) {
        closeDeleteModal();
      } else {
        toast.error(failed.join("\n"));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("AREAS_DELETE_FAILED")
      );
    } finally {
      setDeleteLoading(false);
    }
  }, [dwId, areasToDelete, t, selectedLevelId, pageSize, removeNodesLocally, closeDeleteModal]);

  // Wire top toolbar Delete button (next to Import/Export).
  useEffect(() => {
    setBulkDelete({
      disabled: selectedRowIds.size === 0 || deleteLoading || !canDelete,
      onClick: () => {
        openDeleteModal();
      },
    });
    return () => setBulkDelete(null);
  }, [selectedRowIds, deleteLoading, openDeleteModal, setBulkDelete, canDelete]);

  const exportBusyRef = useRef(false);
  useEffect(() => {
    const selectedLevel = selectedLevelId
      ? levels.find((level) => level.id === selectedLevelId)
      : null;
    setToolbarExport({
      onClick: async () => {
        if (!dwId || exportBusyRef.current) return;
        exportBusyRef.current = true;
        try {
          const result = await downloadAreasExport(dwId, {
            sort_order: "asc",
            sort_field: "level",
            hierarchical: false,
            ...(selectedLevel ? { level: selectedLevel.order } : {}),
          }, {
            requestFailed: t("REQUEST_FAILED"),
            exportFailed: t("EXPORT_FAILED"),
            unexpectedJsonResponse: t("UNEXPECTED_JSON_RESPONSE"),
            unexpectedResponse: t("UNEXPECTED_RESPONSE"),
          });
          if (!result.ok) {
            toast.error(result.message);
          } else {
            toast.success(t("AREAS_EXPORT_SUCCESS"));
          }
        } catch (e) {
          toast.error(
            t("ERROR_MESSAGE").replace(
              "{message}",
              e instanceof Error ? e.message : t("EXPORT_FAILED")
            )
          );
        } finally {
          exportBusyRef.current = false;
        }
      },
      disabled: !dwId,
    });
    return () => setToolbarExport(null);
  }, [dwId, levels, selectedLevelId, setToolbarExport, t]);

  useEffect(() => {
    setToolbarImport({
      onClick: () => {},
      disabled: !dwId || !canCreate,
    });
    return () => setToolbarImport(null);
  }, [dwId, canCreate, setToolbarImport]);

  useEffect(() => {
    setFileImportSubmitHandler(areasFileImportSubmitHandler);
    return () => setFileImportSubmitHandler(null);
  }, [areasFileImportSubmitHandler, setFileImportSubmitHandler]);

  useEffect(() => {
    setFileImportTemplateHandler(areasTemplateDownloadHandler);
    return () => setFileImportTemplateHandler(null);
  }, [areasTemplateDownloadHandler, setFileImportTemplateHandler]);

  // ------------------------------------------------------------------
  // Expand / collapse
  // ------------------------------------------------------------------
  const toggleExpand = (nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else {
        next.add(nodeId);
        if (!selectedLevelId) {
          void fetchChildrenOnDemand(nodeId);
        }
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(nodes.map((n) => n.id)));
    for (const node of nodes) {
      void fetchChildrenOnDemand(node.id);
    }
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // ------------------------------------------------------------------
  // Area-level management (drawer)
  // ------------------------------------------------------------------
  const openDeleteLevelModal = (levelId: string) => {
    if (!canDelete) return;
    const level = levels.find((l) => l.id === levelId);
    if (!level) return;
    setLevelPendingDelete(level);
    setDeleteLevelModalOpen(true);
  };

  const closeDeleteLevelModal = () => {
    if (deleteLevelRunning) return;
    setDeleteLevelModalOpen(false);
    setLevelPendingDelete(null);
  };

  const confirmDeleteLevel = async () => {
    if (!dwId || !levelPendingDelete) return;
    const level = levelPendingDelete;
    setDeleteLevelRunning(true);
    try {
      const result = await deleteAreaLevel(dwId, String(level.nid));
      if (result.success) {
        toast.success(t("LEVEL_DELETE_SUCCESS").replace("{name}", level.name));
        setDeleteLevelModalOpen(false);
        setLevelPendingDelete(null);
        await loadLevels({ force: true });
        await refetchCurrentMode();
      } else {
        toast.error(
          (result as { err_message?: string }).err_message ??
            t("LEVEL_DELETE_FAILED")
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("LEVEL_DELETE_FAILED")
      );
    } finally {
      setDeleteLevelRunning(false);
    }
  };

  const handleAddLevel = async () => {
    if (!canCreate) return;
    const name = newLevelName.trim();
    if (!name || !dwId) return;
    const nextOrder = levels.length > 0 ? Math.max(...levels.map((l) => l.order)) + 1 : 1;
    try {
      const result = await createAreaLevels(dwId, [
        { al_level: nextOrder, al_name: name },
      ]);
      if (result.success) {
        toast.success(
          t("LEVEL_CREATE_SUCCESS").replace("{name}", name)
        );
        setNewLevelName("");
        await loadLevels({ force: true });
      } else {
        toast.error(
          (result as { err_message?: string }).err_message ??
            t("LEVEL_CREATE_FAILED")
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("LEVEL_CREATE_FAILED")
      );
    }
  };

  const commitLevelNameRename = async (levelId: string) => {
    if (!canUpdate) return;
    if (!dwId) return;
    const level = levels.find((l) => l.id === levelId);
    if (!level) return;
    const raw = levelNameEdits[levelId] ?? level.name;
    const trimmed = raw.trim();
    if (trimmed === level.name) return;
    if (!trimmed) {
      toast.error(t("LEVEL_RENAME_EMPTY"));
      setLevelNameEdits((p) => ({ ...p, [levelId]: level.name }));
      return;
    }
    setLevelRenameSavingId(levelId);
    try {
      const result = await updateAreaLevel(dwId, String(level.nid), {
        al_level: level.order,
        al_name: trimmed,
      });
      if (result.success) {
        toast.success(t("LEVEL_RENAME_SUCCESS").replace("{name}", trimmed));
        setLevels((prev) => {
          const next = prev.map((l) =>
            l.id === levelId ? { ...l, name: trimmed } : l
          );
          initialAreaLevelsCache.set(dwId, next);
          return next;
        });
      } else {
        toast.error(
          (result as { err_message?: string }).err_message ??
            t("LEVEL_RENAME_FAILED")
        );
        setLevelNameEdits((p) => ({ ...p, [levelId]: level.name }));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("LEVEL_RENAME_FAILED")
      );
      setLevelNameEdits((p) => ({ ...p, [levelId]: level.name }));
    } finally {
      setLevelRenameSavingId(null);
    }
  };

  // ------------------------------------------------------------------
  // Columns
  // ------------------------------------------------------------------
  const columns = useAreaTableColumns({
    rowsLength: visibleNodeRows.length,
    selectedRowIds,
    selectAll,
    toggleSelect,
    nameFilter,
    setNameFilter,
    keywordFilter,
    setKeywordFilter,
    draft,
    setDraft,
    saveLoading,
    onStartAdd: startAdd,
    onStartEdit: startEdit,
    onToggleExpand: toggleExpand,
    onSaveDraft: saveDraft,
    onCancelDraft: cancelDraft,
    draftNameInputRef,
    draftKeywordInputRef,
    draftLatitudeInputRef,
    draftLongitudeInputRef,
    showTreeHierarchyControls: !selectedLevelId,
  });

  // ------------------------------------------------------------------
  // Table list state (pass areasState through for loading/error)
  // ------------------------------------------------------------------
  const listState = useMemo(
    () => ({
      rows,
      meta: selectedLevelId ? areasState.meta : null,
      totalCount: selectedLevelId ? optimisticLevelTotalCount : visibleNodeRows.length,
      totalPages: selectedLevelId ? optimisticLevelTotalPages : 1,
      loading: selectedLevelId ? areasState.loading || levelsLoading : treeLoading || levelsLoading,
      error: selectedLevelId ? areasState.error : treeError,
      refetch: refetchCurrentMode,
    }),
    [
      areasState.error,
      areasState.loading,
      areasState.meta,
      levelsLoading,
      optimisticLevelTotalCount,
      optimisticLevelTotalPages,
      refetchCurrentMode,
      rows,
      selectedLevelId,
      treeError,
      treeLoading,
      visibleNodeRows.length,
    ]
  );

  const areaLevelTab = selectedLevelId ?? "all";

  const areaLevelTabs = useMemo(
    () => [
      { value: "all" as const, label: t("ALL") },
      ...levels.map((level) => ({ value: level.id, label: level.name })),
    ],
    [levels, t]
  );

  if (!allowed) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <div className="page-subtabs-row">
        <MainTabsBar
          tabs={areaLevelTabs}
          activeValue={areaLevelTab}
          onSelect={(value) =>
            setSelectedLevelId(value === "all" ? null : value)
          }
          tablistAccessibility={{ ariaLabel: t("AREA_LEVEL") }}
        />
        <button
          type="button"
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border p-1 transition hover:bg-primary-soft hover:text-primary ${levelsDrawerOpen ? "bg-primary-soft text-primary" : "text-text-muted"}`}
          onClick={() => setLevelsDrawerOpen(true)}
          title={t("MANAGE_LEVELS")}
          aria-label={t("MANAGE_LEVELS")}
        >
          <span className="material-symbols-outlined !text-sm" aria-hidden>
            graph_2
          </span>
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden px-0">
        <ServerDrivenTable<AreaTableRow, AreasListMeta>
          listState={listState}
          columns={columns}
          selection={{
            count: selectedRowIds.size,
            onClear: () => setSelectedRowIds(new Set()),
          }}
          wrapClassName="tbl-wrap h-full bg-surface"
          renderThead={() => (
            <thead>
              <EditableDataGridThead columns={columns} />
            </thead>
          )}
          tbody={
            <ServerDrivenListTbody<AreaTableRow>
              colSpan={columns.length}
              rows={rows}
              columns={columns}
              getRowId={(row) => row.rowId}
              activeRowId={activeRowId}
              editingRowId={draft?.rowId ?? null}
              emptyMessage={t("AREAS_EMPTY")}
              showLoadingRow={false}
              showEmptyRow={!listState.loading && rows.length === 0}
              showDataRows={!listState.loading}
              onDataRowEnterAtEnd={({ mode }) => {
                if (mode === "edit") {
                  void saveDraft();
                }
              }}
              onDataRowEscape={({ mode }) => {
                if (mode === "edit") {
                  cancelDraft();
                }
              }}
              onDeleteKeyToggleRowSelection={(rowId) => {
                const r = rows.find((x) => x.rowId === rowId);
                if (!r || r.kind !== "node") return;
                toggleSelect(rowId);
              }}
              trProps={(row) => ({
                onKeyDown: (event) => {
                  if (event.defaultPrevented || isKeyboardInputTarget(event.target)) {
                    return;
                  }
                  if (row.kind !== "node") return;

                  if (event.key === "ArrowRight") {
                    if (!row.expanded && (row.hasChildren || row.canAddChild)) {
                      event.preventDefault();
                      toggleExpand(row.node.id);
                    }
                  } else if (event.key === "ArrowLeft") {
                    if (row.expanded) {
                      event.preventDefault();
                      toggleExpand(row.node.id);
                    }
                  }
                },
              })}
              getRowClassName={(row) => {
                if (row.kind === "add") {
                  const base = "add-row bg-surface";
                  return draft?.rowId === row.rowId
                    ? base
                    : `${base} hover:bg-surface-muted`;
                }
                return [
                  selectedRowIds.has(row.rowId)
                    ? "bg-primary-soft"
                    : "hover:bg-slate-50",
                  recentCreatedRowIdSet.has(row.rowId)
                    ? TV_ROW_NEWLY_ADDED_CLASS
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ");
              }}
            />
          }
          pagination={{
            page,
            displayPage: areasState.meta?.page ?? page,
            totalPages: optimisticLevelTotalPages,
            totalCount: areasFooterFilteredCount,
            totalCountUnfiltered: areasFooterUnfilteredCount,
            pageSize,
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
            countNoun: "areas",
            showPageSizeSelect: Boolean(selectedLevelId),
            showPaginationControls: Boolean(selectedLevelId),
            pageSummaryClassName: "mx-1",
            labels: { t, rowsPerPage: t("SHOW") },
            renderCount: () =>
              !selectedLevelId && !treeSearchQuery ? (
                <span>
                  {t("AREAS_SHOWING_COUNT")
                    .replace("{visible}", String(visibleNodeRows.length))
                    .replace("{total}", String(nodes.length))}
                </span>
              ) : (
                <span id="footer-count">
                  {formatGridFooterTotalCount(
                    areasFooterFilteredCount,
                    areasFooterUnfilteredCount,
                    t,
                    "AREAS_FOOTER_OF_TOTAL",
                    "AREAS_FOOTER_MATCHING"
                  )}
                </span>
              ),
          }}
        />
      </div>

      <Drawer
        open={levelsDrawerOpen}
        onClose={() => setLevelsDrawerOpen(false)}
        width="32%"
        title={t("MANAGE_LEVELS")}
      >
        <div className="space-y-2">
          {levels.map((level, index) => (
            <div
              key={level.id}
              className="flex min-w-0 items-center justify-between gap-2 rounded border border-border bg-surface px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded bg-primary-soft px-1 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <input
                  type="text"
                  className={textFieldClassName("md", "min-w-0 flex-1 text-sm")}
                  value={levelNameEdits[level.id] ?? level.name}
                  onChange={(e) =>
                    setLevelNameEdits((p) => ({ ...p, [level.id]: e.target.value }))
                  }
                  onBlur={() => void commitLevelNameRename(level.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  disabled={levelRenameSavingId === level.id || !canUpdate}
                  title={!canUpdate ? t("NO_PERMISSION_UPDATE") : undefined}
                  aria-label={t("COLUMN_NAME")}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                  {t("N_AREAS", "{count} areas").replace(
                    "{count}",
                    String(levelCountMap.get(level.id) ?? 0)
                  )}
                </span>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-text-muted hover:border-error hover:bg-[color:var(--color-error-hover-bg)] hover:text-error disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-transparent disabled:hover:text-text-muted"
                  disabled={!canDelete}
                  onClick={() => openDeleteLevelModal(level.id)}
                  title={
                    !canDelete
                      ? t("NO_PERMISSION_DELETE")
                      : t("LEVEL_DELETE_TOOLTIP").replace("{name}", level.name)
                  }
                >
                  <Mi name="delete" className="!text-sm" />
                </button>
              </div>
            </div>
          ))}
          <div className="add-row-prompt-shell mt-3 bg-[color:color-mix(in_srgb,var(--color-primary)_6%,var(--color-surface))] p-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-surface-muted px-1 text-xs font-bold text-text-muted">
                {levels.length + 1}
              </span>
              <input
                type="text"
                className="h-8 flex-1 rounded border border-slate-200 bg-white px-2 text-sm outline-none focus:border-primary"
                placeholder={t("ADD_LEVEL_PLACEHOLDER")}
                value={newLevelName}
                onChange={(e) => setNewLevelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddLevel();
                }}
                disabled={!canCreate}
                title={!canCreate ? t("NO_PERMISSION_CREATE") : undefined}
              />
              <PrimaryButton
                type="button"
                disabled={!canCreate}
                title={!canCreate ? t("NO_PERMISSION_CREATE") : undefined}
                onClick={() => void handleAddLevel()}
              >
                {t("ADD")}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </Drawer>

      <DeletePermanentConfirmModal
        open={deleteModalOpen}
        onClose={closeDeleteModal}
        title={t("DELETE")}
        titleId="dm-areas-delete-title"
        dismissDisabled={deleteLoading}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={closeDeleteModal}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmDisabled={areasToDelete.length === 0}
        confirmLoading={deleteLoading}
        onConfirm={deleteSelected}
      >
        <p className="modal-lead">
          {t("AREAS_DELETE_MODAL_LEAD").replace(
            "{count}",
            String(areasToDelete.length)
          )}
        </p>
        <ul className="modal-list">
          {areasToDelete.map((area) => (
            <li key={area.id}>
              <span className="modal-list-name">{area.name}</span>
              {area.gid ? (
                <span className="modal-list-meta">{area.gid}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </DeletePermanentConfirmModal>

      <DeletePermanentConfirmModal
        open={deleteLevelModalOpen && !!levelPendingDelete}
        onClose={closeDeleteLevelModal}
        title={t("LEVEL_DELETE_MODAL_TITLE")}
        titleId="dm-areas-delete-level-title"
        dismissDisabled={deleteLevelRunning}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={closeDeleteLevelModal}
        confirmLabel={t("DELETE")}
        confirmLoadingLabel={t("DELETING")}
        confirmLoading={deleteLevelRunning}
        onConfirm={confirmDeleteLevel}
      >
        <p className="modal-lead">{t("LEVEL_DELETE_CASCADE_WARNING")}</p>
      </DeletePermanentConfirmModal>
    </div>
  );
}
