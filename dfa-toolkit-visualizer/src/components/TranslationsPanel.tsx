"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { X, Languages, Upload, Download, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useCore } from "@/contexts/CoreContext";
import { Loader } from "@/components/Loader";
import {
  fetchSystemLanguages,
  fetchTranslationsList,
  updateTranslation,
  downloadTranslationsExport,
  importTranslationsXlsx,
  type TranslationRow,
  type TranslationsListMeta,
} from "@/lib/api/core";
import type { SystemLanguageEntry } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortState = { field: string | null; order: "asc" | "desc" };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// TranslationsPanel
// ---------------------------------------------------------------------------

export interface TranslationsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function TranslationsPanel({ open, onClose }: TranslationsPanelProps) {
  const { t } = useCore();

  // --- Languages (columns) ---
  const [languages, setLanguages] = useState<SystemLanguageEntry[]>([]);
  const [selectedLocale, setSelectedLocale] = useState<string | null>(null);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  // --- Table data ---
  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [meta, setMeta] = useState<TranslationsListMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Pagination ---
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // --- Sort ---
  const [sort, setSort] = useState<SortState>({ field: "trans_code", order: "asc" });

  // --- Search ---
  const [searchCode, setSearchCode] = useState("");
  const [searchText, setSearchText] = useState("");
  const debouncedSearchCode = useDebounce(searchCode, 300);
  const debouncedSearchText = useDebounce(searchText, 300);

  // --- Inline edit ---
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- Export ---
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // --- Import modal ---
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Load languages once on open
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    fetchSystemLanguages().then((langs) => {
      const active = langs.filter((l) => !("is_deleted" in l && (l as SystemLanguageEntry & { is_deleted?: boolean }).is_deleted));
      setLanguages(active);
      if (active.length > 0 && selectedLocale === null) {
        const def = active.find((l) => l.is_default) ?? active[0];
        setSelectedLocale(def.locale);
      }
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Fetch translations list
  // ---------------------------------------------------------------------------
  const fetchList = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const result = await fetchTranslationsList({
      page,
      pageSize,
      searchCode: debouncedSearchCode || undefined,
      searchText: debouncedSearchText || undefined,
      sortField: sort.field ?? undefined,
      sortOrder: sort.order,
    });
    setLoading(false);
    if (result.ok) {
      setRows(result.rows);
      setMeta(result.meta);
    } else {
      setFetchError(result.error);
    }
  }, [page, pageSize, debouncedSearchCode, debouncedSearchText, sort]);

  useEffect(() => {
    if (!open) return;
    fetchList();
  }, [open, fetchList]);

  // Reset to page 1 when search/sort changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchCode, debouncedSearchText, sort, pageSize]);

  // ---------------------------------------------------------------------------
  // Keyboard / click-outside
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (importOpen) { setImportOpen(false); return; }
        if (editingCode) { cancelEdit(); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, importOpen, editingCode, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!langDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setLangDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [langDropdownOpen]);

  // ---------------------------------------------------------------------------
  // Sort helpers
  // ---------------------------------------------------------------------------
  function toggleSort(field: string) {
    setSort((prev) => {
      if (prev.field === field) return { field, order: prev.order === "asc" ? "desc" : "asc" };
      return { field, order: "asc" };
    });
  }

  function sortIcon(field: string) {
    if (sort.field !== field) return "↕";
    return sort.order === "asc" ? "↑" : "↓";
  }

  // ---------------------------------------------------------------------------
  // Inline edit
  // ---------------------------------------------------------------------------
  function startEdit(row: TranslationRow) {
    setEditingCode(row.code);
    setEditingValues({ ...row.translations });
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingCode(null);
    setEditingValues({});
    setSaveError(null);
  }

  async function saveEdit() {
    if (!editingCode) return;
    setSaving(true);
    setSaveError(null);
    const result = await updateTranslation(editingCode, editingValues);
    setSaving(false);
    if (result.ok) {
      setRows((prev) =>
        prev.map((r) =>
          r.code === editingCode ? { ...r, translations: { ...editingValues } } : r
        )
      );
      setEditingCode(null);
      setEditingValues({});
    } else {
      setSaveError(result.error);
    }
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    const result = await downloadTranslationsExport({
      searchCode: debouncedSearchCode || undefined,
      searchText: debouncedSearchText || undefined,
      sortField: sort.field ?? undefined,
      sortOrder: sort.order,
    });
    setExporting(false);
    if (!result.ok) setExportError(result.error);
  }

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------
  function handleFileSelect(file: File) {
    if (!file.name.endsWith(".xlsx")) {
      setImportError(t("IMPORT_INVALID_FILE_TYPE", "Only .xlsx files are supported."));
      return;
    }
    setImportFile(file);
    setImportError(null);
    setImportSuccess(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  }

  async function handleImportSubmit() {
    if (!importFile || importing) return;
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    const result = await importTranslationsXlsx(importFile);
    setImporting(false);
    if (result.ok) {
      setImportSuccess(result.message);
      setImportFile(null);
      fetchList();
    } else {
      setImportError(result.error);
    }
  }

  function closeImport() {
    setImportOpen(false);
    setImportFile(null);
    setImportError(null);
    setImportSuccess(null);
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const selectedLang = languages.find((l) => l.locale === selectedLocale);
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total_count / pageSize)) : 1;

  // ---------------------------------------------------------------------------
  // Render guard
  // ---------------------------------------------------------------------------
  if (!open) return null;
  if (typeof document === "undefined") return null;

  // ---------------------------------------------------------------------------
  // Panel UI
  // ---------------------------------------------------------------------------
  const panelUi = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 top-[var(--height-header)] z-[200] bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("TRANSLATIONS", "Translations")}
        className="fixed top-[var(--height-header)] bottom-0 right-0 rtl:right-auto rtl:left-0 z-[210] flex w-[min(90vw,56rem)] min-h-0 flex-col border-l rtl:border-l-0 rtl:border-r border-border bg-surface shadow-xl"
      >
        {/* ------------------------------------------------------------------ */}
        {/* Header — single row matching Settings / About height */}
        {/* ------------------------------------------------------------------ */}
        <div className="px-4 py-2 bg-surface-muted border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {/* Title */}
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text shrink-0 mr-1">
              <Languages className="w-4 h-4 text-primary" aria-hidden />
              {t("TRANSLATIONS", "Translations")}
            </h3>

            {/* Import */}
            <button
              type="button"
              className="btn-comp-secondary text-xs px-3 py-1.5 gap-1.5"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="w-3.5 h-3.5" aria-hidden />
              {t("IMPORT", "Import")}
            </button>

            {/* Export */}
            <button
              type="button"
              className="btn-comp-secondary text-xs px-3 py-1.5 gap-1.5"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download className="w-3.5 h-3.5" aria-hidden />
              {exporting ? t("EXPORTING", "Exporting…") : t("EXPORT", "Export")}
            </button>

            {exportError && (
              <span className="text-xs text-error truncate max-w-[12rem]">{exportError}</span>
            )}

            <div className="flex-1" />

            {/* Language dropdown */}
            {languages.length > 0 && (
              <div className="relative" ref={langDropdownRef}>
                <button
                  type="button"
                  className="btn-comp-secondary text-xs px-3 py-1.5 gap-1.5 min-w-[8rem]"
                  onClick={() => setLangDropdownOpen((p) => !p)}
                  aria-expanded={langDropdownOpen}
                  aria-haspopup="listbox"
                >
                  <span className="truncate">{selectedLang?.name ?? selectedLocale ?? t("SELECT_LANGUAGE", "Language")}</span>
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
                </button>
                {langDropdownOpen && (
                  <ul
                    className="absolute right-0 rtl:right-auto rtl:left-0 top-full z-[220] mt-1 min-w-[10rem] max-h-60 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
                    role="listbox"
                    aria-label={t("SELECT_LANGUAGE", "Select language")}
                  >
                    {languages.map((lang) => {
                      const isActive = lang.locale === selectedLocale;
                      return (
                        <li key={lang.locale} role="option" aria-selected={isActive}>
                          <button
                            type="button"
                            className={`list-opt--panel focus:bg-surface-muted focus:outline-none ${isActive ? "font-semibold text-primary" : ""}`}
                            onClick={() => {
                              setSelectedLocale(lang.locale);
                              setLangDropdownOpen(false);
                            }}
                          >
                            {lang.name ?? lang.locale}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="btn-comp-icon--ghost ml-1 shrink-0"
              aria-label={t("CLOSE", "Close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Table — vertical scroll only, fixed column layout, no x-scroll     */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          {loading && (
            <div className="flex flex-1 items-center justify-center h-full min-h-[200px]">
              <Loader loadingLabel={t("COMMON_LOADING", "Loading…")} size={40}/>
            </div>
          )}
          {!loading && fetchError && (
            <div className="flex items-center justify-center h-24 text-sm text-error px-4 text-center">
              {fetchError}
            </div>
          )}
          {!loading && !fetchError && (
            <table className="w-full text-xs border-collapse table-fixed">
              <colgroup>
                {/* Code column: ~45% */}
                <col style={{ width: "45%" }} />
                {/* Value column: fills remainder */}
                <col />
                {/* Actions column: fixed narrow */}
                <col style={{ width: "60px" }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-muted">
                {/* Label row */}
                <tr>
                  <th
                    scope="col"
                    className="th-label border-b border-border cursor-pointer select-none rtl:text-right text-text"
                    onClick={() => toggleSort("trans_code")}
                  >
                    {t("TRANSLATION_CODE", "Translation Code")}
                    <span className="ml-1 rtl:ml-0 rtl:mr-1">{sortIcon("trans_code")}</span>
                  </th>
                  <th
                    scope="col"
                    className="th-label border-b border-border cursor-pointer select-none rtl:text-right text-text"
                    onClick={() => toggleSort("translation_text")}
                  >
                    {selectedLang?.name ?? selectedLocale ?? t("VALUE", "Value")}
                    <span className="ml-1 rtl:ml-0 rtl:mr-1">{sortIcon("translation_text")}</span>
                  </th>
                  <th scope="col" className="th-label border-b border-border" aria-label={t("ACTIONS", "Actions")} />
                </tr>
                {/* Search row — lives inside thead so it sticks with headers */}
                <tr className="bg-surface border-b border-border">
                  <th scope="col" className="px-2 py-1.5">
                    <input
                      type="text"
                      className="field-comp--sm"
                      placeholder={t("SEARCH_BY_CODE", "Search…")}
                      value={searchCode}
                      onChange={(e) => { setSearchCode(e.target.value); setSearchText(""); }}
                      aria-label={t("SEARCH_BY_CODE", "Search by code")}
                    />
                  </th>
                  <th scope="col" className="px-2 py-1.5">
                    <input
                      type="text"
                      className="field-comp--sm"
                      placeholder={t("SEARCH_BY_VALUE", "Search…")}
                      value={searchText}
                      onChange={(e) => { setSearchText(e.target.value); setSearchCode(""); }}
                      aria-label={t("SEARCH_BY_VALUE", "Search by value")}
                    />
                  </th>
                  <th scope="col" className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-text-muted">
                      {t("NO_RESULTS", "No results found.")}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isEditing = editingCode === row.code;
                    const cellValue = selectedLocale ? (row.translations[selectedLocale] ?? "") : "";

                    return (
                      <tr
                        key={row.code}
                        className={`border-b border-border transition-colors ${isEditing ? "" : "hover:bg-surface-muted/50 cursor-pointer"}`}
                        onDoubleClick={() => !isEditing && startEdit(row)}
                        title={!isEditing ? t("DOUBLE_CLICK_TO_EDIT", "Double-click to edit") : undefined}
                      >
                        {/* Code cell — truncated, never wraps */}
                        <td className="px-4 py-2 align-middle overflow-hidden">
                          <span className="font-mono text-xs text-text block truncate" title={row.code}>
                            {row.code}
                          </span>
                        </td>

                        {/* Value cell */}
                        <td className="px-4 py-2 align-middle overflow-hidden">
                          {isEditing && selectedLocale ? (
                            <input
                              type="text"
                              className="field-comp--sm"
                              value={editingValues[selectedLocale] ?? ""}
                              onChange={(e) =>
                                setEditingValues((prev) => ({ ...prev, [selectedLocale]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); void saveEdit(); }
                                if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                              }}
                              autoFocus
                              disabled={saving}
                              aria-label={selectedLang?.name ?? selectedLocale ?? t("VALUE", "Value")}
                            />
                          ) : (
                            <span className="text-xs text-text block truncate" title={cellValue || undefined}>
                              {cellValue || <span className="text-text-muted">—</span>}
                            </span>
                          )}
                        </td>

                        {/* Actions cell — fixed, always visible */}
                        <td className="px-1 py-2 align-middle">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                type="button"
                                className="btn-comp-ghost--grid-save disabled:opacity-50"
                                onClick={() => void saveEdit()}
                                disabled={saving}
                                aria-label={t("SAVE_CHANGES", "Save")}
                                title={t("SAVE_CHANGES", "Save")}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                className="btn-comp-ghost--grid-cancel"
                                onClick={cancelEdit}
                                aria-label={t("CANCEL_EDIT", "Cancel")}
                                title={t("CANCEL_EDIT", "Cancel")}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
          {!loading && !fetchError && saveError && (
            <div className="px-4 py-2 text-xs text-error border-t border-border bg-surface">
              {saveError}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Pagination footer */}
        {/* ------------------------------------------------------------------ */}
        {meta && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border bg-surface-muted shrink-0 flex-wrap text-xs text-text-muted">
            {/* Left: rows-per-page selector */}
            <div className="flex items-center gap-1.5">
              <span>{t("ROWS_PER_PAGE", "Rows per page:")}</span>
              <select
                className="pg-sel"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                aria-label={t("ROWS_PER_PAGE", "Rows per page")}
              >
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Right: page info then prev/next arrows */}
            <div className="flex items-center gap-1">
              <span className="pr-1 tabular-nums whitespace-nowrap">
                {t("PAGE", "Page")} {page} {t("OF", "of")} {totalPages} ({meta.total_count} {t("TOTAL", "total")})
              </span>
              <button
                type="button"
                className="pg-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label={t("PREVIOUS_PAGE", "Previous page")}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="pg-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label={t("NEXT_PAGE", "Next page")}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Import modal */}
      {/* -------------------------------------------------------------------- */}
      {importOpen && (
        <>
          <div
            className="fixed inset-0 z-[220] bg-black/50"
            onClick={closeImport}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("IMPORT_TRANSLATIONS", "Import Translations")}
            className="fixed inset-0 z-[230] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-xl flex flex-col">
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-muted rounded-t-lg">
                <h4 className="text-sm font-semibold text-text flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" aria-hidden />
                  {t("IMPORT_TRANSLATIONS", "Import Translations")}
                </h4>
                <button
                  type="button"
                  onClick={closeImport}
                  className="btn-comp-icon--ghost"
                  aria-label={t("CLOSE", "Close")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drop zone */}
              <div className="px-5 py-5 flex flex-col gap-4">
                <div
                  className={`flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed py-10 transition-colors cursor-pointer ${dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-surface-muted"}`}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                  aria-label={t("DRAG_DROP_OR_CLICK", "Drag and drop or click to select file")}
                >
                  <Upload className="w-8 h-8 text-text-muted" aria-hidden />
                  <span className="text-sm text-text-muted text-center">
                    {importFile
                      ? importFile.name
                      : t("DRAG_DROP_XLSX", "Drag & drop an .xlsx file, or click to browse")}
                  </span>
                  {importFile && (
                    <span className="text-xs text-text-muted">
                      {(importFile.size / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={handleFileInputChange}
                  aria-hidden
                />

                {importError && (
                  <p className="text-xs text-error">{importError}</p>
                )}
                {importSuccess && (
                  <p className="text-xs text-success">{importSuccess}</p>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-surface-muted rounded-b-lg">
                <button
                  type="button"
                  className="btn-comp-secondary text-sm"
                  onClick={closeImport}
                >
                  {t("CANCEL", "Cancel")}
                </button>
                <button
                  type="button"
                  className="btn-comp-primary text-sm"
                  onClick={() => void handleImportSubmit()}
                  disabled={!importFile || importing}
                >
                  {importing ? t("IMPORTING", "Importing…") : t("IMPORT", "Import")}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );

  return createPortal(panelUi, document.body);
}
