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
  downloadRequest,
  getFileResponse,
  getRequest,
  patchRequest,
  postRequest,
} from "@/lib/api/http";
import {
  getDWAPIURL,
  REFERENCE_PATH_LANGUAGES,
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
import { DeletePermanentConfirmModal } from "@/components/DeletePermanentConfirmModal";
import { Modal } from "@/components/Modal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelectField } from "@/components/SelectField";
import { gridTextFieldClassName } from "@/components/TextField";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import {
  languageRowId,
  useLanguagesGridColumns,
  type LanguageInlineFocusField,
} from "./languagesGridColumns";

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

interface LanguageRaw {
  lang_nid?: number;
  lang_name: string | null;
  lang_code: string | null;
  lang_is_default: boolean;
  lang_is_global_lock: boolean;
}

interface LanguagesListMeta {
  total_count: number;
  total_pages: number;
  page: number;
}

interface LanguagesListResponse {
  success: true;
  data: LanguageRaw[];
  meta?: LanguagesListMeta | null;
  message?: string;
}

type LanguagesListResult =
  | LanguagesListResponse
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

interface CreateLanguagePayload {
  lang_name: string;
  lang_code: string;
  source_lang?: string;
  lang_is_default?: boolean;
  lang_is_global_lock?: boolean;
}

interface UpdateLanguagePayload {
  lang_name?: string;
  lang_code?: string;
  lang_is_default?: boolean;
  lang_is_global_lock?: boolean;
}

type DeleteLanguageResult =
  | { success: true }
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

function normalizeLanguageRaw(raw: Record<string, unknown>): LanguageRaw {
  const nidRaw = raw.lang_nid;
  let lang_nid: number | undefined;
  if (typeof nidRaw === "number" && Number.isFinite(nidRaw)) lang_nid = nidRaw;
  else if (typeof nidRaw === "string" && nidRaw.trim() !== "") {
    const n = Number(nidRaw);
    if (!Number.isNaN(n)) lang_nid = n;
  }

  return {
    ...raw,
    lang_nid,
    lang_name: (raw.lang_name ?? null) as string | null,
    lang_code: (raw.lang_code ?? null) as string | null,
    lang_is_default: Boolean(raw.lang_is_default),
    lang_is_global_lock: Boolean(raw.lang_is_global_lock),
  };
}

function isLanguagesListResponse(
  r: LanguagesListResult
): r is LanguagesListResponse {
  return r.success === true && Array.isArray((r as LanguagesListResponse).data);
}

function getLanguagePatchIdentifier(row: LanguageRaw): string | null {
  const code = (row.lang_code ?? "").trim();
  if (code) return code;
  return null;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

async function createLanguage(
  dwId: string,
  data: CreateLanguagePayload
): Promise<
  | { success: true; data?: Record<string, unknown>; message?: string }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_LANGUAGES);
  const json = await postRequest(url, data as unknown as Record<string, unknown>, undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as
    | { success: true; data?: Record<string, unknown>; message?: string }
    | { success: false; err_message?: string; errors?: Record<string, unknown> };
}

async function updateLanguage(
  dwId: string,
  identifier: string,
  payload: UpdateLanguagePayload
): Promise<
  | { success: true; data?: Record<string, unknown> }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_LANGUAGES)}/${encodeURIComponent(identifier)}`;
  const body: Record<string, unknown> = {};
  if (payload.lang_name != null) body.lang_name = payload.lang_name;
  if (payload.lang_code != null) body.lang_code = payload.lang_code;
  if (payload.lang_is_default != null) body.lang_is_default = payload.lang_is_default;
  if (payload.lang_is_global_lock != null) body.lang_is_global_lock = payload.lang_is_global_lock;
  const json = await patchRequest(url, body, undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as
    | { success: true; data?: Record<string, unknown> }
    | { success: false; err_message?: string; errors?: Record<string, unknown> };
}

async function deleteLanguage(
  dwId: string,
  identifier: string
): Promise<DeleteLanguageResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_LANGUAGES)}/${encodeURIComponent(identifier)}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) return json as DeleteLanguageResult;
  return { success: true } as DeleteLanguageResult;
}

async function downloadLanguagesExport(
  dwId: string,
  fromLangCode: string,
  toLangCode: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_LANGUAGES)}/export`;
  const res = await downloadRequest(url, {
    from_lang_code: fromLangCode,
    to_lang_code: toLangCode,
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { err_message?: string; message?: string };
      return { ok: false, message: json.err_message ?? json.message ?? `Export failed (${res.status})` };
    } catch {
      return { ok: false, message: `Export failed (${res.status})` };
    }
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = "language_export.xlsx";
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

export default function LanguagesPage() {
  const { dwId, setToolbarExport, setToolbarImport, setBulkDelete } = useSidebar();
  const { t } = useCore();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.administration.languages);
  const { canCreate, canUpdate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.administration.languages
  );
  const tblScrollRef = useRef<HTMLDivElement>(null);
  const addRowRef = useRef<HTMLTableRowElement>(null);
  const inlineNameInputRef = useRef<HTMLInputElement>(null);
  const inlineCodeInputRef = useRef<HTMLInputElement>(null);
  const pendingInlineFocusRef = useRef<LanguageInlineFocusField | null>(null);
  const addRowNameInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);

  const [colFilterName, setColFilterName] = useState("");
  const [colFilterCode, setColFilterCode] = useState("");
  const [listSort, setListSort] = useState<{
    columnId: "lang_name" | "lang_code" | null;
    direction: "asc" | "desc";
  }>({ columnId: null, direction: "asc" });

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const [addRowExpanded, setAddRowExpanded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newSourceLang, setNewSourceLang] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState("");
  const [inlineCode, setInlineCode] = useState("");
  const [inlineSaveLoading, setInlineSaveLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [importDragActive, setImportDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFromLang, setExportFromLang] = useState("");
  const [exportToLang, setExportToLang] = useState("");
  const [isExporting, setIsExporting] = useState(false);

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
  const [rowsToDelete, setRowsToDelete] = useState<LanguageRaw[]>([]);
  const [deleteRunError, setDeleteRunError] = useState<string | null>(null);
  const [deleteRunning, setDeleteRunning] = useState(false);

  const listUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_LANGUAGES) : ""),
    [dwId]
  );

  const parseListResponse = useCallback(
    (json: unknown): ServerListParseResult<LanguageRaw, LanguagesListMeta> => {
      const r = json as LanguagesListResult;
      if (!isLanguagesListResponse(r)) {
        const msg =
          typeof (r as { err_message?: string })?.err_message === "string"
            ? (r as { err_message: string }).err_message
            : "Failed to load languages";
        return { ok: false, message: msg };
      }
      const rows = (r.data ?? []).map((item) =>
        normalizeLanguageRaw(item as unknown as Record<string, unknown>)
      );
      const totalCount = r.meta?.total_count ?? rows.length;
      const totalPages = r.meta?.total_pages ?? 1;
      return {
        ok: true,
        rows,
        totalCount,
        totalPages,
        meta: r.meta ?? { total_count: totalCount, total_pages: totalPages, page: 1 },
      };
    },
    []
  );

  const debouncedFilterName = useDebounce(colFilterName, 300);
  const debouncedFilterCode = useDebounce(colFilterCode, 300);

  const listQuery = useMemo(() => {
    const q: Record<string, string | number> = {
      page,
      page_size: pageSize,
    };
    if (debouncedFilterName.trim()) {
      q.search = debouncedFilterName.trim();
      q.search_by = "lang_name";
    } else if (debouncedFilterCode.trim()) {
      q.search = debouncedFilterCode.trim();
      q.search_by = "lang_code";
    }
    if (listSort.columnId) {
      q.sort_field = listSort.columnId;
      q.sort_order = listSort.direction;
    }
    return q;
  }, [page, pageSize, debouncedFilterName, debouncedFilterCode, listSort]);

  const listState = useServerListQuery({
    listUrl,
    query: listQuery,
    parseListResponse,
    enabled: Boolean(dwId && listUrl),
  });

  const { rows: serverRows, loading, meta, refetch } = listState;
  const [rows, setRows] = useState<LanguageRaw[]>([]);
  useEffect(() => {
    setRows(serverRows);
  }, [serverRows]);

  const [localTotalCount, setLocalTotalCount] = useState<number>(0);
  useEffect(() => {
    if (typeof listState.totalCount === "number") {
      setLocalTotalCount(listState.totalCount);
    }
  }, [listState.totalCount]);
  const localTotalPages =
    pageSize > 0 ? Math.max(0, Math.ceil(localTotalCount / pageSize)) : 0;

  const selectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      const ids = rows.map(languageRowId).filter(Boolean);
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
    setDeleteRunError(null);
  }, []);

  const openDeleteModal = useCallback(() => {
    const list: LanguageRaw[] = [];
    for (const row of rows) {
      const id = languageRowId(row);
      if (id && selectedRowIds.has(id)) list.push(row);
    }
    if (list.length === 0) return;
    setRowsToDelete(list);
    setDeleteRunError(null);
    setDeleteModalOpen(true);
  }, [rows, selectedRowIds]);

  const handleConfirmBulkDelete = useCallback(async () => {
    if (rowsToDelete.length === 0 || !dwId) return;
    setDeleteRunning(true);
    setDeleteRunError(null);

    const identifiers = rowsToDelete
      .map((r) => getLanguagePatchIdentifier(r))
      .filter((s): s is string => Boolean(s));
    if (identifiers.length === 0) {
      setDeleteRunning(false);
      setDeleteRunError(t("LANGUAGE_IDENTIFIER_MISSING"));
      return;
    }

    let failCount = 0;
    const errors: string[] = [];
    for (const id of identifiers) {
      const res = await deleteLanguage(dwId, id);
      if (!res.success) {
        failCount++;
        if (res.err_message) errors.push(res.err_message);
      }
    }
    setDeleteRunning(false);

    if (failCount === identifiers.length) {
      setDeleteRunError(errors[0] || t("BULK_DELETE_FAILED"));
      return;
    }

    const successCount = identifiers.length - failCount;
    const deletedIds = new Set(rowsToDelete.map(languageRowId));
    setRows((prev) => prev.filter((row) => !deletedIds.has(languageRowId(row))));
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
        `Deleted ${successCount} language${successCount === 1 ? "" : "s"} successfully`
      );
    }
    closeDeleteModal();
  }, [rowsToDelete, dwId, closeDeleteModal, t]);

  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [page, pageSize, debouncedFilterName, debouncedFilterCode, listSort.columnId, listSort.direction]);

  const applyInlineFocus = useCallback((field: LanguageInlineFocusField) => {
    const run = () => {
      const el =
        field === "name"
          ? inlineNameInputRef.current
          : inlineCodeInputRef.current;
      el?.focus();
      el?.select();
    };
    requestAnimationFrame(run);
  }, []);

  const onStartInlineEdit = useCallback(
    (row: LanguageRaw, focusField: LanguageInlineFocusField = "name") => {
      if (!canUpdate) return;
      const id = languageRowId(row);
      if (!id) return;
      pendingInlineFocusRef.current = focusField;
      setInlineError(null);
      setActiveRowId(id);
      setEditingRowId(id);
      setInlineName(row.lang_name ?? "");
      setInlineCode(row.lang_code ?? "");
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
    const row = rows.find((r) => languageRowId(r) === editingRowId);
    if (!row) {
      setEditingRowId(null);
      return;
    }
    const identifier = getLanguagePatchIdentifier(row);
    if (!identifier) {
      toast.error(t("LANGUAGE_IDENTIFIER_MISSING"));
      return;
    }

    const payload: UpdateLanguagePayload = {};
    const origName = (row.lang_name ?? "").trim();

    const name = inlineName.trim();

    if (name !== origName) payload.lang_name = name;

    if (Object.keys(payload).length === 0) {
      setEditingRowId(null);
      setActiveRowId(savedRowId);
      return;
    }

    setInlineSaveLoading(true);
    try {
      const res = await updateLanguage(dwId, identifier, payload);
      if (!res.success) {
        const msg = res.err_message ?? t("UPDATE_FAILED_LANGUAGE");
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      setInlineError(null);
      setRows((prev) =>
        prev.map((r) =>
          languageRowId(r) === savedRowId
            ? normalizeLanguageRaw({
                ...r,
                lang_name: payload.lang_name ?? r.lang_name,
              } as Record<string, unknown>)
            : r
        )
      );
      setEditingRowId(null);
      setActiveRowId(savedRowId);
      toast.success(t("UPDATE_SUCCESS_LANGUAGE"));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("UPDATE_FAILED_LANGUAGE");
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
    dwId,
    t,
  ]);

  useEffect(() => {
    if (!editingRowId) return;
    if (!rows.some((r) => languageRowId(r) === editingRowId)) {
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
    const name = newName.trim();
    const code = newCode.trim().toLowerCase();
    if (!name || !code || addSaving || editingRowId != null) return;
    setAddSaving(true);
    try {
      const payload: CreateLanguagePayload = {
        lang_name: name,
        lang_code: code,
        ...(newSourceLang.trim() ? { source_lang: newSourceLang.trim() } : {}),
      };
      const res = await createLanguage(dwId, payload);
      if (!res.success) {
        const msg = res.err_message ?? t("CREATE_FAILED_LANGUAGE");
        toast.error(msg);
        return;
      }

      const apiData = (res.data ?? {}) as Record<string, unknown>;
      const created = normalizeLanguageRaw({
        ...apiData,
        lang_name: name,
        lang_code: code,
        lang_is_default: false,
        lang_is_global_lock: false,
      });

      setNewName("");
      setNewCode("");
      setNewSourceLang("");
      setAddRowExpanded(false);

      const newRowId = languageRowId(created);
      setRows((prev) => [created, ...prev]);
      setLocalTotalCount((c) => c + 1);
      if (newRowId) {
        setActiveRowId(newRowId);
        setRecentCreatedRowIds((prev) => [newRowId, ...prev]);
      }
      toast.success(t("CREATE_SUCCESS_LANGUAGE"));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("CREATE_FAILED_LANGUAGE");
      toast.error(msg);
    } finally {
      setAddSaving(false);
    }
  }, [dwId, newName, newCode, newSourceLang, addSaving, editingRowId, t]);

  const handleAddRowDiscard = useCallback(() => {
    setNewName("");
    setNewCode("");
    setNewSourceLang("");
    setAddRowExpanded(false);
  }, []);

  const allRowsSelected = useMemo(() => {
    const ids = rows.map(languageRowId).filter(Boolean);
    return ids.length > 0 && ids.every((id) => selectedRowIds.has(id));
  }, [rows, selectedRowIds]);

  const addRowDisabledByInlineEdit = editingRowId != null;

  const onSortName = useCallback(() => {
    setListSort((prev) => {
      if (prev.columnId === "lang_name") {
        return { columnId: "lang_name", direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { columnId: "lang_name", direction: "asc" };
    });
    setPage(1);
  }, []);

  const onSortCode = useCallback(() => {
    setListSort((prev) => {
      if (prev.columnId === "lang_code") {
        return { columnId: "lang_code", direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { columnId: "lang_code", direction: "asc" };
    });
    setPage(1);
  }, []);

  const nameSortIcon = useMemo((): "arrow_upward" | "arrow_downward" | "unfold_more" => {
    if (listSort.columnId !== "lang_name") return "unfold_more";
    return listSort.direction === "asc" ? "arrow_upward" : "arrow_downward";
  }, [listSort]);

  const codeSortIcon = useMemo((): "arrow_upward" | "arrow_downward" | "unfold_more" => {
    if (listSort.columnId !== "lang_code") return "unfold_more";
    return listSort.direction === "asc" ? "arrow_upward" : "arrow_downward";
  }, [listSort]);

  const handleToggleDefault = useCallback(async (row: LanguageRaw) => {
    if (!canUpdate || !dwId) return;
    const identifier = getLanguagePatchIdentifier(row);
    if (!identifier) {
      toast.error(t("LANGUAGE_IDENTIFIER_MISSING"));
      return;
    }

    const newDefaultValue = !row.lang_is_default;
    
    try {
      const res = await updateLanguage(dwId, identifier, {
        lang_is_default: newDefaultValue,
      });
      
      if (!res.success) {
        const msg = res.err_message ?? t("UPDATE_FAILED_LANGUAGE");
        toast.error(msg);
        return;
      }
      
      setRows((prev) =>
        prev.map((r) => {
          if (languageRowId(r) === languageRowId(row)) {
            return normalizeLanguageRaw({
              ...r,
              lang_is_default: newDefaultValue,
            } as Record<string, unknown>);
          }
          if (newDefaultValue && r.lang_is_default) {
            return normalizeLanguageRaw({
              ...r,
              lang_is_default: false,
            } as Record<string, unknown>);
          }
          return r;
        })
      );
      
      toast.success(
        newDefaultValue
          ? t("DEFAULT_LANGUAGE_SET", "Default language set successfully")
          : t("DEFAULT_LANGUAGE_UNSET", "Default language unset successfully")
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("UPDATE_FAILED_LANGUAGE");
      toast.error(msg);
    }
  }, [canUpdate, dwId, t, rows]);

  const columns = useLanguagesGridColumns({
    t,
    canUpdate,
    canDelete,
    allRowsSelected,
    selectedRowIds,
    selectAll,
    toggleSelect,
    colFilterName,
    setColFilterName,
    colFilterCode,
    setColFilterCode,
    onSortName,
    onSortCode,
    nameSortIcon,
    codeSortIcon,
    editingRowId,
    inlineName,
    setInlineName,
    inlineCode,
    setInlineCode,
    inlineNameInputRef,
    inlineCodeInputRef,
    inlineSaveLoading,
    onStartInlineEdit,
    onInlineSave,
    onInlineCancel,
    onToggleDefault: handleToggleDefault,
  });

  const addRowExpandedFields = useMemo((): ServerDrivenListAddRowField[] => {
    const addRowDisabled = addSaving || addRowDisabledByInlineEdit;
    return [
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" aria-hidden />,
      },
      {
        kind: "text" as const,
        value: newName,
        onChange: (v) => setNewName(v.slice(0, 50)),
        placeholder: t("LANGUAGE_NAME_PLACEHOLDER"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        inputRef: addRowNameInputRef,
        disabled: addRowDisabled,
        ariaLabel: t("LANGUAGE_NAME"),
      },
      {
        kind: "text" as const,
        value: newCode,
        onChange: (v) => setNewCode(v.slice(0, 10).toLowerCase()),
        placeholder: t("LANGUAGE_CODE_PLACEHOLDER"),
        inputClassName: gridTextFieldClassName("min-w-0 text-xs"),
        disabled: addRowDisabled,
        ariaLabel: t("LANGUAGE_CODE"),
        onEnter: () => void handleAddSave(),
      },
      {
        kind: "custom" as const,
        content: <span className="text-text-muted">-</span>,
      },
    ];
  }, [
    addRowDisabledByInlineEdit,
    newName,
    newCode,
    addSaving,
    handleAddSave,
    t,
  ]);

  const handleImportDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setImportDragActive(true);
  }, []);

  const handleImportDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setImportDragActive(false);
  }, []);

  const handleImportDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setImportDragActive(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    setSelectedImportFile(file);
  }, []);

  const handleImportFilePick = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedImportFile(file);
  }, []);

  const closeImportModal = useCallback(() => {
    setImportModalOpen(false);
    setSelectedImportFile(null);
    setImportDragActive(false);
  }, []);

  const runImport = useCallback(async () => {
    if (!dwId || !canCreate || !selectedImportFile || isImporting) return;
    const ext = selectedImportFile.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "xlsx") {
      toast.error(t("IMPORT_XLSX_ONLY", "Only .xlsx files are supported"));
      return;
    }
    setIsImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedImportFile);
      const url = `${getDWAPIURL(dwId, REFERENCE_PATH_LANGUAGES)}/import`;
      const json = (await postRequest(url, fd, undefined, undefined, {
        suppressErrorMessage: true,
      })) as {
        success?: boolean;
        message?: string;
        err_message?: string;
        data?: Record<string, unknown>;
      };
      if (json.success !== true) {
        toast.error(json.err_message ?? json.message ?? t("IMPORT_FAILED", "Import failed"));
      } else {
        toast.success(json.message ?? t("IMPORT_SUCCESS", "Import completed successfully"));
        await refetch();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("IMPORT_FAILED", "Import failed"));
    } finally {
      setIsImporting(false);
      closeImportModal();
    }
  }, [dwId, canCreate, selectedImportFile, isImporting, t, closeImportModal, refetch]);

  const closeExportModal = useCallback(() => {
    setExportModalOpen(false);
    setExportFromLang("");
    setExportToLang("");
  }, []);

  const runExport = useCallback(async () => {
    if (!dwId || !exportToLang || isExporting) return;
    setIsExporting(true);
    try {
      const result = await downloadLanguagesExport(dwId, exportFromLang, exportToLang);
      if (result.ok) {
        toast.success(t("EXPORT_SUCCESS", "Export downloaded successfully"));
      } else {
        toast.error(result.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("EXPORT_FAILED", "Export failed"));
    } finally {
      setIsExporting(false);
      closeExportModal();
    }
  }, [dwId, exportFromLang, exportToLang, isExporting, t, closeExportModal]);

  const languageOptions = useMemo(() => {
    return rows.map(r => ({
      value: r.lang_code ?? "",
      label: `${r.lang_name} [${r.lang_code}]`,
    }));
  }, [rows]);

  useEffect(() => {
    setBulkDelete({
      onClick: openDeleteModal,
      disabled: selectedRowIds.size === 0 || !canDelete,
    });
    return () => setBulkDelete(null);
  }, [setBulkDelete, openDeleteModal, selectedRowIds.size, canDelete]);

  useEffect(() => {
    setToolbarImport({
      onClick: () => {
        if (!canCreate) return;
        setImportModalOpen(true);
      },
      disabled: !dwId || !canCreate,
    });
    setToolbarExport({
      onClick: () => setExportModalOpen(true),
      disabled: false,
    });
    return () => {
      setToolbarImport(null);
      setToolbarExport(null);
    };
  }, [dwId, canCreate, setToolbarImport, setToolbarExport]);

  if (!allowed) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden">
      {inlineError ? (
        <div className="inline-alert--error mx-4 mt-2">
          {inlineError}
        </div>
      ) : null}

      <ServerDrivenTable<LanguageRaw, LanguagesListMeta>
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
          <ServerDrivenListTbody<LanguageRaw>
            colSpan={6}
            rows={rows}
            columns={columns}
            getRowId={languageRowId}
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
              recentCreatedRowIdSet.has(languageRowId(row))
                ? TV_ROW_NEWLY_ADDED_CLASS
                : ""
            }
            emptyMessage={t("LANGUAGE_EMPTY")}
            showLoadingRow={false}
            showEmptyRow={!loading && rows.length === 0}
            showDataRows={!loading}
            addRow={{
              ref: addRowRef,
              promptLabel: t("ADD"),
              expanded: addRowExpanded,
              onExpandedChange: setAddRowExpanded,
              primaryColumnId: "lang_name",
              disabled: !canCreate,
              disabledTitle: t("NO_PERMISSION_CREATE"),
              onExpand: () => {
                queueMicrotask(() => addRowNameInputRef.current?.focus());
              },
              className: `add-row${addRowExpanded ? "" : " add-row-collapsed"}${addRowDisabledByInlineEdit || !canCreate ? " add-row-interaction-blocked" : ""}`,
              ariaDisabled: addRowDisabledByInlineEdit || !canCreate,
              title: !canCreate
                ? t("NO_PERMISSION_CREATE")
                : addRowDisabledByInlineEdit
                  ? t("LANGUAGE_ADD_ROW_FINISH_EDIT_FIRST")
                  : undefined,
              onRowEnterAtEnd: () => {
                if (!canCreate) return;
                if (addRowDisabledByInlineEdit) return;
                if (!addRowExpanded) {
                  setAddRowExpanded(true);
                  queueMicrotask(() => addRowNameInputRef.current?.focus());
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
                : () => {
                    setAddRowExpanded(true);
                  },
              onArrowLeaveRow: addRowDisabledByInlineEdit || !canCreate
                ? undefined
                : () => {
                    setAddRowExpanded(false);
                  },
              expandedFields: addRowExpandedFields,
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
                title:
                  !newName.trim() || !newCode.trim()
                    ? t("LANGUAGE_NAME_CODE_REQUIRED")
                    : t("SAVE"),
                ariaLabel:
                  !newName.trim() || !newCode.trim()
                    ? t("LANGUAGE_NAME_CODE_REQUIRED")
                    : t("SAVE"),
                disabled:
                  addSaving ||
                  !newName.trim() ||
                  !newCode.trim() ||
                  addRowDisabledByInlineEdit,
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
          pageSize,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
          countNoun: "languages",
          labels: { t },
          renderCount: (tc) => (
            <span id="footer-count">
              {t("FOOTER_OF_TOTAL_LANGUAGES").replace("{total}", String(tc))}
            </span>
          ),
        }}
      />

      <DeletePermanentConfirmModal
        open={deleteModalOpen}
        onClose={closeDeleteModal}
        title={t("DELETE_LANGUAGES")}
        titleId="dm-lang-delete-title"
        dismissDisabled={deleteRunning}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={closeDeleteModal}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmLoading={deleteRunning}
        onConfirm={handleConfirmBulkDelete}
      >
        <p className="modal-lead">
          {t("LANGUAGE_DELETE_MODAL_LEAD").replace(
            "{count}",
            String(rowsToDelete.length)
          )}
        </p>
        <ul className="modal-list">
          {rowsToDelete.map((r, idx) => (
            <li key={languageRowId(r) || `lang-del-${idx}`}>
              <span className="modal-list-name">
                {(r.lang_name ?? "").trim() || (r.lang_code ?? "").trim() || "—"}
              </span>
            </li>
          ))}
        </ul>
        {deleteRunError && (
          <p className="modal-error" style={{ marginTop: 12 }}>
            {deleteRunError}
          </p>
        )}
      </DeletePermanentConfirmModal>

      <Modal
        open={importModalOpen}
        onClose={closeImportModal}
        title={`${t("IMPORT")} ${t("LANGUAGES")}`}
        titleId="languages-import-modal-title"
        className="max-w-md"
        closeAriaLabel={t("CLOSE")}
        footer={
          <>
            <SecondaryButton type="button" variant="modal" onClick={closeImportModal}>
              {t("CANCEL")}
            </SecondaryButton>
            <PrimaryButton
              type="button"
              icon={isImporting ? "hourglass_empty" : "upload"}
              onClick={runImport}
              disabled={!selectedImportFile || isImporting}
            >
              {isImporting ? t("IMPORTING", "Importing...") : t("IMPORT")}
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-4">
          <div
            className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              importDragActive
                ? "border-primary bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
                : "border-border bg-surface-muted"
            }`}
            onDrop={handleImportDrop}
            onDragOver={handleImportDragOver}
            onDragLeave={handleImportDragLeave}
          >
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFileChange}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-3">
              <Mi name="cloud_upload" className="!text-sm text-text-muted" />
              <div className="text-sm text-text">
                {t("DROP_FILE_HERE", "Drop file here or click to browse")}
              </div>
              <SecondaryButton type="button" icon="folder_open" onClick={handleImportFilePick}>
                {t("BROWSE")}
              </SecondaryButton>
            </div>
          </div>
          {selectedImportFile && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-3">
              <Mi name="description" className="text-text-muted" />
              <span className="flex-1 truncate text-sm text-text">
                {selectedImportFile.name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedImportFile(null)}
                className="shrink-0 text-text-muted hover:text-error"
                aria-label={t("REMOVE")}
              >
                <Mi name="close" className="!text-sm" />
              </button>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={exportModalOpen}
        onClose={closeExportModal}
        title={`${t("EXPORT")} ${t("LANGUAGES")}`}
        titleId="languages-export-modal-title"
        className="max-w-md"
        closeAriaLabel={t("CLOSE")}
        footer={
          <>
            <SecondaryButton type="button" variant="modal" onClick={closeExportModal}>
              {t("CANCEL")}
            </SecondaryButton>
            <PrimaryButton
              type="button"
              icon={isExporting ? "hourglass_empty" : "download"}
              onClick={runExport}
              disabled={!exportFromLang || !exportToLang || isExporting}
            >
              {isExporting ? t("EXPORTING", "Exporting...") : t("EXPORT")}
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="form-label mb-1.5 block">
              {t("TRANSLATE_FROM", "Translate from")}
            </label>
            <SelectField
              value={exportFromLang}
              onChange={(e) => setExportFromLang(e.target.value)}
              className="w-full"
            >
              <option value="">{t("SELECT_LANGUAGE", "Select language")}</option>
              {languageOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <label className="form-label mb-1.5 block">
              {t("TRANSLATE_TO", "Translate to")}
            </label>
            <SelectField
              value={exportToLang}
              onChange={(e) => setExportToLang(e.target.value)}
              className="w-full"
            >
              <option value="">{t("SELECT_LANGUAGE", "Select language")}</option>
              {languageOptions.map(opt => (
                <option key={opt.value} value={opt.value} disabled={opt.value === exportFromLang}>
                  {opt.label}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
      </Modal>

    </div>
  );
}
