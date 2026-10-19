"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import { ModalCloseButton } from "@/components/ModalCloseButton";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SearchInputBar } from "@/components/SearchInputBar";
import { useCore } from "@/contexts/CoreContext";

function Mi({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-icons ${className}`.trim()} aria-hidden>
      {name}
    </span>
  );
}

function rowMatchesSearch(row: GidManagerDrawerRow, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const name = row.name.toLowerCase();
  const gid = row.gid.toLowerCase();
  const ord = (row.order ?? "").toLowerCase();
  return name.includes(q) || gid.includes(q) || ord.includes(q);
}

function parseDrawerOrderInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (Number.isNaN(n) || !Number.isFinite(n)) return null;
  if (String(n) !== t) return null;
  return n;
}

function orderFieldChanged(row: GidManagerDrawerRow, nextNum: number): boolean {
  const prevRaw = (row.order ?? "").trim();
  if (!prevRaw) return true;
  const p = parseInt(prevRaw, 10);
  if (Number.isNaN(p)) return true;
  return p !== nextNum;
}

function setNativeInputValue(el: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function isPlainPrintableKey(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;
}

function rowQuerySelector(root: HTMLElement, rowId: string): Element | null {
  const safe =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(rowId)
      : rowId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return root.querySelector(`[data-gid-drawer-row="${safe}"]`);
}

type GidDrawerFieldKey = "name" | "order" | "gid";

type GidDrawerNavCell = {
  rowIndex: number;
  fieldKey: GidDrawerFieldKey;
  el: HTMLInputElement;
};

function getVisibleDrawerRowEls(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll("[data-gid-drawer-row]")).filter(
    (n): n is HTMLElement => n instanceof HTMLElement && !n.classList.contains("hidden"),
  );
}

function buildDrawerNavMatrix(
  root: HTMLElement,
  includeOrderCol: boolean,
): GidDrawerNavCell[][] {
  const visibleRows = getVisibleDrawerRowEls(root);
  return visibleRows.map((rowEl, rowIndex) => {
    const row: GidDrawerNavCell[] = [];
    const nameInp = rowEl.querySelector<HTMLInputElement>('input[data-field="name"]');
    if (nameInp && !nameInp.disabled) {
      row.push({ rowIndex, fieldKey: "name", el: nameInp });
    }
    if (includeOrderCol) {
      const ordInp = rowEl.querySelector<HTMLInputElement>('input[data-field="order"]');
      if (ordInp && !ordInp.disabled) {
        row.push({ rowIndex, fieldKey: "order", el: ordInp });
      }
    }
    const gidInp = rowEl.querySelector<HTMLInputElement>('input[data-field="gid"]');
    if (gidInp && !gidInp.disabled) {
      row.push({ rowIndex, fieldKey: "gid", el: gidInp });
    }
    return row;
  });
}

function findDrawerNavCell(
  matrix: GidDrawerNavCell[][],
  el: Element,
): { r: number; c: number } | null {
  for (let r = 0; r < matrix.length; r += 1) {
    const c = matrix[r].findIndex((cell) => cell.el === el);
    if (c >= 0) return { r, c };
  }
  return null;
}

/** Row-major “next cell” (same as ArrowRight wrap / Tab order). */
function getNextDrawerEditableCell(
  matrix: GidDrawerNavCell[][],
  el: HTMLInputElement,
): HTMLInputElement | undefined {
  const pos = findDrawerNavCell(matrix, el);
  if (!pos) return undefined;
  const { r, c } = pos;
  const row = matrix[r];
  if (c + 1 < row.length) return row[c + 1].el;
  if (r + 1 < matrix.length && matrix[r + 1].length > 0) return matrix[r + 1][0].el;
  return undefined;
}

function gidDrawerGridInputsDirty(
  root: HTMLElement,
  rows: GidManagerDrawerRow[],
  opts: {
    onSaveName?: boolean;
    onSaveGid?: boolean;
    onSaveOrder?: boolean;
    canEditGid?: (row: GidManagerDrawerRow) => boolean;
  },
): boolean {
  for (const row of rows) {
    const rowEl = rowQuerySelector(root, row.id);
    if (!rowEl) continue;

    if (opts.onSaveName) {
      const nameInp = rowEl.querySelector<HTMLInputElement>('[data-field="name"]');
      if (nameInp && !nameInp.disabled) {
        const dom = nameInp.value.trim();
        if (dom !== row.name.trim()) return true;
      }
    }

    if (opts.onSaveGid) {
      const gidEditable = opts.canEditGid?.(row) ?? true;
      if (gidEditable) {
        const gidInp = rowEl.querySelector<HTMLInputElement>('[data-field="gid"]');
        if (gidInp && !gidInp.disabled) {
          if (gidInp.value.trim() !== row.gid.trim()) return true;
        }
      }
    }

    if (opts.onSaveOrder) {
      const ordInp = rowEl.querySelector<HTMLInputElement>('[data-field="order"]');
      if (ordInp && !ordInp.disabled) {
        const dom = ordInp.value.trim();
        const baseline = (row.order ?? "").trim();
        if (dom !== baseline) return true;
      }
    }
  }
  return false;
}

function revertGidDrawerGridInputs(
  root: HTMLElement,
  rows: GidManagerDrawerRow[],
  opts: {
    onSaveName?: boolean;
    onSaveGid?: boolean;
    onSaveOrder?: boolean;
    canEditGid?: (row: GidManagerDrawerRow) => boolean;
  },
): void {
  for (const row of rows) {
    const rowEl = rowQuerySelector(root, row.id);
    if (!rowEl) continue;

    if (opts.onSaveName) {
      const nameInp = rowEl.querySelector<HTMLInputElement>('[data-field="name"]');
      if (nameInp && !nameInp.disabled) {
        setNativeInputValue(nameInp, row.name);
      }
    }

    if (opts.onSaveGid) {
      const gidEditable = opts.canEditGid?.(row) ?? true;
      if (gidEditable) {
        const gidInp = rowEl.querySelector<HTMLInputElement>('[data-field="gid"]');
        if (gidInp && !gidInp.disabled) {
          setNativeInputValue(gidInp, row.gid);
        }
      }
    }

    if (opts.onSaveOrder) {
      const ordInp = rowEl.querySelector<HTMLInputElement>('[data-field="order"]');
      if (ordInp && !ordInp.disabled) {
        setNativeInputValue(ordInp, row.order ?? "");
      }
    }
  }
}

/**
 * When `GidManagerDrawer` is open, its root overlay has this attribute. Pages with
 * global `keydown` capture handlers (e.g. tree navigation) should skip handling while
 * this node exists so arrow keys reach the drawer first.
 */
export const GID_MANAGER_DRAWER_OPEN_SELECTOR = '[data-gid-manager-drawer="open"]';

/** Compatible with typical toolkit API PATCH responses */
export type GidManagerDrawerSaveResult = { success: boolean; err_message?: string };

export type GidManagerDrawerRow = {
  id: string;
  name: string;
  gid: string;
  /** When using `onSaveOrder`, initial display order (stringified integer). */
  order?: string;
  /** When true, GID and order fields are locked (system-managed row). */
  isSystem?: boolean;
};

export type GidManagerDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Overrides the default “Bulk Edit” header. Omit to use shared i18n labels. */
  title?: string;
  /** When `title` is omitted, show the loading variant (“Bulk Edit — loading…”). */
  titleLoading?: boolean;
  rows: GidManagerDrawerRow[];
  nameColumnLabel?: string;
  gidColumnLabel?: string;
  orderColumnLabel?: string;
  /**
   * Show subgroup / item name in a disabled input (no `onSaveName`).
   * Ignored when `onSaveName` is provided (name stays editable).
   */
  nameDisabled?: boolean;
  /** Blur save; skip when omitted — name is read-only (unless `nameDisabled` shows a disabled field). */
  onSaveName?: (rowId: string, nextName: string) => Promise<GidManagerDrawerSaveResult>;
  /** Blur save; skip when omitted — GID is read-only */
  onSaveGid?: (rowId: string, nextGid: string) => Promise<GidManagerDrawerSaveResult>;
  /** When set, an order column is shown and saved on blur / header Save. */
  onSaveOrder?: (rowId: string, nextOrder: number) => Promise<GidManagerDrawerSaveResult>;
  /**
   * When `onSaveGid` is set, use this to mark rows whose GID must stay read-only
   * (e.g. subgroup category GIDs). Defaults to all rows editable when omitted.
   */
  canEditGid?: (row: GidManagerDrawerRow) => boolean;
  /**
   * After a successful PATCH from blur, or from the header Save when that flush performed new writes.
   * (Save skips this when everything was already saved on blur — avoids duplicate reloads.)
   */
  onAfterSave?: () => void | Promise<void>;
  /** Header Save button label (shown when name or GID editing is enabled). */
  saveLabel?: string;
  panelWidthClassName?: string;
  copySuccessMessage?: string;
  nameSaveErrorMessage?: string;
  gidSaveErrorMessage?: string;
  orderSaveErrorMessage?: string;
  /** API failure message when `onSaveOrder` returns success: false */
  orderUpdateErrorMessage?: string;
  /** When false, the search field is hidden. Default true. */
  showSearch?: boolean;
  searchPlaceholder?: string;
  noSearchResultsMessage?: string;
};

const GRID_COLS_3 = "grid grid-cols-[minmax(240px,1fr)_minmax(260px,1fr)_64px]";
const GRID_COLS_4 =
  "grid grid-cols-[minmax(200px,1fr)_80px_minmax(200px,1fr)_64px]";

/** Matches subgroup / IC grid row hover + keyboard focus band */
const DRAWER_ROW_HOVER =
  "transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))] focus-within:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]";

/** Same as `textFieldClassName` / `.field-comp--sm:focus` — ring utilities were not winning over `border-border` reliably */
const DRAWER_INPUT_FOCUS =
  "outline-none transition-[border-color,box-shadow] focus:border-primary focus:shadow-[var(--shadow-focus-ring)]";

/** Navigate mode keeps focus for arrows/typing but hides the text caret (Excel-style). */
const DRAWER_GRID_INPUT_CLASS = `${DRAWER_INPUT_FOCUS} [&[data-gid-drawer-navigate]]:caret-transparent`;

export function GidManagerDrawer({
  open,
  onClose,
  title,
  titleLoading = false,
  rows,
  nameColumnLabel = "Name",
  gidColumnLabel = "GID",
  orderColumnLabel = "Order",
  onSaveName,
  onSaveGid,
  onSaveOrder,
  canEditGid,
  nameDisabled = false,
  onAfterSave,
  saveLabel,
  panelWidthClassName = "w-[680px]",
  copySuccessMessage = "GID copied",
  nameSaveErrorMessage = "Failed to update name",
  gidSaveErrorMessage = "Failed to update GID",
  orderSaveErrorMessage = "Enter a valid whole number for order",
  orderUpdateErrorMessage = "Failed to update order",
  showSearch = true,
  searchPlaceholder,
  noSearchResultsMessage = "No matching rows",
}: GidManagerDrawerProps) {
  const { t } = useCore();
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("SEARCH_PLACEHOLDER");
  const resolvedSaveLabel = saveLabel ?? t("SAVE", "Save");
  const headerTitle =
    title ??
    (titleLoading
      ? t("BULK_EDIT_LOADING","Bulk Edit — loading…")
      : t("BULK_EDIT", "Bulk Edit"));
  const bodyRef = useRef<HTMLDivElement>(null);
  const drawerCellModeRef = useRef<"navigate" | "edit">("navigate");
  const pendingNavFocusRef = useRef(false);
  const openedByPointerRef = useRef(false);
  const [saveRunning, setSaveRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const hasOrderCol = Boolean(onSaveOrder);

  useEffect(() => {
    if (!open) setSearchQuery("");
  }, [open]);
 
  useEffect(() => {
    if (open) {
      setDrawerMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setDrawerVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setDrawerVisible(false);
    const t = window.setTimeout(() => setDrawerMounted(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (open) drawerCellModeRef.current = "navigate";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const gridOpts = {
      onSaveName: Boolean(onSaveName),
      onSaveGid: Boolean(onSaveGid),
      onSaveOrder: Boolean(onSaveOrder),
      canEditGid,
    };
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const body = bodyRef.current;
      if (!body) {
        e.preventDefault();
        onClose();
        return;
      }
      if (
        gidDrawerGridInputsDirty(body, rows, {
          onSaveName: gridOpts.onSaveName,
          onSaveGid: gridOpts.onSaveGid,
          onSaveOrder: gridOpts.onSaveOrder,
          canEditGid: gridOpts.canEditGid,
        })
      ) {
        e.preventDefault();
        e.stopPropagation();
        revertGidDrawerGridInputs(body, rows, {
          onSaveName: gridOpts.onSaveName,
          onSaveGid: gridOpts.onSaveGid,
          onSaveOrder: gridOpts.onSaveOrder,
          canEditGid: gridOpts.canEditGid,
        });
        drawerCellModeRef.current = "navigate";
        for (const inp of body.querySelectorAll<HTMLInputElement>("input[data-field]")) {
          inp.removeAttribute("data-gid-drawer-navigate");
        }
        return;
      }
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [open, onClose, rows, onSaveName, onSaveGid, onSaveOrder, canEditGid]);

  const onGridFieldPointerDown = useCallback(() => {
    openedByPointerRef.current = true;
  }, []);

  const onGridFieldFocus = useCallback((e: FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (openedByPointerRef.current) {
      drawerCellModeRef.current = "edit";
      openedByPointerRef.current = false;
      el.removeAttribute("data-gid-drawer-navigate");
      return;
    }
    if (pendingNavFocusRef.current) {
      pendingNavFocusRef.current = false;
    }
    drawerCellModeRef.current = "navigate";
    requestAnimationFrame(() => {
      if (drawerCellModeRef.current === "navigate" && document.activeElement === el) {
        el.setAttribute("data-gid-drawer-navigate", "");
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }, []);

  const onGridFieldKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      if (drawerCellModeRef.current === "edit") {
        if (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey) {
          const body = bodyRef.current;
          if (!body) return;
          const matrix = buildDrawerNavMatrix(body, hasOrderCol);
          if (matrix.length === 0 || matrix.every((r) => r.length === 0)) return;
          const next = getNextDrawerEditableCell(matrix, el);
          e.preventDefault();
          el.removeAttribute("data-gid-drawer-navigate");
          if (next) {
            pendingNavFocusRef.current = true;
            next.focus();
          }
        }
        return;
      }
      const hasMods = e.altKey || e.ctrlKey || e.metaKey;
      if (e.key === "Enter" && !hasMods) {
        e.preventDefault();
        el.removeAttribute("data-gid-drawer-navigate");
        drawerCellModeRef.current = "edit";
        const len = el.value.length;
        el.setSelectionRange(len, len);
        return;
      }
      if (hasMods) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        el.removeAttribute("data-gid-drawer-navigate");
        setNativeInputValue(el, "");
        drawerCellModeRef.current = "edit";
        el.setSelectionRange(0, 0);
        return;
      }
      if (isPlainPrintableKey(e)) {
        e.preventDefault();
        el.removeAttribute("data-gid-drawer-navigate");
        setNativeInputValue(el, e.key);
        drawerCellModeRef.current = "edit";
        el.setSelectionRange(1, 1);
        return;
      }
    },
    [hasOrderCol],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
        return;
      }
      const body = bodyRef.current;
      if (!body) return;

      const matrix = buildDrawerNavMatrix(body, hasOrderCol);
      if (matrix.length === 0 || matrix.every((r) => r.length === 0)) return;

      const active = document.activeElement;
      const inGrid =
        active instanceof HTMLInputElement &&
        active.hasAttribute("data-field") &&
        body.contains(active);

      if (!inGrid) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const first = matrix[0][0]?.el;
          if (first) {
            pendingNavFocusRef.current = true;
            first.focus();
          }
        }
        return;
      }

      if (drawerCellModeRef.current === "edit" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        return;
      }

      e.preventDefault();
      const pos = findDrawerNavCell(matrix, active);
      if (!pos) return;
      const { r, c } = pos;
      const row = matrix[r];
      const cell = row[c];
      if (!cell) return;

      const focusNextCell = (next: HTMLInputElement | undefined) => {
        if (!next) return;
        pendingNavFocusRef.current = true;
        next.focus();
      };

      if (e.key === "ArrowRight") {
        if (c + 1 < row.length) focusNextCell(row[c + 1].el);
        else if (r + 1 < matrix.length && matrix[r + 1].length > 0) focusNextCell(matrix[r + 1][0].el);
        return;
      }
      if (e.key === "ArrowLeft") {
        if (c > 0) focusNextCell(row[c - 1].el);
        else if (r > 0) {
          const prev = matrix[r - 1];
          focusNextCell(prev[prev.length - 1]?.el);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        if (r + 1 >= matrix.length) return;
        const nextRow = matrix[r + 1];
        const byKey = nextRow.find((x) => x.fieldKey === cell.fieldKey);
        if (byKey) focusNextCell(byKey.el);
        else focusNextCell(nextRow[Math.min(c, nextRow.length - 1)]?.el);
        return;
      }
      if (e.key === "ArrowUp") {
        if (r === 0) return;
        const prevRow = matrix[r - 1];
        const byKey = prevRow.find((x) => x.fieldKey === cell.fieldKey);
        if (byKey) focusNextCell(byKey.el);
        else focusNextCell(prevRow[Math.min(c, prevRow.length - 1)]?.el);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, hasOrderCol]);

  const runAfterSave = async () => {
    await onAfterSave?.();
  };

  const flushPendingEdits = useCallback(async (): Promise<{ ok: boolean; wrote: number }> => {
    const root = bodyRef.current;
    if (!root) return { ok: true, wrote: 0 };

    let failed = false;
    let wrote = 0;
    for (const row of rows) {
      const rowEl = rowQuerySelector(root, row.id);
      if (!rowEl) continue;

      if (onSaveName) {
        const nameInp = rowEl.querySelector<HTMLInputElement>('[data-field="name"]');
        if (nameInp) {
          const next = nameInp.value.trim();
          if (next && next !== row.name) {
            const r = await onSaveName(row.id, next);
            if (!r.success) {
              toast.error(r.err_message ?? nameSaveErrorMessage);
              failed = true;
            } else {
              wrote += 1;
            }
          }
        }
      }

      const gidEditable = Boolean(onSaveGid && (canEditGid?.(row) ?? true));
      if (gidEditable && onSaveGid) {
        const gidInp = rowEl.querySelector<HTMLInputElement>('[data-field="gid"]');
        if (gidInp) {
          const next = gidInp.value.trim();
          if (next !== row.gid) {
            const r = await onSaveGid(row.id, next);
            if (!r.success) {
              toast.error(r.err_message ?? gidSaveErrorMessage);
              failed = true;
            } else {
              wrote += 1;
            }
          }
        }
      }

      if (onSaveOrder) {
        const ordInp = rowEl.querySelector<HTMLInputElement>('[data-field="order"]');
        if (ordInp) {
          const nextNum = parseDrawerOrderInt(ordInp.value);
          if (nextNum === null) {
            toast.error(orderSaveErrorMessage);
            failed = true;
          } else if (orderFieldChanged(row, nextNum)) {
            const r = await onSaveOrder(row.id, nextNum);
            if (!r.success) {
              toast.error(r.err_message ?? orderUpdateErrorMessage);
              failed = true;
            } else {
              wrote += 1;
            }
          }
        }
      }
    }
    return { ok: !failed, wrote };
  }, [
    rows,
    onSaveName,
    onSaveGid,
    onSaveOrder,
    canEditGid,
    nameSaveErrorMessage,
    gidSaveErrorMessage,
    orderSaveErrorMessage,
    orderUpdateErrorMessage,
  ]);

  const handleSaveClick = useCallback(async () => {
    if (!onSaveName && !onSaveGid && !onSaveOrder) return;
    setSaveRunning(true);
    try {
      const { ok, wrote } = await flushPendingEdits();
      if (!ok) return;
      // Blur already runs onAfterSave; only refresh again if Save flush performed new writes.
      if (wrote > 0) await onAfterSave?.();
    } finally {
      setSaveRunning(false);
    }
  }, [flushPendingEdits, onAfterSave, onSaveName, onSaveGid, onSaveOrder]);

  const trimmedSearch = searchQuery.trim();
  const hasNoMatches =
    rows.length > 0 && trimmedSearch.length > 0 && rows.every((r) => !rowMatchesSearch(r, searchQuery));

  if (!drawerMounted) return null;

  const gridCols = hasOrderCol ? GRID_COLS_4 : GRID_COLS_3;

  return (
    <div
      className={`fixed inset-0 z-40 ${drawerVisible ? "" : "pointer-events-none"}`}
      data-gid-manager-drawer="open"
      aria-hidden={!drawerVisible}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ${
          drawerVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-label="Close bulk edit overlay"
      />
      <div
        className={`absolute right-0 top-0 z-10 flex h-full ${panelWidthClassName} flex-col border-l border-border bg-surface shadow-xl transition-transform duration-300 ease-out ${
          drawerVisible ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={headerTitle}
      >
        <div className="flex items-center gap-2 border-b border-border p-3">
          <ModalCloseButton className="shrink-0" onClick={onClose} />
          <div className="min-w-0 flex-1 text-sm font-semibold text-text">{headerTitle}</div>
          <div className="flex shrink-0 items-center gap-2">
            {onSaveName || onSaveGid || onSaveOrder ? (
              <PrimarySaveButton
                className="text-xs font-semibold"
                disabled={saveRunning}
                onClick={() => void handleSaveClick()}
              >
                {saveRunning ? "Saving…" : resolvedSaveLabel}
              </PrimarySaveButton>
            ) : null}
          </div>
        </div>
        <div
          className={`${gridCols} items-center border-b border-border bg-surface-muted px-3 py-2 text-xs font-medium`}
        >
          <div>{nameColumnLabel}</div>
          {hasOrderCol ? <div>{orderColumnLabel}</div> : null}
          <div>{gidColumnLabel}</div>
          <div />
        </div>
        {showSearch ? (
          <div className="border-b border-border px-3 py-2">
            <SearchInputBar
              embedded
              size="sm"
              wrapperClassName="w-full"
              fieldClassName="w-full"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={resolvedSearchPlaceholder}
              autoComplete="off"
              aria-label={resolvedSearchPlaceholder}
            />
          </div>
        ) : null}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto">
          {hasNoMatches ? (
            <div className="px-3 py-8 text-center text-xs text-text-muted">{noSearchResultsMessage}</div>
          ) : null}
          {rows.map((row) => {
            const gidEditable = Boolean(onSaveGid && !row.isSystem && (canEditGid?.(row) ?? true));
            const orderEditable = Boolean(onSaveOrder && !row.isSystem);
            const visible = rowMatchesSearch(row, searchQuery);
            return (
              <div
                key={row.id}
                data-gid-drawer-row={row.id}
                className={`${gridCols} gap-2 items-center border-b border-border/50 px-3 py-2 ${DRAWER_ROW_HOVER} ${visible ? "" : "hidden"}`}
              >
                {onSaveName ? (
                  <div className="relative min-w-0">
                    <input
                      key={`${row.id}-name-${row.name}`}
                      data-field="name"
                      defaultValue={row.name}
                      className={`h-8 w-full min-w-0 rounded-sm border border-border bg-surface px-2 text-xs ${row.isSystem ? "pr-16" : ""} ${DRAWER_GRID_INPUT_CLASS}`}
                      onPointerDown={onGridFieldPointerDown}
                      onFocus={onGridFieldFocus}
                      onKeyDown={onGridFieldKeyDown}
                      onBlur={async (e) => {
                        e.currentTarget.removeAttribute("data-gid-drawer-navigate");
                        const next = e.target.value.trim();
                        if (!next || next === row.name) return;
                        const r = await onSaveName(row.id, next);
                        if (!r.success) toast.error(r.err_message ?? nameSaveErrorMessage);
                        else void runAfterSave();
                      }}
                    />
                    {row.isSystem && (
                      <span className="label-tag tone-pill--muted-subtle absolute right-1.5 top-1/2 -translate-y-1/2">
                        {t("SYSTEM_ROLE_BADGE", "System")}
                      </span>
                    )}
                  </div>
                ) : nameDisabled ? (
                  <div className="relative min-w-0">
                    <input
                      key={`${row.id}-namedis-${row.name}`}
                      defaultValue={row.name}
                      disabled
                      className={`h-8 w-full min-w-0 cursor-not-allowed rounded-sm border border-border bg-surface-muted px-2 text-xs text-text-muted outline-none ${row.isSystem ? "pr-16" : ""}`}
                    />
                    {row.isSystem && (
                      <span className="label-tag tone-pill--muted-subtle absolute right-1.5 top-1/2 -translate-y-1/2">
                        {t("SYSTEM_ROLE_BADGE", "System")}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center gap-1.5 px-2">
                    <span className="truncate text-xs">{row.name}</span>
                    {row.isSystem && (
                      <span className="label-tag tone-pill--muted-subtle">
                        {t("SYSTEM_ROLE_BADGE", "System")}
                      </span>
                    )}
                  </div>
                )}
                {hasOrderCol ? (
                  orderEditable ? (
                    <input
                      key={`${row.id}-order-${row.order ?? ""}`}
                      data-field="order"
                      inputMode="numeric"
                      defaultValue={row.order ?? ""}
                      className={`h-8 w-full min-w-0 rounded-sm border border-border bg-surface px-2 text-xs tabular-nums ${DRAWER_GRID_INPUT_CLASS}`}
                      onPointerDown={onGridFieldPointerDown}
                      onFocus={onGridFieldFocus}
                      onKeyDown={onGridFieldKeyDown}
                      onBlur={async (e) => {
                        e.currentTarget.removeAttribute("data-gid-drawer-navigate");
                        const nextNum = parseDrawerOrderInt(e.target.value);
                        if (nextNum === null) {
                          toast.error(orderSaveErrorMessage);
                          return;
                        }
                        if (!orderFieldChanged(row, nextNum)) return;
                        const r = await onSaveOrder!(row.id, nextNum);
                        if (!r.success) toast.error(r.err_message ?? orderUpdateErrorMessage);
                        else void runAfterSave();
                      }}
                    />
                  ) : (
                    <span className="truncate px-2 text-xs tabular-nums text-text-muted">{row.order ?? "—"}</span>
                  )
                ) : null}
                {gidEditable ? (
                  <input
                    key={`${row.id}-gid-${row.gid}`}
                    data-field="gid"
                    defaultValue={row.gid}
                    className={`h-8 rounded-sm border border-border bg-surface px-2 text-xs ${DRAWER_GRID_INPUT_CLASS}`}
                    onPointerDown={onGridFieldPointerDown}
                    onFocus={onGridFieldFocus}
                    onKeyDown={onGridFieldKeyDown}
                    onBlur={async (e) => {
                      e.currentTarget.removeAttribute("data-gid-drawer-navigate");
                      const next = e.target.value.trim();
                      if (next === row.gid) return;
                      const r = await onSaveGid!(row.id, next);
                      if (!r.success) toast.error(r.err_message ?? gidSaveErrorMessage);
                      else void runAfterSave();
                    }}
                  />
                ) : (
                  <span className="truncate px-2 text-xs">{row.gid}</span>
                )}
                <button
                  type="button"
                  className="btn-comp-icon-md justify-self-end !shadow-none"
                  onClick={() => {
                    const gid = row.gid.trim();
                    if (!gid) return;
                    void navigator.clipboard.writeText(gid).then(() => toast.success(copySuccessMessage));
                  }}
                  aria-label={t("COPY_ID")}
                  title={t("COPY_ID")}
                >
                  <Mi name="content_copy" className="!text-sm" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
