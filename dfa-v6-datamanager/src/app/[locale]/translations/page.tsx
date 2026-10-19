"use client";

// Translations management page: list, inline-edit, and import/export app-scoped translations.
// Route: /{locale}/translations  (app-scoped, no warehouse context)

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
import Breadcrumb from "@/components/Breadcrumb";
import { PageToolbar } from "@/components/PageToolbar";
import {
  getFileResponse,
  patchRequest,
  postRequest,
} from "@/lib/api/http";
import { getTranslationsApiUrl } from "@/lib/constants";
import {
  fetchSystemLanguages,
  systemLanguageRowLabel,
  type SystemLanguageRow,
} from "@/lib/api/core";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import {
  EditableDataGridThead,
  ServerDrivenListTbody,
  ServerDrivenTable,
  TV_ROW_NEWLY_ADDED_CLASS,
  useServerListQuery,
  type ServerDrivenListAddRowField,
  type ServerListParseResult,
} from "@/components/TableView";
import { gridTextFieldClassName } from "@/components/TextField";
import FileImport from "@/components/FileImport";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import {
  translationRowId,
  useTranslationsGridColumns,
  type TranslationRow,
} from "./translationsGridColumns";
import { hasPermission, APP_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import { usePermissionGuard } from "@/hooks/usePermissionGuard";

// --- API types ---

type TranslationsListMeta = {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

type TranslationsListResponse = {
  success: true;
  message?: string;
  data: Record<string, Record<string, string>>[];
  meta: TranslationsListMeta;
};

// --- Helpers ---

function isTranslationsListResponse(r: unknown): r is TranslationsListResponse {
  return (
    typeof r === "object" &&
    r !== null &&
    (r as TranslationsListResponse).success === true &&
    Array.isArray((r as TranslationsListResponse).data)
  );
}

/**
 * The API returns each element as `{ CODE: { locale: text } }`.
 * Flatten into our internal row type.
 */
function parseTranslationItems(
  items: Record<string, Record<string, string>>[]
): TranslationRow[] {
  return items.map((item) => {
    const [code, translations] = Object.entries(item)[0] ?? ["", {}];
    return { code, translations: translations ?? {} };
  });
}

type SortState = { columnId: string | null; direction: "asc" | "desc" | null };

function cycleSort(columnId: string, prev: SortState): SortState {
  if (prev.columnId !== columnId) return { columnId, direction: "asc" };
  if (prev.direction === "asc") return { columnId, direction: "desc" };
  return { columnId: null, direction: null };
}

function sortIcon(columnId: string, state: SortState): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (state.columnId === columnId && state.direction === "asc") return "arrow_upward";
  if (state.columnId === columnId && state.direction === "desc") return "arrow_downward";
  return "unfold_more";
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** GET /translations list search fields from latest API contract. */
const SEARCH_BY_TRANSLATION_CODE = "trans_code";
const SEARCH_BY_TRANSLATION_TEXT = "translation_text";

// --- API calls ---

async function updateTranslation(
  code: string,
  translations: Record<string, string>
): Promise<{ success: true } | { success: false; err_message?: string }> {
  const url = `${getTranslationsApiUrl()}/${encodeURIComponent(code)}`;
  const json = (await patchRequest(
    url,
    { translations },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;
  if (json.success === true) return { success: true };
  return {
    success: false,
    err_message: (json.err_message as string | undefined) ?? "Request failed",
  };
}

/**
 * POST /translations — creates a single translation (code + locale map).
 * NOTE: the API always answers 201 with `success: true`, even when the
 * item failed (e.g. duplicate code) — the real outcome is `meta.count`
 * and `meta.errors`, not the top-level `success` flag.
 */
async function createTranslation(
  code: string,
  translations: Record<string, string>
): Promise<{ success: true } | { success: false; err_message?: string }> {
  const json = (await postRequest(
    getTranslationsApiUrl(),
    { code, translations },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;
  if (json.success !== true) {
    return {
      success: false,
      err_message: (json.err_message as string | undefined) ?? "Request failed",
    };
  }
  const meta = json.meta as
    | { count?: number; errors?: Array<{ error?: string }> }
    | undefined;
  if ((meta?.count ?? 0) === 0) {
    return {
      success: false,
      err_message: meta?.errors?.[0]?.error ?? "Request failed",
    };
  }
  return { success: true };
}

type ExportTranslationsParams = {
  search?: string;
  search_by?: string;
  sort_field?: string;
  sort_order?: "asc" | "desc";
};

/**
 * GET /translations?export=true — returns XLSX with current filters/sort.
 */
async function downloadTranslationsExport(
  params: ExportTranslationsParams = {}
): Promise<{ ok: true } | { ok: false; message: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set("export", "true");
  searchParams.set("other_language", "all");
  if (params.search) searchParams.set("search", params.search);
  if (params.search_by) searchParams.set("search_by", params.search_by);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  const url = `${getTranslationsApiUrl()}?${searchParams.toString()}`;
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
            json.err_message ?? json.message ?? `Export failed (${res.status})`,
        };
      } catch {
        return { ok: false, message: `Export failed (${res.status})` };
      }
    }
    return { ok: false, message: `Export failed (${res.status})` };
  }

  if (contentType.includes("application/json")) {
    try {
      const json = (await res.json()) as { err_message?: string };
      return {
        ok: false,
        message: json.err_message ?? "Unexpected JSON response",
      };
    } catch {
      return { ok: false, message: "Unexpected response" };
    }
  }

  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = `translations-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
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

async function importTranslationsFromXlsx(
  file: File
): Promise<{ ok: true; message?: string } | { ok: false; message: string }> {
  const form = new FormData();
  form.append("file", file);
  const url = `${getTranslationsApiUrl()}/import`;
  const json = (await postRequest(url, form, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === true) {
    return {
      ok: true,
      message: typeof json.message === "string" ? json.message : undefined,
    };
  }
  return {
    ok: false,
    message: (json.err_message as string | undefined) ?? "Import failed",
  };
}

// --- Page ---

export default function TranslationsPage() {
  const { t, locale } = useCore();

  usePermissionGuard(APP_ROUTE_PERMISSIONS.translations.view);

  const canUpdate = hasPermission(APP_ROUTE_PERMISSIONS.translations.crud, "U");
  const canCreate = hasPermission(APP_ROUTE_PERMISSIONS.translations.crud, "C");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inlineInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const inlineFocusPendingRef = useRef(false);
  const addRowRef = useRef<HTMLTableRowElement>(null);
  const addRowCodeInputRef = useRef<HTMLInputElement>(null);

  // --- System languages (derive columns) ---
  const [languages, setLanguages] = useState<SystemLanguageRow[]>([]);
  useEffect(() => {
    fetchSystemLanguages()
      .then((rows) => setLanguages(rows.filter((r) => !r.is_deleted)))
      .catch(() => {/* silently continue; columns just show none */});
  }, []);

  // --- Pagination + sort + filter ---
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);
  const [listSort, setListSort] = useState<SortState>({ columnId: null, direction: null });
  const [colFilterCode, setColFilterCode] = useState("");
  const [colFilterEnglish, setColFilterEnglish] = useState("");
  const debouncedCode = useDebounce(colFilterCode, 300);
  const debouncedEnglish = useDebounce(colFilterEnglish, 300);

  /** Locale string for the English column (for search_by + filter UI); null if /system-language has no English row. */
  const englishColumnLocale = useMemo(() => {
    const row = languages.find((l) => {
      const loc = l.locale.trim();
      return /^en(?:[-_]|$)/i.test(loc) || loc.toLowerCase() === "en";
    });
    return row?.locale.trim() ?? null;
  }, [languages]);

  // --- Inline edit ---
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineTranslations, setInlineTranslations] = useState<Record<string, string>>({});
  const [inlineSaveLoading, setInlineSaveLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const exportBusyRef = useRef(false);
  const importBusyRef = useRef(false);
  const [fileImportOpen, setFileImportOpen] = useState(false);

  // --- Add row ---
  const [addRowExpanded, setAddRowExpanded] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newTranslations, setNewTranslations] = useState<Record<string, string>>({});
  const [addSaving, setAddSaving] = useState(false);

  const RECENT_CREATED_ROW_HIGHLIGHT_MS = 4500;
  const [recentCreatedRowIds, setRecentCreatedRowIds] = useState<string[]>([]);
  useEffect(() => {
    if (recentCreatedRowIds.length === 0) return;
    const snapshot = [...recentCreatedRowIds];
    const id = window.setTimeout(() => {
      setRecentCreatedRowIds((prev) => prev.filter((k) => !snapshot.includes(k)));
    }, RECENT_CREATED_ROW_HIGHLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [recentCreatedRowIds]);
  const recentCreatedRowIdSet = useMemo(
    () => new Set(recentCreatedRowIds),
    [recentCreatedRowIds]
  );

  // One active search field at a time (same UX pattern as Sources page).
  const handleColFilterCode = useCallback((v: string) => {
    setColFilterCode(v);
    setColFilterEnglish("");
  }, []);

  const handleColFilterEnglish = useCallback((v: string) => {
    setColFilterEnglish(v);
    setColFilterCode("");
  }, []);

  /** Single-field search/search_by for GET /translations (updated API contract). */
  const buildTranslationListSearch = useCallback(() => {
    const codeTerm = debouncedCode.trim();
    const englishTerm = debouncedEnglish.trim();
    if (codeTerm) {
      return {
        search: codeTerm,
        search_by: SEARCH_BY_TRANSLATION_CODE,
      };
    }
    if (englishTerm) {
      return {
        search: englishTerm,
        search_by: SEARCH_BY_TRANSLATION_TEXT,
      };
    }
    return {
      search: undefined,
      search_by: undefined,
    };
  }, [debouncedCode, debouncedEnglish]);

  // --- Server list query ---
  const listQuery = useMemo(() => {
    const { search, search_by } = buildTranslationListSearch();
    const sort_field =
      listSort.direction != null && listSort.columnId === "code"
        ? SEARCH_BY_TRANSLATION_CODE
        : undefined;
    const sort_order =
      listSort.direction != null && sort_field != null ? listSort.direction : undefined;
    return {
      other_language: "all" as const,
      page,
      page_size: pageSize,
      ...(sort_field && sort_order ? { sort_field, sort_order } : {}),
      ...(search != null && search !== "" ? { search } : {}),
      ...(search_by != null && search_by !== "" ? { search_by } : {}),
    };
  }, [page, pageSize, listSort, buildTranslationListSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedCode, debouncedEnglish]);

  const parseListResponse = useCallback(
    (json: unknown): ServerListParseResult<TranslationRow, TranslationsListMeta> => {
      if (!isTranslationsListResponse(json)) {
        const err = json as { err_message?: string };
        return {
          ok: false,
          message: err.err_message ?? t("LOADING_TRANSLATIONS"),
        };
      }
      const totals = parseListMetaTotals(json.meta);
      return {
        ok: true,
        rows: parseTranslationItems(json.data),
        ...totals,
        meta: json.meta,
      };
    },
    [t]
  );

  const listState = useServerListQuery({
    listUrl: getTranslationsApiUrl(),
    query: listQuery,
    parseListResponse,
    enabled: true,
  });

  const { rows: serverRows, loading, meta, refetch } = listState;
  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [optimisticTotalCount, setOptimisticTotalCount] = useState(0);
  const [optimisticTotalCountUnfiltered, setOptimisticTotalCountUnfiltered] =
    useState<number | undefined>(undefined);

  useEffect(() => { setRows(serverRows); }, [serverRows]);
  useEffect(() => {
    setOptimisticTotalCount(listState.totalCount);
    setOptimisticTotalCountUnfiltered(listState.totalCountUnfiltered);
  }, [listState.totalCount, listState.totalCountUnfiltered]);

  const tableRows = rows;

  const totalCount = optimisticTotalCount;
  const totalPages = listState.totalPages;

  // --- Sort handler ---
  const onSortCode = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSort("code", prev));
  }, []);

  // --- Inline edit ---
  const onStartInlineEdit = useCallback((row: TranslationRow) => {
    if (!canUpdate) return;
    const id = translationRowId(row);
    if (!id) return;
    inlineFocusPendingRef.current = true;
    setInlineError(null);
    setActiveRowId(id);
    setEditingRowId(id);
    setInlineTranslations({ ...row.translations });
  }, [canUpdate]);

  const setInlineTranslation = useCallback((locale: string, value: string) => {
    setInlineTranslations((prev) => ({ ...prev, [locale]: value }));
  }, []);

  const onInlineCancel = useCallback(() => {
    if (editingRowId) setActiveRowId(editingRowId);
    setInlineError(null);
    setEditingRowId(null);
  }, [editingRowId]);

  const onInlineSave = useCallback(async () => {
    if (!editingRowId || inlineSaveLoading) return;
    const savedId = editingRowId;
    const row = rows.find((r) => translationRowId(r) === savedId);
    if (!row) { setEditingRowId(null); return; }

    setInlineSaveLoading(true);
    try {
      const res = await updateTranslation(savedId, inlineTranslations);
      if (!res.success) {
        const msg = res.err_message ?? t("TRANSLATION_UPDATE_FAILED");
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      setInlineError(null);
      setRows((prev) =>
        prev.map((r) =>
          translationRowId(r) === savedId
            ? { ...r, translations: { ...inlineTranslations } }
            : r
        )
      );
      setEditingRowId(null);
      setActiveRowId(savedId);
      toast.success(t("TRANSLATION_UPDATED"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("TRANSLATION_UPDATE_FAILED");
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setInlineSaveLoading(false);
    }
  }, [editingRowId, inlineSaveLoading, rows, inlineTranslations, t]);

  // Exit edit mode if the row disappears (page change, filter, etc.)
  useEffect(() => {
    if (!editingRowId) return;
    if (!rows.some((r) => translationRowId(r) === editingRowId)) setEditingRowId(null);
  }, [rows, editingRowId]);

  // Focus first inline input when entering edit mode
  useLayoutEffect(() => {
    if (!editingRowId || !inlineFocusPendingRef.current) return;
    inlineFocusPendingRef.current = false;
    requestAnimationFrame(() => {
      const first = inlineInputRefs.current.values().next().value;
      first?.focus();
      first?.select();
    });
  }, [editingRowId]);

  // --- Add row ---
  const setNewTranslation = useCallback((locale: string, value: string) => {
    setNewTranslations((prev) => ({ ...prev, [locale]: value }));
  }, []);

  const addRowDisabledByInlineEdit = editingRowId != null;

  const handleAddSave = useCallback(async () => {
    const code = newCode.trim();
    if (!code || addSaving || addRowDisabledByInlineEdit) return;
    setAddSaving(true);
    try {
      const filteredTranslations = Object.fromEntries(
        Object.entries(newTranslations).filter(([, v]) => v.trim() !== "")
      );
      const res = await createTranslation(code, filteredTranslations);
      if (!res.success) {
        toast.error(res.err_message ?? t("TRANSLATION_CREATE_FAILED", "Create failed"));
        return;
      }

      const created: TranslationRow = { code, translations: filteredTranslations };
      setNewCode("");
      setNewTranslations({});
      setAddRowExpanded(false);
      setRows((prev) => [created, ...prev]);
      setOptimisticTotalCount((c) => c + 1);
      setActiveRowId(translationRowId(created));
      setRecentCreatedRowIds((prev) => [translationRowId(created), ...prev]);
      toast.success(t("TRANSLATION_CREATED", "Translation created"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("TRANSLATION_CREATE_FAILED", "Create failed")
      );
    } finally {
      setAddSaving(false);
    }
  }, [newCode, newTranslations, addSaving, addRowDisabledByInlineEdit, t]);

  const handleAddRowDiscard = useCallback(() => {
    setNewCode("");
    setNewTranslations({});
    setAddRowExpanded(false);
  }, []);

  const handleImportFile = useCallback(
    async (file: File | null) => {
      if (!canCreate || !file || importBusyRef.current) return;
      importBusyRef.current = true;
      try {
        const result = await importTranslationsFromXlsx(file);
        if (!result.ok) {
          toast.error(
            t("ERROR_MESSAGE").replace("{message}", result.message)
          );
          return;
        }
        toast.success(result.message ?? t("IMPORT"));
        await refetch();
      } catch (e) {
        toast.error(
          t("ERROR_MESSAGE").replace(
            "{message}",
            e instanceof Error ? e.message : t("EXPORT_FAILED")
          )
        );
      } finally {
        importBusyRef.current = false;
      }
    },
    [canCreate, refetch, t]
  );

  const toolbarImportConfig = useMemo(
    () => ({
      onClick: () => {
        if (!canCreate) return;
        setFileImportOpen(true);
      },
      disabled: !canCreate,
    }),
    [canCreate]
  );

  const handleFileImportModalSubmit = useCallback(
    async ({ file, format }: { file: File | null; format: "csv" | "xlsx" }) => {
      if (!canCreate || !file || importBusyRef.current) return;
      if (format !== "xlsx") {
        toast.error(`${t("TOOLBAR_DOWNLOAD_EXCEL")} (.xlsx).`);
        return;
      }
      await handleImportFile(file);
    },
    [canCreate, handleImportFile, t]
  );

  const runTranslationsExport = useCallback(async () => {
    if (exportBusyRef.current) return;
    exportBusyRef.current = true;
    try {
      const { search, search_by } = buildTranslationListSearch();
      const result = await downloadTranslationsExport({
        search,
        search_by,
        ...(listSort.direction != null && listSort.columnId === "code"
          ? {
              sort_field: SEARCH_BY_TRANSLATION_CODE,
              sort_order: listSort.direction,
            }
          : {}),
      });
      if (!result.ok) {
        toast.error(
          t("ERROR_MESSAGE").replace("{message}", result.message)
        );
      } else {
        toast.success(t("EXPORT_SUCCESS"));
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
  }, [buildTranslationListSearch, listSort.columnId, listSort.direction, t]);

  const toolbarExportConfig = useMemo(
    () => ({
      onClick: () => void runTranslationsExport(),
      disabled: totalCount === 0,
    }),
    [runTranslationsExport, totalCount]
  );

  // --- Column defs ---
  const codeSortIcon = useMemo(
    () => sortIcon("code", listSort),
    [listSort]
  );

  const columns = useTranslationsGridColumns({
    t,
    locale,
    languages,
    englishColumnLocale,
    colFilterCode,
    setColFilterCode: handleColFilterCode,
    colFilterEnglish,
    setColFilterEnglish: handleColFilterEnglish,
    onSortCode,
    codeSortIcon,
    canUpdate,
    editingRowId,
    inlineTranslations,
    setInlineTranslation,
    inlineInputRefs,
    inlineSaveLoading,
    onStartInlineEdit,
    onInlineSave,
    onInlineCancel,
  });

  // Total columns = code + N langs + actions
  const colSpan = 1 + languages.length + 1;

  const addRowExpandedFields = useMemo((): ServerDrivenListAddRowField[] => {
    const addRowDisabled = addSaving || addRowDisabledByInlineEdit;
    const codeField: ServerDrivenListAddRowField = {
      kind: "text",
      value: newCode,
      onChange: setNewCode,
      placeholder: t("TRANSLATION_CODE"),
      inputClassName: gridTextFieldClassName("min-w-0 w-full"),
      inputRef: addRowCodeInputRef,
      disabled: addRowDisabled,
      ariaLabel: t("TRANSLATION_CODE"),
    };
    const langFields: ServerDrivenListAddRowField[] = languages.map((lang) => ({
      kind: "text" as const,
      value: newTranslations[lang.locale] ?? "",
      onChange: (v: string) => setNewTranslation(lang.locale, v),
      inputClassName: gridTextFieldClassName("min-w-0 w-full"),
      disabled: addRowDisabled,
      ariaLabel: systemLanguageRowLabel(lang, locale),
    }));
    return [codeField, ...langFields];
  }, [
    addSaving,
    addRowDisabledByInlineEdit,
    newCode,
    newTranslations,
    setNewTranslation,
    languages,
    locale,
    t,
  ]);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
      <Breadcrumb activeTab="translation" />

      <PageToolbar
        title={t("TRANSLATIONS")}
        icon="translate"
        toolbarExtra={null}
        bulkDelete={null}
        toolbarExport={toolbarExportConfig}
        toolbarImport={toolbarImportConfig}
        hideActions={false}
        hideImportExport={false}
        hideDelete
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {inlineError ? (
        <div className="inline-alert--error mx-4 mt-2">
          {inlineError}
        </div>
      ) : null}

      <ServerDrivenTable<TranslationRow, TranslationsListMeta>
        listState={listState}
        columns={columns}
        scrollRef={scrollRef}
        renderThead={() => (
          <thead>
            <EditableDataGridThead columns={columns} />
          </thead>
        )}
        tbody={
          <ServerDrivenListTbody<TranslationRow>
            colSpan={colSpan}
            rows={tableRows}
            columns={columns}
            getRowId={translationRowId}
            activeRowId={activeRowId}
            editingRowId={editingRowId}
            onDataRowEnterAtEnd={({ mode }) => {
              if (mode === "edit") void onInlineSave();
            }}
            onDataRowEscape={({ mode }) => {
              if (mode === "edit") onInlineCancel();
            }}
            getRowClassName={(row) =>
              recentCreatedRowIdSet.has(translationRowId(row))
                ? TV_ROW_NEWLY_ADDED_CLASS
                : ""
            }
            emptyMessage={t("TRANSLATIONS_EMPTY")}
            showLoadingRow={false}
            showEmptyRow={!loading && rows.length === 0}
            showDataRows={!loading}
            addRow={{
              ref: addRowRef,
              promptLabel: t("ADD"),
              expanded: addRowExpanded,
              onExpandedChange: setAddRowExpanded,
              primaryColumnId: "code",
              disabled: !canCreate,
              disabledTitle: t("NO_PERMISSION_CREATE"),
              onExpand: () => {
                queueMicrotask(() => addRowCodeInputRef.current?.focus());
              },
              className: `add-row${addRowExpanded ? "" : " add-row-collapsed"}${addRowDisabledByInlineEdit || !canCreate ? " add-row-interaction-blocked" : ""}`,
              ariaDisabled: addRowDisabledByInlineEdit || !canCreate,
              title: !canCreate
                ? t("NO_PERMISSION_CREATE")
                : addRowDisabledByInlineEdit
                  ? t("TRANSLATION_ADD_ROW_FINISH_EDIT_FIRST", "Finish editing the current row first")
                  : undefined,
              onRowEnterAtEnd: () => {
                if (!canCreate) return;
                if (addRowDisabledByInlineEdit) return;
                if (!addRowExpanded) {
                  setAddRowExpanded(true);
                  queueMicrotask(() => addRowCodeInputRef.current?.focus());
                  return;
                }
                void handleAddSave();
              },
              onRowEscape: () => {
                if (addRowExpanded) handleAddRowDiscard();
              },
              onArrowIntoRow: addRowDisabledByInlineEdit || !canCreate
                ? undefined
                : () => setAddRowExpanded(true),
              onArrowLeaveRow: addRowDisabledByInlineEdit || !canCreate
                ? undefined
                : () => setAddRowExpanded(false),
              expandedFields: addRowExpandedFields,
              collapsedSave: { title: "save", ariaLabel: "save-placeholder" },
              collapsedCancel: { title: "cancel", ariaLabel: "cancel-placeholder" },
              showActionsColumn: canCreate,
              actionsWidth: "icon",
              save: {
                title: !newCode.trim() ? t("TRANSLATION_CODE_REQUIRED", "Code is required") : t("SAVE"),
                ariaLabel: !newCode.trim() ? t("TRANSLATION_CODE_REQUIRED", "Code is required") : t("SAVE"),
                disabled: addSaving || !newCode.trim() || addRowDisabledByInlineEdit,
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
          totalPages,
          totalCount,
          totalCountUnfiltered: optimisticTotalCountUnfiltered,
          pageSize,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
          countNoun: t("TRANSLATIONS"),
          labels: { t, filteredOnly: "FOOTER_OF_TOTAL_TRANSLATIONS" },
        }}
      />
      </div>
      <FileImport
        open={fileImportOpen}
        title={t("TRANSLATIONS")}
        onClose={() => setFileImportOpen(false)}
        onImport={handleFileImportModalSubmit}
      />
    </main>
  );
}
