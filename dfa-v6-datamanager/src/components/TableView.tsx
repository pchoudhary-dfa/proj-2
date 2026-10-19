"use client";

import { getRequest } from "@/lib/api/http";
import { useCore } from "@/contexts/CoreContext";
import { SearchableListCombobox } from "@/components/SearchableListCombobox";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { Loader } from "@/components/Loader";
import { SecondaryButton } from "@/components/SecondaryButton";
import {
  TableSelectionNotice,
  type TableSelectionNoticeProps,
} from "@/components/TableSelectionNotice";
import { gridTextFieldClassName } from "@/components/TextField";
import {
  renderEditableGridFilter,
  type EditableGridFilterDef,
} from "@/components/editableGridFilter";
import { renderEditableGridBodyCell, buildGridEditFieldSuggestionsMap } from "@/components/editableGridEditField";
import { collectGridSuggestions } from "@/lib/gridSuggestions";
import { ENABLE_GRID_AUTOSUGGESTIONS } from "@/lib/constants";
import type { EditableGridEditFieldDef } from "@/components/editableGridEditField";
import { GridInlineTextField } from "@/components/gridEditableTextCell";
import {
  DUAL_ACTION_COLUMN_WIDTH,
  ICON_ACTION_COLUMN_WIDTH,
  ADD_ROW_ACTIONS_TD_ICON,
} from "@/components/editableGridColumnClasses";
import {
  gridColElementClassName,
  resolveGridColElementStyle,
  resolveGridColumnTdClasses,
  resolveGridColumnThClasses,
  resolveGridColumnCellStyle,
  resolveGridColumnStickyInsetStyle,
  type GridColumnLayout,
} from "@/components/gridColumnLayout";
import {
  BTN_GRID_ICON_CLOSE,
  BTN_GRID_ICON_TICK,
  GRID_ACTION_ICON,
  GridInlineSaveCancelActions,
} from "@/components/GridInlineSaveCancelActions";
import {
  GridSortButton,
  gridSortIcon,
  type GridSortDirection,
  type GridSortIcon,
} from "@/components/GridSortButton";
import {
  renderTablePaginationFooter,
  type TablePaginationFooterConfig,
} from "@/components/tablePaginationFooterConfig";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type HTMLAttributes,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
  type UIEvent,
} from "react";

/** `<tr>` class for short-lived “just created” row styling (see `globals.css`). */
export const TV_ROW_NEWLY_ADDED_CLASS = "tv-row-newly-added";

/**
 * Hook for managing column visibility in editable grids.
 * Returns filtered columns and toggle functions for show/hide drawer integration.
 */
export function useColumnVisibility<TRow>(columns: EditableGridColumnDef<TRow>[]) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenIds.has(c.id)),
    [columns, hiddenIds]
  );

  const toggle = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return { hiddenIds, visibleColumns, toggle };
}

/** Width in px for the sticky "Columns" trigger column — intentionally very thin. */
export const COLUMN_VISIBILITY_TRIGGER_WIDTH = 32;

/**
 * Builds the thin sticky-right "Columns" trigger column to append to any grid.
 * The header contains a vertical clickable label; body cells are intentionally empty.
 * Use together with {@link useColumnVisibility} and {@link ColumnVisibilityPanel}.
 */
export function buildColumnVisibilityTriggerCol<TRow>(
  label: string,
  ariaLabel: string,
  onOpen: () => void
): EditableGridColumnDef<TRow> {
  return {
    id: "__col_visibility",
    layout: {
      width: COLUMN_VISIBILITY_TRIGGER_WIDTH,
      minWidth: COLUMN_VISIBILITY_TRIGGER_WIDTH,
      maxWidth: COLUMN_VISIBILITY_TRIGGER_WIDTH,
      sticky: "right",
    },
    headerThClassName: "!p-0 overflow-hidden",
    header: null,
    headerAfter: (
      <button
        type="button"
        className="btn-comp-ghost absolute inset-0 z-10 flex items-center justify-center p-0"
        onClick={onOpen}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <span
          className="select-none font-semibold text-text text-xs"
          style={{
            writingMode: "vertical-lr",
            textOrientation: "mixed",
            lineHeight: 0.82,
          }}
        >
          {label}
        </span>
      </button>
    ),
    filter: null,
    cell: () => null,
  };
}

export type ColumnVisibilityItem = { id: string; label: string };

/**
 * In-table slide-in panel for show/hide column toggles.
 * Renders `absolute` inside the nearest `relative` ancestor — the `.tv-grid-wrap` already is one.
 * Pair with {@link buildColumnVisibilityTriggerCol} and {@link useColumnVisibility}.
 *
 * To enable on any table:
 * 1. Call `useColumnVisibility(allColumns)` to get `{ hiddenIds, visibleColumns, toggle }`.
 * 2. Append `buildColumnVisibilityTriggerCol(label, ariaLabel, openFn)` to the column array.
 * 3. Render `<ColumnVisibilityPanel ... />` as a sibling inside the same `relative` container.
 */
export function ColumnVisibilityPanel({
  open,
  onClose,
  title,
  closeAriaLabel,
  groupAriaLabel,
  items,
  hiddenIds,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeAriaLabel: string;
  groupAriaLabel: string;
  items: ColumnVisibilityItem[];
  hiddenIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className={`absolute right-0 top-0 bottom-0 z-[60] flex flex-col border-l border-border bg-surface shadow-[-4px_0_12px_rgb(0_0_0/0.08)] transition-transform duration-300 ease-out w-[280px] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!open}
    >
      <div className="sp-header">
        <div className="sp-header-info">
          <h2 className="sp-title">{title}</h2>
        </div>
        <button
          type="button"
          className="btn-comp-icon-md shrink-0"
          onClick={onClose}
          aria-label={closeAriaLabel}
        >
          <span className="material-icons !text-sm" aria-hidden="true">close</span>
        </button>
      </div>
      <div className="sp-body">
        <div role="group" aria-label={groupAriaLabel}>
          {items.map((item) => (
            <div key={item.id} className="sys-config__type-row !py-1.5">
              <label className="gap-2">
                <input
                  type="checkbox"
                  className="checkbox-comp"
                  checked={!hiddenIds.has(item.id)}
                  onChange={() => onToggle(item.id)}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const GRID_BODY_ROW_SELECTOR = "tbody tr[data-tv-body-row='true']";
const GRID_NAV_ROW_SELECTOR = "tbody tr[data-tv-nav-row='true']";
const KEYBOARD_INPUT_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
].join(", ");

const GRID_ROW_ENTER_NAV_SELECTOR = [
  "input:not([type='hidden']):not([disabled]):not([type='checkbox']):not([type='radio'])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
  "[data-tv-enter-field='true']:not([disabled])",
].join(", ");

function isKeyboardInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(KEYBOARD_INPUT_SELECTOR) != null;
}

export function isTextLikeInput(el: HTMLElement): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  return (
    el.type === "text" ||
    el.type === "search" ||
    el.type === "url" ||
    el.type === "tel" ||
    el.type === "password"
  );
}

function setNativeInputValue(el: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  );
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function shouldPreserveLocalArrowHandling(
  target: EventTarget | null,
  key: string
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (key !== "ArrowUp" && key !== "ArrowDown") return false;
  if (target.closest(".drop-panel") != null) return true;
  /** List panel is a sibling of the input; focus stays on the input while the list is open. */
  if (target.closest("[data-ac-list-open='true']") != null) return true;
  return false;
}

function isPlainPrintableKey(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return (
    event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey
  );
}

export function focusEditableElement(
  el: HTMLElement,
  opts?: {
    selectText?: boolean;
    cursorAtEnd?: boolean;
    replaceText?: string;
  }
): void {
  const { selectText = true, cursorAtEnd = false, replaceText } = opts ?? {};
  el.focus();
  if (isTextLikeInput(el)) {
    if (typeof replaceText === "string") {
      setNativeInputValue(el, replaceText);
      const nextPos = replaceText.length;
      el.setSelectionRange(nextPos, nextPos);
      return;
    }
    if (cursorAtEnd) {
      const nextPos = el.value.length;
      el.setSelectionRange(nextPos, nextPos);
      return;
    }
    if (selectText) {
      el.select();
    }
  }
}

export function applyOverrideMode(el: HTMLElement): void {
  el.setAttribute("data-tv-override", "true");
  const remove = () => {
    el.removeAttribute("data-tv-override");
    el.removeEventListener("input", remove);
  };
  el.addEventListener("input", remove);
}

function isVisibleElement(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

export function getRowEnterNavigationTargets(row: HTMLTableRowElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>(GRID_ROW_ENTER_NAV_SELECTOR)).filter(
    isVisibleElement
  );
}

export function findActiveRowEnterTarget(
  row: HTMLTableRowElement,
  target: EventTarget | null
): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const active = target.closest<HTMLElement>(GRID_ROW_ENTER_NAV_SELECTOR);
  if (!active || !row.contains(active)) return null;
  return active;
}

export function moveFocusBetweenGridRows(
  currentRow: HTMLTableRowElement,
  direction: 1 | -1,
  targetIndex = 0
): boolean {
  const body = currentRow.closest("tbody");
  if (!body) return false;

  const rows = Array.from(
    body.querySelectorAll<HTMLTableRowElement>(GRID_NAV_ROW_SELECTOR)
  );
  const currentIndex = rows.indexOf(currentRow);
  if (currentIndex < 0) return false;

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= rows.length) return false;

  const nextRow = rows[nextIndex];
  const targets = getRowEnterNavigationTargets(nextRow);
  if (targets.length > 0) {
    const clamped = Math.max(0, Math.min(targets.length - 1, targetIndex));
    focusEditableElement(targets[clamped]);
    if (isTextLikeInput(targets[clamped] as HTMLInputElement)) {
      applyOverrideMode(targets[clamped]);
    }
    nextRow.scrollIntoView({ block: "nearest" });
    return true;
  }
  nextRow.focus();
  nextRow.scrollIntoView({ block: "nearest" });
  return true;
}

export function moveFocusWithinRow(
  row: HTMLTableRowElement,
  target: EventTarget | null,
  direction: 1 | -1
): boolean {
  const targets = getRowEnterNavigationTargets(row);
  if (targets.length === 0) return false;
  const active = findActiveRowEnterTarget(row, target);
  if (!active) {
    const el = direction === 1 ? targets[0] : targets[targets.length - 1];
    focusEditableElement(el);
    if (isTextLikeInput(el as HTMLInputElement)) applyOverrideMode(el);
    return true;
  }
  const currentIndex = targets.indexOf(active);
  if (currentIndex < 0) return false;
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= targets.length) return false;
  const el = targets[nextIndex];
  focusEditableElement(el);
  if (isTextLikeInput(el as HTMLInputElement)) applyOverrideMode(el);
  return true;
}

// ---------------------------------------------------------------------------
// useServerListQuery
// ---------------------------------------------------------------------------

export type ServerListParseResult<TRow, TMeta> =
  | {
      ok: true;
      rows: TRow[];
      totalCount: number;
      totalPages: number;
      meta: TMeta;
      /** Full list size before search/column filters (from API `meta.total_count_unfiltered`). */
      totalCountUnfiltered?: number;
    }
  | { ok: false; message: string };

/**
 * Build a full request URL from a list base path (no query) and flat params.
 * Omits null, undefined, and empty string; boolean `true` becomes "true" (common for API flags).
 */
export function buildListRequestUrl(
  listUrl: string,
  query: Record<string, string | number | boolean | undefined | null>
): string {
  const base = listUrl.replace(/\/+$/, "");
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    if (v === false) continue;
    if (v === true) {
      sp.set(k, "true");
      continue;
    }
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export type UseServerListQueryOptions<TRow, TMeta> = {
  /** Base list URL with no query string (e.g. `getDWAPIURL(dwId, REFERENCE_PATH_INDICATORS)`). */
  listUrl: string;
  /** Query params merged into the request (page, filters, sort, …). */
  query: Record<string, string | number | boolean | undefined | null>;
  parseListResponse: (json: unknown) => ServerListParseResult<TRow, TMeta>;
  enabled?: boolean;
};

export type UseServerListQueryResult<TRow, TMeta> = {
  rows: TRow[];
  meta: TMeta | null;
  totalCount: number;
  /** Unfiltered total when the API applies search/filters (`meta.total_count_unfiltered`). */
  totalCountUnfiltered?: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

function getStableQueryKey(
  query: Record<string, string | number | boolean | undefined | null>
): string {
  const entries = Object.entries(query)
    .filter(([, v]) => v != null && v !== "" && v !== false)
    .map(([k, v]) => [k, v === true ? "true" : String(v)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

/** One in-flight GET per list URL (Strict Mode remounts + overlapping callers). */
const serverListRequestPromises = new Map<string, Promise<unknown>>();

function fetchServerListJson(requestUrl: string): Promise<unknown> {
  const existing = serverListRequestPromises.get(requestUrl);
  if (existing) return existing;

  const promise = getRequest(requestUrl, undefined, {
    suppressErrorMessage: true,
  }).finally(() => {
    if (serverListRequestPromises.get(requestUrl) === promise) {
      serverListRequestPromises.delete(requestUrl);
    }
  });
  serverListRequestPromises.set(requestUrl, promise);
  return promise;
}

/**
 * Server-side list model similar to AG Grid SSRM: one base URL + query object,
 * parse JSON into rows + pagination + optional meta. Uses `getRequest` (auth/signature via client).
 */
export function useServerListQuery<TRow, TMeta = unknown>(
  opts: UseServerListQueryOptions<TRow, TMeta>
): UseServerListQueryResult<TRow, TMeta> {
  const { listUrl, query, parseListResponse, enabled = true } = opts;

  const [rows, setRows] = useState<TRow[]>([]);
  const [meta, setMeta] = useState<TMeta | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalCountUnfiltered, setTotalCountUnfiltered] = useState<
    number | undefined
  >(undefined);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const parseRef = useRef(parseListResponse);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    parseRef.current = parseListResponse;
  }, [parseListResponse]);

  const queryKey = useMemo(() => getStableQueryKey(query), [query]);
  const requestUrl = useMemo(() => {
    if (!listUrl) return "";
    return buildListRequestUrl(listUrl, query);
  }, [listUrl, queryKey]);

  const resetData = useCallback(() => {
    setRows([]);
    setMeta(null);
    setTotalCount(0);
    setTotalCountUnfiltered(undefined);
    setTotalPages(0);
  }, []);

  const fetchList = useCallback(async () => {
    if (!enabled || !requestUrl) {
      setLoading(false);
      return;
    }
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    let json: unknown;
    try {
      json = await fetchServerListJson(requestUrl);
    } catch (err) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(err instanceof Error ? err.message : "Network error");
      resetData();
      setLoading(false);
      return;
    }
    if (requestSeq !== requestSeqRef.current) return;

    const parsed = parseRef.current(json);
    if (parsed.ok) {
      setRows(parsed.rows);
      setMeta(parsed.meta);
      setTotalCount(parsed.totalCount);
      setTotalCountUnfiltered(parsed.totalCountUnfiltered);
      setTotalPages(parsed.totalPages);
      setError(null);
    } else {
      setError(parsed.message);
      resetData();
    }
    setLoading(false);
  }, [enabled, requestUrl, resetData]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void fetchList();
    return () => {
      requestSeqRef.current += 1;
    };
  }, [enabled, fetchList]);

  return {
    rows,
    meta,
    totalCount,
    totalCountUnfiltered,
    totalPages,
    loading,
    error,
    refetch: fetchList,
  };
}

// ---------------------------------------------------------------------------
// InlineEditableTable
// ---------------------------------------------------------------------------

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

export type { TableSelectionNoticeProps };

export type InlineEditableTableProps = {
  /** Bulk row selection banner (count + clear); omitted when count is 0. */
  selection?: TableSelectionNoticeProps | null;
  /** Scroll container ref (e.g. for positioning overlays). */
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** When set, shows a banner above the table and hides the scroll area until retried/cleared. */
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  wrapClassName?: string;
  scrollClassName?: string;
  tableClassName?: string;
  /** Optional inline styles on the `<table>` (e.g. minWidth for wide dynamic column sets). */
  tableStyle?: CSSProperties;
  /** Accessibility name for the `<table>` (e.g. workflow assignment grids). */
  tableAriaLabel?: string;
  /** When set, renders `<colgroup>` so fixed layouts do not stretch action columns. */
  gridColumns?: EditableGridColumnDef<unknown>[];
  thead: ReactNode;
  tbody: ReactNode;
  /** Renders inside the outer wrap after the scroll region (e.g. pagination bar). */
  footer?: ReactNode;
  /** Declarative pagination; rendered when `footer` is omitted. */
  pagination?: TablePaginationFooterConfig;
  /** Absolutely-positioned overlay rendered inside the `relative` wrap (e.g. column-visibility panel). */
  overlay?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  disableGlobalArrowNavigation?: boolean;
};

/**
 * Shared shell for tables that support inline row editing: outer wrap, optional load error
 * banner, horizontal scroll region, and native table with thead/tbody slots.
 */
export function InlineEditableTable({
  selection,
  scrollRef,
  error,
  onRetry,
  retryLabel = "Retry",
  wrapClassName = "tbl-wrap",
  scrollClassName = "tbl-scroll",
  tableClassName,
  tableStyle,
  tableAriaLabel,
  gridColumns,
  thead,
  tbody,
  footer,
  overlay,
  pagination,
  loading = false,
  loadingLabel,
  disableGlobalArrowNavigation = false,
}: InlineEditableTableProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedNavRowIdRef = useRef<string | null>(null);
  const resolvedFooter =
    footer ?? (pagination ? renderTablePaginationFooter(pagination) : null);

  const focusRowFromSelection = useCallback((direction: 1 | -1): boolean => {
    const navRows = Array.from(
      wrapRef.current?.querySelectorAll<HTMLTableRowElement>(GRID_NAV_ROW_SELECTOR) ?? []
    );
    if (navRows.length === 0) return false;

    const active = document.activeElement;
    const activeRow =
      active instanceof HTMLElement
        ? active.closest<HTMLTableRowElement>(GRID_NAV_ROW_SELECTOR)
        : null;
    const focusedIndex = activeRow ? navRows.indexOf(activeRow) : -1;

    const anchorIndexFromLastFocus =
      focusedIndex >= 0
        ? focusedIndex
        : (() => {
            const lastFocusedId = lastFocusedNavRowIdRef.current;
            if (!lastFocusedId) return -1;
            if (lastFocusedId === "__add_row__") {
              return navRows.findIndex(
                (row) => row.getAttribute("data-tv-add-row") === "true"
              );
            }
            return navRows.findIndex(
              (row) => row.getAttribute("data-tv-row-id") === lastFocusedId
            );
          })();

    const targetIndex =
      anchorIndexFromLastFocus >= 0
        ? Math.max(0, Math.min(navRows.length - 1, anchorIndexFromLastFocus + direction))
        : (() => {
            if (direction === 1) return 0;
            const lastDataRow = (() => {
              for (let i = navRows.length - 1; i >= 0; i -= 1) {
                if (navRows[i].getAttribute("data-tv-row-id") != null) return i;
              }
              return -1;
            })();
            return lastDataRow >= 0 ? lastDataRow : navRows.length - 1;
          })();

    const targetRow = navRows[targetIndex];
    const targets = getRowEnterNavigationTargets(targetRow);
    if (targets.length > 0) {
      focusEditableElement(targets[0]);
      if (isTextLikeInput(targets[0] as HTMLInputElement)) {
        applyOverrideMode(targets[0]);
      }
      targetRow.scrollIntoView({ block: "nearest" });
      return true;
    }
    targetRow.focus();
    targetRow.scrollIntoView({ block: "nearest" });
    return true;
  }, []);

  useEffect(() => {
    if (disableGlobalArrowNavigation) return;
    const onDocumentArrow = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.key !== "ArrowDown" && event.key !== "ArrowUp")
      ) {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!wrapRef.current) return;

      const target = event.target;
      if (isKeyboardInputTarget(target)) return;

      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active.closest("tr[data-tv-nav-row='true']")
      ) {
        return;
      }

      const direction: 1 | -1 = event.key === "ArrowDown" ? 1 : -1;
      if (focusRowFromSelection(direction)) {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", onDocumentArrow);
    return () => {
      document.removeEventListener("keydown", onDocumentArrow);
    };
  }, [disableGlobalArrowNavigation, focusRowFromSelection]);

  useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current.contains(target)) return;
      lastFocusedNavRowIdRef.current = null;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        wrapRef.current.contains(active) &&
        active.closest(GRID_NAV_ROW_SELECTOR)
      ) {
        active.blur();
      }
    };
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    };
  }, []);

  const mergedWrapClassName = `${wrapClassName} tv-grid-wrap relative`;
  const mergedTableClassName = [tableClassName, "tv-grid-table"]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={wrapRef}
      className={mergedWrapClassName}
      onFocusCapture={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const row = target.closest<HTMLTableRowElement>(GRID_NAV_ROW_SELECTOR);
        if (!row || !wrapRef.current?.contains(row)) return;
        const rowId = row.getAttribute("data-tv-row-id");
        if (rowId) {
          lastFocusedNavRowIdRef.current = rowId;
          return;
        }
        if (row.getAttribute("data-tv-add-row") === "true") {
          lastFocusedNavRowIdRef.current = "__add_row__";
        }
      }}
      onKeyDownCapture={(event) => {
        if (disableGlobalArrowNavigation) return;
        if (
          event.defaultPrevented ||
          (event.key !== "ArrowDown" && event.key !== "ArrowUp")
        ) {
          return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

        const target = event.target;
        if (isKeyboardInputTarget(target)) return;
        if (
          target instanceof HTMLElement &&
          target.closest("tr[data-tv-nav-row='true']")
        ) {
          return;
        }

        const direction: 1 | -1 = event.key === "ArrowDown" ? 1 : -1;
        if (focusRowFromSelection(direction)) {
          event.preventDefault();
        }
      }}
    >
      {selection && selection.count > 0 ? (
        <TableSelectionNotice {...selection} />
      ) : null}
      {error ? (
        <div
          style={{
            padding: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--red-bg)",
            color: "var(--red)",
            margin: "1rem",
            borderRadius: "8px",
          }}
        >
          <span>{error}</span>
          {onRetry ? (
            <SecondaryButton type="button" onClick={onRetry}>
              {retryLabel}
            </SecondaryButton>
          ) : null}
        </div>
      ) : null}
      {!error ? (
        <div className={scrollClassName} ref={scrollRef}>
          <table
            className={mergedTableClassName}
            style={tableStyle}
            aria-label={tableAriaLabel}
          >
            {gridColumns ? (
              <EditableDataGridColgroup columns={gridColumns} />
            ) : null}
            {thead}
            {tbody}
          </table>
        </div>
      ) : null}
      {resolvedFooter}
      {!error && loading ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[color:color-mix(in_srgb,var(--color-surface)_76%,transparent)] backdrop-blur-[1px]">
          <Loader loadingLabel={loadingLabel} />
        </div>
      ) : null}
      {overlay ?? null}
    </div>
  );
}

export type InlineEditTableLoadingRowProps = {
  colSpan: number;
  children?: ReactNode;
  className?: string;
};

export function InlineEditTableLoadingRow({
  colSpan,
  children = "Loading…",
  className = "cell-empty",
}: InlineEditTableLoadingRowProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={className}
        style={{ textAlign: "center", padding: "2rem" }}
      >
        {children}
      </td>
    </tr>
  );
}

export type InlineEditTableEmptyRowProps = {
  colSpan: number;
  children?: ReactNode;
  className?: string;
};

export function InlineEditTableEmptyRow({
  colSpan,
  children = "No records found.",
  className = "cell-empty",
}: InlineEditTableEmptyRowProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={className}
        style={{ textAlign: "center", padding: "2rem" }}
      >
        {children}
      </td>
    </tr>
  );
}

export type InlineEditRowActionsProps = {
  isEditing: boolean;
  saveLoading: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveTitle?: string;
  saveAriaLabel?: string;
  cancelTitle?: string;
  cancelAriaLabel?: string;
  /** Shown when `isEditing` is false (e.g. Configure button). */
  viewContent: ReactNode;
};

/**
 * Last-column pattern for inline edit: save/cancel while editing,
 * and arbitrary view content when not editing. Errors are shown via toast at the call site.
 */
export function InlineEditRowActions({
  isEditing,
  saveLoading,
  onSave,
  onCancel,
  saveTitle,
  saveAriaLabel = "Save row changes",
  cancelTitle = "Cancel editing",
  cancelAriaLabel = "Cancel row edit",
  viewContent,
}: InlineEditRowActionsProps) {
  const { t } = useCore();
  const resolvedSaveTitle = saveTitle ?? t("SAVE", "Save");
  if (isEditing) {
    return (
      <GridInlineSaveCancelActions
        onSave={onSave}
        onCancel={onCancel}
        saveLoading={saveLoading}
        saveTitle={resolvedSaveTitle}
        saveAriaLabel={saveAriaLabel}
        cancelTitle={cancelTitle}
        cancelAriaLabel={cancelAriaLabel}
      />
    );
  }
  return <>{viewContent}</>;
}

// ---------------------------------------------------------------------------
// EditableDataGrid
// ---------------------------------------------------------------------------

/** Row-level cell mode: whole row can be in `edit` (AG Grid–style row editing). */
export type EditableGridCellMode = "view" | "edit";

export type EditableGridCellContext<TRow> = {
  row: TRow;
  rowIndex: number;
  mode: EditableGridCellMode;
  /** Ghost autocomplete vocabulary when `editField.suggestFromRow` is set on the column. */
  gridSuggestions?: string[];
};

/**
 * Column definition: headers + optional filter row cell + body cell renderer.
 * Similar to AG Grid `columnDefs`: declarative columns, imperative data via `rows` on the body.
 */

const EDITABLE_GRID_DEFAULT_HEADER_LABEL_CLASS =
  "flex min-w-0 items-center gap-1.5 font-semibold text-xs text-text";

const EDITABLE_GRID_HEADER_LABEL_TEXT_CLASS =
  "min-w-0 shrink font-semibold text-xs text-text";

export type { GridSortDirection, GridSortIcon };
export { gridSortIcon, gridSortIconForColumn } from "@/components/GridSortButton";

export type EditableGridHeaderLabelDef = {
  kind: "label";
  text: ReactNode;
};

export type EditableGridHeaderSortDef = {
  kind: "sort";
  text: ReactNode;
  onSort: () => void;
  sortAriaLabel: string;
  /** Column is the active sort target (preferred over `sortIcon`). */
  sortActive?: boolean;
  /** Direction when `sortActive`; ignored when inactive. */
  sortDirection?: GridSortDirection;
  /** Hide control but keep label + sort column layout aligned. */
  sortHidden?: boolean;
  /**
   * @deprecated Prefer `sortActive` + `sortDirection`; icon is derived automatically.
   */
  sortIcon?: GridSortIcon;
  /**
   * @deprecated Styling is fixed on {@link GridSortButton}.
   */
  sortButtonClassName?: string;
};

export type EditableGridHeaderSortWrapLabelDef = {
  kind: "sortWrapLabel";
  text: ReactNode;
};

export type EditableGridHeaderSelectAllDef = {
  kind: "selectAll";
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  disabled?: boolean;
  title?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export type EditableGridHeaderSrOnlyDef = {
  kind: "srOnly";
  text: string;
};

export type EditableGridHeaderCenteredDef = {
  kind: "centered";
  text: ReactNode;
};

/** Centered header for {@link DUAL_ACTION_COLUMN_WIDTH} dual-action columns (icon + labeled buttons). */
export function dualActionColumnHeader(
  text: string
): EditableGridHeaderCenteredDef {
  return { kind: "centered", text };
}

/** Centered header for {@link ICON_ACTION_COLUMN_WIDTH} icon-only action columns. */
export function iconPairActionColumnHeader(
  text: string
): EditableGridHeaderCenteredDef {
  return { kind: "centered", text };
}

function isDualActionGridColumn<TRow>(
  col: EditableGridColumnDef<TRow>
): boolean {
  const layout = col.layout;
  return (
    layout?.sticky === "right" && layout.width === DUAL_ACTION_COLUMN_WIDTH
  );
}

function isIconPairActionGridColumn<TRow>(
  col: EditableGridColumnDef<TRow>
): boolean {
  const layout = col.layout;
  return (
    layout?.sticky === "right" && layout.width === ICON_ACTION_COLUMN_WIDTH
  );
}

export type EditableGridHeaderEmptyDef = {
  kind: "empty";
};

export type EditableGridHeaderColumnToolbarHighlightDef = {
  onClear: () => void;
  clearAriaLabel: string;
  closeTitle?: string;
};

export type EditableGridHeaderColumnToolbarDef = {
  kind: "columnToolbar";
  leadingIcon?: string;
  label: string;
  onLabelClick: () => void;
  labelTitle?: string;
  highlight?: EditableGridHeaderColumnToolbarHighlightDef;
};

export type EditableGridHeaderObjectDef =
  | EditableGridHeaderLabelDef
  | EditableGridHeaderSortDef
  | EditableGridHeaderSortWrapLabelDef
  | EditableGridHeaderSelectAllDef
  | EditableGridHeaderSrOnlyDef
  | EditableGridHeaderCenteredDef
  | EditableGridHeaderEmptyDef
  | EditableGridHeaderColumnToolbarDef;

/** Declarative header config; plain strings are shorthand for `{ kind: "label", text }`. */
export type EditableGridHeaderDef = string | null | EditableGridHeaderObjectDef;

function normalizeEditableGridHeader(
  header: EditableGridHeaderDef
): EditableGridHeaderObjectDef {
  if (header == null) return { kind: "empty" };
  if (typeof header === "string") return { kind: "label", text: header };
  return header;
}

/** Renders label/sort/checkbox header markup from {@link EditableGridHeaderDef}. */
export function renderEditableGridHeader(header: EditableGridHeaderDef): ReactNode {
  const def = normalizeEditableGridHeader(header);

  switch (def.kind) {
    case "empty":
      return null;
    case "label":
      return (
        <span className={EDITABLE_GRID_DEFAULT_HEADER_LABEL_CLASS}>
          {def.text}
        </span>
      );
    case "sort": {
      const sortActive = def.sortActive ?? false;
      const sortDirection = sortActive ? (def.sortDirection ?? null) : null;
      const sortIconResolved =
        def.sortIcon ?? gridSortIcon(sortActive, sortDirection);
      return (
        <div className="th-sort-wrap">
          <span className={EDITABLE_GRID_HEADER_LABEL_TEXT_CLASS}>{def.text}</span>
          <GridSortButton
            ariaLabel={def.sortAriaLabel}
            onClick={def.onSort}
            hidden={def.sortHidden}
            active={sortActive}
            direction={sortDirection}
            icon={sortIconResolved}
            className={def.sortButtonClassName}
          />
        </div>
      );
    }
    case "sortWrapLabel":
      return (
        <div className="th-sort-wrap">
          <span className={EDITABLE_GRID_HEADER_LABEL_TEXT_CLASS}>{def.text}</span>
        </div>
      );
    case "selectAll":
      return (
        <input
          ref={def.inputRef}
          type="checkbox"
          className="checkbox-comp"
          checked={def.checked}
          onChange={def.onChange}
          disabled={def.disabled}
          title={def.title}
          aria-label={def.ariaLabel}
        />
      );
    case "srOnly":
      return <span className="sr-only">{def.text}</span>;
    case "centered":
      return (
        <span className="block w-full text-center text-xs font-semibold text-text">
          {def.text}
        </span>
      );
    case "columnToolbar":
      return (
        <div className="flex min-w-0 items-center gap-1">
          {def.leadingIcon ? (
            <Mi
              name={def.leadingIcon}
              className="pointer-events-none shrink-0 !text-sm text-text-muted"
              aria-hidden
            />
          ) : null}
          {def.highlight ? (
            <div className="col-highlight-header min-w-0 flex-1">
              <button
                type="button"
                className="min-w-0 truncate bg-transparent border-0 p-0 text-left text-xs font-semibold text-text hover:text-primary transition-colors cursor-pointer"
                onClick={def.onLabelClick}
                title={def.labelTitle ?? def.label}
              >
                {def.label}
              </button>
              <button
                type="button"
                className="btn-comp-ghost--xs"
                onClick={def.highlight.onClear}
                aria-label={def.highlight.clearAriaLabel}
                title={def.highlight.closeTitle}
              >
                <Mi name="close" className="!text-sm" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 truncate bg-transparent border-0 p-0 text-left text-xs font-semibold text-text hover:text-primary transition-colors cursor-pointer"
              onClick={def.onLabelClick}
              title={def.labelTitle ?? def.label}
            >
              {def.label}
            </button>
          )}
        </div>
      );
    default:
      return null;
  }
}

export type {
  EditableGridFilterDef,
  EditableGridFilterSearchDef,
  EditableGridFilterSelectDef,
} from "@/components/editableGridFilter";
export { renderEditableGridFilter } from "@/components/editableGridFilter";

export type {
  EditableGridEditFieldDef,
  EditableGridEditTextFieldDef,
} from "@/components/editableGridEditField";
export {
  renderEditableGridBodyCell,
  renderEditableGridEditField,
  buildGridEditFieldSuggestionsMap,
} from "@/components/editableGridEditField";

export type { GridColumnLayout } from "@/components/gridColumnLayout";

export type EditableGridColumnDef<TRow> = {
  id: string;
  /** Declarative header config (string shorthand = plain label). */
  header: EditableGridHeaderDef;
  /**
   * Column width / sticky — TableView applies classes and inline styles.
   * Prefer numeric tiers: `{ width: 1 }` checkbox, `{ width: 5, sticky: true, main: true }` primary column that grows.
   * Use `sticky: "left"` when there is no checkbox column (e.g. translations code column).
   * Legacy preset strings (`"select"`, `"units"`, …) still work.
   */
  layout?: GridColumnLayout;
  /** Inline style on the label-row `<th>` (e.g. dataset column resize width). */
  headerThStyle?: CSSProperties;
  /** Rendered inside the label-row `<th>` after the header (e.g. resize handle). */
  headerAfter?: ReactNode;
  /**
   * Declarative filter row (`search`, `select`). TableView renders via
   * {@link renderEditableGridFilter}. Prefer over hand-rolled `filterCell` markup.
   */
  filter?: EditableGridFilterDef | null;
  /** Custom filter row when declarative `filter` is not enough. */
  filterCell?: ReactNode | null;
  className?: string;
  /** Truncate long header labels inside the column (applied in `resolveGridColumnThClasses`). */
  headerTextClamp?: boolean;
  /** Clip body cell content under fixed widths (applied in `resolveGridColumnTdClasses`). */
  cellOverflowHidden?: boolean;
  headerThClassName?: string;
  /** Merged onto the label-row `<th>` after `headerThClassName` (e.g. drag-and-drop). */
  headerThExtraProps?: Omit<ThHTMLAttributes<HTMLTableCellElement>, "children">;
  /** `<th>` in the filter row; defaults to `th-search-cell` when the filter row is shown. */
  filterThClassName?: string;
  /** Merged onto the filter-row `<th>` after `filterThClassName`. */
  filterThExtraProps?: Omit<ThHTMLAttributes<HTMLTableCellElement>, "children">;
  /** Read-only body cell (pair with `editField` for inline text columns). */
  viewCell?: (ctx: EditableGridCellContext<TRow>) => ReactNode;
  /**
   * Declarative inline editor (`text` → {@link GridAutoSuggestInput} when env enabled).
   * Shown when `ctx.mode === "edit"` unless `editField.when` overrides.
   */
  editField?: EditableGridEditFieldDef<TRow>;
  /** Full body renderer when `viewCell` / `editField` are not enough. */
  cell?: (ctx: EditableGridCellContext<TRow>) => ReactNode;
  /** Merged onto body `<td>` after width/column `className`. */
  tdExtraProps?: Omit<TdHTMLAttributes<HTMLTableCellElement>, "children">;
  /** Double-click on the `<td>` (e.g. start inline edit for a field). */
  onCellDoubleClick?: (
    ctx: EditableGridCellContext<TRow>,
    event: MouseEvent<HTMLTableCellElement>
  ) => void;
  /** Initial pixel width used when `allowResize` is enabled on the thead. */
  defaultWidth?: number;
  /**
   * Whether this column can be resized by the user.
   * When `undefined`, auto-detected: action/select/expand columns are excluded.
   * Set to `false` to explicitly prevent resizing.
   */
  resizable?: boolean;
};

export type EditableDataGridTheadProps<TRow> = {
  columns: EditableGridColumnDef<TRow>[];
  /** If false, only the first header row is rendered (no filter row). */
  showFilterRow?: boolean;
  /** Enable drag-to-resize on columns that have `defaultWidth`. Default `true`. */
  allowResize?: boolean;
};

/** Locks column widths under `table-layout: fixed` (e.g. compact action column). */
export function EditableDataGridColgroup<TRow>({
  columns,
}: {
  columns: EditableGridColumnDef<TRow>[];
}) {
  return (
    <colgroup>
      {columns.map((col) => {
        const style = resolveGridColElementStyle(col);
        const className = gridColElementClassName(col);
        if (!style && !className) {
          return <col key={col.id} />;
        }
        return (
          <col key={col.id} className={className} style={style} />
        );
      })}
    </colgroup>
  );
}

const NON_RESIZABLE_TH_PATTERNS = [
  "tv-col-actions-th-icon",
  "tv-col-actions-th-dual",
  "tv-col-select-th",
];

function isColumnResizable<TRow>(col: EditableGridColumnDef<TRow>): boolean {
  if (col.resizable === false) return false;
  if (col.resizable === true) return true;
  if (col.defaultWidth == null) return false;
  const cls = col.headerThClassName ?? "";
  return !NON_RESIZABLE_TH_PATTERNS.some((p) => cls.includes(p));
}

/**
 * Renders a single header row from column definitions, with heading and
 * optional filter/search merged in the same cell.
 */
export function EditableDataGridThead<TRow>({
  columns,
  showFilterRow = true,
  allowResize = true,
}: EditableDataGridTheadProps<TRow>) {
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const col of columns) {
      if (col.defaultWidth != null) init[col.id] = col.defaultWidth;
    }
    return init;
  });

  const resizeRef = useRef<{
    col: string;
    startX: number;
    startW: number;
    currentW: number;
    minWidth: number;
    thEl: HTMLElement | null;
    colEl: HTMLElement | null;
  } | null>(null);
  const trRef = useRef<HTMLTableRowElement>(null);

  // Sync widths for newly appearing columns (e.g. conditional columns toggled on)
  const colIds = columns.map((c) => c.id).join(",");
  useEffect(() => {
    setColWidths((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const col of columns) {
        if (col.defaultWidth != null && !(col.id in next)) {
          next[col.id] = col.defaultWidth;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colIds]);

  // Sync colWidths → <col> elements so table-layout:fixed picks up resize widths.
  // useLayoutEffect runs before paint, preventing any visible width flash.
  useLayoutEffect(() => {
    const table = trRef.current?.closest("table");
    if (!table) return;
    const colEls = Array.from(
      table.querySelectorAll<HTMLElement>(":scope > colgroup > col")
    );
    columns.forEach((col, idx) => {
      const colEl = colEls[idx];
      if (!colEl || !isColumnResizable(col)) return;
      const w = colWidths[col.id];
      if (w != null) colEl.style.width = `${w}px`;
    });
  }, [colWidths, columns]);

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, colId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = colWidths[colId] ?? 150;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      // Capture DOM elements once so onMove can update them without React re-renders.
      const thEl = target.closest<HTMLElement>("th");
      const table = thEl?.closest<HTMLElement>("table");
      const colIndex = columns.findIndex((c) => c.id === colId);
      const colEl =
        colIndex >= 0 && table
          ? (Array.from(
              table.querySelectorAll<HTMLElement>(":scope > colgroup > col")
            )[colIndex] ?? null)
          : null;
      const colDef = columns.find((c) => c.id === colId);
      const minWidth = colDef?.layout?.minWidth ?? 60;

      resizeRef.current = {
        col: colId,
        startX,
        startW,
        currentW: startW,
        minWidth,
        thEl: thEl ?? null,
        colEl,
      };

      const onMove = (ev: globalThis.PointerEvent) => {
        const r = resizeRef.current;
        if (!r) return;
        const nextW = Math.max(r.minWidth, r.startW + (ev.clientX - r.startX));
        r.currentW = nextW;
        // Direct DOM update — avoids React re-renders on every pointermove.
        if (r.thEl) {
          r.thEl.style.width = `${nextW}px`;
          r.thEl.style.maxWidth = `${nextW}px`;
        }
        if (r.colEl) r.colEl.style.width = `${nextW}px`;
      };
      const onUp = () => {
        const r = resizeRef.current;
        if (r) {
          // Commit final width to React state so it survives re-renders.
          setColWidths((prev) => ({ ...prev, [r.col]: r.currentW }));
        }
        resizeRef.current = null;
        target.releasePointerCapture(e.pointerId);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [colWidths, columns],
  );

  const renderResizeHandle = useCallback(
    (colId: string) => (
      <div
        className="absolute right-0 top-0 z-30 h-full w-1 cursor-col-resize select-none hover:bg-primary/30 active:bg-primary/50"
        onPointerDown={(e) => onResizePointerDown(e, colId)}
      />
    ),
    [onResizePointerDown],
  );

  return (
    <tr ref={trRef}>
      {columns.map((col, columnIndex) => {
        const canResize = allowResize && isColumnResizable(col);

        // Don't show a resize handle on the column immediately before a sticky-right column
        // (the handle would sit flush against the sticky Action column, misleading users).
        const nextCol = columns[columnIndex + 1] ?? null;
        const isBeforeRightSticky =
          nextCol?.layout?.sticky === "right" ||
          (nextCol?.headerThClassName ?? "").includes("tv-col-actions");
        const showResizeUi = canResize && !isBeforeRightSticky;

        const { className: hExtraClass, style: hExtraStyle, ...hExtraRest } =
          col.headerThExtraProps ?? {};
        const { className: fExtraClass, style: fExtraStyle, ...fExtraRest } =
          (showFilterRow ? col.filterThExtraProps : undefined) ?? {};
        const classParts = [
          resolveGridColumnThClasses(col, {
            showFilterRow,
            columns: columns as EditableGridColumnDef<unknown>[],
            columnIndex,
          }),
          hExtraClass,
          fExtraClass,
        ].filter(Boolean);
        const mergedClassBase = classParts.join(" ");
        const alreadyPositioned =
          mergedClassBase.includes("sticky") ||
          mergedClassBase.includes("fixed") ||
          mergedClassBase.includes("absolute");
        // const stickySide =
        //   col.layout?.sticky === true || col.layout?.sticky === "leftPrimary"
        //     ? "leftPrimary"
        //     : col.layout?.sticky === "right"
        //       ? "right"
        //       : "none";
        // Show a right border on plain resizable columns so the resize zone is visible.
        // Skip it when the next column already provides a border-l (status / action) — that
        // avoids a visible double-border at that boundary.
        // Sticky-left already has border-r from CSS; sticky-right already has border-l.
        // const nextColHasBorderL =
        //   nextCol != null &&
        //   (nextCol.layout?.sticky === "right" ||
        //     (nextCol.headerThClassName ?? "").includes("border-l"));
        // const showResizeBorder = showResizeUi && stickySide === "none" && !nextColHasBorderL;

        const mergedClass = [
          showResizeUi && !alreadyPositioned ? `${mergedClassBase} relative` : mergedClassBase,
          // showResizeBorder ? "border-r border-border" : "",
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

        const layoutStyle = resolveGridColumnCellStyle(col);
        const stickyInsetStyle = resolveGridColumnStickyInsetStyle(
          col,
          columns,
          columnIndex
        );
        const resizeWidthStyle: CSSProperties | undefined =
          canResize && colWidths[col.id] != null
            ? { width: colWidths[col.id], maxWidth: colWidths[col.id] }
            : undefined;

        const mergedStyle: CSSProperties | undefined =
          layoutStyle ||
          stickyInsetStyle ||
          col.headerThStyle ||
          hExtraStyle ||
          fExtraStyle ||
          resizeWidthStyle
            ? {
                ...layoutStyle,
                ...stickyInsetStyle,
                ...col.headerThStyle,
                ...hExtraStyle,
                ...fExtraStyle,
                ...resizeWidthStyle,
              }
            : undefined;

        const labelWrapClass =
          normalizeEditableGridHeader(col.header).kind === "centered" ||
          isDualActionGridColumn(col) ||
          isIconPairActionGridColumn(col)
            ? "th-merged-label justify-center"
            : "th-merged-label";
        return (
          <th
            key={col.id}
            className={mergedClass || undefined}
            style={mergedStyle}
            {...hExtraRest}
            {...fExtraRest}
          >
            <div className={labelWrapClass}>
              {renderEditableGridHeader(col.header)}
              {col.headerAfter}
              {showResizeUi && renderResizeHandle(col.id)}
            </div>
            {showFilterRow ? (
              <div className="th-merged-filter">
                {col.filter != null
                  ? renderEditableGridFilter(col.filter)
                  : (col.filterCell ?? null)}
              </div>
            ) : null}
          </th>
        );
      })}
    </tr>
  );
}

export type EditableDataGridBodyProps<TRow> = {
  rows: TRow[];
  columns: EditableGridColumnDef<TRow>[];
  getRowId: (row: TRow) => string;
  /** When this matches `getRowId(row)`, the row receives keyboard focus once mounted. */
  activeRowId?: string | null;
  /** When this matches `getRowId(row)`, all cells receive `mode: "edit"`. */
  editingRowId: string | null;
  /** Called when Enter is pressed on last editable field in an edit row. */
  onRowEnterAtEnd?: (ctx: EditableGridCellContext<TRow>) => void;
  /** Called when Escape is pressed while row is in edit mode. */
  onRowEscape?: (ctx: EditableGridCellContext<TRow>) => void;
  /**
   * In view mode, Delete on a focused row toggles checkbox selection (bulk delete UX).
   * Ignored while focus is in an input/button; no-op if omitted.
   */
  onDeleteKeyToggleRowSelection?: (rowId: string) => void;
  getRowClassName?: (row: TRow, rowIndex: number) => string;
  /** Extra class applied to a specific `<td>` for a given row (e.g. sticky-cell background override for deleted rows). */
  getRowTdClassName?: (row: TRow, col: EditableGridColumnDef<TRow>) => string | undefined;
  /** Extra row attributes (`onClick`, `data-*`, etc.). `className` is merged with `getRowClassName`. */
  trProps?: (
    row: TRow,
    rowIndex: number
  ) => Omit<HTMLAttributes<HTMLTableRowElement>, "children">;
  /**
   * Renders additional `<tr>` nodes immediately after a data row (e.g. expandable detail panels).
   * Must return valid table row(s) or null.
   */
  renderAfterRow?: (ctx: {
    row: TRow;
    rowIndex: number;
    rowId: string;
  }) => ReactNode;
};

/**
 * Renders data rows from the same `columns` array used for {@link EditableDataGridThead}.
 */
export function EditableDataGridBody<TRow>({
  rows,
  columns,
  getRowId,
  activeRowId = null,
  editingRowId,
  onRowEnterAtEnd,
  onRowEscape,
  onDeleteKeyToggleRowSelection,
  getRowClassName,
  getRowTdClassName,
  trProps,
  renderAfterRow,
}: EditableDataGridBodyProps<TRow>) {
  const rowElementsRef = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const pendingFocusRowIdRef = useRef<string | null>(null);
  const prevEditingRowIdRef = useRef<string | null>(null);
  const pendingKeyboardEditStartRef = useRef<{
    rowId: string;
    mode: "caretEnd" | "replace" | "selectAll";
    text?: string;
    targetIndex?: number;
  } | null>(null);

  useEffect(() => {
    pendingFocusRowIdRef.current = activeRowId;
  }, [activeRowId]);

  useEffect(() => {
    const prevEditingRowId = prevEditingRowIdRef.current;
    const exitedEditOnCurrentRow =
      prevEditingRowId != null && editingRowId == null && activeRowId === prevEditingRowId;
    if (exitedEditOnCurrentRow && activeRowId) {
      // Re-queue row focus when exiting edit mode so hover-style remains visible
      // even if parent sets the same activeRowId value again.
      pendingFocusRowIdRef.current = activeRowId;
    }
    prevEditingRowIdRef.current = editingRowId;
  }, [activeRowId, editingRowId]);

  useLayoutEffect(() => {
    const pendingId = pendingFocusRowIdRef.current;
    if (!pendingId || editingRowId === pendingId) return;
    if (
      editingRowId != null &&
      pendingKeyboardEditStartRef.current?.rowId === editingRowId
    ) {
      pendingFocusRowIdRef.current = null;
      return;
    }
    const rowEl = rowElementsRef.current.get(pendingId);
    if (!rowEl) return;
    pendingFocusRowIdRef.current = null;
    rowEl.focus();
    rowEl.scrollIntoView({ block: "nearest" });
  }, [activeRowId, editingRowId, rows]);

  const moveRowFocus = useCallback(
    (
      event: React.KeyboardEvent<HTMLTableRowElement>,
      direction: 1 | -1,
      targetIndex = 0
    ) => {
      if (moveFocusBetweenGridRows(event.currentTarget, direction, targetIndex)) {
        event.preventDefault();
      }
    },
    []
  );

  useLayoutEffect(() => {
    if (!editingRowId) return;
    const pending = pendingKeyboardEditStartRef.current;
    if (!pending || pending.rowId !== editingRowId) return;
    const rowEl = rowElementsRef.current.get(editingRowId);
    if (!rowEl) return;
    pendingKeyboardEditStartRef.current = null;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const targets = getRowEnterNavigationTargets(rowEl);
        const targetIndex = Math.max(
          0,
          Math.min(targets.length - 1, pending.targetIndex ?? 0)
        );
        const first = targets[targetIndex];
        if (!first) {
          rowEl.focus();
          rowEl.scrollIntoView({ block: "nearest" });
          return;
        }
        if (pending.mode === "replace" && typeof pending.text === "string") {
          focusEditableElement(first, {
            selectText: false,
            cursorAtEnd: true,
            replaceText: pending.text,
          });
          return;
        }
        if (pending.mode === "selectAll") {
          focusEditableElement(first, {
            selectText: true,
            cursorAtEnd: false,
          });
          if (isTextLikeInput(first as HTMLInputElement)) {
            applyOverrideMode(first);
          }
          return;
        }
        focusEditableElement(first, {
          selectText: false,
          cursorAtEnd: true,
        });
      });
    });
  }, [editingRowId, rows]);

  const editFieldSuggestionsByColumnId = useMemo(
    () => buildGridEditFieldSuggestionsMap(columns, rows),
    [columns, rows]
  );

  return (
    <>
      {rows.map((row, rowIndex) => {
        const id = getRowId(row);
        const mode: EditableGridCellMode =
          editingRowId != null && editingRowId === id ? "edit" : "view";
        const extra = trProps?.(row, rowIndex) ?? {};
        const { className: trClassName, onKeyDown: userOnKeyDown, ...restTr } = extra;
        const className = [getRowClassName?.(row, rowIndex), trClassName]
          .filter(Boolean)
          .join(" ") || undefined;

        return (
          <Fragment key={id}>
          <tr
            ref={(node) => {
              if (node) {
                rowElementsRef.current.set(id, node);
                return;
              }
              rowElementsRef.current.delete(id);
            }}
            {...restTr}
            className={className}
            tabIndex={-1}
            data-tv-body-row="true"
            data-tv-nav-row="true"
            data-tv-row-id={id}
            {...(mode === "edit" ? { "data-tv-row-editing": "true" } : {})}
            onKeyDown={(event) => {
              userOnKeyDown?.(event);
              if (event.defaultPrevented) return;
              const hasModifiers =
                event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
              const activeInRow = findActiveRowEnterTarget(event.currentTarget, event.target);
              const firstInlineEditableCol = columns.find(
                (col) => typeof col.onCellDoubleClick === "function"
              );
              const ctx: EditableGridCellContext<TRow> = { row, rowIndex, mode };

              if (
                !hasModifiers &&
                (event.key === "ArrowUp" ||
                  event.key === "ArrowDown" ||
                  event.key === "ArrowLeft" ||
                  event.key === "ArrowRight")
              ) {
                if (shouldPreserveLocalArrowHandling(event.target, event.key)) return;

                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  if (mode === "edit") {
                    const active = findActiveRowEnterTarget(event.currentTarget, event.target);
                    if (active && isTextLikeInput(active) && !active.hasAttribute("data-tv-override")) {
                      return;
                    }
                  }
                  const moved = moveFocusWithinRow(
                    event.currentTarget,
                    event.target,
                    event.key === "ArrowRight" ? 1 : -1
                  );
                  if (moved) {
                    event.preventDefault();
                    return;
                  }
                } else {
                  const direction: 1 | -1 = event.key === "ArrowDown" ? 1 : -1;

                  if (mode === "view") {
                    if (!firstInlineEditableCol?.onCellDoubleClick) {
                      moveRowFocus(event, direction, 0);
                      return;
                    }
                    if (id) {
                      pendingKeyboardEditStartRef.current = {
                        rowId: id,
                        mode: "selectAll",
                        targetIndex: 0,
                      };
                    }
                    event.preventDefault();
                    firstInlineEditableCol.onCellDoubleClick(
                      {
                        row,
                        rowIndex,
                        mode,
                      },
                      event as unknown as MouseEvent<HTMLTableCellElement>
                    );
                    return;
                  }

                  const rowTargets = getRowEnterNavigationTargets(event.currentTarget);
                  const activeIndex = activeInRow
                    ? Math.max(0, rowTargets.indexOf(activeInRow))
                    : 0;
                  const nextRowIndex = rowIndex + direction;
                  if (
                    firstInlineEditableCol?.onCellDoubleClick &&
                    nextRowIndex >= 0 &&
                    nextRowIndex < rows.length
                  ) {
                    const nextRow = rows[nextRowIndex];
                    const nextRowId = getRowId(nextRow);
                    if (nextRowId) {
                      pendingKeyboardEditStartRef.current = {
                        rowId: nextRowId,
                        mode: "selectAll",
                        targetIndex: activeIndex,
                      };
                    }
                    event.preventDefault();
                    firstInlineEditableCol.onCellDoubleClick(
                      {
                        row: nextRow,
                        rowIndex: nextRowIndex,
                        mode: "view",
                      },
                      event as unknown as MouseEvent<HTMLTableCellElement>
                    );
                    return;
                  }
                  if (mode === "edit" && nextRowIndex < 0 && onRowEscape) {
                    const currentRow = event.currentTarget;
                    event.preventDefault();
                    onRowEscape(ctx);
                    requestAnimationFrame(() => {
                      moveFocusBetweenGridRows(currentRow, direction, activeIndex);
                    });
                    return;
                  }
                  moveRowFocus(event, direction, activeIndex);
                  if (event.defaultPrevented) return;
                }
              }

              if (mode === "view" && event.key === "Enter" && !hasModifiers) {
                if (isKeyboardInputTarget(event.target)) return;
                if (!firstInlineEditableCol?.onCellDoubleClick) return;
                if (id) {
                  pendingKeyboardEditStartRef.current = {
                    rowId: id,
                    mode: "caretEnd",
                    targetIndex: 0,
                  };
                }
                event.preventDefault();
                firstInlineEditableCol.onCellDoubleClick(
                  {
                    row,
                    rowIndex,
                    mode,
                  },
                  event as unknown as MouseEvent<HTMLTableCellElement>
                );
                return;
              }

              if (mode === "view") {
                if (isKeyboardInputTarget(event.target)) return;
                if (
                  !hasModifiers &&
                  event.key === "Delete" &&
                  onDeleteKeyToggleRowSelection
                ) {
                  event.preventDefault();
                  onDeleteKeyToggleRowSelection(id);
                  return;
                }
                const wantsStartEdit = isPlainPrintableKey(event);
                if (!wantsStartEdit) return;
                if (!firstInlineEditableCol?.onCellDoubleClick) return;
                if (id) {
                  pendingKeyboardEditStartRef.current = isPlainPrintableKey(event)
                    ? { rowId: id, mode: "replace", text: event.key, targetIndex: 0 }
                    : { rowId: id, mode: "caretEnd" };
                }
                event.preventDefault();
                firstInlineEditableCol.onCellDoubleClick(
                  {
                    row,
                    rowIndex,
                    mode,
                  },
                  event as unknown as MouseEvent<HTMLTableCellElement>
                );
                return;
              }

              if (event.key === "Enter") {
                if (hasModifiers) return;
                const targets = getRowEnterNavigationTargets(event.currentTarget);
                if (targets.length === 0) {
                  onRowEnterAtEnd?.(ctx);
                  return;
                }
                const active = findActiveRowEnterTarget(event.currentTarget, event.target);
                event.preventDefault();
                if (!active) {
                  focusEditableElement(targets[0], {
                    selectText: false,
                    cursorAtEnd: true,
                  });
                  return;
                }
                if (isTextLikeInput(active)) {
                  const start = active.selectionStart ?? 0;
                  const end = active.selectionEnd ?? 0;
                  const allSelected = start === 0 && end === active.value.length && active.value.length > 0;
                  if (allSelected) {
                    const atEnd = active.value.length;
                    active.setSelectionRange(atEnd, atEnd);
                    active.removeAttribute("data-tv-override");
                    return;
                  }
                }
                const index = targets.indexOf(active);
                const next = index >= 0 ? targets[index + 1] : targets[0];
                if (next) {
                  focusEditableElement(next, {
                    selectText: false,
                    cursorAtEnd: true,
                  });
                  return;
                }
                onRowEnterAtEnd?.(ctx);
              }

              if (event.key === "Escape") {
                if (hasModifiers) return;
                if (mode !== "edit") return;
                event.preventDefault();
                onRowEscape?.(ctx);
                return;
              }
            }}
          >
            {columns.map((col, columnIndex) => {
              const ctx: EditableGridCellContext<TRow> = {
                row,
                rowIndex,
                mode,
                gridSuggestions: editFieldSuggestionsByColumnId.get(col.id),
              };
              const { className: tdExtraClass, style: tdExtraStyle, ...tdExtraRest } =
                col.tdExtraProps ?? {};
              const tdClass = [
                "!text-xs",
                resolveGridColumnTdClasses(col, {
                  columns: columns as EditableGridColumnDef<unknown>[],
                  columnIndex,
                }),
                tdExtraClass,
                getRowTdClassName?.(row, col),
              ]
                .filter(Boolean)
                .join(" ");
              const cellStyle = resolveGridColumnCellStyle(col);
              const stickyInsetStyle = resolveGridColumnStickyInsetStyle(
                col,
                columns,
                columnIndex
              );
              const tdStyle =
                cellStyle || stickyInsetStyle || tdExtraStyle
                  ? {
                      ...cellStyle,
                      ...stickyInsetStyle,
                      ...tdExtraStyle,
                    }
                  : undefined;
              return (
                <td
                  key={col.id}
                  className={tdClass}
                  style={tdStyle}
                  {...tdExtraRest}
                  onDoubleClick={(e) => col.onCellDoubleClick?.(ctx, e)}
                >
                  {renderEditableGridBodyCell(col, ctx)}
                </td>
              );
            })}
          </tr>
          {renderAfterRow?.({ row, rowIndex, rowId: id })}
          </Fragment>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Server-driven list tbody: one shell; add-row cells are declarative via `fields`
// ---------------------------------------------------------------------------

function SdtMi({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-icons ${className}`.trim()} aria-hidden>
      {name}
    </span>
  );
}

type ListAddRowFieldRender = ServerDrivenListAddRowField & {
  tdStyle?: CSSProperties;
};

/** One `<td>` in the add-row: padding, text, searchable dropdown, toggle, icon actions, or arbitrary content. */
export type ServerDrivenListAddRowField =
  | {
      kind: "padding";
      tdStyle?: CSSProperties;
    }
  | {
      kind: "text";
      value: string;
      onChange: (v: string) => void;
      placeholder?: string;
      disabled?: boolean;
      ariaLabel?: string;
      inputClassName?: string;
      /** Ghost autocomplete vocabulary from existing row values (when env enabled). */
      gridSuggestions?: string[];
      /** Built from `rows` in {@link ServerDrivenListTbody} when `gridSuggestions` is omitted. */
      suggestFromRow?: (row: unknown) => string | null | undefined;
      /** Merged with grid column layout when using built-in add row. */
      tdClassName?: string;
      inputRef?: RefObject<HTMLInputElement | null>;
      onEnter?: () => void;
      /** When the row ref is set, blur only commits if focus left the add-row tr. */
      addRowTrRef?: RefObject<HTMLTableRowElement | null>;
      onBlurCommit?: (opts?: { silentIfEmpty?: boolean }) => void;
    }
  | {
      kind: "autocomplete";
      inputRef: RefObject<HTMLInputElement | null>;
      listRef: RefObject<HTMLDivElement | null>;
      inputValue: string;
      onInputChange: (v: string) => void;
      open: boolean;
      setOpen: (v: boolean) => void;
      highlightIdx: number;
      setHighlightIdx: Dispatch<SetStateAction<number>>;
      options: { id: string; label: string }[];
      selectedId: string | null;
      onSelect: (id: string) => void;
      placeholder?: string;
      disabled?: boolean;
      ariaLabel?: string;
      inputClassName?: string;
      emptyHint?: string;
      /** Arrow/Enter selection; set false for mouse-only lists. */
      keyboardNavigation?: boolean;
      /** Total count for keyboard loop (options + optional create row). */
      optionCountForKeyboard?: number;
      createOption?: {
        show: boolean;
        loading: boolean;
        label: string;
        onCreate: () => void;
        /** Index in the highlight loop (usually options.length). */
        highlightIndex: number;
      };
      /** Enter while dropdown is closed (e.g. save row). */
      onEnterWhenClosed?: () => void;
      onAfterSelectFocusRef?: RefObject<HTMLInputElement | null>;
      blurCloseMs?: number;
      dropdownInteractive?: boolean;
      /** Ghost autocomplete vocabulary (same env flag as inline grid). */
      gridSuggestions?: string[];
      onListScroll?: (event: UIEvent<HTMLDivElement>) => void;
      onNeedMoreIfNotScrollable?: () => void;
      listFooter?: ReactNode;
      /** Merged with grid column layout when using built-in add row. */
      tdClassName?: string;
    }
  | {
      kind: "toggle";
      pressed: boolean;
      onToggle: () => void;
      disabled?: boolean;
      saving?: boolean;
      ariaLabel?: string;
      /** Optional extra classes on the add-row `<td>` (e.g. column width utilities). */
      tdClassName?: string;
    }
  | {
      kind: "actions";
      actions: Array<{
        icon: string;
        title: string;
        ariaLabel: string;
        onClick: () => void;
        disabled?: boolean;
      }>;
      tdClassName?: string;
    }
  | {
      kind: "custom";
      content: ReactNode;
      tdClassName?: string;
      colSpan?: number;
    };

export type AddRowActionButtonConfig = {
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick: () => void;
};

/** Width presets aligned with grid actions columns (see `editableGridColumnClasses`). */
export type AddRowActionsWidth = "dual" | "icon";

export type AddRowActionsColumnConfig =
  | {
      /** Match sticky actions column on the same table. */
      width?: AddRowActionsWidth;
      tdClassName?: string;
      /** Collapsed add-row: disabled check/close placeholders. */
      placeholder: true;
      saveTitle?: string;
      saveAriaLabel?: string;
      cancelTitle?: string;
      cancelAriaLabel?: string;
    }
  | {
      width?: AddRowActionsWidth;
      tdClassName?: string;
      placeholder?: false;
      save: AddRowActionButtonConfig;
      cancel: AddRowActionButtonConfig;
    };

function addRowActionsTdClassName(
  width: AddRowActionsWidth = "icon",
  tdClassName?: string
): string {
  if (tdClassName) return tdClassName;
  return ADD_ROW_ACTIONS_TD_ICON;
}

/** Builds the standard add-row check/close `<td>` field (also used by {@link ServerDrivenListTbody} `actionsColumn`). */
export function buildAddRowActionsField(
  config: AddRowActionsColumnConfig
): Extract<ServerDrivenListAddRowField, { kind: "actions" }> {
  const tdClassName = addRowActionsTdClassName(config.width, config.tdClassName);
  if (config.placeholder) {
    return {
      kind: "actions",
      tdClassName,
      actions: [
        {
          icon: "check",
          title: config.saveTitle ?? "",
          ariaLabel: config.saveAriaLabel ?? config.saveTitle ?? "Save",
          disabled: true,
          onClick: () => {},
        },
        {
          icon: "close",
          title: config.cancelTitle ?? "",
          ariaLabel: config.cancelAriaLabel ?? config.cancelTitle ?? "Cancel",
          disabled: true,
          onClick: () => {},
        },
      ],
    };
  }
  return {
    kind: "actions",
    tdClassName,
    actions: [
      { icon: "check", ...config.save },
      { icon: "close", ...config.cancel },
    ],
  };
}

/** Sticky actions column — not part of built-in add-row body cells. */
export function isAddRowActionsColumn<TRow>(
  col: EditableGridColumnDef<TRow>
): boolean {
  if (col.id === "actions") return true;
  return col.layout?.sticky === "right";
}

/** Body columns for add-row (everything except actions). Includes select when present. */
export function getAddRowBodyColumns<TRow>(
  columns: EditableGridColumnDef<TRow>[],
  skipColumnIds: string[] = []
): EditableGridColumnDef<TRow>[] {
  const skip = new Set(skipColumnIds);
  return columns.filter((c) => !skip.has(c.id) && !isAddRowActionsColumn(c));
}

function resolveAddRowPrimaryColumnId<TRow>(
  columns: EditableGridColumnDef<TRow>[],
  explicit?: string
): string {
  if (explicit) return explicit;
  const stickyPrimary = columns.find(
    (c) => c.layout?.sticky === true || c.layout?.sticky === "leftPrimary"
  );
  if (stickyPrimary) return stickyPrimary.id;
  const body = getAddRowBodyColumns(columns);
  return body.find((c) => c.id !== "select")?.id ?? body[0]?.id ?? "";
}

export function resolveAddRowColumnTd<TRow>(
  col: EditableGridColumnDef<TRow>,
  extraClassName?: string
): { tdClassName: string; tdStyle: CSSProperties | undefined } {
  const tdClassName = [
    resolveGridColumnTdClasses(col),
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");
  return { tdClassName, tdStyle: resolveGridColumnCellStyle(col) };
}

function withAddRowColumnLayout<TRow>(
  col: EditableGridColumnDef<TRow>,
  field: ServerDrivenListAddRowField,
  extraClassName?: string
): ListAddRowFieldRender {
  const { tdClassName, tdStyle } = resolveAddRowColumnTd(col, extraClassName);
  if (field.kind === "padding") {
    return { ...field, tdStyle };
  }
  const existingClass =
    "tdClassName" in field ? field.tdClassName : undefined;
  const mergedClass = [existingClass, tdClassName].filter(Boolean).join(" ");
  return { ...field, tdClassName: mergedClass || undefined, tdStyle };
}

export function AddRowPromptButton({
  label,
  disabled = false,
  disabledTitle,
  onClick,
  className = "",
}: {
  label: ReactNode;
  disabled?: boolean;
  disabledTitle?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`add-row-prompt-btn${disabled ? " opacity-50 cursor-not-allowed" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
    >
      <span className="material-icons !text-sm" aria-hidden>
        add_circle_outline
      </span>
      <span>{label}</span>
    </button>
  );
}

function buildAddRowSelectSpacerField<TRow>(
  col: EditableGridColumnDef<TRow> | undefined,
  expanded: boolean
): ListAddRowFieldRender {
  const spacer = (
    <span
      className={`inline-block ${expanded ? "h-4 w-4" : "h-5 w-5"}`}
      aria-hidden
    />
  );
  if (!col) {
    return { kind: "custom", content: spacer };
  }
  return withAddRowColumnLayout(
    col,
    { kind: "custom", content: spacer },
    expanded ? "bg-inherit" : undefined
  );
}

function buildAddRowPlaceholderField<TRow>(
  col: EditableGridColumnDef<TRow>
): ListAddRowFieldRender {
  return withAddRowColumnLayout(col, {
    kind: "custom",
    content: (
      <span className="text-xs text-text-muted" aria-hidden>
        -
      </span>
    ),
  });
}

/** Built-in add row: TableView renders collapsed prompt + placeholders and save/cancel from props. */
export type ServerDrivenListBuiltInAddRowConfig = {
  ref: RefObject<HTMLTableRowElement | null>;
  promptLabel: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  primaryColumnId?: string;
  skipColumnIds?: string[];
  disabled?: boolean;
  disabledTitle?: string;
  onExpand?: () => void;
  className?: string;
  ariaDisabled?: boolean | "true" | "false";
  title?: string;
  onRowEnterAtEnd?: () => void;
  onRowEscape?: () => void;
  onArrowIntoRow?: () => void;
  onArrowLeaveRow?: () => void;
  /** One field per {@link getAddRowBodyColumns} entry, same order as the grid (including select). */
  expandedFields: ServerDrivenListAddRowField[];
  save: AddRowActionButtonConfig;
  cancel: AddRowActionButtonConfig;
  collapsedSave?: { title?: string; ariaLabel?: string };
  collapsedCancel?: { title?: string; ariaLabel?: string };
  showActionsColumn?: boolean;
  actionsWidth?: AddRowActionsWidth;
};

export type ServerDrivenListLegacyAddRowConfig = {
  ref: RefObject<HTMLTableRowElement | null>;
  className?: string;
  ariaDisabled?: boolean | "true" | "false";
  title?: string;
  onRowEnterAtEnd?: () => void;
  onRowEscape?: () => void;
  onArrowIntoRow?: () => void;
  onArrowLeaveRow?: () => void;
  fields: ServerDrivenListAddRowField[];
  actionsColumn?: false | AddRowActionsColumnConfig;
};

export type ServerDrivenListAddRowConfig =
  | ServerDrivenListBuiltInAddRowConfig
  | ServerDrivenListLegacyAddRowConfig;

export function isBuiltInListAddRow(
  addRow: ServerDrivenListAddRowConfig
): addRow is ServerDrivenListBuiltInAddRowConfig {
  return "promptLabel" in addRow;
}

export function buildBuiltInListAddRowFields<TRow>(
  columns: EditableGridColumnDef<TRow>[],
  config: ServerDrivenListBuiltInAddRowConfig
): ServerDrivenListAddRowField[] {
  const bodyColumns = getAddRowBodyColumns(columns, config.skipColumnIds);
  const primaryId = resolveAddRowPrimaryColumnId(columns, config.primaryColumnId);
  // Only treat a column as the leading select/checkbox spacer when the grid
  // actually has one — falling back to bodyColumns[0] here would collide with
  // the primary column on grids (like Translations) that have no select
  // column, since the primary column IS bodyColumns[0] in that case.
  const selectCol = bodyColumns.find(
    (c) => c.id === "select" || c.layout?.width === 1
  );

  if (!config.expanded) {
    return bodyColumns.map((col) => {
      if (col.id === selectCol?.id) {
        return buildAddRowSelectSpacerField(col, false);
      }
      if (col.id === primaryId) {
        return withAddRowColumnLayout(col, {
          kind: "custom",
          content: (
            <AddRowPromptButton
              label={config.promptLabel}
              disabled={config.disabled}
              disabledTitle={config.disabledTitle}
              onClick={() => {
                config.onExpandedChange(true);
                config.onExpand?.();
              }}
            />
          ),
        });
      }
      return buildAddRowPlaceholderField(col);
    });
  }

  if (config.expandedFields.length !== bodyColumns.length) {
    console.warn(
      `[ServerDrivenListTbody] addRow.expandedFields length (${config.expandedFields.length}) ` +
        `does not match body columns (${bodyColumns.length}).`
    );
  }

  return bodyColumns.map((col, index) => {
    const field = config.expandedFields[index];
    if (!field) {
      return buildAddRowPlaceholderField(col);
    }
    return withAddRowColumnLayout(col, field, "bg-inherit");
  });
}

export function buildBuiltInListAddRowActionsColumn(
  config: ServerDrivenListBuiltInAddRowConfig
): false | AddRowActionsColumnConfig {
  if (config.showActionsColumn === false) return false;
  const width = config.actionsWidth ?? "icon";
  if (!config.expanded) {
    return {
      width,
      placeholder: true,
      saveTitle: config.collapsedSave?.title ?? "",
      saveAriaLabel:
        config.collapsedSave?.ariaLabel ??
        config.collapsedSave?.title ??
        "Save",
      cancelTitle: config.collapsedCancel?.title ?? "",
      cancelAriaLabel:
        config.collapsedCancel?.ariaLabel ??
        config.collapsedCancel?.title ??
        "Cancel",
    };
  }
  return {
    width,
    save: config.save,
    cancel: config.cancel,
  };
}

type ListAddRowAutocompleteProps = Omit<
  Extract<ServerDrivenListAddRowField, { kind: "autocomplete" }>,
  "kind"
> & {
  tdClassName?: string;
  tdStyle?: CSSProperties;
};

function ListAddRowAutocompleteCell({
  inputRef,
  listRef,
  inputValue,
  onInputChange,
  open,
  setOpen,
  highlightIdx,
  setHighlightIdx,
  options,
  selectedId,
  onSelect,
  placeholder,
  disabled,
  ariaLabel,
  inputClassName = gridTextFieldClassName(),
  emptyHint = "No matches",
  keyboardNavigation = true,
  optionCountForKeyboard,
  createOption,
  onEnterWhenClosed,
  onAfterSelectFocusRef,
  blurCloseMs = 150,
  dropdownInteractive = true,
  gridSuggestions,
  onListScroll,
  onNeedMoreIfNotScrollable,
  listFooter,
  tdClassName,
  tdStyle,
}: ListAddRowAutocompleteProps) {
  const nOpt = options.length;
  const navigableCount =
    optionCountForKeyboard ??
    (createOption?.show ? nOpt + 1 : nOpt);

  const createSlot = createOption?.show
    ? {
        show: true,
        loading: createOption.loading,
        label: createOption.label,
        onCreate: () => void createOption.onCreate(),
        highlightIndex: createOption.highlightIndex,
      }
    : undefined;

  return (
    <td className={tdClassName} style={tdStyle}>
      <SearchableListCombobox
        inputRef={inputRef}
        listRef={listRef}
        inputClassName={inputClassName}
        placeholder={placeholder}
        disabled={disabled}
        ariaLabel={ariaLabel}
        inputValue={inputValue}
        onInputChange={onInputChange}
        gridSuggestions={gridSuggestions}
        open={open}
        onOpenChange={setOpen}
        highlightIndex={highlightIdx}
        onHighlightChange={setHighlightIdx}
        navigableCount={navigableCount}
        options={options}
        selectedId={selectedId}
        onSelect={onSelect}
        onEnterWhenClosed={onEnterWhenClosed}
        emptyMessage={emptyHint}
        createSlot={createSlot}
        afterSelectFocusRef={onAfterSelectFocusRef}
        blurCloseMs={blurCloseMs}
        keyboardNavigation={keyboardNavigation}
        openOnArrowDown={false}
        dropdownInteractive={dropdownInteractive}
        onListScroll={onListScroll}
        onNeedMoreIfNotScrollable={onNeedMoreIfNotScrollable}
        listFooter={listFooter}
        menuPortal
      />
    </td>
  );
}

function renderListAddRowField(
  field: ListAddRowFieldRender,
  key: string,
  rows?: readonly unknown[]
): ReactNode {
  const tdStyle = field.tdStyle;
  switch (field.kind) {
    case "padding":
      return (
        <td key={key} style={tdStyle ?? { paddingLeft: 16 }} />
      );
    case "text": {
      void rows;
      return (
        <td key={key} className={field.tdClassName} style={tdStyle}>
          <GridInlineTextField
            inputRef={field.inputRef}
            className={field.inputClassName ?? gridTextFieldClassName()}
            placeholder={field.placeholder}
            value={field.value}
            onChange={field.onChange}
            onEnter={field.onEnter}
            onBlur={(e) => {
              if (!field.onBlurCommit || !field.addRowTrRef) return;
              const next = e.relatedTarget as Node | null;
              if (next && field.addRowTrRef.current?.contains(next)) return;
              void field.onBlurCommit({ silentIfEmpty: true });
            }}
            disabled={field.disabled}
            ariaLabel={field.ariaLabel}
          />
        </td>
      );
    }
    case "autocomplete": {
      const { kind, tdStyle: acStyle, ...rest } = field;
      void kind;
      return (
        <ListAddRowAutocompleteCell key={key} tdStyle={acStyle} {...rest} />
      );
    }
    case "toggle":
      return (
        <td key={key} className={field.tdClassName} style={tdStyle}>
          <ToggleSwitch
            data-tv-enter-field="true"
            checked={field.pressed}
            onCheckedChange={() => void field.onToggle()}
            disabled={field.disabled || field.saving}
            aria-label={field.ariaLabel}
          />
        </td>
      );
    case "actions":
      return (
        <td
          key={key}
          className={field.tdClassName ?? "add-row-actions"}
          style={tdStyle}
        >
          <div className="add-row-action-btns">
            {field.actions.map((a) => (
              <button
                key={a.ariaLabel}
                type="button"
                className={
                  a.icon === "check" ? BTN_GRID_ICON_TICK : BTN_GRID_ICON_CLOSE
                }
                title={a.title}
                aria-label={a.ariaLabel}
                disabled={a.disabled}
                onClick={() => void a.onClick()}
              >
                <SdtMi name={a.icon} className={GRID_ACTION_ICON} />
              </button>
            ))}
          </div>
        </td>
      );
    case "custom":
      return (
        <td
          key={key}
          className={field.tdClassName}
          style={tdStyle}
          colSpan={field.colSpan}
        >
          {field.content}
        </td>
      );
    default:
      return null;
  }
}

export type ServerDrivenListTbodyProps<TRow> = {
  rows: TRow[];
  columns: EditableGridColumnDef<TRow>[];
  getRowId: (row: TRow) => string;
  activeRowId?: string | null;
  editingRowId: string | null;
  onDataRowEnterAtEnd?: (ctx: EditableGridCellContext<TRow>) => void;
  onDataRowEscape?: (ctx: EditableGridCellContext<TRow>) => void;
  onDeleteKeyToggleRowSelection?: (rowId: string) => void;
  getRowClassName?: (row: TRow, rowIndex: number) => string;
  /** Extra class applied to a specific `<td>` for a given row (passed through to {@link EditableDataGridBody}). */
  getRowTdClassName?: (row: TRow, col: EditableGridColumnDef<TRow>) => string | undefined;
  trProps?: (
    row: TRow,
    rowIndex: number
  ) => Omit<HTMLAttributes<HTMLTableRowElement>, "children">;
  /** Extra `<tr>` nodes after a data row (e.g. expandable detail panels). */
  renderAfterRow?: (ctx: {
    row: TRow;
    rowIndex: number;
    rowId: string;
  }) => ReactNode;

  colSpan: number;
  emptyMessage?: string;
  showLoadingRow: boolean;
  showEmptyRow: boolean;
  showDataRows: boolean;

  /**
   * When set, renders `<tr className="add-row …">`.
   * Pass `promptLabel` for built-in collapsed prompt, placeholders, and save/cancel;
   * otherwise pass `fields` + `actionsColumn` for full manual control.
   */
  addRow?: ServerDrivenListAddRowConfig | null;

  /** e.g. full-width error row after the add row (indicator create errors). */
  afterAddRow?: ReactNode;
};

/**
 * Single list `<tbody>`: optional declarative add-row, loading/empty rows, {@link EditableDataGridBody}.
 * Pages supply `addRow.fields` (inputs, autocomplete+options, toggles, actions, or `custom`).
 */
export function ServerDrivenListTbody<TRow>({
  rows,
  columns,
  getRowId,
  activeRowId,
  editingRowId,
  onDataRowEnterAtEnd,
  onDataRowEscape,
  onDeleteKeyToggleRowSelection,
  getRowClassName,
  getRowTdClassName,
  trProps,
  renderAfterRow,
  colSpan,
  emptyMessage = "No records found.",
  showLoadingRow,
  showEmptyRow,
  showDataRows,
  addRow,
  afterAddRow,
}: ServerDrivenListTbodyProps<TRow>) {
  const resolvedAddRowFields = useMemo(() => {
    if (!addRow) return null;
    if (isBuiltInListAddRow(addRow)) {
      return buildBuiltInListAddRowFields(columns, addRow);
    }
    return "fields" in addRow ? addRow.fields : [];
  }, [addRow, columns]);

  const resolvedAddRowActionsColumn = useMemo((): false | AddRowActionsColumnConfig | undefined => {
    if (!addRow) return undefined;
    if (isBuiltInListAddRow(addRow)) {
      return buildBuiltInListAddRowActionsColumn(addRow);
    }
    return "actionsColumn" in addRow ? addRow.actionsColumn : undefined;
  }, [addRow]);

  return (
    <tbody className="text-xs">
      {addRow && resolvedAddRowFields ? (
        <tr
          ref={addRow.ref}
          className={`${addRow.className ?? "add-row"} text-xs`}
          aria-disabled={addRow.ariaDisabled}
          title={addRow.title}
          tabIndex={-1}
          data-tv-nav-row="true"
          data-tv-add-row="true"
          onKeyDown={(event) => {
            if (event.defaultPrevented) return;
            const hasModifiers =
              event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
            if (event.key === "Escape") {
              if (hasModifiers) return;
              event.preventDefault();
              addRow.onRowEscape?.();
              return;
            }
            if (event.key === "Enter") {
              if (hasModifiers) return;
              const targets = getRowEnterNavigationTargets(event.currentTarget);
              if (targets.length === 0) {
                addRow.onRowEnterAtEnd?.();
                return;
              }
              const active = findActiveRowEnterTarget(event.currentTarget, event.target);
              event.preventDefault();
              if (!active) {
                const first = targets[0];
                focusEditableElement(first, {
                  selectText: false,
                  cursorAtEnd: true,
                });
                if (first.getAttribute("data-tv-row-enter-open-dropdown") === "true") {
                  first.click();
                }
                return;
              }
              if (isTextLikeInput(active as HTMLInputElement)) {
                const start = (active as HTMLInputElement).selectionStart ?? 0;
                const end = (active as HTMLInputElement).selectionEnd ?? 0;
                const val = (active as HTMLInputElement).value;
                if (start === 0 && end === val.length && val.length > 0) {
                  (active as HTMLInputElement).setSelectionRange(val.length, val.length);
                  active.removeAttribute("data-tv-override");
                  return;
                }
              }
              const index = targets.indexOf(active);
              const next = index >= 0 ? targets[index + 1] : targets[0];
              if (next) {
                focusEditableElement(next, {
                  selectText: false,
                  cursorAtEnd: true,
                });
                return;
              }
              addRow.onRowEnterAtEnd?.();
              return;
            }
            if (
              !hasModifiers &&
              (event.key === "ArrowUp" ||
                event.key === "ArrowDown" ||
                event.key === "ArrowLeft" ||
                event.key === "ArrowRight")
            ) {
              if (shouldPreserveLocalArrowHandling(event.target, event.key)) return;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                const addActive = findActiveRowEnterTarget(event.currentTarget, event.target);
                if (addActive && isTextLikeInput(addActive as HTMLInputElement) && !addActive.hasAttribute("data-tv-override")) {
                  return;
                }
                if (
                  moveFocusWithinRow(
                    event.currentTarget,
                    event.target,
                    event.key === "ArrowRight" ? 1 : -1
                  )
                ) {
                  event.preventDefault();
                }
                return;
              }

              const rowTargets = getRowEnterNavigationTargets(event.currentTarget);
              const active = findActiveRowEnterTarget(event.currentTarget, event.target);
              const direction: 1 | -1 = event.key === "ArrowDown" ? 1 : -1;
              event.preventDefault();

              if (rowTargets.length === 0) {
                addRow.onArrowIntoRow?.();
                const row = event.currentTarget;
                requestAnimationFrame(() => {
                  const targets = getRowEnterNavigationTargets(row);
                  if (targets.length > 0) {
                    focusEditableElement(targets[0]);
                    if (isTextLikeInput(targets[0] as HTMLInputElement)) {
                      applyOverrideMode(targets[0]);
                    }
                  }
                });
                return;
              }

              const currentRow = event.currentTarget;
              const targetIndex = active
                ? Math.max(0, rowTargets.indexOf(active))
                : direction === 1 ? 0 : Math.max(0, rowTargets.length - 1);
              if (moveFocusBetweenGridRows(currentRow, direction, targetIndex)) {
                addRow.onArrowLeaveRow?.();
              }
              return;
            }
          }}
        >
          {[
            ...resolvedAddRowFields,
            ...(resolvedAddRowActionsColumn === false
              ? []
              : resolvedAddRowActionsColumn
                ? [buildAddRowActionsField(resolvedAddRowActionsColumn)]
                : []),
          ].map((f, i) => renderListAddRowField(f, `add-${i}`, rows))}
        </tr>
      ) : null}
      {afterAddRow}
      {showLoadingRow ? (
        <InlineEditTableLoadingRow colSpan={colSpan}><Loader /></InlineEditTableLoadingRow>
      ) : null}
      {showEmptyRow ? (
        <InlineEditTableEmptyRow colSpan={colSpan}>{emptyMessage}</InlineEditTableEmptyRow>
      ) : null}
      {showDataRows ? (
        <EditableDataGridBody
          rows={rows}
          columns={columns}
          getRowId={getRowId}
          activeRowId={activeRowId}
          editingRowId={editingRowId}
          onRowEnterAtEnd={onDataRowEnterAtEnd}
          onRowEscape={onDataRowEscape}
          onDeleteKeyToggleRowSelection={onDeleteKeyToggleRowSelection}
          getRowClassName={getRowClassName}
          getRowTdClassName={getRowTdClassName}
          trProps={trProps}
          renderAfterRow={renderAfterRow}
        />
      ) : null}
    </tbody>
  );
}

export type ServerDrivenTableProps<TRow, TMeta> = {
  /** Result of `useServerListQuery` — keeps rows/meta on the page while the table shell lives here. */
  listState: UseServerListQueryResult<TRow, TMeta>;
  /** Column defs for `<colgroup>` width locking (same array as thead/tbody). */
  columns?: EditableGridColumnDef<TRow>[];
  /** Bulk row selection banner; see {@link TableSelectionNotice}. */
  selection?: TableSelectionNoticeProps | null;
  scrollRef?: RefObject<HTMLDivElement | null>;
  footer?: ReactNode;
  pagination?: TablePaginationFooterConfig;
  renderThead: (state: UseServerListQueryResult<TRow, TMeta>) => ReactNode;
  /** Full `<tbody>` subtree (typically {@link ServerDrivenListTbody}). */
  tbody: ReactNode;
  retryLabel?: string;
  wrapClassName?: string;
  scrollClassName?: string;
  tableClassName?: string;
  tableStyle?: CSSProperties;
  loadingLabel?: string;
  disableGlobalArrowNavigation?: boolean;
};

/**
 * Composes {@link InlineEditableTable} with list loading/error/retry wired from {@link useServerListQuery}.
 * The page owns the hook (so `rows` / `meta` are available for modals, exports, derived row models, etc.).
 */
export function ServerDrivenTable<TRow, TMeta>({
  listState,
  columns,
  selection,
  scrollRef,
  footer,
  pagination,
  renderThead,
  tbody,
  retryLabel,
  wrapClassName,
  scrollClassName,
  tableClassName,
  tableStyle,
  loadingLabel,
  disableGlobalArrowNavigation = false,
}: ServerDrivenTableProps<TRow, TMeta>) {
  return (
    <InlineEditableTable
      selection={selection}
      scrollRef={scrollRef}
      error={listState.error}
      loading={listState.loading}
      loadingLabel={loadingLabel}
      onRetry={() => void listState.refetch()}
      retryLabel={retryLabel}
      wrapClassName={wrapClassName}
      scrollClassName={scrollClassName}
      tableClassName={tableClassName}
      tableStyle={tableStyle}
      disableGlobalArrowNavigation={disableGlobalArrowNavigation}
      gridColumns={
        columns as EditableGridColumnDef<unknown>[] | undefined
      }
      thead={renderThead(listState)}
      tbody={tbody}
      footer={footer}
      pagination={pagination}
    />
  );
}
