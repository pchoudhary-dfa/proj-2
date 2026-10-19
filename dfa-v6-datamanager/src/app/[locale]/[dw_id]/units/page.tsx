"use client";

// Units page: list units for the current data warehouse, filter/sort/paginate,
// add new units, edit inline, delete (single or bulk), and export via API.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
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
  CreateUnitPayload,
  CreateUnitsResponse,
  CreateUnitsResult,
  DeleteUnitResult,
  MultipleDeleteUnitsResult,
  UnitAssociationCountsData,
  UnitAssociationCountsResult,
  UnitRaw,
  UnitsListMeta,
  UnitsListResponse,
  UnitsListResult,
  UpdateUnitPayload,
} from "@/lib/api/types";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import {
  API_KEY_FORMAT,
  getDWAPIURL,
  REFERENCE_PATH_UNITS,
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
import { SearchableListCombobox } from "@/components/SearchableListCombobox";
import { gridTextFieldClassName } from "@/components/TextField";
import { useUnitDataFormatOptions } from "@/hooks/useUnitDataFormatOptions";
import {
  filterUnitFormatSelectOptions,
  resolveUnitFormatLabel,
  unitFormatOptionsToComboboxOptions,
} from "@/lib/unitDataFormatCatalog";
import {
  dataIusAssociationImpactLines,
  DeletePermanentConfirmModal,
} from "@/components/DeletePermanentConfirmModal";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import { sanitizeManualGidInput } from "@/services/validations";
import { unitRowId, useUnitsGridColumns } from "./unitsGridColumns";

function isUnitsListResponse(r: UnitsListResult): r is UnitsListResponse {
  return r.success === true && Array.isArray((r as UnitsListResponse).data);
}

function getUnitGid(u: UnitRaw): string | null {
  return u.unit_gid ?? u.u_gid ?? null;
}

function getUnitName(u: UnitRaw): string {
  return (u.unit_name ?? u.u_name ?? "") || "";
}

/** Create response often omits name fields; merge form values so the grid shows the right columns. */
function unitRowFromCreateResponse(
  api: UnitRaw,
  formName: string,
  formGid: string,
  formFormat: string
): UnitRaw {
  const name =
    (api.unit_name ?? api.u_name)?.toString().trim() || formName.trim();
  const gidRaw =
    api.unit_gid ?? api.u_gid ?? (formGid.trim() || undefined) ?? undefined;
  const gid =
    gidRaw != null && String(gidRaw).trim() !== ""
      ? String(gidRaw).trim()
      : undefined;
  const formatRaw = api.unit_format ?? api.u_format ?? formFormat.trim() ?? undefined;
  const format =
    formatRaw != null && String(formatRaw).trim() !== ""
      ? String(formatRaw).trim()
      : undefined;
  return {
    ...api,
    unit_name: name,
    u_name: name,
    ...(gid != null ? { unit_gid: gid, u_gid: gid } : {}),
    ...(format != null ? { unit_format: format, u_format: format } : {}),
  };
}

function serializeCreateUnitBody(items: CreateUnitPayload[]): unknown[] {
  if (API_KEY_FORMAT === "external") {
    return items.map((p) => {
      const o: Record<string, unknown> = { u_name: p.unit_name };
      if (p.unit_gid != null && p.unit_gid !== "") o.u_gid = p.unit_gid;
      if (p.unit_format != null && p.unit_format !== "") o.u_format = p.unit_format;
      if (p.unit_global === true) o.u_is_global = true;
      return o;
    });
  }
  return items.map((p) => {
    const o: Record<string, unknown> = { unit_name: p.unit_name };
    if (p.unit_gid != null && p.unit_gid !== "") o.unit_gid = p.unit_gid;
    if (p.unit_format != null && p.unit_format !== "") o.unit_format = p.unit_format;
    if (p.unit_global === true) o.unit_global = true;
    return o;
  });
}

/** Text from `meta.errors` (e.g. UNIT_NAME_EXISTS) for toasts / inline add-row error. */
function formatCreateUnitsRowErrors(
  meta: CreateUnitsResponse["meta"] | undefined
): string {
  const raw = meta?.errors;
  if (!Array.isArray(raw) || raw.length === 0) return "";
  const parts: string[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const err = (item as { error?: unknown }).error;
      if (typeof err === "string" && err.trim()) parts.push(err.trim());
    }
  }
  return parts.join(" ");
}

function buildCreateUnitsUserMessage(
  res: CreateUnitsResponse,
  fallback: string
): string {
  const rowDetail = formatCreateUnitsRowErrors(res.meta);
  const apiMsg =
    typeof res.message === "string" && res.message.trim()
      ? res.message.trim()
      : "";
  if (apiMsg && rowDetail) return `${apiMsg} — ${rowDetail}`;
  if (rowDetail) return rowDetail;
  return apiMsg || fallback;
}

async function createUnits(
  dwId: string,
  data: CreateUnitPayload[]
): Promise<CreateUnitsResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_UNITS);
  const json = await postRequest(
    url,
    serializeCreateUnitBody(data),
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as CreateUnitsResult;
}

async function updateUnit(
  dwId: string,
  identifier: string,
  payload: UpdateUnitPayload
): Promise<
  | { success: true; data?: Record<string, unknown> }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_UNITS)}/${encodeURIComponent(identifier)}`;

  const body =
    API_KEY_FORMAT === "external"
      ? {
          ...(payload.unit_name != null ? { u_name: payload.unit_name } : {}),
          ...(payload.unit_gid != null ? { u_gid: payload.unit_gid } : {}),
          ...(payload.unit_format != null ? { u_format: payload.unit_format } : {}),
        }
      : {
          ...(payload.unit_name != null ? { unit_name: payload.unit_name } : {}),
          ...(payload.unit_gid != null ? { unit_gid: payload.unit_gid } : {}),
          ...(payload.unit_format != null ? { unit_format: payload.unit_format } : {}),
        };

  const json = await patchRequest(
    url,
    body,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as
    | { success: true; data?: Record<string, unknown> }
    | { success: false; err_message?: string; errors?: Record<string, unknown> };
}

/** Identifier for DELETE `/units/{identifier}`: prefer GID, else numeric NID. */
function getUnitDeleteIdentifier(u: UnitRaw): string | null {
  const g = getUnitGid(u);
  if (g) return g;
  const nid = u.unit_nid ?? u.u_nid;
  if (nid != null) return String(nid);
  return null;
}

async function fetchUnitAssociationCounts(
  dwId: string,
  unitIdentifiers: string[]
): Promise<UnitAssociationCountsResult> {
  const params = new URLSearchParams();
  if (unitIdentifiers.length > 0) {
    params.set("identifier", unitIdentifiers.join(","));
  }
  const q = params.toString();
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_UNITS)}/association-count${q ? `?${q}` : ""}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return {
      success: false,
      err_message:
        (json.err_message as string | undefined) ?? "Request failed",
      errors: json.errors as Record<string, unknown> | undefined,
    };
  }
  if (json.success === true && json.data && typeof json.data === "object") {
    const d = json.data as Record<string, unknown>;
    return {
      success: true,
      message: json.message as string | undefined,
      data: {
        data_rows: Number(d.data_rows) || 0,
        ius_rows: Number(d.ius_rows) || 0,
      },
    };
  }
  return {
    success: false,
    err_message:
      (json.err_message as string) ?? "Invalid unit association-count response",
    errors: json.errors as Record<string, unknown> | undefined,
  };
}

async function deleteUnit(
  dwId: string,
  identifier: string
): Promise<DeleteUnitResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_UNITS)}/${encodeURIComponent(identifier)}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return json as DeleteUnitResult;
  }
  return { success: true } as DeleteUnitResult;
}

async function multipleDeleteUnits(
  dwId: string,
  unitGids: string[]
): Promise<MultipleDeleteUnitsResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_UNITS)}/multiple-delete`;
  const json = (await postRequest(
    url,
    { unit_gid: unitGids },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;
  if (json.success === true) {
    const data = json.data as { deleted?: number[] } | undefined;
    return {
      success: true,
      message: json.message as string | undefined,
      data: { deleted: data?.deleted },
      meta: json.meta as { errors?: unknown[] } | undefined,
    };
  }
  return {
    success: false,
    err_message: (json.err_message as string | undefined) ?? "Request failed",
    status: json.status as number | undefined,
    errors: json.errors as Record<string, unknown> | undefined,
  };
}

// Small wrapper so we can use Material Icons by name in JSX.
const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

// API field names differ when the backend uses "external" vs internal keys.
const SORT_NAME = API_KEY_FORMAT === "external" ? "u_name" : "unit_name";
const SORT_GID = API_KEY_FORMAT === "external" ? "u_gid" : "unit_gid";

/** GET /units requires `search_by` when `search` is set (API: u_name | u_gid). */
type UnitsListApiSearch = {
  search: string;
  search_by: "u_name" | "u_gid";
  /** When both header filters are non-empty, server filters by name only; we narrow rows by GID on the client for this page. */
  clientGidSubstr?: string;
};

function buildUnitsListApiSearch(
  debouncedUnit: string,
  debouncedGid: string
): UnitsListApiSearch | undefined {
  const u = debouncedUnit.trim();
  const g = debouncedGid.trim();
  if (!u && !g) return undefined;
  if (u && !g) return { search: u, search_by: "u_name" };
  if (!u && g) return { search: g, search_by: "u_gid" };
  return { search: u, search_by: "u_name", clientGidSubstr: g };
}

type ExportUnitsParams = {
  sort_order?: "asc" | "desc";
  sort_field?: string;
  search?: string;
  search_by?: "u_name" | "u_gid";
};

/**
 * GET /dw/{dw_id}/units?export=true — returns XLSX.
 * Triggers a browser download. Call only in client components.
 */
async function downloadUnitsExport(
  dwId: string,
  params: ExportUnitsParams = {},
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
  if (params.search != null && params.search !== "") {
    searchParams.set("search", params.search);
  }
  if (params.search_by) searchParams.set("search_by", params.search_by);

  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_UNITS)}?${searchParams.toString()}`;
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
  let filename = "units_export.xlsx";
  if (cd) {
    const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i);
    const raw = decodeURIComponent(m?.[1] || m?.[2] || "");
    if (raw) filename = raw;
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);

  return { ok: true };
}

type UnitsListSortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

function cycleUnitsListSort(columnId: string, prev: UnitsListSortState): UnitsListSortState {
  if (prev.columnId !== columnId) {
    return { columnId, direction: "asc" };
  }
  if (prev.direction === "asc") {
    return { columnId, direction: "desc" };
  }
  if (prev.direction === "desc") {
    return { columnId: null, direction: null };
  }
  return { columnId, direction: "asc" };
}

function unitsSortHeaderMaterialIcon(
  columnId: string,
  activeColumnId: string | null,
  direction: UnitsListSortState["direction"]
): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (activeColumnId === columnId && direction === "asc") return "arrow_upward";
  if (activeColumnId === columnId && direction === "desc") return "arrow_downward";
  return "unfold_more";
}

// Waits until the user stops typing for `delay` ms, then updates (used for search boxes).
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

const RECENT_CREATED_ROW_HIGHLIGHT_MS = 4500;

export default function UnitsPage() {
  const { dwId, setToolbarExport, setToolbarImport, setBulkDelete } = useSidebar();
  const { t } = useCore();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.template.units);
  const { canCreate, canUpdate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.template.units
  );
  const tblScrollRef = useRef<HTMLDivElement>(null);
  const addRowRef = useRef<HTMLTableRowElement>(null);
  // Stops double-clicks on export from running two downloads at once.
  const exportBusyRef = useRef(false);
  const inlineNameInputRef = useRef<HTMLInputElement>(null);
  const inlineGidInputRef = useRef<HTMLInputElement>(null);
  const inlineFormatInputRef = useRef<HTMLInputElement>(null);
  const addRowNameInputRef = useRef<HTMLInputElement>(null);
  const addRowFormatInputRef = useRef<HTMLInputElement>(null);
  /** After opening inline edit, which field to focus on the next paint. */
  const pendingInlineFocusFieldRef = useRef<"name" | "gid" | "format">("name");
  const inlineFocusPendingRef = useRef(false);

  // --- Pagination and sorting (same 3-step cycle as datawarehouse ListView: asc → desc → off) ---
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(
    DEFAULT_TABLE_PAGE_SIZES[0]
  );
  const [listSort, setListSort] = useState<UnitsListSortState>({
    columnId: null,
    direction: null,
  });

  // --- Column filters (debounced so we do not hit the API on every keystroke) ---
  const [colFilterUnit, setColFilterUnit] = useState("");
  const [colFilterGid, setColFilterGid] = useState("");
  const [colFilterFormat, setColFilterFormat] = useState("");
  const debouncedUnit = useDebounce(colFilterUnit, 300);
  const debouncedGid = useDebounce(colFilterGid, 300);
  const debouncedFormat = useDebounce(colFilterFormat, 300);

  // Rows checked for bulk delete (toolbar action wired in useEffect below).
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // --- Add-new row at top of table ---
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitGid, setNewUnitGid] = useState("");
  const [newUnitFormat, setNewUnitFormat] = useState("");
  const [newUnitFormatSearch, setNewUnitFormatSearch] = useState("");
  const [addRowFormatDdOpen, setAddRowFormatDdOpen] = useState(false);
  const [addRowFormatHi, setAddRowFormatHi] = useState(-1);
  const [addSaving, setAddSaving] = useState(false);
  const [addRowExpanded, setAddRowExpanded] = useState(false);

  // --- Inline edit for an existing row (name / GID / format) ---
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState("");
  const [inlineGid, setInlineGid] = useState("");
  const [inlineFormat, setInlineFormat] = useState("");
  const [inlineFormatSearch, setInlineFormatSearch] = useState("");
  const [inlineFormatDdOpen, setInlineFormatDdOpen] = useState(false);
  const [inlineFormatHi, setInlineFormatHi] = useState(-1);
  const [inlineSaveLoading, setInlineSaveLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [recentCreatedRowIds, setRecentCreatedRowIds] = useState<string[]>([]);
  /** Keeps newly created units directly under the add row until the warehouse changes. */
  const [pinnedUnitRowIds, setPinnedUnitRowIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentCreatedRowIds([]);
    setPinnedUnitRowIds([]);
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

  // --- Delete confirmation modal (single or multiple units) ---
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [unitsToDelete, setUnitsToDelete] = useState<UnitRaw[]>([]);
  const [deleteAssocLoading, setDeleteAssocLoading] = useState(false);
  const [deleteAssoc, setDeleteAssoc] = useState<UnitAssociationCountsData | null>(
    null
  );
  const [deleteAssocError, setDeleteAssocError] = useState<string | null>(null);
  const [deleteRunError, setDeleteRunError] = useState<string | null>(null);
  const [deleteRunning, setDeleteRunning] = useState(false);

  const unitsApiSearch = useMemo(
    () => buildUnitsListApiSearch(debouncedUnit, debouncedGid),
    [debouncedUnit, debouncedGid]
  );

  const unitsListUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_UNITS) : ""),
    [dwId]
  );

  // Validates the HTTP response and maps it to rows + totals for ServerDrivenTable.
  const parseUnitsListResponse = useCallback(
    (json: unknown): ServerListParseResult<UnitRaw, UnitsListMeta> => {
      const r = json as UnitsListResult;
      if (!isUnitsListResponse(r)) {
        const msg =
          typeof r.err_message === "string" ? r.err_message : "Failed to load units";
        return { ok: false, message: msg };
      }
      const totals = parseListMetaTotals(r.meta);
      return {
        ok: true,
        rows: r.data,
        ...totals,
        meta: r.meta,
      };
    },
    []
  );

  // Query string the server expects (page, page size, optional sort, optional search).
  const unitsListQuery = useMemo(() => {
    const sort_field =
      listSort.direction != null && listSort.columnId === "unit"
        ? SORT_NAME
        : listSort.direction != null && listSort.columnId === "gid"
          ? SORT_GID
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
      ...(unitsApiSearch
        ? {
            search: unitsApiSearch.search,
            search_by: unitsApiSearch.search_by,
          }
        : {}),
    };
  }, [page, pageSize, listSort.columnId, listSort.direction, unitsApiSearch]);

  const unitsExportQuery = useMemo((): ExportUnitsParams => {
    const sort_field =
      listSort.direction != null && listSort.columnId === "unit"
        ? SORT_NAME
        : listSort.direction != null && listSort.columnId === "gid"
          ? SORT_GID
          : undefined;
    const sort_order =
      listSort.direction != null && sort_field != null
        ? listSort.direction
        : undefined;
    return {
      ...(sort_field != null && sort_order != null
        ? { sort_field, sort_order }
        : {}),
      ...(unitsApiSearch
        ? {
            search: unitsApiSearch.search,
            search_by: unitsApiSearch.search_by,
          }
        : {}),
    };
  }, [listSort.columnId, listSort.direction, unitsApiSearch]);

  // Fetches the list when dwId/query change; exposes rows, loading, refetch.
  const listState = useServerListQuery({
    listUrl: unitsListUrl,
    query: unitsListQuery,
    parseListResponse: parseUnitsListResponse,
    enabled: Boolean(dwId && unitsListUrl),
  });

  const { rows: serverRows, loading, meta } = listState;
  const [rows, setRows] = useState<UnitRaw[]>([]);
  const [optimisticTotalCount, setOptimisticTotalCount] = useState(0);
  const [optimisticTotalCountUnfiltered, setOptimisticTotalCountUnfiltered] =
    useState<number | undefined>(undefined);
  useEffect(() => {
    const gidExtra = unitsApiSearch?.clientGidSubstr?.trim();
    const formatExtra = debouncedFormat.trim().toLowerCase();
    let filtered = serverRows;
    if (gidExtra) {
      const g = gidExtra.toLowerCase();
      filtered = filtered.filter((r) =>
        (getUnitGid(r) ?? "").toLowerCase().includes(g)
      );
    }
    if (formatExtra) {
      const code = formatExtra.toUpperCase();
      filtered = filtered.filter(
        (r) => ((r.unit_format ?? r.u_format) ?? "").trim().toUpperCase() === code
      );
    }
    setRows(filtered);
  }, [serverRows, unitsApiSearch, debouncedFormat]);
  useEffect(() => {
    setOptimisticTotalCount(listState.totalCount);
    setOptimisticTotalCountUnfiltered(listState.totalCountUnfiltered);
  }, [listState.totalCount, listState.totalCountUnfiltered]);

  const tableRows = useMemo(() => {
    if (pinnedUnitRowIds.length === 0) return rows;
    const priority = new Map(pinnedUnitRowIds.map((id, i) => [id, i]));
    const head: UnitRaw[] = [];
    const tail: UnitRaw[] = [];
    for (const r of rows) {
      const id = unitRowId(r);
      if (id && priority.has(id)) head.push(r);
      else tail.push(r);
    }
    head.sort(
      (a, b) =>
        (priority.get(unitRowId(a)) ?? 0) - (priority.get(unitRowId(b)) ?? 0)
    );
    return [...head, ...tail];
  }, [rows, pinnedUnitRowIds]);

  const totalCount = optimisticTotalCount;
  const totalPages = listState.totalPages;

  const onSortUnit = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleUnitsListSort("unit", prev));
  }, []);

  const onSortGid = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleUnitsListSort("gid", prev));
  }, []);

  // Checkbox column: select every row on this page, or clear if already all selected.
  const selectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      const ids = rows.map(unitRowId).filter(Boolean);
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

  // Reset modal state when closing.
  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setUnitsToDelete([]);
    setDeleteAssoc(null);
    setDeleteAssocError(null);
    setDeleteRunError(null);
    setDeleteAssocLoading(false);
  }, []);

  // Bulk delete from toolbar: only rows that are checked on the current page.
  const openDeleteModal = useCallback(() => {
    const list: UnitRaw[] = [];
    for (const row of rows) {
      const id = unitRowId(row);
      if (id && selectedRowIds.has(id)) list.push(row);
    }
    if (list.length === 0) return;
    setUnitsToDelete(list);
    setDeleteAssoc(null);
    setDeleteAssocError(null);
    setDeleteRunError(null);
    setDeleteModalOpen(true);
  }, [rows, selectedRowIds]);

  // When the delete dialog opens, load how many linked rows (data / IUS) would be affected.
  useEffect(() => {
    if (!deleteModalOpen || unitsToDelete.length === 0 || !dwId) return;
    let cancelled = false;
    setDeleteAssocLoading(true);
    setDeleteAssoc(null);
    setDeleteAssocError(null);
    const ids = unitsToDelete
      .map((u) => getUnitDeleteIdentifier(u))
      .filter((s): s is string => Boolean(s));
    void fetchUnitAssociationCounts(dwId, ids).then((r) => {
      if (cancelled) return;
      setDeleteAssocLoading(false);
      if (r.success) setDeleteAssoc(r.data);
      else
        setDeleteAssocError(
          r.err_message ?? t("ASSOC_COUNTS_FAILED")
        );
    });
    return () => {
      cancelled = true;
    };
  }, [deleteModalOpen, dwId, unitsToDelete, t]);

  // Runs the actual delete: GID rows use bulk API; rows without GID delete one-by-one.
  const handleConfirmBulkDelete = useCallback(async () => {
    if (unitsToDelete.length === 0) return;
    setDeleteRunning(true);
    setDeleteRunError(null);
    const failed: string[] = [];
    const deletedRowIds = new Set<string>();

    const gidRows = unitsToDelete.filter((u) => Boolean(getUnitGid(u)));
    const gids = gidRows
      .map((u) => getUnitGid(u))
      .filter((g): g is string => Boolean(g));
    const nidOnlyRows = unitsToDelete.filter((u) => !getUnitGid(u));

    if (gids.length > 0) {
      const r = await multipleDeleteUnits(dwId, gids);
      if (!r.success) {
        failed.push(r.err_message ?? "Bulk delete failed");
      } else {
        const deletedNids = r.data?.deleted ?? [];
        if (deletedNids.length > 0) {
          const deletedNidSet = new Set(deletedNids);
          for (const u of gidRows) {
            const nid = u.unit_nid ?? u.u_nid;
            if (nid != null && deletedNidSet.has(nid)) {
              deletedRowIds.add(unitRowId(u));
            }
          }
        } else {
          // Some API variants don't return deleted NIDs; treat requested GIDs as deleted on success.
          for (const u of gidRows) {
            deletedRowIds.add(unitRowId(u));
          }
        }
        const metaErrs = r.meta?.errors;
        if (metaErrs && metaErrs.length > 0) {
          failed.push(
            `${metaErrs.length} unit(s) could not be deleted (check server errors).`
          );
        }
      }
    }

    for (const u of nidOnlyRows) {
      const id = getUnitDeleteIdentifier(u);
      if (!id) {
        failed.push("A row is missing a unit identifier.");
        continue;
      }
      const r = await deleteUnit(dwId, id);
      if (r.success) deletedRowIds.add(unitRowId(u));
      else {
        failed.push(
          `${getUnitName(u)}: ${r.err_message ?? "Delete failed"}`
        );
      }
    }

    setDeleteRunning(false);
    if (deletedRowIds.size > 0) {
      setRows((prev) => prev.filter((row) => !deletedRowIds.has(unitRowId(row))));
      setOptimisticTotalCount((prev) => Math.max(0, prev - deletedRowIds.size));
    }
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      for (const rid of deletedRowIds) next.delete(rid);
      return next;
    });

    if (failed.length === 0) {
      toast.success(
        `Deleted ${deletedRowIds.size} unit${deletedRowIds.size === 1 ? "" : "s"} successfully`
      );
      closeDeleteModal();
      return;
    }
    if (deletedRowIds.size > 0) {
      toast.warning(
        `Deleted ${deletedRowIds.size} unit${deletedRowIds.size === 1 ? "" : "s"}, but some deletions failed`
      );
    } else {
      toast.error("Failed to delete selected units");
    }
    setDeleteRunError(failed.join("\n"));
    const remaining = unitsToDelete.filter((u) => !deletedRowIds.has(unitRowId(u)));
    setUnitsToDelete(remaining);
    if (remaining.length === 0) closeDeleteModal();
  }, [unitsToDelete, dwId, closeDeleteModal]);

  // Changing page, filters, or sort shows a new result set — drop old row selection.
  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [page, pageSize, debouncedUnit, debouncedGid, debouncedFormat, listSort.columnId, listSort.direction]);

  const setInlineGidSanitized = useCallback((v: string) => {
    setInlineGid(sanitizeManualGidInput(v));
  }, []);

  // Put the cursor in the name, ID, or format field after the row switches to edit mode.
  const applyInlineFocus = useCallback(() => {
    const field = pendingInlineFocusFieldRef.current;
    const run = () => {
      const el =
        field === "gid"
          ? inlineGidInputRef.current
          : field === "format"
            ? inlineFormatInputRef.current
            : inlineNameInputRef.current;
      el?.focus();
      if (field !== "format") {
        (el as HTMLInputElement | null)?.select?.();
      }
    };
    requestAnimationFrame(run);
  }, []);

  // User opened inline edit (double-click or actions column).
  const onStartInlineEdit = useCallback(
    (row: UnitRaw, focus: "name" | "gid" | "format" = "name") => {
      if (!canUpdate) return;
      const id = unitRowId(row);
      if (!id) return;
      pendingInlineFocusFieldRef.current = focus;
      inlineFocusPendingRef.current = true;
      setInlineError(null);
      setActiveRowId(id);
      setEditingRowId(id);
      setInlineName(row.unit_name ?? row.u_name ?? "");
      setInlineGid(getUnitGid(row) ?? "");
      setInlineFormat((row.unit_format ?? row.u_format ?? "") || "");
      setInlineFormatSearch("");
      setInlineFormatDdOpen(false);
      setInlineFormatHi(-1);
    },
    [canUpdate]
  );

  // Auto-focus first input field when navigating to a data row with arrow keys
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
      
      // Auto-focus first input field when navigating to a data row
      setTimeout(() => {
        const focusedRow = document.activeElement?.closest('tr[data-tv-row-id]');
        if (focusedRow) {
          const firstInput = focusedRow.querySelector('input:not([type="checkbox"]):not([disabled])') as HTMLInputElement;
          if (firstInput && !firstInput.closest('.add-row')) {
            // Start inline edit for the focused row
            const rowId = focusedRow.getAttribute('data-tv-row-id');
            if (rowId) {
              const row = rows.find(r => unitRowId(r) === rowId);
              if (row && editingRowId !== rowId) {
                onStartInlineEdit(row);
              }
            }
          }
        }
      }, 0);
    };
    document.addEventListener("keydown", onArrowNavigation);
    return () => {
      document.removeEventListener("keydown", onArrowNavigation);
    };
  }, [rows, editingRowId, onStartInlineEdit]);

  const onInlineCancel = useCallback(() => {
    if (editingRowId) {
      setActiveRowId(editingRowId);
    }
    setInlineError(null);
    setInlineFormatSearch("");
    setInlineFormatDdOpen(false);
    setInlineFormatHi(-1);
    setEditingRowId(null);
  }, [editingRowId]);

  // Save inline edits: unit name and ID (PATCH requires a non-empty ID; POST may omit it).
  const onInlineSave = useCallback(async () => {
    if (!editingRowId || inlineSaveLoading) return;
    const savedRowId = editingRowId;
    const row = rows.find((r) => unitRowId(r) === editingRowId);
    if (!row) {
      setEditingRowId(null);
      return;
    }
    const identifier = getUnitDeleteIdentifier(row);
    if (!identifier) {
      toast.error("Unit identifier is missing.");
      return;
    }
    const name = inlineName.trim();
    if (!name) {
      toast.error("Unit name is required.");
      return;
    }
    const gidTrim = inlineGid.trim();
    if (!gidTrim) {
      toast.error(t("UNIT_ID_MANDATORY"));
      return;
    }
    if (sanitizeManualGidInput(gidTrim) !== gidTrim) {
      toast.error(t("GID_INVALID"));
      return;
    }
    setInlineSaveLoading(true);
    try {
      const formatVal = inlineFormat.trim();
      const payload: UpdateUnitPayload = {
        unit_name: name,
        unit_gid: gidTrim,
        ...(formatVal !== "" ? { unit_format: formatVal } : { unit_format: "" }),
      };
      const res = await updateUnit(dwId, identifier, payload);
      if (!res.success) {
        const msg = res.err_message ?? "Failed to update unit";
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      setInlineError(null);
      const updatedRow: UnitRaw = {
        ...row,
        unit_name: name,
        u_name: name,
        unit_gid: gidTrim,
        u_gid: gidTrim,
        unit_format: formatVal || null,
        u_format: formatVal || null,
      };
      const newRowId = unitRowId(updatedRow);
      setRows((prev) =>
        prev.map((r) => (unitRowId(r) === savedRowId ? updatedRow : r))
      );
      setEditingRowId(null);
      setActiveRowId(newRowId);
      setSelectedRowIds((prev) => {
        if (!prev.has(savedRowId) || savedRowId === newRowId) return prev;
        const next = new Set(prev);
        next.delete(savedRowId);
        next.add(newRowId);
        return next;
      });
      setPinnedUnitRowIds((prev) =>
        prev.map((id) => (id === savedRowId ? newRowId : id))
      );
      toast.success(t("UPDATE_SUCCESS"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update unit";
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setInlineSaveLoading(false);
    }
  }, [
    editingRowId,
    inlineSaveLoading,
    rows,
    inlineName,
    inlineGid,
    inlineFormat,
    dwId,
    t,
  ]);

  // If the row we were editing is no longer on this page, exit edit mode.
  useEffect(() => {
    if (!editingRowId) return;
    if (!rows.some((r) => unitRowId(r) === editingRowId)) {
      setEditingRowId(null);
    }
  }, [rows, editingRowId]);

  // Runs once when entering edit mode so we focus name or ID without stealing focus on every render.
  useLayoutEffect(() => {
    if (!editingRowId || !inlineFocusPendingRef.current) return;
    inlineFocusPendingRef.current = false;
    applyInlineFocus();
  }, [editingRowId, applyInlineFocus]);

  // Top "add unit" row: create one unit (and optional GID), then clear inputs and reload.
  const handleAddSave = useCallback(async () => {
    const name = newUnitName.trim();
    if (!name || addSaving || editingRowId != null) return;
    const gid = newUnitGid.trim();
    if (gid && sanitizeManualGidInput(gid) !== gid) {
      toast.error(t("GID_INVALID"));
      return;
    }
    setAddSaving(true);
    try {
      const format = newUnitFormat.trim();
      const payload: CreateUnitPayload = { unit_name: name };
      if (gid) payload.unit_gid = gid;
      if (format) payload.unit_format = format;
      const res = await createUnits(dwId, [payload]);
      if (!res.success) {
        const msg = res.err_message ?? t("CREATE_FAILED");
        toast.error(msg);
        return;
      }
      const createdList = Array.isArray(res.data) ? res.data : [];
      const rowErrorDetail = formatCreateUnitsRowErrors(res.meta);
      // API can return success: true with empty data when every row failed (e.g. duplicate name).
      if (createdList.length === 0) {
        const msg = buildCreateUnitsUserMessage(res, t("CREATE_FAILED"));
        toast.error(msg);
        return;
      }
      setNewUnitName("");
      setNewUnitGid("");
      setNewUnitFormat("");
      setNewUnitFormatSearch("");
      setAddRowFormatDdOpen(false);
      setAddRowFormatHi(-1);
      const created = createdList[0];
      const rowToInsert = unitRowFromCreateResponse(created, name, gid, format);
      const createdGid = rowToInsert.unit_gid ?? rowToInsert.u_gid ?? "";
      const createdNid = rowToInsert.unit_nid ?? rowToInsert.u_nid;
      const createdRowId = createdGid
        ? createdGid
        : createdNid != null
          ? `nid-${createdNid}`
          : "";
      setRows((prev) => [rowToInsert, ...prev]);
      if (createdRowId) {
        setPage(1);
        setRecentCreatedRowIds([createdRowId]);
        setPinnedUnitRowIds((prev) => [
          createdRowId,
          ...prev.filter((x) => x !== createdRowId),
        ]);
        setActiveRowId(createdRowId);
      }
      if (rowErrorDetail) {
        toast.warning(
          buildCreateUnitsUserMessage(res, t("CREATE_SUCCESS"))
        );
      } else {
        toast.success(t("CREATE_SUCCESS"));
      }
      setAddRowExpanded(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create unit";
      toast.error(msg);
    } finally {
      setAddSaving(false);
    }
  }, [dwId, newUnitName, newUnitGid, newUnitFormat, addSaving, editingRowId, t]);

  const handleAddCancel = useCallback(() => {
    setNewUnitName("");
    setNewUnitGid("");
    setNewUnitFormat("");
    setNewUnitFormatSearch("");
    setAddRowFormatDdOpen(false);
    setAddRowFormatHi(-1);
    setAddRowExpanded(false);
  }, []);

  // True when every visible row is checked (used for the header "select all" checkbox).
  const allRowsSelected = useMemo(() => {
    const ids = rows.map(unitRowId).filter(Boolean);
    return ids.length > 0 && ids.every((id) => selectedRowIds.has(id));
  }, [rows, selectedRowIds]);

  const unitSortIcon = useMemo(
    () => unitsSortHeaderMaterialIcon("unit", listSort.columnId, listSort.direction),
    [listSort.columnId, listSort.direction]
  );
  const gidSortIcon = useMemo(
    () => unitsSortHeaderMaterialIcon("gid", listSort.columnId, listSort.direction),
    [listSort.columnId, listSort.direction]
  );

  const editingRowOriginalFormat = useMemo(() => {
    if (!editingRowId) return undefined;
    const row = rows.find((r) => unitRowId(r) === editingRowId);
    const format = ((row?.unit_format ?? row?.u_format) ?? "").trim();
    return format || undefined;
  }, [editingRowId, rows]);

  const inUseUnitFormatCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const row of rows) {
      const format = ((row.unit_format ?? row.u_format) ?? "").trim();
      if (format) codes.add(format);
    }
    return [...codes];
  }, [rows]);

  const unitFormatEditLegacyValues = useMemo(() => {
    const codes = new Set<string>();
    for (const code of [
      editingRowOriginalFormat,
      inlineFormat.trim() || undefined,
      newUnitFormat.trim() || undefined,
    ]) {
      if (code) codes.add(code);
    }
    return [...codes];
  }, [editingRowOriginalFormat, inlineFormat, newUnitFormat]);

  const {
    filterOptions: formatFilterOptions,
    editOptions: formatEditOptions,
    displayOptions: formatDisplayOptions,
  } = useUnitDataFormatOptions(t, {
    editLegacyValues: unitFormatEditLegacyValues,
    displayLegacyValues: inUseUnitFormatCodes,
  });

  const filteredInlineFormatOptions = useMemo(() => {
    if (!editingRowId) return [];
    return filterUnitFormatSelectOptions(
      formatEditOptions,
      inlineFormatSearch,
      inlineFormat ? [inlineFormat] : []
    );
  }, [editingRowId, formatEditOptions, inlineFormatSearch, inlineFormat]);

  const filteredAddRowFormatOptions = useMemo(
    () =>
      filterUnitFormatSelectOptions(
        formatEditOptions,
        newUnitFormatSearch,
        newUnitFormat ? [newUnitFormat] : []
      ),
    [formatEditOptions, newUnitFormatSearch, newUnitFormat]
  );

  const addRowFormatComboOptions = useMemo(
    () => unitFormatOptionsToComboboxOptions(filteredAddRowFormatOptions),
    [filteredAddRowFormatOptions]
  );

  // Column defs: filters, sort, selection, inline edit, delete — see unitsGridColumns.tsx.
  const unitsColumns = useUnitsGridColumns({
    t,
    allRowsSelected,
    selectedRowIds,
    selectAll,
    toggleSelect,
    colFilterUnit,
    setColFilterUnit,
    colFilterGid,
    setColFilterGid,
    colFilterFormat,
    setColFilterFormat,
    onSortUnit,
    onSortGid,
    unitSortIcon,
    gidSortIcon,
    editingRowId,
    inlineName,
    setInlineName: (v) => setInlineName(v),
    inlineNameInputRef,
    inlineGid,
    setInlineGid: setInlineGidSanitized,
    inlineGidInputRef,
    inlineFormat,
    setInlineFormat,
    inlineFormatSearch,
    setInlineFormatSearch,
    inlineFormatDdOpen,
    setInlineFormatDdOpen,
    inlineFormatHi,
    setInlineFormatHi,
    inlineFormatInputRef,
    filteredInlineFormatOptions,
    formatFilterOptions,
    formatEditOptions,
    formatDisplayOptions,
    inlineSaveLoading,
    onStartInlineEdit,
    onInlineSave,
    onInlineCancel,
  });

  const unitsListAddRowExpandedFields = useMemo((): ServerDrivenListAddRowField[] => {
    const addRowDisabled = addSaving || !canCreate;
    return [
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" aria-hidden />,
      },
      {
        kind: "text" as const,
        value: newUnitName,
        onChange: setNewUnitName,
        placeholder: t("UNIT_NAME"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        disabled: addRowDisabled,
        ariaLabel: t("NEW_UNIT_NAME"),
        inputRef: addRowNameInputRef,
      },
      {
        kind: "text" as const,
        value: newUnitGid,
        onChange: (value) => setNewUnitGid(sanitizeManualGidInput(value)),
        placeholder: t("ADD_PLACEHOLDER_GID"),
        inputClassName: gridTextFieldClassName("min-w-0 text-xs"),
        disabled: addRowDisabled,
        ariaLabel: t("LABEL_UNIT_ID"),
        onEnter: () => void handleAddSave(),
      },
      {
        kind: "custom" as const,
        content: (
          <SearchableListCombobox
            inputRef={addRowFormatInputRef}
            inputClassName={gridTextFieldClassName("min-w-0")}
            placeholder={t("UNIT_FORMAT_COMBO_PLACEHOLDER")}
            disabled={addRowDisabled}
            ariaLabel={t("UNIT_FORMAT", "Format")}
            inputValue={
              addRowFormatDdOpen
                ? newUnitFormatSearch
                : newUnitFormat
                  ? resolveUnitFormatLabel(newUnitFormat, formatEditOptions) ||
                    newUnitFormat
                  : ""
            }
            onInputChange={(v) => {
              setNewUnitFormatSearch(v);
              setAddRowFormatDdOpen(true);
              setAddRowFormatHi(-1);
              if (!v.trim()) {
                setNewUnitFormat("");
              }
            }}
            open={addRowFormatDdOpen}
            onOpenChange={(open) => {
              setAddRowFormatDdOpen(open);
              if (!open) {
                setAddRowFormatHi(-1);
                setNewUnitFormatSearch("");
              }
            }}
            highlightIndex={addRowFormatHi}
            onHighlightChange={setAddRowFormatHi}
            navigableCount={addRowFormatComboOptions.length}
            options={addRowFormatComboOptions}
            selectedId={newUnitFormat}
            onSelect={(id) => {
              setNewUnitFormat(id);
              setNewUnitFormatSearch("");
              setAddRowFormatDdOpen(false);
              setAddRowFormatHi(-1);
            }}
            onEnterWhenClosed={() => void handleAddSave()}
            emptyMessage={t("NO_FORMAT_MATCH")}
            openOnArrowDown={false}
            menuPortal
          />
        ),
      },
    ];
  }, [
    newUnitName,
    newUnitGid,
    newUnitFormat,
    newUnitFormatSearch,
    addRowFormatDdOpen,
    addRowFormatHi,
    formatEditOptions,
    addRowFormatComboOptions,
    addSaving,
    canCreate,
    handleAddSave,
    t,
  ]);

  // Sidebar: show "bulk delete" only while this page is mounted; disabled when nothing selected or no permission.
  useEffect(() => {
    setBulkDelete({
      onClick: openDeleteModal,
      disabled: selectedRowIds.size === 0 || !canDelete,
    });
    return () => setBulkDelete(null);
  }, [setBulkDelete, openDeleteModal, selectedRowIds.size, canDelete]);

  // Sidebar: export button downloads API export file (server-side, not local rows).
  useEffect(() => {
    setToolbarExport({
      onClick: async () => {
        if (!dwId || exportBusyRef.current) return;
        exportBusyRef.current = true;
        try {
          const result = await downloadUnitsExport(dwId, unitsExportQuery, {
            requestFailed: t("REQUEST_FAILED", "Request failed"),
            exportFailed: t("EXPORT_FAILED", "Export failed"),
            unexpectedJsonResponse: t(
              "UNITS_EXPORT_UNEXPECTED_JSON",
              "Unexpected JSON response while exporting units."
            ),
            unexpectedResponse: t(
              "UNITS_EXPORT_UNEXPECTED_RESPONSE",
              "Unexpected export response."
            ),
          });
          if (!result.ok) {
            toast.error(t("ERROR_MESSAGE", result.message));
          } else {
            toast.success(t("EXPORT_SUCCESS"));
          }
        } catch (e) {
          toast.error(
            t(
              "EXPORT_FAILED",
              e instanceof Error ? e.message : "Export failed"
            )
          );
        } finally {
          exportBusyRef.current = false;
        }
      },
      disabled: !dwId,
    });
    return () => setToolbarExport(null);
  }, [dwId, unitsExportQuery, setToolbarExport, t]);

  useEffect(() => {
    setToolbarImport({
      onClick: () => {},
      disabled: !dwId || !canCreate,
    });
    return () => setToolbarImport(null);
  }, [dwId, canCreate, setToolbarImport]);

  if (!allowed) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden">
      {inlineError ? (
        <div className="inline-alert--error mx-4 mt-2">
          {inlineError}
        </div>
      ) : null}

      {/* Table: server-paged list + add row + body cells from unitsColumns */}
      <ServerDrivenTable<UnitRaw, UnitsListMeta>
        listState={listState}
        columns={unitsColumns}
        selection={{
          count: selectedRowIds.size,
          onClear: clearSelection,
        }}
        scrollRef={tblScrollRef}
        renderThead={() => (
          <thead>
            <EditableDataGridThead columns={unitsColumns} />
          </thead>
        )}
        tbody={
          <ServerDrivenListTbody<UnitRaw>
            colSpan={5}
            rows={tableRows}
            columns={unitsColumns}
            getRowId={unitRowId}
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
              recentCreatedRowIdSet.has(unitRowId(row))
                ? TV_ROW_NEWLY_ADDED_CLASS
                : ""
            }
            emptyMessage={t("EMPTY_UNITS")}
            showLoadingRow={false}
            showEmptyRow={!loading && rows.length === 0}
            showDataRows={!loading}
            addRow={{
              ref: addRowRef,
              promptLabel: t("ADD_UNIT_PROMPT"),
              expanded: addRowExpanded,
              onExpandedChange: setAddRowExpanded,
              primaryColumnId: "unit",
              disabled: !canCreate,
              disabledTitle: t("NO_PERMISSION_CREATE"),
              onExpand: () => {
                queueMicrotask(() => addRowNameInputRef.current?.focus());
              },
              className: `add-row${addRowExpanded ? "" : " add-row-collapsed"}${!canCreate ? " add-row-interaction-blocked" : ""}`,
              ariaDisabled: !canCreate,
              title: !canCreate ? t("NO_PERMISSION_CREATE") : undefined,
              onRowEnterAtEnd: () => {
                if (!canCreate) return;
                if (!addRowExpanded) {
                  setAddRowExpanded(true);
                  queueMicrotask(() => addRowNameInputRef.current?.focus());
                  return;
                }
                void handleAddSave();
              },
              onRowEscape: () => {
                if (addRowExpanded) {
                  handleAddCancel();
                }
              },
              onArrowIntoRow: canCreate ? () => {
                setAddRowExpanded(true);
              } : undefined,
              onArrowLeaveRow: canCreate ? handleAddCancel : undefined,
              expandedFields: unitsListAddRowExpandedFields,
              collapsedSave: {
                title: t("ADD_SAVE_TITLE_NEED_NAME"),
                ariaLabel: t("ADD_SAVE_ARIA_NEED_NAME"),
              },
              collapsedCancel: {
                title: t("ADD_CLEAR_ROW"),
                ariaLabel: t("ADD_CLEAR_ROW"),
              },
              showActionsColumn: canCreate,
              actionsWidth: "icon",
              save: {
                title: !newUnitName.trim()
                  ? t("ADD_SAVE_TITLE_NEED_NAME")
                  : t("SAVE_NEW_UNIT"),
                ariaLabel: !newUnitName.trim()
                  ? t("ADD_SAVE_ARIA_NEED_NAME")
                  : t("SAVE_NEW_UNIT"),
                disabled: addSaving || !newUnitName.trim() || !canCreate,
                onClick: () => void handleAddSave(),
              },
              cancel: {
                title: t("ADD_CLEAR_ROW"),
                ariaLabel: t("ADD_CLEAR_ROW"),
                disabled: addSaving || !canCreate,
                onClick: handleAddCancel,
              },
            }}
          />
        }
        pagination={{
          page,
          displayPage: meta?.page ?? page,
          totalPages,
          totalCount,
          totalCountUnfiltered: optimisticTotalCountUnfiltered,
          pageSize,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
          countNoun: t("UNITS"),
          labels: { t },
        }}
      />

      {/* Confirm delete: list units, show impact preview, then delete or show errors */}
      <DeletePermanentConfirmModal
        open={deleteModalOpen}
        onClose={closeDeleteModal}
        title={t("DELETE_UNITS")}
        titleId="dm-units-delete-title"
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
                  dataCount: deleteAssoc.data_rows,
                  iusCount: deleteAssoc.ius_rows,
                }
              )
            : null,
        }}
        runError={deleteRunError}
      >
        <p className="modal-lead">
          {t("DELETE_UNITS_MODAL_LEAD").replace(
            "{count}",
            String(unitsToDelete.length)
          )}
        </p>
        <ul className="modal-list">
          {unitsToDelete.map((u, idx) => {
            const nid = u.unit_nid ?? u.u_nid;
            return (
              <li key={unitRowId(u) || `unit-del-${idx}`}>
                <span className="modal-list-name">
                  {getUnitName(u) || `NID ${nid ?? "?"}`}
                </span>
                {getUnitGid(u) ? (
                  <span className="modal-list-meta">{getUnitGid(u)}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </DeletePermanentConfirmModal>
    </div>
  );
}
