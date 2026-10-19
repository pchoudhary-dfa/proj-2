"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useDwCrudPermissions } from "@/hooks/useDwCrudPermissions";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import {
  deleteRequest,
  getRequest,
  patchRequest,
  postRequest,
} from "@/lib/api/http";
import type {
  CreateSourcePayload,
  DeleteSourceResult,
  SourceAssociationCountsData,
  SourceAssociationCountsResult,
  SourceRaw,
  SourcesListMeta,
  SourcesListResponse,
  SourcesListResult,
  UpdateSourcePayload,
} from "@/lib/api/types";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import {
  getDWAPIURL,
  REFERENCE_PATH_SOURCES,
} from "@/lib/constants";
import {
  EditableDataGridThead,
  ServerDrivenListTbody,
  ServerDrivenTable,
  TV_ROW_NEWLY_ADDED_CLASS,
  useServerListQuery,
  type ServerDrivenListAddRowField,
  type ServerListParseResult,
} from "@/components/TableView";
import { MainTabsBar } from "@/components/MainTabsBar";
import {
  dataIusAssociationImpactLines,
  DeletePermanentConfirmModal,
} from "@/components/DeletePermanentConfirmModal";
import { gridTextFieldClassName } from "@/components/TextField";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import {
  sourceRowId,
  useSourcesGridColumns,
  type SourceInlineFocusField,
} from "./sourcesGridColumns";

// Must match ALLOWED_SORT_FIELDS in the backend router src_name, src_short_name, src_publisher, src_title, src_year
// Values sent as sort_field — must match backend ALLOWED_SORT_FIELDS
const SORT_SRC_NAME = "ic_name";
const SORT_SRC_PUBLISHER = "publisher";
const SORT_SRC_TITLE = "title";
const SORT_SRC_YEAR = "diyear";
const SORT_SRC_SHORT_NAME = "ic_short_name";

// Values sent as search_by — must match SOURCE_SEARCH_BY_FIELDS on the API
const SEARCH_KEY_NAME = "src_name";
const SEARCH_KEY_PUBLISHER = "src_publisher";
const SEARCH_KEY_TITLE = "src_title";
const SEARCH_KEY_YEAR = "src_year";
const SEARCH_KEY_SHORT_NAME = "src_short_name";

type SourceTabId = "all" | "missing_data";

type SourcesSortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

function cycleSourcesSort(columnId: string, prev: SourcesSortState): SourcesSortState {
  if (prev.columnId !== columnId) return { columnId, direction: "asc" };
  if (prev.direction === "asc") return { columnId, direction: "desc" };
  if (prev.direction === "desc") return { columnId: null, direction: null };
  return { columnId, direction: "asc" };
}

function sourcesSortIcon(
  columnId: string,
  state: SourcesSortState
): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (state.columnId === columnId && state.direction === "asc") return "arrow_upward";
  if (state.columnId === columnId && state.direction === "desc") return "arrow_downward";
  return "unfold_more";
}

const SORT_COLUMN_TO_FIELD: Record<string, string> = {
  src_name: SORT_SRC_NAME,
  publisher: SORT_SRC_PUBLISHER,
  title: SORT_SRC_TITLE,
  year: SORT_SRC_YEAR,
  short_name: SORT_SRC_SHORT_NAME,
};

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

/** Mirrors backend `_build_ic_name` in services/source.py exactly. */
function buildSrcName(publisher: string, title: string, year: string): string {
  const pub = (publisher || "").trim() || "GLOBAL";
  const tit = (title || "").trim();
  if (!tit) return pub;
  const yr = (year || "").trim();
  if (yr) return `${pub}_${tit}_${yr}`;
  return `${pub}_${tit}`;
}

function normalizeSourceRaw(raw: Record<string, unknown>): SourceRaw {
  const nidRaw = raw.src_nid ?? raw.ic_nid;
  let src_nid: number | undefined;
  if (typeof nidRaw === "number" && Number.isFinite(nidRaw)) src_nid = nidRaw;
  else if (typeof nidRaw === "string" && nidRaw.trim() !== "") {
    const n = Number(nidRaw);
    if (!Number.isNaN(n)) src_nid = n;
  }

  return {
    ...raw,
    src_nid,
    src_gid: (raw.src_gid ?? raw.ic_gid ?? null) as string | null,
    src_name: (raw.src_name ?? raw.ic_name ?? null) as string | null,
    src_short_name: (raw.src_short_name ?? raw.ic_short_name ?? null) as string | null,
    src_publisher: (raw.src_publisher ?? raw.publisher ?? null) as string | null,
    src_title: (raw.src_title ?? raw.title ?? null) as string | null,
    src_year: (raw.src_year ?? raw.diyear ?? null) as string | null,
  };
}

function isSourcesListResponse(
  r: SourcesListResult
): r is SourcesListResponse {
  return r.success === true && Array.isArray((r as SourcesListResponse).data);
}

function getSourcePatchIdentifier(row: SourceRaw): string | null {
  if (row.src_nid != null) return String(row.src_nid);
  const gid = (row.src_gid ?? "").trim();
  if (gid) return gid;
  return null;
}

async function createSource(
  dwId: string,
  data: CreateSourcePayload
): Promise<
  | { success: true; data?: Record<string, unknown>; message?: string }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_SOURCES);
  const json = await postRequest(url, data as unknown as Record<string, unknown>, undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as
    | { success: true; data?: Record<string, unknown>; message?: string }
    | { success: false; err_message?: string; errors?: Record<string, unknown> };
}

async function updateSource(
  dwId: string,
  identifier: string,
  payload: UpdateSourcePayload
): Promise<
  | { success: true; data?: Record<string, unknown> }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SOURCES)}/${encodeURIComponent(identifier)}`;
  const body: Record<string, unknown> = {};
  if (payload.src_publisher != null) body.src_publisher = payload.src_publisher;
  if (payload.src_title != null) body.src_title = payload.src_title;
  if (payload.year != null) body.year = payload.year;
  if (payload.short_name != null) body.short_name = payload.short_name;
  if (payload.src_gid != null) body.src_gid = payload.src_gid;
  const json = await patchRequest(url, body, undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as
    | { success: true; data?: Record<string, unknown> }
    | { success: false; err_message?: string; errors?: Record<string, unknown> };
}

async function fetchSourceAssociationCounts(
  dwId: string,
  identifiers: string[]
): Promise<SourceAssociationCountsResult> {
  const params = new URLSearchParams();
  if (identifiers.length > 0) params.set("identifier", identifiers.join(","));
  const q = params.toString();
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SOURCES)}/association-count${q ? `?${q}` : ""}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return {
      success: false,
      err_message: (json.err_message as string | undefined) ?? "Request failed",
      errors: json.errors as Record<string, unknown> | undefined,
    };
  }
  if (json.success === true && json.data && typeof json.data === "object") {
    const d = json.data as Record<string, unknown>;
    const data_count = Number(d.data_count ?? d.data_rows ?? 0) || 0;
    const ius_count = Number(d.ius_count ?? d.ius_rows ?? 0) || 0;
    return { success: true, message: json.message as string | undefined, data: { data_count, ius_count } };
  }
  return {
    success: false,
    err_message: (json.err_message as string) ?? "Invalid source association-count response",
    errors: json.errors as Record<string, unknown> | undefined,
  };
}

async function deleteSource(
  dwId: string,
  identifier: string
): Promise<DeleteSourceResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SOURCES)}/${encodeURIComponent(identifier)}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) return json as DeleteSourceResult;
  return { success: true } as DeleteSourceResult;
}

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadSourcesCsv(rows: SourceRaw[], filename: string) {
  const header = "Name,Publisher,Title,Year,Short Name,GID";
  const lines = [
    header,
    ...rows.map((r) =>
      [
        r.src_name ?? "",
        r.src_publisher ?? "",
        r.src_title ?? "",
        r.src_year ?? "",
        r.src_short_name ?? "",
        r.src_gid ?? "",
      ]
        .map((c) => escapeCsvCell(c))
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SourcesPage() {
  const { dwId, setToolbarExport, setBulkDelete } = useSidebar();
  const { t } = useCore();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.dataManagement.sources, {
    parentResourceCode: DW_ROUTE_PERMISSIONS.dataManagement.parent,
  });
  const { canCreate, canUpdate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.dataManagement.sources
  );
  const tblScrollRef = useRef<HTMLDivElement>(null);
  const addRowRef = useRef<HTMLTableRowElement>(null);
  const exportBusyRef = useRef(false);
  const inlinePublisherInputRef = useRef<HTMLInputElement>(null);
  const inlineTitleInputRef = useRef<HTMLInputElement>(null);
  const inlineYearInputRef = useRef<HTMLInputElement>(null);
  const inlineShortNameInputRef = useRef<HTMLInputElement>(null);
  const pendingInlineFocusRef = useRef<SourceInlineFocusField | null>(null);
  const addRowTitleInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);
  const [listSort, setListSort] = useState<SourcesSortState>({
    columnId: null,
    direction: null,
  });

  const [colFilterName, setColFilterName] = useState("");
  const [colFilterPublisher, setColFilterPublisher] = useState("");
  const [colFilterTitle, setColFilterTitle] = useState("");
  const [colFilterYear, setColFilterYear] = useState("");
  const [colFilterShortName, setColFilterShortName] = useState("");

  // Typing in any column clears the others so only one is active at a time
  const handleColFilterName = useCallback((v: string) => {
    setColFilterName(v);
    setColFilterPublisher(""); setColFilterTitle(""); setColFilterYear(""); setColFilterShortName("");
  }, []);
  const handleColFilterPublisher = useCallback((v: string) => {
    setColFilterPublisher(v);
    setColFilterName(""); setColFilterTitle(""); setColFilterYear(""); setColFilterShortName("");
  }, []);
  const handleColFilterTitle = useCallback((v: string) => {
    setColFilterTitle(v);
    setColFilterName(""); setColFilterPublisher(""); setColFilterYear(""); setColFilterShortName("");
  }, []);
  const handleColFilterYear = useCallback((v: string) => {
    setColFilterYear(v);
    setColFilterName(""); setColFilterPublisher(""); setColFilterTitle(""); setColFilterShortName("");
  }, []);
  const handleColFilterShortName = useCallback((v: string) => {
    setColFilterShortName(v);
    setColFilterName(""); setColFilterPublisher(""); setColFilterTitle(""); setColFilterYear("");
  }, []);

  const activeSearch = colFilterName || colFilterPublisher || colFilterTitle || colFilterYear || colFilterShortName;
  // Tracks which column is being searched — sent as `search_by` (see SOURCE_SEARCH_BY_FIELDS on API).
  const activeSearchKey = colFilterName
    ? SEARCH_KEY_NAME
    : colFilterPublisher
      ? SEARCH_KEY_PUBLISHER
      : colFilterTitle
        ? SEARCH_KEY_TITLE
        : colFilterYear
          ? SEARCH_KEY_YEAR
          : colFilterShortName
            ? SEARCH_KEY_SHORT_NAME
            : null;

  const debouncedSearch = useDebounce(activeSearch, 300);
  const debouncedSearchBy = useDebounce(activeSearchKey, 300);

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<SourceTabId>("all");

  const [addRowExpanded, setAddRowExpanded] = useState(false);
  const [newPublisher, setNewPublisher] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newShortName, setNewShortName] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlinePublisher, setInlinePublisher] = useState("");
  const [inlineTitle, setInlineTitle] = useState("");
  const [inlineYear, setInlineYear] = useState("");
  const [inlineShortName, setInlineShortName] = useState("");
  const [inlineSaveLoading, setInlineSaveLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const RECENT_CREATED_ROW_HIGHLIGHT_MS = 4500;
  const [recentCreatedRowIds, setRecentCreatedRowIds] = useState<string[]>([]);
  useEffect(() => {
    setRecentCreatedRowIds([]);
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

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [rowsToDelete, setRowsToDelete] = useState<SourceRaw[]>([]);
  const [deleteAssocLoading, setDeleteAssocLoading] = useState(false);
  const [deleteAssoc, setDeleteAssoc] =
    useState<SourceAssociationCountsData | null>(null);
  const [deleteAssocError, setDeleteAssocError] = useState<string | null>(null);
  const [deleteRunError, setDeleteRunError] = useState<string | null>(null);
  const [deleteRunning, setDeleteRunning] = useState(false);

  const searchParam = useMemo(() => {
    const s = debouncedSearch.trim();
    return s ? s : undefined;
  }, [debouncedSearch]);

  const searchByParam = useMemo(
    () => (searchParam ? debouncedSearchBy ?? undefined : undefined),
    [searchParam, debouncedSearchBy]
  );

  const listUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_SOURCES) : ""),
    [dwId]
  );

  const parseListResponse = useCallback(
    (json: unknown): ServerListParseResult<SourceRaw, SourcesListMeta> => {
      const r = json as SourcesListResult;
      if (!isSourcesListResponse(r)) {
        const msg =
          typeof (r as { err_message?: string })?.err_message === "string"
            ? (r as { err_message: string }).err_message
            : "Failed to load sources";
        return { ok: false, message: msg };
      }
      const rows = (r.data ?? []).map((item) =>
        normalizeSourceRaw(item as Record<string, unknown>)
      );
      return {
        ok: true,
        rows,
        ...parseListMetaTotals(r.meta),
        meta: r.meta,
      };
    },
    []
  );

  const listQuery = useMemo(() => {
    const sort_field =
      listSort.direction != null && listSort.columnId != null
        ? SORT_COLUMN_TO_FIELD[listSort.columnId]
        : undefined;
    const sort_order =
      listSort.direction != null && sort_field != null
        ? listSort.direction
        : undefined;
    return {
      page,
      page_size: pageSize,
      ...(sort_field != null && sort_order != null
        ? { sort_field, sort_order }
        : {}),
      ...(searchParam
        ? { search: searchParam, ...(searchByParam ? { search_by: searchByParam } : {}) }
        : {}),
      ...(activeTab === "missing_data" ? { scope: "NO_DATA" } : {}),
    };
  }, [page, pageSize, listSort.columnId, listSort.direction, searchParam, searchByParam, activeTab]);

  const listState = useServerListQuery({
    listUrl,
    query: listQuery,
    parseListResponse,
    enabled: Boolean(dwId && listUrl),
  });

  const { rows: serverRows, loading, meta } = listState;
  const [rows, setRows] = useState<SourceRaw[]>([]);
  useEffect(() => {
    setRows(serverRows);
  }, [serverRows]);

  // Local total count — synced from server but can be nudged on create/delete
  // without triggering a full refetch.
  const [localTotalCount, setLocalTotalCount] = useState<number>(0);
  const [localTotalCountUnfiltered, setLocalTotalCountUnfiltered] = useState<
    number | undefined
  >(undefined);
  useEffect(() => {
    if (typeof listState.totalCount === "number") {
      setLocalTotalCount(listState.totalCount);
    }
    setLocalTotalCountUnfiltered(listState.totalCountUnfiltered);
  }, [listState.totalCount, listState.totalCountUnfiltered]);
  const localTotalPages =
    pageSize > 0 ? Math.max(0, Math.ceil(localTotalCount / pageSize)) : 0;

  const onSortName = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSourcesSort("src_name", prev));
  }, []);
  const onSortPublisher = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSourcesSort("publisher", prev));
  }, []);
  const onSortTitle = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSourcesSort("title", prev));
  }, []);
  const onSortYear = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSourcesSort("year", prev));
  }, []);
  const onSortShortName = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSourcesSort("short_name", prev));
  }, []);

  const sortIconName = useMemo(() => sourcesSortIcon("src_name", listSort), [listSort]);
  const sortIconPublisher = useMemo(() => sourcesSortIcon("publisher", listSort), [listSort]);
  const sortIconTitle = useMemo(() => sourcesSortIcon("title", listSort), [listSort]);
  const sortIconYear = useMemo(() => sourcesSortIcon("year", listSort), [listSort]);
  const sortIconShortName = useMemo(() => sourcesSortIcon("short_name", listSort), [listSort]);

  const selectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      const ids = rows.map(sourceRowId).filter(Boolean);
      if (ids.length > 0 && ids.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(ids);
    });
  }, [rows]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedRowIds(new Set()), []);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setRowsToDelete([]);
    setDeleteAssoc(null);
    setDeleteAssocError(null);
    setDeleteRunError(null);
    setDeleteAssocLoading(false);
  }, []);

  const openDeleteModal = useCallback(() => {
    const list: SourceRaw[] = [];
    for (const row of rows) {
      const id = sourceRowId(row);
      if (id && selectedRowIds.has(id)) list.push(row);
    }
    if (list.length === 0) return;
    setRowsToDelete(list);
    setDeleteAssoc(null);
    setDeleteAssocError(null);
    setDeleteRunError(null);
    setDeleteModalOpen(true);
  }, [rows, selectedRowIds]);

  useEffect(() => {
    if (!deleteModalOpen || rowsToDelete.length === 0 || !dwId) return;
    let cancelled = false;
    setDeleteAssocLoading(true);
    setDeleteAssoc(null);
    setDeleteAssocError(null);
    const ids = rowsToDelete
      .map((r) => getSourcePatchIdentifier(r))
      .filter((s): s is string => Boolean(s));
    void fetchSourceAssociationCounts(dwId, ids).then((r) => {
      if (cancelled) return;
      setDeleteAssocLoading(false);
      if (r.success) setDeleteAssoc(r.data);
      else setDeleteAssocError(r.err_message ?? t("ASSOC_COUNTS_FAILED"));
    });
    return () => {
      cancelled = true;
    };
  }, [deleteModalOpen, dwId, rowsToDelete, t]);

  const handleConfirmBulkDelete = useCallback(async () => {
    if (rowsToDelete.length === 0 || !dwId) return;
    setDeleteRunning(true);
    setDeleteRunError(null);

    const identifiers = rowsToDelete
      .map((r) => getSourcePatchIdentifier(r))
      .filter((s): s is string => Boolean(s));
    if (identifiers.length === 0) {
      setDeleteRunning(false);
      setDeleteRunError(t("SOURCE_IDENTIFIER_MISSING"));
      return;
    }

    let failCount = 0;
    for (const id of identifiers) {
      const res = await deleteSource(dwId, id);
      if (!res.success) failCount++;
    }
    setDeleteRunning(false);

    if (failCount === identifiers.length) {
      setDeleteRunError(t("BULK_DELETE_FAILED"));
      return;
    }

    const successCount = identifiers.length - failCount;
    const deletedIds = new Set(rowsToDelete.map(sourceRowId));
    setRows((prev) => prev.filter((row) => !deletedIds.has(sourceRowId(row))));
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      for (const rid of deletedIds) next.delete(rid);
      return next;
    });
    setLocalTotalCount((c) => Math.max(0, c - successCount));

    if (failCount > 0) {
      toast.warning(`Deleted with ${failCount} failure(s).`);
    } else {
      toast.success(
        `Deleted ${successCount} source${successCount === 1 ? "" : "s"} successfully`
      );
    }
    closeDeleteModal();
  }, [rowsToDelete, dwId, closeDeleteModal, t]);

  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [page, pageSize, searchParam, listSort.columnId, listSort.direction]);

  useEffect(() => {
    setPage(1);
    setSelectedRowIds(new Set());
    setAddRowExpanded(false);
    setEditingRowId(null);
    setColFilterName(""); setColFilterPublisher(""); setColFilterTitle("");
    setColFilterYear(""); setColFilterShortName("");
  }, [activeTab]);

  // Reset to page 1 when the debounced search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const applyInlineFocus = useCallback((field: SourceInlineFocusField) => {
    const run = () => {
      const el =
        field === "publisher"
          ? inlinePublisherInputRef.current
          : field === "title"
            ? inlineTitleInputRef.current
            : field === "year"
              ? inlineYearInputRef.current
              : inlineShortNameInputRef.current;
      el?.focus();
      el?.select();
    };
    requestAnimationFrame(run);
  }, []);

  const onStartInlineEdit = useCallback(
    (row: SourceRaw, focusField: SourceInlineFocusField = "publisher") => {
      if (!canUpdate) return;
      const id = sourceRowId(row);
      if (!id) return;
      pendingInlineFocusRef.current = focusField;
      setInlineError(null);
      setActiveRowId(id);
      setEditingRowId(id);
      setInlinePublisher(row.src_publisher ?? row.publisher ?? "");
      setInlineTitle(row.src_title ?? row.title ?? "");
      setInlineYear(row.src_year ?? row.diyear ?? "");
      setInlineShortName(row.src_short_name ?? row.ic_short_name ?? "");
    },
    [canUpdate]
  );

  const onInlineCancel = useCallback(() => {
    if (editingRowId) setActiveRowId(editingRowId);
    setInlineError(null);
    setEditingRowId(null);
  }, [editingRowId]);

  const onInlineSave = useCallback(async () => {
    if (!editingRowId || inlineSaveLoading || !dwId) return;
    const savedRowId = editingRowId;
    const row = rows.find((r) => sourceRowId(r) === editingRowId);
    if (!row) {
      setEditingRowId(null);
      return;
    }
    const identifier = getSourcePatchIdentifier(row);
    if (!identifier) {
      toast.error(t("SOURCE_IDENTIFIER_MISSING"));
      return;
    }

    const payload: UpdateSourcePayload = {};
    const origPub = (row.src_publisher ?? row.publisher ?? "").trim();
    const origTitle = (row.src_title ?? row.title ?? "").trim();
    const origYear = (row.src_year ?? row.diyear ?? "").trim();
    const origShort = (row.src_short_name ?? row.ic_short_name ?? "").trim();

    const pub = inlinePublisher.trim();
    const ttl = inlineTitle.trim();
    const yr = inlineYear.trim();
    const sn = inlineShortName.trim();

    if (pub !== origPub) payload.src_publisher = pub;
    if (ttl !== origTitle) payload.src_title = ttl;
    if (yr !== origYear) payload.year = yr;
    if (sn !== origShort) payload.short_name = sn;

    if (Object.keys(payload).length === 0) {
      setEditingRowId(null);
      setActiveRowId(savedRowId);
      return;
    }

    setInlineSaveLoading(true);
    try {
      const res = await updateSource(dwId, identifier, payload);
      if (!res.success) {
        const msg = res.err_message ?? t("UPDATE_FAILED_SOURCE");
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      setInlineError(null);
      setRows((prev) =>
        prev.map((r) =>
          sourceRowId(r) === savedRowId
            ? normalizeSourceRaw({
                ...r,
                src_publisher: payload.src_publisher ?? r.src_publisher,
                src_title: payload.src_title ?? r.src_title,
                src_year: payload.year ?? r.src_year,
                src_short_name: payload.short_name ?? r.src_short_name,
              } as Record<string, unknown>)
            : r
        )
      );
      setEditingRowId(null);
      setActiveRowId(savedRowId);
      toast.success(t("UPDATE_SUCCESS_SOURCE"));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("UPDATE_FAILED_SOURCE");
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setInlineSaveLoading(false);
    }
  }, [
    editingRowId,
    inlineSaveLoading,
    rows,
    inlinePublisher,
    inlineTitle,
    inlineYear,
    inlineShortName,
    dwId,
    t,
  ]);

  useEffect(() => {
    if (!editingRowId) return;
    if (!rows.some((r) => sourceRowId(r) === editingRowId)) {
      setEditingRowId(null);
    }
  }, [rows, editingRowId]);

  useLayoutEffect(() => {
    if (!editingRowId) {
      pendingInlineFocusRef.current = null;
      return;
    }
    const field = pendingInlineFocusRef.current;
    pendingInlineFocusRef.current = null;
    if (field != null) applyInlineFocus(field);
  }, [editingRowId, applyInlineFocus]);

  const handleAddSave = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || addSaving || editingRowId != null) return;
    setAddSaving(true);
    try {
      const pubVal = newPublisher.trim();
      const yearVal = newYear.trim();
      const shortVal = newShortName.trim();
      const payload: CreateSourcePayload = {
        src_title: title,
        ...(pubVal ? { src_publisher: pubVal } : {}),
        ...(yearVal ? { year: yearVal } : {}),
        ...(shortVal ? { short_name: shortVal } : {}),
      };
      const res = await createSource(dwId, payload);
      if (!res.success) {
        const msg = res.err_message ?? t("CREATE_FAILED_SOURCE");
        toast.error(msg);
        return;
      }

      const apiData = (res.data ?? {}) as Record<string, unknown>;
      const generatedName = buildSrcName(pubVal, title, yearVal);
      const created = normalizeSourceRaw({
        ...apiData,
        src_name: generatedName,
        ic_name: generatedName,
        src_title: title,
        src_publisher: pubVal || null,
        src_year: yearVal || null,
        src_short_name: shortVal || null,
      });

      setNewPublisher("");
      setNewTitle("");
      setNewYear("");
      setNewShortName("");
      setAddRowExpanded(false);

      const newRowId = sourceRowId(created);
      setRows((prev) => [created, ...prev]);
      setLocalTotalCount((c) => c + 1);
      if (newRowId) {
        setActiveRowId(newRowId);
        setRecentCreatedRowIds((prev) => [newRowId, ...prev]);
      }
      toast.success(t("CREATE_SUCCESS_SOURCE"));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("CREATE_FAILED_SOURCE");
      toast.error(msg);
    } finally {
      setAddSaving(false);
    }
  }, [dwId, newPublisher, newTitle, newYear, newShortName, addSaving, editingRowId, t]);

  const handleAddRowDiscard = useCallback(() => {
    setNewPublisher("");
    setNewTitle("");
    setNewYear("");
    setNewShortName("");
    setAddRowExpanded(false);
  }, []);

  const allRowsSelected = useMemo(() => {
    const ids = rows.map(sourceRowId).filter(Boolean);
    return ids.length > 0 && ids.every((id) => selectedRowIds.has(id));
  }, [rows, selectedRowIds]);

  const addRowDisabledByInlineEdit = editingRowId != null;

  const columns = useSourcesGridColumns({
    t,
    allRowsSelected,
    selectedRowIds,
    selectAll,
    toggleSelect,
    colFilterName,
    setColFilterName: handleColFilterName,
    colFilterPublisher,
    setColFilterPublisher: handleColFilterPublisher,
    colFilterTitle,
    setColFilterTitle: handleColFilterTitle,
    colFilterYear,
    setColFilterYear: handleColFilterYear,
    colFilterShortName,
    setColFilterShortName: handleColFilterShortName,
    onSortName,
    onSortPublisher,
    onSortTitle,
    onSortYear,
    onSortShortName,
    sortIconName,
    sortIconPublisher,
    sortIconTitle,
    sortIconYear,
    sortIconShortName,
    editingRowId,
    inlinePublisher,
    setInlinePublisher,
    inlineTitle,
    setInlineTitle,
    inlineYear,
    setInlineYear,
    inlineShortName,
    setInlineShortName,
    inlinePublisherInputRef,
    inlineTitleInputRef,
    inlineYearInputRef,
    inlineShortNameInputRef,
    inlineSaveLoading,
    onStartInlineEdit,
    onInlineSave,
    onInlineCancel,
  });

  const sourcesListAddRowExpandedFields = useMemo((): ServerDrivenListAddRowField[] => {
    const addRowDisabled = addSaving || addRowDisabledByInlineEdit;
    return [
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" aria-hidden />,
      },
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" aria-hidden />,
      },
      {
        kind: "text" as const,
        value: newPublisher,
        onChange: (v) => setNewPublisher(v.slice(0, 100)),
        placeholder: t("SOURCE_ADD_PLACEHOLDER_PUBLISHER"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        disabled: addRowDisabled,
        ariaLabel: t("SOURCE_PUBLISHER"),
        onEnter: () => void handleAddSave(),
      },
      {
        kind: "text" as const,
        value: newTitle,
        onChange: setNewTitle,
        placeholder: t("SOURCE_ADD_PLACEHOLDER_TITLE"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        inputRef: addRowTitleInputRef,
        disabled: addRowDisabled,
        ariaLabel: t("SOURCE_TITLE"),
        onEnter: () => void handleAddSave(),
      },
      {
        kind: "text" as const,
        value: newYear,
        onChange: (v) => setNewYear(v.slice(0, 10)),
        placeholder: t("SOURCE_ADD_PLACEHOLDER_YEAR"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        disabled: addRowDisabled,
        ariaLabel: t("YEAR"),
        onEnter: () => void handleAddSave(),
      },
      {
        kind: "text" as const,
        value: newShortName,
        onChange: (v) => setNewShortName(v.slice(0, 255)),
        placeholder: t("SOURCE_ADD_PLACEHOLDER_SHORT_NAME"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        disabled: addRowDisabled,
        ariaLabel: t("SHORT_NAME"),
        onEnter: () => void handleAddSave(),
      },
    ];
  }, [
    addRowDisabledByInlineEdit,
    newPublisher,
    newTitle,
    newYear,
    newShortName,
    addSaving,
    handleAddSave,
    t,
  ]);

  useEffect(() => {
    setBulkDelete({
      onClick: openDeleteModal,
      disabled: selectedRowIds.size === 0 || !canDelete,
    });
    return () => setBulkDelete(null);
  }, [setBulkDelete, openDeleteModal, selectedRowIds.size, canDelete]);

  useEffect(() => {
    setToolbarExport({
      onClick: async () => {
        if (!dwId || exportBusyRef.current) return;
        exportBusyRef.current = true;
        try {
          downloadSourcesCsv(
            rows,
            `sources-${dwId}-${new Date().toISOString().slice(0, 10)}.csv`
          );
          toast.success(t("EXPORT_SUCCESS"));
        } catch (e) {
          toast.error(
            t("EXPORT_FAILED", e instanceof Error ? e.message : "Export failed")
          );
        } finally {
          exportBusyRef.current = false;
        }
      },
      disabled: rows.length === 0,
    });
    return () => setToolbarExport(null);
  }, [dwId, rows, setToolbarExport, t]);

  if (!allowed) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden">
      <div className="page-subtabs-row">
        <MainTabsBar
          tabs={(
            [
              ["all", t("ALL"), "list"] as const,
              ["missing_data", t("MISSING_DATA"), "warning"] as const,
            ] as const
          ).map(([value, label, icon]) => ({ value, label, icon }))}
          activeValue={activeTab}
          onSelect={setActiveTab}
        />
      </div>
      {inlineError ? (
        <div className="inline-alert--error mx-4 mt-2">
          {inlineError}
        </div>
      ) : null}

      <ServerDrivenTable<SourceRaw, SourcesListMeta>
        listState={listState}
        columns={columns}
        selection={{
          count: selectedRowIds.size,
          onClear: clearSelection,
        }}
        scrollRef={tblScrollRef}
        renderThead={() => (
          <thead>
            <EditableDataGridThead columns={columns} />
          </thead>
        )}
        tbody={
          <ServerDrivenListTbody<SourceRaw>
            colSpan={7}
            rows={rows}
            columns={columns}
            getRowId={sourceRowId}
            activeRowId={activeRowId}
            editingRowId={editingRowId}
            onDataRowEnterAtEnd={({ mode }) => {
              if (mode === "edit") void onInlineSave();
            }}
            onDataRowEscape={({ mode }) => {
              if (mode === "edit") onInlineCancel();
            }}
            onDeleteKeyToggleRowSelection={toggleSelect}
            getRowClassName={(row) =>
              recentCreatedRowIdSet.has(sourceRowId(row))
                ? TV_ROW_NEWLY_ADDED_CLASS
                : ""
            }
            emptyMessage={t("SOURCE_EMPTY")}
            showLoadingRow={false}
            showEmptyRow={!loading && rows.length === 0}
            showDataRows={!loading}
            addRow={{
              ref: addRowRef,
              promptLabel: t("ADD_SOURCE_PROMPT"),
              expanded: addRowExpanded,
              onExpandedChange: setAddRowExpanded,
              primaryColumnId: "src_name",
              disabled: addRowDisabledByInlineEdit || !canCreate,
              disabledTitle: !canCreate
                ? t("NO_PERMISSION_CREATE")
                : addRowDisabledByInlineEdit
                  ? t("SOURCE_ADD_ROW_FINISH_EDIT_FIRST")
                  : undefined,
              onExpand: () => {
                queueMicrotask(() => addRowTitleInputRef.current?.focus());
              },
              className: `add-row${addRowExpanded ? "" : " add-row-collapsed"}${addRowDisabledByInlineEdit || !canCreate ? " add-row-interaction-blocked" : ""}`,
              ariaDisabled: addRowDisabledByInlineEdit || !canCreate,
              title: !canCreate
                ? t("NO_PERMISSION_CREATE")
                : addRowDisabledByInlineEdit
                  ? t("SOURCE_ADD_ROW_FINISH_EDIT_FIRST")
                  : undefined,
              onRowEnterAtEnd: () => {
                if (!canCreate) return;
                if (addRowDisabledByInlineEdit) return;
                if (!addRowExpanded) {
                  setAddRowExpanded(true);
                  queueMicrotask(() => addRowTitleInputRef.current?.focus());
                  return;
                }
                void handleAddSave();
              },
              onRowEscape: () => {
                if (addRowExpanded) {
                  handleAddRowDiscard();
                }
              },
              onArrowIntoRow: addRowDisabledByInlineEdit || !canCreate
                ? undefined
                : () => { setAddRowExpanded(true); },
              onArrowLeaveRow: addRowDisabledByInlineEdit || !canCreate
                ? undefined
                : () => { setAddRowExpanded(false); },
              expandedFields: sourcesListAddRowExpandedFields,
              collapsedSave: {
                title: "save",
                ariaLabel: "save-placeholder",
              },
              collapsedCancel: {
                title: "cancel",
                ariaLabel: "cancel-placeholder",
              },
              showActionsColumn: canCreate,
              actionsWidth: "icon",
              save: {
                title: !newTitle.trim()
                  ? t("SOURCE_TITLE_REQUIRED")
                  : t("SAVE"),
                ariaLabel: !newTitle.trim()
                  ? t("SOURCE_TITLE_REQUIRED")
                  : t("SAVE"),
                disabled:
                  addSaving || !newTitle.trim() || addRowDisabledByInlineEdit,
                onClick: () => void handleAddSave(),
              },
              cancel: {
                title: t("ADD_CLEAR_ROW"),
                ariaLabel: t("ADD_CLEAR_ROW"),
                disabled: addSaving || addRowDisabledByInlineEdit,
                onClick: handleAddRowDiscard,
              },
            }}
          />
        }
        pagination={{
          page,
          displayPage: meta?.page ?? page,
          totalPages: localTotalPages,
          totalCount: localTotalCount,
          totalCountUnfiltered: localTotalCountUnfiltered,
          pageSize,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
          countNoun: "sources",
          labels: { t, filteredOnly: "FOOTER_OF_TOTAL_SOURCES" },
        }}
      />

      <DeletePermanentConfirmModal
        open={deleteModalOpen}
        onClose={closeDeleteModal}
        title={t("DELETE_SOURCES")}
        titleId="dm-src-delete-title"
        dismissDisabled={deleteRunning}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={closeDeleteModal}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmDisabled={deleteAssocLoading}
        confirmLoading={deleteRunning}
        onConfirm={handleConfirmBulkDelete}
        impact={{
          title: t("IMPACT_PREVIEW"),
          loading: deleteAssocLoading,
          loadingLabel: t("LOADING"),
          error: deleteAssocError,
          errorInfoLabel: t("DELETE_PREVIEW_INFO_ONLY"),
          lines: deleteAssoc
            ? dataIusAssociationImpactLines(
                {
                  dataRows: t("IMPACT_DATA_ROWS"),
                  iusRows: t("IMPACT_IUS_ROWS"),
                },
                {
                  dataCount: deleteAssoc.data_count,
                  iusCount: deleteAssoc.ius_count,
                }
              )
            : null,
        }}
        runError={deleteRunError}
      >
        <p className="modal-lead">
          {t("SOURCE_DELETE_MODAL_LEAD").replace(
            "{count}",
            String(rowsToDelete.length)
          )}
        </p>
        <ul className="modal-list">
          {rowsToDelete.map((r, idx) => (
            <li key={sourceRowId(r) || `src-del-${idx}`}>
              <span className="modal-list-name">
                {(r.src_name ?? r.ic_name ?? "").trim() ||
                  (r.src_nid != null ? `ID ${r.src_nid}` : "—")}
              </span>
            </li>
          ))}
        </ul>
      </DeletePermanentConfirmModal>

    </div>
  );
}
