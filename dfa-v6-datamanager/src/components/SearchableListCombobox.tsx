"use client";

import type { RefObject } from "react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent, ReactNode, UIEvent } from "react";
import { GridAutoSuggestInput } from "@/components/GridAutoSuggestInput";
import { ENABLE_GRID_AUTOSUGGESTIONS } from "@/lib/constants";

export type SearchableListComboboxOption = {
  id: string;
  label: string;
};

export type SearchableListComboboxCreateSlot = {
  show: boolean;
  loading?: boolean;
  label: string;
  onCreate: () => void;
  /** Row index in the keyboard loop (usually `options.length`). */
  highlightIndex: number;
};

export type SearchableListComboboxRenderRowContext = {
  index: number;
  selected: boolean;
  highlighted: boolean;
};

/** List rows show a checkbox; click or Enter/Space toggles without single-select semantics. */
export type SearchableListComboboxCheckboxSelection = {
  isChecked: (id: string) => boolean;
  onToggle: (id: string) => void;
};

export type SearchableListComboboxProps = {
  /**
   * When true (default), shows the search field; parent filters via `inputValue` / filtered `rows` or `options`.
   * When false, list-only (menus, short fixed lists).
   */
  search?: boolean;
  /**
   * Row data (`{ id, label }`). Same shape as `options`; use whichever name reads clearer at the call site.
   */
  rows?: SearchableListComboboxOption[];
  options?: SearchableListComboboxOption[];
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Outer wrapper (e.g. `relative`) */
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  /** Passed to {@link GridAutoSuggestInput} when env autocomplete is on. */
  gridSuggestions?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlightIndex: number;
  onHighlightChange: (index: number) => void;
  /** `listOptions.length + (createSlot?.show ? 1 : 0)` */
  navigableCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Enter while dropdown is closed (e.g. save row). */
  onEnterWhenClosed?: () => void;
  emptyMessage?: string;
  createSlot?: SearchableListComboboxCreateSlot;
  /** When set, each option shows a checkbox and uses `onToggle` instead of `onSelect` for row activation. */
  checkboxSelection?: SearchableListComboboxCheckboxSelection;
  /**
   * With `checkboxSelection`, shows a select/unselect control for the current list options unless `false`.
   * Requires `onCheckboxSelectAll` to render the control. The handler should toggle: select all visible
   * when not all are checked, or clear visible items from the selection when all are checked.
   */
  checkboxSelectAll?: boolean;
  /** Toggle select-all / unselect-all for the current list (parent implements using `isChecked` state). */
  onCheckboxSelectAll?: () => void;
  /** Label when not all visible options are selected. */
  checkboxSelectAllLabel?: string;
  /** Label when every visible option is selected. */
  checkboxUnselectAllLabel?: string;
  /** Custom row content; default is option label. */
  renderRow?: (
    option: SearchableListComboboxOption,
    ctx: SearchableListComboboxRenderRowContext
  ) => ReactNode;
  /** Extra classes on the list panel (both modes). */
  listPanelClassName?: string;
  /** Focus after selection (e.g. next column). */
  afterSelectFocusRef?: RefObject<HTMLElement | null>;
  /** Focus target when Tab is pressed in the input. */
  onTabFocusRef?: RefObject<HTMLElement | null>;
  blurCloseMs?: number;
  /** Optional ref on the scrollable listbox (e.g. add-row fields). */
  listRef?: RefObject<HTMLDivElement | null>;
  /** Fired when the scrollable dropdown panel is scrolled (e.g. infinite load). */
  onListScroll?: (event: UIEvent<HTMLDivElement>) => void;
  /**
   * When the open list does not overflow its panel (no scrollbar), call this so parents
   * can fetch the next page until the list scrolls or data is exhausted.
   */
  onNeedMoreIfNotScrollable?: () => void;
  /** Optional footer below list rows (e.g. loading-more indicator). */
  listFooter?: ReactNode;
  /** When false, only Escape closes the list; no arrow/Enter list navigation. */
  keyboardNavigation?: boolean;
  /** When false, ArrowDown does not auto-open the dropdown while closed. */
  openOnArrowDown?: boolean;
  /** When false, the dropdown is hidden (e.g. add-row disabled overlay). */
  dropdownInteractive?: boolean;
  /** When false, blur does not close the list (e.g. portaled popovers that use document click-outside). */
  closeOnBlur?: boolean;
  /** Forward to the search input for TableView keyboard column navigation. */
  dataTvEnterField?: boolean;
  /**
   * Render the list in a fixed portal (document.body) so it is not clipped by
   * overflow on table/scroll parents (e.g. compute add row).
   */
  menuPortal?: boolean;
};

/**
 * Optional search field + list with keyboard navigation (ArrowUp/Down, Enter, Escape),
 * or list-only when `search={false}`. Matches indicator inline-edit unit column behavior when searching.
 */
export function SearchableListCombobox({
  search = true,
  rows,
  options,
  inputRef: inputRefProp,
      className = "relative w-full min-w-0",
  inputClassName = "field-comp--sm",
  placeholder,
  disabled = false,
  ariaLabel,
  inputValue: inputValueProp = "",
  onInputChange: onInputChangeProp = () => {},
  gridSuggestions = [],
  open,
  onOpenChange,
  highlightIndex,
  onHighlightChange,
  navigableCount,
  selectedId,
  onSelect,
  onEnterWhenClosed,
  emptyMessage = "No matches",
  createSlot,
  checkboxSelection,
  checkboxSelectAll = true,
  onCheckboxSelectAll,
  checkboxSelectAllLabel = "Select all",
  checkboxUnselectAllLabel = "Unselect all",
  renderRow,
  listPanelClassName = "",
  afterSelectFocusRef,
  onTabFocusRef,
  blurCloseMs = 150,
  listRef: externalListRef,
  onListScroll,
  onNeedMoreIfNotScrollable,
  listFooter,
  keyboardNavigation = true,
  openOnArrowDown = true,
  dropdownInteractive = true,
  closeOnBlur = true,
  dataTvEnterField = false,
  menuPortal = false,
}: SearchableListComboboxProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const inputRef = inputRefProp ?? fallbackInputRef;
  const listboxRef = useRef<HTMLDivElement>(null);
  const [portalBox, setPortalBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxListPx: number;
  } | null>(null);
  /** Keeps arrow-key navigation correct between rapid keydowns before React re-renders. */
  const highlightNavRef = useRef(highlightIndex);
  const lastNeedMoreAtCountRef = useRef(-1);

  const listOptions = rows ?? options ?? [];

  useEffect(() => {
    highlightNavRef.current = highlightIndex;
  }, [highlightIndex]);

  const setListboxEl = (el: HTMLDivElement | null) => {
    listboxRef.current = el;
    if (externalListRef && "current" in externalListRef) {
      (externalListRef as { current: HTMLDivElement | null }).current = el;
    }
  };

  const assignDropRef = (el: HTMLDivElement | null) => {
    panelRef.current = el;
    setListboxEl(el);
  };

  const close = useCallback(() => {
    onOpenChange(false);
    onHighlightChange(-1);
  }, [onOpenChange, onHighlightChange]);

  useLayoutEffect(() => {
    if (!open || !menuPortal || !dropdownInteractive) {
      setPortalBox(null);
      return;
    }
    const anchor = search ? inputRef.current : wrapRef.current;
    if (!anchor) return;
    const update = () => {
      const r = anchor.getBoundingClientRect();
      const gap = 4;
      const top = r.bottom + gap;
      const maxListPx = Math.max(
        80,
        Math.min(240, window.innerHeight - top - 12)
      );
      setPortalBox({
        top,
        left: r.left,
        width: Math.max(r.width, 160),
        maxListPx,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      setPortalBox(null);
    };
  }, [open, menuPortal, dropdownInteractive, search]);

  useEffect(() => {
    if (!open || !menuPortal) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, menuPortal, close]);

  useLayoutEffect(() => {
    if (!open || !dropdownInteractive || highlightIndex < 0) return;
    const root = listboxRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-ac-row-index="${highlightIndex}"]`
    );
    target?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [open, dropdownInteractive, highlightIndex, navigableCount]);

  useEffect(() => {
    if (!open) lastNeedMoreAtCountRef.current = -1;
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !dropdownInteractive || !onNeedMoreIfNotScrollable) return;
    const el = panelRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 48) {
      lastNeedMoreAtCountRef.current = -1;
      return;
    }
    if (listOptions.length === lastNeedMoreAtCountRef.current) return;
    lastNeedMoreAtCountRef.current = listOptions.length;
    onNeedMoreIfNotScrollable();
  }, [
    open,
    dropdownInteractive,
    onNeedMoreIfNotScrollable,
    listOptions.length,
    listFooter,
    portalBox,
  ]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLDivElement>) => {
    if (e.key === "Escape") {
      if (open) {
        close();
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    if (e.key === "Tab") {
      close();
      if (!e.shiftKey && onTabFocusRef?.current) {
        e.preventDefault();
        queueMicrotask(() => onTabFocusRef.current?.focus());
      }
      return;
    }

    if (!keyboardNavigation) return;

    if (!open && e.key === "ArrowDown" && openOnArrowDown) {
      onOpenChange(true);
      onHighlightChange(0);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (open && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      close();
      return;
    }

    if (!open && e.key === "Enter") {
      if (onEnterWhenClosed) {
        e.preventDefault();
        e.stopPropagation();
        onEnterWhenClosed();
      }
      return;
    }

    if (!open) return;

    const n = navigableCount;

    if (e.key === "Enter") {
      if (n === 0 && onEnterWhenClosed) {
        e.preventDefault();
        e.stopPropagation();
        onEnterWhenClosed();
        return;
      }
    }

    if (n === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const hi = highlightNavRef.current;
      const next = hi < n - 1 ? hi + 1 : 0;
      highlightNavRef.current = next;
      onHighlightChange(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const hi = highlightNavRef.current;
      const next = hi <= 0 ? n - 1 : hi - 1;
      highlightNavRef.current = next;
      onHighlightChange(next);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const hi = highlightNavRef.current;
      const createIdx = createSlot?.show ? createSlot.highlightIndex : -1;
      if (createSlot?.show && hi === createIdx) {
        void createSlot.onCreate();
        return;
      }
      if (hi >= 0 && hi < listOptions.length) {
        if (checkboxSelection) {
          checkboxSelection.onToggle(listOptions[hi].id);
        } else {
          onSelect(listOptions[hi].id);
          if (afterSelectFocusRef?.current) {
            queueMicrotask(() => afterSelectFocusRef.current?.focus());
          }
        }
        return;
      }
      if (createSlot?.show && inputValueProp.trim()) {
        void createSlot.onCreate();
        return;
      }
      if (hi < 0 && listOptions.length > 0) {
        if (checkboxSelection) {
          checkboxSelection.onToggle(listOptions[0].id);
        } else {
          onSelect(listOptions[0].id);
          if (afterSelectFocusRef?.current) {
            queueMicrotask(() => afterSelectFocusRef.current?.focus());
          }
        }
      }
    }
  };

  const listVisible = open && dropdownInteractive;
  const showCheckboxSelectAll =
    Boolean(checkboxSelection) &&
    checkboxSelectAll !== false &&
    typeof onCheckboxSelectAll === "function" &&
    listVisible &&
    listOptions.length > 0;

  const allVisibleOptionsSelected =
    Boolean(checkboxSelection) &&
    listOptions.length > 0 &&
    listOptions.every((opt) => checkboxSelection!.isChecked(opt.id));

  const dropClassName = [
    "drop-panel",
    search ? "drop-panel--anchored drop-panel--anchored-ac" : "drop-panel--inline",
    listVisible ? "block animate-[indicator-fadein_0.1s_ease]" : "hidden",
    listPanelClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const showDrop = listVisible && (!menuPortal || portalBox != null);

  const handleInputBlur = useCallback(() => {
    if (!closeOnBlur) return;
    setTimeout(() => {
      const active = document.activeElement;
      if (wrapRef.current?.contains(active)) return;
      if (panelRef.current?.contains(active)) return;
      close();
    }, blurCloseMs);
  }, [closeOnBlur, blurCloseMs, close]);

  const dropPanel = (
    <>
      {showCheckboxSelectAll ? (
        <div className="sticky top-0 z-[1] flex items-center justify-end border-b border-border bg-surface px-2.5 py-1.5">
          <button
            type="button"
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline"
            disabled={disabled}
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => onCheckboxSelectAll?.()}
          >
            {allVisibleOptionsSelected
              ? checkboxUnselectAllLabel
              : checkboxSelectAllLabel}
          </button>
        </div>
      ) : null}
      <div
        role="listbox"
        tabIndex={!search && listVisible ? 0 : undefined}
        aria-label={!search ? ariaLabel : undefined}
        aria-multiselectable={checkboxSelection ? true : false}
        onKeyDown={!search ? handleKeyDown : undefined}
      >
        {listOptions.length === 0 && !(createSlot?.show) && (
          <div className="list-opt-empty list-opt-empty--grid">
            {emptyMessage}
          </div>
        )}
        {listOptions.map((opt, idx) => {
          const selected = checkboxSelection
            ? checkboxSelection.isChecked(opt.id)
            : selectedId === opt.id;
          const highlighted = highlightIndex === idx;
          return (
            <div
              key={opt.id}
              data-ac-row-index={idx}
              className={[
                "list-opt list-opt--grid",
                checkboxSelection ? "flex items-center gap-2" : "",
                highlighted ? "hl" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => onHighlightChange(idx)}
              onMouseDown={(ev) => {
                ev.preventDefault();
                if (checkboxSelection) {
                  checkboxSelection.onToggle(opt.id);
                  return;
                }
                onSelect(opt.id);
                if (afterSelectFocusRef?.current) {
                  queueMicrotask(() => afterSelectFocusRef.current?.focus());
                }
              }}
            >
              {checkboxSelection ? (
                <input
                  type="checkbox"
                  className="checkbox-comp shrink-0 pointer-events-none"
                  checked={selected}
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                />
              ) : null}
              {renderRow
                ? renderRow(opt, {
                    index: idx,
                    selected,
                    highlighted,
                  })
                : opt.label || opt.id}
            </div>
          );
        })}
        {createSlot?.show ? (
          <button
            type="button"
            data-ac-row-index={createSlot.highlightIndex}
            className={`list-opt list-opt--grid list-opt--create ${highlightIndex === createSlot.highlightIndex ? "hl" : ""}`}
            role="option"
            disabled={createSlot.loading}
            onMouseEnter={() => onHighlightChange(createSlot.highlightIndex)}
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => void createSlot.onCreate()}
          >
            {createSlot.loading ? "Creating…" : createSlot.label}
          </button>
        ) : null}
        {listFooter}
      </div>
    </>
  );

  const portalPanelStyle =
    menuPortal && portalBox
      ? {
          position: "fixed" as const,
          top: portalBox.top,
          left: portalBox.left,
          width: portalBox.width,
          zIndex: 700,
          maxHeight: portalBox.maxListPx,
        }
      : undefined;

  return (
    <div
      ref={wrapRef}
      className={className}
      data-ac-list-open={open ? "true" : undefined}
    >
      {search ? (
        ENABLE_GRID_AUTOSUGGESTIONS && gridSuggestions.length > 0 ? (
          <GridAutoSuggestInput
            ref={inputRef}
            className={inputClassName}
            placeholder={placeholder}
            autoComplete="off"
            suggestions={gridSuggestions}
            acceptSuggestionOnTab={false}
            value={inputValueProp}
            onChange={(e) => {
              onInputChangeProp(e.target.value);
              onOpenChange(true);
              onHighlightChange(-1);
            }}
            onFocus={() => {
              onOpenChange(true);
              onHighlightChange(-1);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleInputBlur}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-autocomplete="list"
            data-tv-enter-field={dataTvEnterField ? "true" : undefined}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            className={inputClassName}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            value={inputValueProp}
            onChange={(e) => {
              onInputChangeProp(e.target.value);
              onOpenChange(true);
              onHighlightChange(-1);
            }}
            onFocus={() => {
              onOpenChange(true);
              onHighlightChange(-1);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleInputBlur}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-autocomplete="list"
            data-tv-enter-field={dataTvEnterField ? "true" : undefined}
          />
        )
      ) : null}
      {showDrop && menuPortal && portalBox
        ? createPortal(
            <div
              ref={assignDropRef}
              className={dropClassName}
              style={portalPanelStyle}
              onScroll={onListScroll}
            >
              {dropPanel}
            </div>,
            document.body
          )
        : null}
      {showDrop && !menuPortal ? (
        <div ref={assignDropRef} className={dropClassName} onScroll={onListScroll}>
          {dropPanel}
        </div>
      ) : null}
    </div>
  );
}
