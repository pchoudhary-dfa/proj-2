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
import { useSidebar, type FileImportSubmitPayload } from "@/contexts/SidebarContext";
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
  CreateTimePeriodPayload,
  CreateTimePeriodsResponse,
  CreateTimePeriodsResult,
  DeleteTimePeriodResult,
  MultipleDeleteTimePeriodsResult,
  TimePeriodAssociationCountsData,
  TimePeriodAssociationCountsResult,
  TimePeriodRaw,
  TimePeriodsListMeta,
  TimePeriodsListResponse,
  TimePeriodsListResult,
  UpdateTimePeriodPayload,
} from "@/lib/api/types";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import {
  getDWAPIURL,
  REFERENCE_PATH_TIME_PERIODS,
} from "@/lib/constants";
import {
  EditableDataGridThead,
  ServerDrivenListTbody,
  ServerDrivenTable,
  useServerListQuery,
  type ServerDrivenListAddRowField,
  type ServerListParseResult,
} from "@/components/TableView";
import { gridTextFieldClassName } from "@/components/TextField";
import { MainTabsBar } from "@/components/MainTabsBar";
import {
  dataIusAssociationImpactLines,
  DeletePermanentConfirmModal,
} from "@/components/DeletePermanentConfirmModal";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import {
  TV_COL_PRIMARY_STICKY_TD,
  TV_COL_SELECT_TD,
} from "@/components/editableGridColumnClasses";
import { SearchableListCombobox } from "@/components/SearchableListCombobox";
import {
  formatTimePeriodDateDisplay,
  timeperiodRowId,
  useTimePeriodGridColumns,
} from "./timeperiodGridColumns";

/**
 * Time periods list API `sort_field` query values (OpenAPI):
 * `tp_nid` | `timeperiod` | `startdate` | `enddate` | `periodicity`.
 */
const TP_SORT_FIELD = {
  periodicity: "periodicity",
  timeperiod: "timeperiod",
  startdate: "startdate",
  enddate: "enddate",
} as const;

const TP_SORT_FIELD_DEFAULT = "tp_nid" as const;

type TimePeriodListSortColumnId = keyof typeof TP_SORT_FIELD;

type TimePeriodListSortState = {
  columnId: TimePeriodListSortColumnId | null;
  direction: "asc" | "desc" | null;
};

function cycleTimePeriodListSort(
  columnId: TimePeriodListSortColumnId,
  prev: TimePeriodListSortState
): TimePeriodListSortState {
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

function timePeriodSortHeaderMaterialIcon(
  columnId: TimePeriodListSortColumnId,
  activeColumnId: TimePeriodListSortState["columnId"],
  direction: TimePeriodListSortState["direction"]
): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (activeColumnId === columnId && direction === "asc") return "arrow_upward";
  if (activeColumnId === columnId && direction === "desc") return "arrow_downward";
  return "unfold_more";
}

const MAX_TP_LABEL_LEN = 30;

type TimePeriodTabId = "all" | "missing_data";

const TIMEPERIOD_SCOPE_BY_TAB: Record<
  Exclude<TimePeriodTabId, "all">,
  "NO_DATA"
> = {
  missing_data: "NO_DATA",
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

/** First string candidate with non-whitespace content (API often sends `""` on one key and real value on `tp_*`). */
function firstNonBlankStr(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c);
    if (s.trim()) return s;
  }
  return "";
}

/** Normalizes list/create payloads: `id` or `timeperiod_nid`, and flat vs `tp_*` field names. */
function normalizeTimePeriodRaw(raw: Record<string, unknown>): TimePeriodRaw {
  const idRaw = raw.id ?? raw.timeperiod_nid ?? raw.tp_nid;
  let id: number | undefined;
  if (typeof idRaw === "number" && Number.isFinite(idRaw)) id = idRaw;
  else if (typeof idRaw === "string" && idRaw.trim() !== "") {
    const n = Number(idRaw);
    if (!Number.isNaN(n)) id = n;
  }
  const tp = firstNonBlankStr(raw.tp_timeperiod, raw.timeperiod);
  const sd = firstNonBlankStr(raw.tp_startdate, raw.startdate);
  const ed = firstNonBlankStr(raw.tp_enddate, raw.enddate);
  const per = firstNonBlankStr(raw.tp_periodicity, raw.periodicity);
  return {
    ...raw,
    id,
    timeperiod: tp,
    startdate: sd,
    enddate: ed,
    periodicity: per,
  };
}

function isTimePeriodsListResponse(
  r: TimePeriodsListResult
): r is TimePeriodsListResponse {
  return r.success === true && Array.isArray((r as TimePeriodsListResponse).data);
}

function getTimePeriodPatchIdentifier(row: TimePeriodRaw): string | null {
  if (row.id != null) return String(row.id);
  const tp = (row.timeperiod ?? "").trim();
  if (tp) return tp;
  return null;
}

const TIMEPERIOD_LABEL_FORMAT_BY_CODE: Record<string, string> = {
  A: "yyyy / yyyy-yyyy",
  M: "yyyy.mm / yyyy.mm-yyyy.mm",
  Q: "Qn.yyyy / Qn.yyyy-Qn.yyyy",
  H: "yyyy.mm / yyyy.mm-yyyy.mm",
  D: "yyyy.mm.dd / yyyy.mm.dd-yyyy.mm.dd",
  F: "yyyy.mm.dd / yyyy.mm.dd-yyyy.mm.dd",
};

function getTimePeriodFormatPlaceholder(
  periodicityCode: string | undefined,
  t: (code: string, fallback?: string) => string
): string {
  const raw = (periodicityCode ?? "").trim();
  if (!raw) return t("TIMEPERIOD_ADD_PLACEHOLDER_LABEL");
  const c = raw[0]!.toUpperCase();
  const format = TIMEPERIOD_LABEL_FORMAT_BY_CODE[c];
  if (!format) return t("TIMEPERIOD_ADD_PLACEHOLDER_LABEL");
  return format;
}

function formatCreateTimePeriodRowErrors(
  meta: CreateTimePeriodsResponse["meta"] | undefined
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

function buildCreateTimePeriodsUserMessage(
  res: CreateTimePeriodsResponse,
  fallback: string
): string {
  const rowDetail = formatCreateTimePeriodRowErrors(res.meta);
  const apiMsg =
    typeof res.message === "string" && res.message.trim()
      ? res.message.trim()
      : "";
  if (apiMsg && rowDetail) return `${apiMsg} — ${rowDetail}`;
  if (rowDetail) return rowDetail;
  return apiMsg || fallback;
}

function timePeriodRowFromCreateResponse(
  api: TimePeriodRaw,
  form: CreateTimePeriodPayload
): TimePeriodRaw {
  const merged = normalizeTimePeriodRaw({
    ...api,
    tp_timeperiod: form.tp_timeperiod,
    tp_periodicity: form.tp_periodicity,
  });
  return merged;
}

async function createTimePeriods(
  dwId: string,
  data: CreateTimePeriodPayload[]
): Promise<CreateTimePeriodsResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS);
  const json = await postRequest(url, data, undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as CreateTimePeriodsResult;
}

async function updateTimePeriod(
  dwId: string,
  identifier: string,
  payload: UpdateTimePeriodPayload
): Promise<
  | { success: true; data?: Record<string, unknown> }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS)}/${encodeURIComponent(identifier)}`;
  const body: Record<string, unknown> = {};
  if (payload.tp_timeperiod != null) body.tp_timeperiod = payload.tp_timeperiod;
  if (payload.tp_startdate != null) body.tp_startdate = payload.tp_startdate;
  if (payload.tp_enddate != null) body.tp_enddate = payload.tp_enddate;
  if (payload.tp_periodicity != null) body.tp_periodicity = payload.tp_periodicity;
  const json = await patchRequest(url, body, undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as
    | { success: true; data?: Record<string, unknown> }
    | { success: false; err_message?: string; errors?: Record<string, unknown> };
}

/** Accepts `data_count` (per OpenAPI) or legacy `data_rows` / `dw_data_count` keys from the backend. */
async function fetchTimePeriodAssociationCounts(
  dwId: string,
  identifiers: string[]
): Promise<TimePeriodAssociationCountsResult> {
  const params = new URLSearchParams();
  if (identifiers.length > 0) params.set("identifier", identifiers.join(","));
  const q = params.toString();
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS)}/association-count${q ? `?${q}` : ""}`;
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
    const data_count =
      Number(
        d.data_count ?? d.data_rows ?? d.dw_data_count ?? 0
      ) || 0;
    return {
      success: true,
      message: json.message as string | undefined,
      data: { data_count },
    };
  }
  return {
    success: false,
    err_message:
      (json.err_message as string) ??
      "Invalid time period association-count response",
    errors: json.errors as Record<string, unknown> | undefined,
  };
}

async function deleteTimePeriod(
  dwId: string,
  identifier: string
): Promise<DeleteTimePeriodResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS)}/${encodeURIComponent(identifier)}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return json as DeleteTimePeriodResult;
  }
  return { success: true } as DeleteTimePeriodResult;
}

async function multipleDeleteTimePeriods(
  dwId: string,
  identifiers: string[]
): Promise<MultipleDeleteTimePeriodsResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS)}/multiple-delete`;
  const json = (await postRequest(
    url,
    { identifier: identifiers },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;
  if (json.success === true) {
    return {
      success: true,
      message: json.message as string | undefined,
      data: json.data,
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

/**
 * GET /dw/{dw_id}/time-periods?export=true — returns XLSX (full warehouse time periods).
 */
async function downloadTimePeriodsExport(
  dwId: string,
  params: {
    sort_field: string;
    sort_order: string;
    search?: string;
  },
  messages: {
    requestFailed: string;
    exportFailed: string;
    unexpectedJsonResponse: string;
    unexpectedResponse: string;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set("export", "true");
  searchParams.set("sort_order", params.sort_order);
  searchParams.set("sort_field", params.sort_field);
  if (params.search?.trim()) searchParams.set("search", params.search.trim());

  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS)}?${searchParams.toString()}`;
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
  let filename = "time_periods_export.xlsx";
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

export default function TimeperiodPage() {
  const {
    dwId,
    setToolbarExport,
    setToolbarImport,
    setFileImportSubmitHandler,
    setFileImportTemplateHandler,
    setBulkDelete,
  } = useSidebar();
  const { t } = useCore();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.dataManagement.timePeriod, {
    parentResourceCode: DW_ROUTE_PERMISSIONS.dataManagement.parent,
  });
  const { canCreate, canUpdate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.dataManagement.timePeriod
  );
  const tblScrollRef = useRef<HTMLDivElement>(null);
  const addRowRef = useRef<HTMLTableRowElement>(null);
  const addRowPeriodicityInputRef = useRef<HTMLInputElement>(null);
  const periodicityListRef = useRef<HTMLDivElement>(null);
  const addRowLabelInputRef = useRef<HTMLInputElement>(null);
  const exportBusyRef = useRef(false);
  const inlinePeriodicityInputRef = useRef<HTMLInputElement>(null);
  const inlineLabelInputRef = useRef<HTMLInputElement>(null);
  const pendingInlineFocusRef = useRef(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(
    DEFAULT_TABLE_PAGE_SIZES[0]
  );
  const [listSort, setListSort] = useState<TimePeriodListSortState>({
    columnId: null,
    direction: null,
  });

  // --- Column filters (debounced so we do not hit the API on every keystroke) ---
  const [colFilterTimeperiod, setColFilterTimeperiod] = useState("");
  const debouncedTimeperiod = useDebounce(colFilterTimeperiod, 300);

  const [colFilterStartdate, setColFilterStartdate] = useState("");
  const [colFilterEnddate, setColFilterEnddate] = useState("");
  const [colFilterPeriodicity, setColFilterPeriodicity] = useState("");
  const debouncedColStartdate = useDebounce(colFilterStartdate, 300);
  const debouncedColEnddate = useDebounce(colFilterEnddate, 300);
  const debouncedColPeriodicity = useDebounce(colFilterPeriodicity, 300);

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<TimePeriodTabId>("all");
  const [tabSwitchPending, setTabSwitchPending] = useState(false);

  const [newLabel, setNewLabel] = useState("");
  const [newPeriodicity, setNewPeriodicity] = useState("");
  const [periodicityDropdownOpen, setPeriodicityDropdownOpen] = useState(false);
  const [addRowPeriodicityHighlightIdx, setAddRowPeriodicityHighlightIdx] =
    useState(-1);
  const [periodicitySearch, setPeriodicitySearch] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addRowExpanded, setAddRowExpanded] = useState(false);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineLabel, setInlineLabel] = useState("");
  const [inlineStartdate, setInlineStartdate] = useState("");
  const [inlineEnddate, setInlineEnddate] = useState("");
  const [inlinePeriodicity, setInlinePeriodicity] = useState("");
  const [inlineSaveLoading, setInlineSaveLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

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
  const [rowsToDelete, setRowsToDelete] = useState<TimePeriodRaw[]>([]);
  const [deleteAssocLoading, setDeleteAssocLoading] = useState(false);
  const [deleteAssoc, setDeleteAssoc] =
    useState<TimePeriodAssociationCountsData | null>(null);
  const [deleteAssocError, setDeleteAssocError] = useState<string | null>(null);
  const [deleteRunError, setDeleteRunError] = useState<string | null>(null);
  const [deleteRunning, setDeleteRunning] = useState(false);

  /** Same contract as indicator list: `search` and `search_by` are pipe-aligned term lists. */
  const buildSearchBy = useCallback(() => {
    const parts: string[] = [];
    const terms: string[] = [];
    const per = debouncedColPeriodicity.trim();
    if (per) {
      parts.push("tp_periodicity");
      terms.push(per);
    }
    const tp = debouncedTimeperiod.trim();
    if (tp) {
      parts.push("tp_timeperiod");
      terms.push(tp);
    }
    const sd = debouncedColStartdate.trim();
    if (sd) {
      parts.push("tp_startdate");
      terms.push(sd);
    }
    const ed = debouncedColEnddate.trim();
    if (ed) {
      parts.push("tp_enddate");
      terms.push(ed);
    }
    const searchBy = parts.join("|");
    const search = terms.join("|");
    return {
      search: terms.length ? search : undefined,
      search_by: searchBy || undefined,
    };
  }, [
    debouncedTimeperiod,
    debouncedColStartdate,
    debouncedColEnddate,
    debouncedColPeriodicity,
  ]);

  const listUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS) : ""),
    [dwId]
  );

  const parseListResponse = useCallback(
    (json: unknown): ServerListParseResult<TimePeriodRaw, TimePeriodsListMeta> => {
      const r = json as TimePeriodsListResult;
      if (!isTimePeriodsListResponse(r)) {
        const msg =
          typeof (r as { err_message?: string })?.err_message === "string"
            ? (r as { err_message: string }).err_message
            : "Failed to load time periods";
        return { ok: false, message: msg };
      }
      const rows = (r.data ?? []).map((item) =>
        normalizeTimePeriodRaw(item as Record<string, unknown>)
      );
      const totals = parseListMetaTotals(r.meta);
      return {
        ok: true,
        rows,
        ...totals,
        meta: r.meta,
      };
    },
    []
  );

  const listQuery = useMemo(() => {
    const { search, search_by } = buildSearchBy();
    const sort_field =
      listSort.direction != null && listSort.columnId != null
        ? TP_SORT_FIELD[listSort.columnId]
        : TP_SORT_FIELD_DEFAULT;
    const sort_order =
      listSort.direction != null && listSort.columnId != null
        ? listSort.direction
        : "asc";
    return {
      page,
      page_size: pageSize,
      sort_field,
      sort_order,
      ...(search != null && search !== "" ? { search } : {}),
      ...(search_by != null && search_by !== "" ? { search_by } : {}),
      ...(activeTab === "all"
        ? {}
        : { scope: TIMEPERIOD_SCOPE_BY_TAB[activeTab] }),
    };
  }, [
    page,
    pageSize,
    listSort.columnId,
    listSort.direction,
    buildSearchBy,
    activeTab,
  ]);

  const exportParams = useMemo(() => {
    const sort_field =
      listSort.direction != null && listSort.columnId != null
        ? TP_SORT_FIELD[listSort.columnId]
        : TP_SORT_FIELD_DEFAULT;
    const sort_order =
      listSort.direction != null && listSort.columnId != null
        ? listSort.direction
        : "asc";
    const tp = debouncedTimeperiod.trim();
    return {
      sort_field,
      sort_order,
      ...(tp ? { search: tp } : {}),
    };
  }, [listSort.columnId, listSort.direction, debouncedTimeperiod]);

  const exportParamsRef = useRef(exportParams);
  exportParamsRef.current = exportParams;

  const listState = useServerListQuery({
    listUrl,
    query: listQuery,
    parseListResponse,
    enabled: Boolean(dwId && listUrl),
  });

  const { rows: serverRows, loading, meta, refetch } = listState;
  const [rows, setRows] = useState<TimePeriodRaw[]>([]);
  useEffect(() => {
    setRows(serverRows);
  }, [serverRows]);

  const totalCount = listState.totalCount;
  const totalCountUnfiltered = listState.totalCountUnfiltered;
  const totalPages = listState.totalPages;

  const showTabSwitchLoader = tabSwitchPending && loading;

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    setTabSwitchPending(true);
  }, [activeTab]);

  useEffect(() => {
    if (!loading) setTabSwitchPending(false);
  }, [loading]);

  const onSortPeriodicity = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleTimePeriodListSort("periodicity", prev));
  }, []);

  const onSortTimeperiod = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleTimePeriodListSort("timeperiod", prev));
  }, []);

  const onSortStartdate = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleTimePeriodListSort("startdate", prev));
  }, []);

  const onSortEnddate = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleTimePeriodListSort("enddate", prev));
  }, []);

  const periodicitySortIcon = useMemo(
    () =>
      timePeriodSortHeaderMaterialIcon(
        "periodicity",
        listSort.columnId,
        listSort.direction
      ),
    [listSort.columnId, listSort.direction]
  );
  const timeperiodSortIcon = useMemo(
    () =>
      timePeriodSortHeaderMaterialIcon(
        "timeperiod",
        listSort.columnId,
        listSort.direction
      ),
    [listSort.columnId, listSort.direction]
  );
  const startdateSortIcon = useMemo(
    () =>
      timePeriodSortHeaderMaterialIcon(
        "startdate",
        listSort.columnId,
        listSort.direction
      ),
    [listSort.columnId, listSort.direction]
  );
  const enddateSortIcon = useMemo(
    () =>
      timePeriodSortHeaderMaterialIcon(
        "enddate",
        listSort.columnId,
        listSort.direction
      ),
    [listSort.columnId, listSort.direction]
  );

  const selectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      const ids = rows.map(timeperiodRowId).filter(Boolean);
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
    const list: TimePeriodRaw[] = [];
    for (const row of rows) {
      const id = timeperiodRowId(row);
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
      .map((r) => getTimePeriodPatchIdentifier(r))
      .filter((s): s is string => Boolean(s));
    void fetchTimePeriodAssociationCounts(dwId, ids).then((r) => {
      if (cancelled) return;
      setDeleteAssocLoading(false);
      if (r.success) setDeleteAssoc(r.data);
      else
        setDeleteAssocError(r.err_message ?? t("ASSOC_COUNTS_FAILED"));
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
      .map((r) => getTimePeriodPatchIdentifier(r))
      .filter((s): s is string => Boolean(s));
    if (identifiers.length === 0) {
      setDeleteRunning(false);
      setDeleteRunError(t("TIMEPERIOD_IDENTIFIER_MISSING"));
      return;
    }

    const res = await multipleDeleteTimePeriods(dwId, identifiers);
    setDeleteRunning(false);

    if (!res.success) {
      setDeleteRunError(res.err_message ?? t("BULK_DELETE_FAILED"));
      return;
    }

    const deletedIds = new Set(rowsToDelete.map(timeperiodRowId));
    setRows((prev) => prev.filter((row) => !deletedIds.has(timeperiodRowId(row))));
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      for (const rid of deletedIds) next.delete(rid);
      return next;
    });

    const metaErrs = res.meta?.errors;
    if (metaErrs && metaErrs.length > 0) {
      toast.warning(
        `Deleted with server warnings: ${metaErrs.length} issue(s) in response meta.`
      );
    } else {
      toast.success(
        `Deleted ${identifiers.length} time period${identifiers.length === 1 ? "" : "s"} successfully`
      );
    }
    closeDeleteModal();
    void refetch();
  }, [rowsToDelete, dwId, closeDeleteModal, refetch, t]);

  const timePeriodsFileImportSubmitHandler = useCallback(
    async ({ file }: FileImportSubmitPayload) => {
      if (!dwId || !file) return;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext !== "xlsx") {
        toast.error(t("TIMEPERIODS_IMPORT_XLSX_ONLY"));
        throw new Error("timeperiods-import-format");
      }
      const fd = new FormData();
      fd.append("file", file);
      const url = `${getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS)}/import`;
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
              : t("TIMEPERIODS_IMPORT_FAILED");
        toast.error(err);
        throw new Error("timeperiods-import-failed");
      }
      toast.success(
        typeof json.message === "string" && json.message.trim()
          ? json.message
          : t("TIMEPERIODS_IMPORT_SUCCESS")
      );
      void refetch();
    },
    [dwId, refetch, t]
  );

  const timePeriodsTemplateDownloadHandler = useCallback(() => {
    const a = document.createElement("a");
    a.href = "/template/time_periods_template.xlsx";
    a.download = "time_periods_template.xlsx";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [
    page,
    pageSize,
    debouncedTimeperiod,
    debouncedColStartdate,
    debouncedColEnddate,
    debouncedColPeriodicity,
    listSort.columnId,
    listSort.direction,
    activeTab,
  ]);

  // First editable column after checkbox is periodicity (parity with units: name, indicator: first field).
  const applyInlineFocus = useCallback(() => {
    const run = () => {
      const el = inlinePeriodicityInputRef.current;
      el?.focus();
      el?.select();
    };
    requestAnimationFrame(run);
  }, []);

  const onStartInlineEdit = useCallback((row: TimePeriodRaw) => {
    if (!canUpdate) return;
    const id = timeperiodRowId(row);
    if (!id) return;
    pendingInlineFocusRef.current = true;
    setInlineError(null);
    setActiveRowId(id);
    setEditingRowId(id);
    setInlineLabel(row.timeperiod ?? "");
    setInlineStartdate(formatTimePeriodDateDisplay(row.startdate));
    setInlineEnddate(formatTimePeriodDateDisplay(row.enddate));
    setInlinePeriodicity((row.periodicity ?? "").toUpperCase());
  }, [canUpdate]);

  const onInlineCancel = useCallback(() => {
    if (editingRowId) setActiveRowId(editingRowId);
    setInlineError(null);
    setEditingRowId(null);
  }, [editingRowId]);

  const onInlineSave = useCallback(async () => {
    if (!editingRowId || inlineSaveLoading || !dwId) return;
    const savedRowId = editingRowId;
    const row = rows.find((r) => timeperiodRowId(r) === editingRowId);
    if (!row) {
      setEditingRowId(null);
      return;
    }
    const identifier = getTimePeriodPatchIdentifier(row);
    if (!identifier) {
      toast.error(t("TIMEPERIOD_IDENTIFIER_MISSING"));
      return;
    }
    const label = inlineLabel.trim();
    if (!label) {
      toast.error(t("LABEL_REQUIRED"));
      return;
    }
    if (label.length > MAX_TP_LABEL_LEN) {
      toast.error(t("TIME_PERIOD_MAX_LENGTH"));
      return;
    }

    const payload: UpdateTimePeriodPayload = {};
    const origTp = (row.timeperiod ?? "").trim();
    const origS = (row.startdate ?? "").trim();
    const origE = (row.enddate ?? "").trim();
    const origP = (row.periodicity ?? "").trim();
    const s = inlineStartdate.trim();
    const e = inlineEnddate.trim();
    const p = inlinePeriodicity.trim();

    if (label !== origTp) payload.tp_timeperiod = label;
    if (formatTimePeriodDateDisplay(s) !== formatTimePeriodDateDisplay(origS))
      payload.tp_startdate = s;
    if (formatTimePeriodDateDisplay(e) !== formatTimePeriodDateDisplay(origE))
      payload.tp_enddate = e;
    if (p !== origP) payload.tp_periodicity = p;

    if (Object.keys(payload).length === 0) {
      setEditingRowId(null);
      setActiveRowId(savedRowId);
      return;
    }

    setInlineSaveLoading(true);
    try {
      const res = await updateTimePeriod(dwId, identifier, payload);
      if (!res.success) {
        const msg = res.err_message ?? t("UPDATE_FAILED_TIMEPERIOD");
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      setInlineError(null);
      setRows((prev) =>
        prev.map((r) =>
          timeperiodRowId(r) === savedRowId
            ? normalizeTimePeriodRaw({
                ...r,
                tp_timeperiod: payload.tp_timeperiod ?? r.timeperiod,
                tp_startdate: payload.tp_startdate ?? r.startdate,
                tp_enddate: payload.tp_enddate ?? r.enddate,
                tp_periodicity: payload.tp_periodicity ?? r.periodicity,
              })
            : r
        )
      );
      setEditingRowId(null);
      setActiveRowId(savedRowId);
      toast.success(t("UPDATE_SUCCESS_TIMEPERIOD"));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("UPDATE_FAILED_TIMEPERIOD");
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setInlineSaveLoading(false);
    }
  }, [
    editingRowId,
    inlineSaveLoading,
    rows,
    inlineLabel,
    inlineStartdate,
    inlineEnddate,
    inlinePeriodicity,
    dwId,
    t,
  ]);

  useEffect(() => {
    if (!editingRowId) return;
    if (!rows.some((r) => timeperiodRowId(r) === editingRowId)) {
      setEditingRowId(null);
    }
  }, [rows, editingRowId]);

  useLayoutEffect(() => {
    if (!editingRowId) {
      pendingInlineFocusRef.current = false;
      return;
    }
    const shouldFocus = pendingInlineFocusRef.current;
    pendingInlineFocusRef.current = false;
    if (shouldFocus) applyInlineFocus();
  }, [editingRowId, applyInlineFocus]);

  const handleAddSave = useCallback(async () => {
    const label = newLabel.trim();
    const periodicity = newPeriodicity.trim();
    if (!label || addSaving || editingRowId != null) return;
    if (!periodicity) {
      toast.error(t("TIMEPERIOD_ADD_NEED_PERIODICITY"));
      return;
    }
    if (label.length > MAX_TP_LABEL_LEN) {
      toast.error(t("TIME_PERIOD_MAX_LENGTH"));
      return;
    }
    setAddSaving(true);
    try {
      const payload: CreateTimePeriodPayload = {
        tp_timeperiod: label,
        tp_periodicity: periodicity,
      };
      const res = await createTimePeriods(dwId, [payload]);
      if (!res.success) {
        const msg = res.err_message ?? t("CREATE_FAILED_TIMEPERIOD");
        toast.error(msg);
        return;
      }
      const createdList = Array.isArray(res.data) ? res.data : [];
      const rowErrorDetail = formatCreateTimePeriodRowErrors(res.meta);
      if (createdList.length === 0) {
        const msg = buildCreateTimePeriodsUserMessage(
          res as CreateTimePeriodsResponse,
          t("CREATE_FAILED_TIMEPERIOD")
        );
        toast.error(msg);
        return;
      }
      setNewLabel("");
      setNewPeriodicity("");
      setPeriodicitySearch("");
      setPeriodicityDropdownOpen(false);
      setAddRowPeriodicityHighlightIdx(-1);
      const created = normalizeTimePeriodRaw(
        createdList[0] as Record<string, unknown>
      );
      const rowToInsert = timePeriodRowFromCreateResponse(created, payload);
      const newRowId = timeperiodRowId(rowToInsert);
      setRows((prev) => [rowToInsert, ...prev]);
      if (newRowId) setActiveRowId(newRowId);
      if (rowErrorDetail) {
        toast.warning(
          buildCreateTimePeriodsUserMessage(
            res as CreateTimePeriodsResponse,
            t("CREATE_SUCCESS_TIMEPERIOD")
          )
        );
      } else {
        toast.success(t("CREATE_SUCCESS_TIMEPERIOD"));
      }
      setAddRowExpanded(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("CREATE_FAILED_TIMEPERIOD");
      toast.error(msg);
    } finally {
      setAddSaving(false);
    }
  }, [dwId, newLabel, newPeriodicity, addSaving, editingRowId, t]);

  const handleAddCancel = useCallback(() => {
    setNewLabel("");
    setNewPeriodicity("");
    setPeriodicitySearch("");
    setPeriodicityDropdownOpen(false);
    setAddRowPeriodicityHighlightIdx(-1);
    setAddRowExpanded(false);
  }, []);

  const allRowsSelected = useMemo(() => {
    const ids = rows.map(timeperiodRowId).filter(Boolean);
    return ids.length > 0 && ids.every((id) => selectedRowIds.has(id));
  }, [rows, selectedRowIds]);

  const timePeriodFormatPlaceholderForInline = useMemo(
    () => getTimePeriodFormatPlaceholder(inlinePeriodicity, t),
    [inlinePeriodicity, t]
  );

  const columns = useTimePeriodGridColumns({
    t,
    allRowsSelected,
    selectedRowIds,
    selectAll,
    toggleSelect,
    colFilterTimeperiod,
    setColFilterTimeperiod,
    colFilterStartdate,
    setColFilterStartdate,
    colFilterEnddate,
    setColFilterEnddate,
    colFilterPeriodicity,
    setColFilterPeriodicity,
    onSortTimeperiod,
    onSortStartdate,
    onSortEnddate,
    onSortPeriodicity,
    periodicitySortIcon,
    timeperiodSortIcon,
    startdateSortIcon,
    enddateSortIcon,
    editingRowId,
    inlineLabel,
    setInlineLabel,
    inlinePeriodicity,
    setInlinePeriodicity,
    inlinePeriodicityInputRef,
    inlineLabelInputRef,
    inlineSaveLoading,
    onStartInlineEdit,
    onInlineSave,
    onInlineCancel,
    timePeriodFormatPlaceholder: timePeriodFormatPlaceholderForInline,
  });

  const allPeriodicityOptions = useMemo(
    () => [
      { id: "A", label: t("ANNUALLY") },
      { id: "M", label: t("MONTHLY") },
      { id: "Q", label: t("QUARTERLY") },
      { id: "H", label: t("HALF_YEARLY") },
      { id: "D", label: t("DAILY") },
      { id: "F", label: t("FORTNIGHTLY") },
    ],
    [t]
  );

  const addRowPeriodicityOptions = useMemo(() => {
    const q = periodicitySearch.trim().toLowerCase();
    if (!q) return allPeriodicityOptions;
    return allPeriodicityOptions.filter((o) =>
      o.label.toLowerCase().includes(q)
    );
  }, [allPeriodicityOptions, periodicitySearch]);

  const periodicityInputValue = useMemo(() => {
    if (!newPeriodicity) return periodicitySearch;
    const opt = allPeriodicityOptions.find((o) => o.id === newPeriodicity);
    return opt?.label ?? newPeriodicity;
  }, [newPeriodicity, periodicitySearch, allPeriodicityOptions]);

  const addRowTimePeriodPlaceholder = useMemo(
    () => getTimePeriodFormatPlaceholder(newPeriodicity, t),
    [newPeriodicity, t]
  );

  const timeperiodListAddRowExpandedFields = useMemo((): ServerDrivenListAddRowField[] => {
    const addRowDisabled = addSaving || editingRowId != null || !canCreate;

    return [
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" aria-hidden />,
      },
      {
        kind: "custom" as const,
        content: (
          <SearchableListCombobox
            inputRef={addRowPeriodicityInputRef}
            listRef={periodicityListRef}
            inputClassName={gridTextFieldClassName()}
            placeholder={t("LABEL_PERIODICITY")}
            disabled={addRowDisabled}
            ariaLabel={t("TIMEPERIOD_ADD_ARIA_PERIODICITY")}
            inputValue={periodicityInputValue}
            onInputChange={(v) => {
              setPeriodicitySearch(v);
              setAddRowPeriodicityHighlightIdx(-1);
              if (!v.trim()) {
                setNewPeriodicity("");
                return;
              }
              if (newPeriodicity) {
                const cur =
                  allPeriodicityOptions.find((o) => o.id === newPeriodicity)
                    ?.label ?? "";
                if (
                  cur &&
                  v.trim().toLowerCase() !== cur.trim().toLowerCase()
                ) {
                  setNewPeriodicity("");
                }
              }
            }}
            open={periodicityDropdownOpen}
            onOpenChange={setPeriodicityDropdownOpen}
            highlightIndex={addRowPeriodicityHighlightIdx}
            onHighlightChange={setAddRowPeriodicityHighlightIdx}
            navigableCount={addRowPeriodicityOptions.length}
            options={addRowPeriodicityOptions}
            selectedId={newPeriodicity || null}
            onSelect={(id) => {
              setNewPeriodicity(id);
              setPeriodicitySearch("");
              setPeriodicityDropdownOpen(false);
              setAddRowPeriodicityHighlightIdx(-1);
            }}
            onEnterWhenClosed={() => void handleAddSave()}
            emptyMessage={t("NO_PERIODICITY_MATCH")}
            afterSelectFocusRef={addRowLabelInputRef}
            blurCloseMs={150}
            openOnArrowDown={false}
            dropdownInteractive={!addRowDisabled}
            menuPortal
          />
        ),
      },
      {
        kind: "text" as const,
        inputRef: addRowLabelInputRef,
        value: newLabel,
        onChange: (v) => setNewLabel(v.slice(0, MAX_TP_LABEL_LEN)),
        placeholder: addRowTimePeriodPlaceholder,
        inputClassName: gridTextFieldClassName("min-w-0"),
        disabled: addRowDisabled,
        ariaLabel: t("NEW_TIMEPERIOD_LABEL"),
        onEnter: () => void handleAddSave(),
      },
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" aria-hidden />,
      },
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" aria-hidden />,
      },
    ];
  }, [
    newLabel,
    newPeriodicity,
    addRowTimePeriodPlaceholder,
    periodicityInputValue,
    periodicityDropdownOpen,
    addRowPeriodicityHighlightIdx,
    addRowPeriodicityOptions,
    allPeriodicityOptions,
    addSaving,
    editingRowId,
    handleAddSave,
    handleAddCancel,
    canCreate,
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
          const p = exportParamsRef.current;
          const result = await downloadTimePeriodsExport(
            dwId,
            {
              sort_field: p.sort_field,
              sort_order: p.sort_order,
              ...(p.search ? { search: p.search } : {}),
            },
            {
              requestFailed: t("REQUEST_FAILED"),
              exportFailed: t("EXPORT_FAILED", "Export failed"),
              unexpectedJsonResponse: t("UNEXPECTED_JSON_RESPONSE"),
              unexpectedResponse: t("ERROR_MESSAGE", "Error: {message}").replace(
                "{message}",
                ""
              ),
            }
          );
          if (!result.ok) {
            toast.error(result.message);
          } else {
            toast.success(t("TIMEPERIODS_EXPORT_SUCCESS"));
          }
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : t("EXPORT_FAILED", "Export failed")
          );
        } finally {
          exportBusyRef.current = false;
        }
      },
      disabled: !dwId,
    });
    return () => setToolbarExport(null);
  }, [dwId, setToolbarExport, t]);

  useEffect(() => {
    setToolbarImport({
      onClick: () => {},
      disabled: !dwId || !canCreate,
    });
    return () => setToolbarImport(null);
  }, [dwId, canCreate, setToolbarImport]);

  useEffect(() => {
    setFileImportSubmitHandler(timePeriodsFileImportSubmitHandler);
    return () => setFileImportSubmitHandler(null);
  }, [timePeriodsFileImportSubmitHandler, setFileImportSubmitHandler]);

  useEffect(() => {
    setFileImportTemplateHandler(timePeriodsTemplateDownloadHandler);
    return () => setFileImportTemplateHandler(null);
  }, [timePeriodsTemplateDownloadHandler, setFileImportTemplateHandler]);

  if (!allowed) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden">
      {inlineError ? (
        <div className="inline-alert--error mx-4 mt-2">
          {inlineError}
        </div>
      ) : null}

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

      <ServerDrivenTable<TimePeriodRaw, TimePeriodsListMeta>
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
          <ServerDrivenListTbody<TimePeriodRaw>
            colSpan={6}
            rows={rows}
            columns={columns}
            getRowId={timeperiodRowId}
            activeRowId={activeRowId}
            editingRowId={editingRowId}
            onDataRowEnterAtEnd={({ mode }) => {
              if (mode === "edit") void onInlineSave();
            }}
            onDataRowEscape={({ mode }) => {
              if (mode === "edit") onInlineCancel();
            }}
            getRowClassName={() => ""}
            emptyMessage={t("TIMEPERIOD_EMPTY")}
            showLoadingRow={false}
            showEmptyRow={!loading && rows.length === 0}
            showDataRows={!loading}
            addRow={
              showTabSwitchLoader
                ? null
                : {
                    ref: addRowRef,
                    promptLabel: t("ADD_TIMEPERIOD_PROMPT"),
                    expanded: addRowExpanded,
                    onExpandedChange: setAddRowExpanded,
                    primaryColumnId: "periodicity",
                    disabled: Boolean(editingRowId) || !canCreate,
                    disabledTitle: !canCreate
                      ? t("NO_PERMISSION_CREATE")
                      : editingRowId
                        ? t("TIMEPERIOD_ADD_ROW_FINISH_EDIT_FIRST")
                        : undefined,
                    onExpand: () => {
                      queueMicrotask(() =>
                        addRowPeriodicityInputRef.current?.focus()
                      );
                    },
                    className: `add-row${addRowExpanded ? "" : " add-row-collapsed"}${editingRowId || !canCreate ? " add-row-disabled" : ""}`,
                    ariaDisabled: Boolean(editingRowId) || !canCreate,
                    title: !canCreate
                      ? t("NO_PERMISSION_CREATE")
                      : editingRowId
                        ? t("TIMEPERIOD_ADD_ROW_FINISH_EDIT_FIRST")
                        : undefined,
                    onRowEnterAtEnd: () => {
                      if (!canCreate) return;
                      if (editingRowId != null) return;
                      if (!addRowExpanded) {
                        setAddRowExpanded(true);
                        queueMicrotask(() =>
                          addRowPeriodicityInputRef.current?.focus()
                        );
                        return;
                      }
                      void handleAddSave();
                    },
                    onRowEscape: () => {
                      if (addRowExpanded) {
                        handleAddCancel();
                      }
                    },
                    onArrowIntoRow:
                      editingRowId != null || !canCreate
                        ? undefined
                        : () => {
                            setAddRowExpanded(true);
                          },
                    onArrowLeaveRow:
                      editingRowId != null || !canCreate
                        ? undefined
                        : () => {
                            setAddRowExpanded(false);
                            setPeriodicityDropdownOpen(false);
                          },
                    expandedFields: timeperiodListAddRowExpandedFields,
                    collapsedSave: {
                      title: t("TIMEPERIOD_ADD_SAVE_TITLE_NEED_LABEL"),
                      ariaLabel: t("TIMEPERIOD_ADD_SAVE_ARIA_NEED_LABEL"),
                    },
                    collapsedCancel: {
                      title: t("ADD_CLEAR_ROW"),
                      ariaLabel: t("ADD_CLEAR_ROW"),
                    },
                    showActionsColumn: canCreate,
                    actionsWidth: "icon",
                    save: {
                      title: !newLabel.trim()
                        ? t("TIMEPERIOD_ADD_SAVE_TITLE_NEED_LABEL")
                        : !newPeriodicity.trim()
                          ? t("TIMEPERIOD_ADD_SAVE_TITLE_NEED_PERIODICITY")
                          : t("TIMEPERIOD_ADD_SAVE"),
                      ariaLabel: !newLabel.trim()
                        ? t("TIMEPERIOD_ADD_SAVE_ARIA_NEED_LABEL")
                        : !newPeriodicity.trim()
                          ? t("TIMEPERIOD_ADD_SAVE_ARIA_NEED_PERIODICITY")
                          : t("TIMEPERIOD_ADD_SAVE"),
                      disabled:
                        addSaving ||
                        !newLabel.trim() ||
                        !newPeriodicity.trim() ||
                        editingRowId != null ||
                        !canCreate,
                      onClick: () => void handleAddSave(),
                    },
                    cancel: {
                      title: t("ADD_CLEAR_ROW"),
                      ariaLabel: t("ADD_CLEAR_ROW"),
                      disabled:
                        addSaving || editingRowId != null || !canCreate,
                      onClick: handleAddCancel,
                    },
                  }
            }
          />
        }
        pagination={{
          page,
          displayPage: meta?.page ?? page,
          totalPages,
          totalCount,
          totalCountUnfiltered,
          pageSize,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
          countNoun: t("TIME_PERIODS"),
          labels: { t, filteredOnly: "FOOTER_OF_TOTAL_TIMEPERIODS" },
        }}
      />

      <DeletePermanentConfirmModal
        open={deleteModalOpen}
        onClose={closeDeleteModal}
        title={t("DELETE_TIMEPERIODS")}
        titleId="dm-tp-delete-title"
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
                { dataRows: t("IMPACT_DATA_ROWS") },
                { dataCount: deleteAssoc.data_count }
              )
            : null,
        }}
        runError={deleteRunError}
      >
        <p className="modal-lead">
          {t("TIMEPERIOD_DELETE_MODAL_LEAD").replace(
            "{count}",
            String(rowsToDelete.length)
          )}
        </p>
        <ul className="modal-list">
          {rowsToDelete.map((r, idx) => (
            <li key={timeperiodRowId(r) || `tp-del-${idx}`}>
              <span className="modal-list-name">
                {r.timeperiod?.trim() || (r.id != null ? `ID ${r.id}` : "—")}
              </span>
            </li>
          ))}
        </ul>
      </DeletePermanentConfirmModal>
    </div>
  );
}
