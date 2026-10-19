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
import { PageToolbar } from "@/components/PageToolbar";
import {
  getFileResponse,
  getRequest,
  patchRequest,
  postRequest,
} from "@/lib/api/http";
import { getTranslationsApiUrl } from "@/lib/constants";
import {
  fetchSystemLanguages,
  type SystemLanguageRow,
} from "@/lib/api/core";
import {
  InlineEditableTable,
  InlineEditableTHead,
  InlineEditableTBody,
} from "@/components/TableView";
import {
  DEFAULT_TABLE_PAGE_SIZES,
  TablePaginationFooter,
} from "@/components/TablePaginationFooter";
import FileImport from "@/components/FileImport";
import { useTranslationGridColumns } from "./TranslationGridColumns";

// --- Types ---

export type TranslationRow = {
  code: string;
  translations: Record<string, string>;
};

function translationRowId(row: TranslationRow): string {
  return row.code;
}

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

function sortIcon(
  columnId: string,
  state: SortState
): "arrow_upward" | "arrow_downward" | "unfold_more" {
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

const SEARCH_BY_TRANSLATION_CODE = "trans_code";
const SEARCH_BY_TRANSLATION_TEXT = "translation_text";

// --- API calls ---

async function fetchTranslationsList(params: Record<string, string>): Promise<unknown> {
  const searchParams = new URLSearchParams(params);
  const url = `${getTranslationsApiUrl()}?${searchParams.toString()}`;
  return getRequest(url);
}

async function updateTranslation(
  code: string,
  translations: Record<string, string>
): Promise<{ success: true } | { success: false; err_message?: string }> {
  const url = `${getTranslationsApiUrl()}/${encodeURIComponent(code)}`;
  const json = (await patchRequest(url, { translations }, { suppressErrorMessage: true })) as Record<string, unknown>;
  if (json.success === true) return { success: true };
  return {
    success: false,
    err_message: (json.err_message as string | undefined) ?? "Request failed",
  };
}

type ExportTranslationsParams = {
  search?: string;
  search_by?: string;
  sort_field?: string;
  sort_order?: "asc" | "desc";
};

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
        const json = (await res.json()) as { err_message?: string; message?: string };
        return {
          ok: false,
          message: json.err_message ?? json.message ?? `Export failed (${res.status})`,
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
      return { ok: false, message: json.err_message ?? "Unexpected JSON response" };
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
  const json = (await postRequest(url, form, { suppressErrorMessage: true })) as Record<string, unknown>;
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

export default function Translations() {
  const { t } = useCore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inlineInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const inlineFocusPendingRef = useRef(false);

  // --- System languages (derive columns) ---
  const [languages, setLanguages] = useState<SystemLanguageRow[]>([]);
  useEffect(() => {
    fetchSystemLanguages()
      .then((rows) => setLanguages(rows.filter((r) => !r.is_deleted)))
      .catch(() => {});
  }, []);

  // --- Pagination + sort + filter ---
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);
  const [listSort, setListSort] = useState<SortState>({ columnId: null, direction: null });
  const [colFilterCode, setColFilterCode] = useState("");
  const [colFilterEnglish, setColFilterEnglish] = useState("");
  const debouncedCode = useDebounce(colFilterCode, 300);
  const debouncedEnglish = useDebounce(colFilterEnglish, 300);

  // --- Inline edit ---
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineTranslations, setInlineTranslations] = useState<Record<string, string>>({});
  const [inlineSaveLoading, setInlineSaveLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const exportBusyRef = useRef(false);
  const importBusyRef = useRef(false);
  const [fileImportOpen, setFileImportOpen] = useState(false);

  // --- Data state ---
  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const fetchIdRef = useRef(0);

  const handleColFilterCode = useCallback((v: string) => {
    setColFilterCode(v);
    setColFilterEnglish("");
  }, []);

  const handleColFilterEnglish = useCallback((v: string) => {
    setColFilterEnglish(v);
    setColFilterCode("");
  }, []);

  const buildTranslationListSearch = useCallback(() => {
    const codeTerm = debouncedCode.trim();
    const englishTerm = debouncedEnglish.trim();
    if (codeTerm) {
      return { search: codeTerm, search_by: SEARCH_BY_TRANSLATION_CODE };
    }
    if (englishTerm) {
      return { search: englishTerm, search_by: SEARCH_BY_TRANSLATION_TEXT };
    }
    return { search: undefined, search_by: undefined };
  }, [debouncedCode, debouncedEnglish]);

  // --- Fetch translations ---
  const fetchData = useCallback(async () => {
    const id = ++fetchIdRef.current;
    setLoading(true);

    const { search, search_by } = buildTranslationListSearch();
    const sort_field =
      listSort.direction != null && listSort.columnId === "code"
        ? SEARCH_BY_TRANSLATION_CODE
        : undefined;
    const sort_order =
      listSort.direction != null && sort_field != null ? listSort.direction : undefined;

    const params: Record<string, string> = {
      other_language: "all",
      page: String(page),
      page_size: String(pageSize),
    };
    if (sort_field && sort_order) {
      params.sort_field = sort_field;
      params.sort_order = sort_order;
    }
    if (search) params.search = search;
    if (search_by) params.search_by = search_by;

    try {
      const json = await fetchTranslationsList(params);
      if (id !== fetchIdRef.current) return;

      if (isTranslationsListResponse(json)) {
        setRows(parseTranslationItems(json.data));
        setTotalCount(json.meta.total_count);
        setTotalPages(json.meta.total_pages);
      } else {
        setRows([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } catch {
      if (id !== fetchIdRef.current) return;
      setRows([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, [page, pageSize, listSort, buildTranslationListSearch]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [debouncedCode, debouncedEnglish]);

  // --- Sort handler ---
  const onSortCode = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSort("code", prev));
  }, []);

  // --- Inline edit ---
  const onStartInlineEdit = useCallback((row: TranslationRow) => {
    const id = translationRowId(row);
    if (!id) return;
    inlineFocusPendingRef.current = true;
    setInlineError(null);
    setActiveRowId(id);
    setEditingRowId(id);
    setInlineTranslations({ ...row.translations });
  }, []);

  const setInlineTranslation = useCallback((loc: string, value: string) => {
    setInlineTranslations((prev) => ({ ...prev, [loc]: value }));
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
        const msg = res.err_message ?? t("TRANSLATION_UPDATE_FAILED", "Update failed");
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
      toast.success(t("TRANSLATION_UPDATED", "Translation updated"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("TRANSLATION_UPDATE_FAILED", "Update failed");
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setInlineSaveLoading(false);
    }
  }, [editingRowId, inlineSaveLoading, rows, inlineTranslations, t]);

  useEffect(() => {
    if (!editingRowId) return;
    if (!rows.some((r) => translationRowId(r) === editingRowId)) setEditingRowId(null);
  }, [rows, editingRowId]);

  useLayoutEffect(() => {
    if (!editingRowId || !inlineFocusPendingRef.current) return;
    inlineFocusPendingRef.current = false;
    requestAnimationFrame(() => {
      const first = inlineInputRefs.current.values().next().value;
      if (first) {
        first.focus();
        first.select();
      }
    });
  }, [editingRowId]);

  // --- Import ---
  const handleImportFile = useCallback(
    async (file: File | null) => {
      if (!file || importBusyRef.current) return;
      importBusyRef.current = true;
      try {
        const result = await importTranslationsFromXlsx(file);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message ?? t("IMPORT", "Import successful"));
        await fetchData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("IMPORT_FAILED", "Import failed"));
      } finally {
        importBusyRef.current = false;
      }
    },
    [fetchData, t]
  );

  const toolbarImportConfig = useMemo(
    () => ({ onClick: () => setFileImportOpen(true), disabled: false }),
    []
  );

  const handleFileImportModalSubmit = useCallback(
    async ({ file, format }: { file: File | null; format: "csv" | "xlsx" }) => {
      if (!file || importBusyRef.current) return;
      if (format !== "xlsx") {
        toast.error("Only Excel (.xlsx) files are supported.");
        return;
      }
      await handleImportFile(file);
    },
    [handleImportFile]
  );

  // --- Export ---
  const runTranslationsExport = useCallback(async () => {
    if (exportBusyRef.current) return;
    exportBusyRef.current = true;
    try {
      const { search, search_by } = buildTranslationListSearch();
      const result = await downloadTranslationsExport({
        search,
        search_by,
        ...(listSort.direction != null && listSort.columnId === "code"
          ? { sort_field: SEARCH_BY_TRANSLATION_CODE, sort_order: listSort.direction }
          : {}),
      });
      if (!result.ok) {
        toast.error(result.message);
      } else {
        toast.success(t("EXPORT_SUCCESS", "Export downloaded"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("EXPORT_FAILED", "Export failed"));
    } finally {
      exportBusyRef.current = false;
    }
  }, [buildTranslationListSearch, listSort.columnId, listSort.direction, t]);

  const toolbarExportConfig = useMemo(
    () => ({ onClick: () => void runTranslationsExport(), disabled: totalCount === 0 }),
    [runTranslationsExport, totalCount]
  );

  // --- Column defs ---
  const codeSortIcon = useMemo(() => sortIcon("code", listSort), [listSort]);

  const columns = useTranslationGridColumns({
    colFilterCode,
    setColFilterCode: handleColFilterCode,
    onSortCode,
    codeSortIcon,
    languages,
    colFilterEnglish,
    setColFilterEnglish: handleColFilterEnglish,
    onStartInlineEdit,
    editingRowId,
    inlineTranslations,
    setInlineTranslation,
    onInlineCancel,
    onInlineSave,
    inlineSaveLoading,
    inlineInputRefs,
  });

  const thead = <InlineEditableTHead columns={columns} />;

  const tbody = (
    <InlineEditableTBody
      columns={columns}
      rows={rows}
      rowId={translationRowId}
      editingRowId={editingRowId}
      activeRowId={activeRowId}
      loading={loading}
      emptyMessage={t("TRANSLATIONS_EMPTY", "No translations found.")}
    />
  );

  return (
    <main className="sys-config bg-surface-muted">
      <PageToolbar
        title={t("TRANSLATIONS", "Translations")}
        icon="translate"
        toolbarExtra={null}
        toolbarExport={toolbarExportConfig}
        toolbarImport={toolbarImportConfig}
        hideActions={false}
        hideImportExport={false}
        hideDelete
        hideInfo = {false}
      />

      <div className="sys-config">
        {inlineError ? (
          <div className="mx-4 mt-2 rounded-md border border-[color:color-mix(in_srgb,var(--color-error)_30%,var(--color-border))] bg-[color:color-mix(in_srgb,var(--color-error)_10%,var(--color-surface))] px-3 py-2 text-xs text-error">
            {inlineError}
          </div>
        ) : null}

        <InlineEditableTable
          scrollRef={scrollRef}
          wrapClassName="tbl-wrap h-full min-h-0"
          tableClassName="min-w-[800px] tv-grid-cols-sticky-ends"
          loading={loading}
          tableAriaLabel={t("TRANSLATIONS", "Translations")}
          thead={thead}
          tbody={tbody}
          footer={
            <TablePaginationFooter
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
              countNoun={t("TRANSLATIONS", "Translations")}
              pageSummaryClassName="mx-1 min-w-[90px] text-center"
            />
          }
        />
      </div>

      <FileImport
        open={fileImportOpen}
        title={t("TRANSLATIONS", "Translations")}
        onClose={() => setFileImportOpen(false)}
        onImport={handleFileImportModalSubmit}
      />
    </main>
  );
}
