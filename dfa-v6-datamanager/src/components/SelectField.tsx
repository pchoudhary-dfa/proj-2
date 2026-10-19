"use client";

import {
  Children,
  CSSProperties,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { SearchInputBar } from "@/components/SearchInputBar";

export type SelectFieldOption = {
  value: string;
  label: ReactNode;
  /**
   * Plain text used when `searchEnabled` filters options (defaults to string form of `label`).
   */
  searchText?: string;
  /**
   * Optional richer node rendered inside dropdown rows only. The trigger button
   * always shows `label` (so it can stay a single truncated line). Provide JSX
   * here when you want a multi-line option layout.
   */
  optionContent?: ReactNode;
  disabled?: boolean;
};

function parseOptionsFromChildren(children: ReactNode): SelectFieldOption[] {
  const out: SelectFieldOption[] = [];
  Children.forEach(children, (node) => {
    if (!isValidElement(node) || node.type !== "option") return;
    const p = node.props as {
      value?: string;
      disabled?: boolean;
      children?: ReactNode;
    };
    if (p.value === undefined) return;
    out.push({
      value: String(p.value),
      label: p.children ?? "",
      disabled: !!p.disabled,
    });
  });
  return out;
}

function optionSearchText(label: ReactNode): string {
  if (typeof label === "string" || typeof label === "number") {
    return String(label);
  }
  return "";
}

function optionMatchText(o: SelectFieldOption): string {
  const fromProp = o.searchText?.trim();
  if (fromProp) return fromProp;
  return optionSearchText(o.label);
}

/** RFC 4122 UUID string (case-insensitive); avoids treating arbitrary strings as UUIDs. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function selectValuesEqual(a: string, b: string): boolean {
  const sa = String(a).trim();
  const sb = String(b).trim();
  if (sa === sb) return true;
  if (UUID_RE.test(sa) && UUID_RE.test(sb)) {
    return sa.toLowerCase() === sb.toLowerCase();
  }
  return false;
}

function emitSelectChange(
  onChange: SelectFieldProps["onChange"],
  value: string,
) {
  if (!onChange) return;
  const t = { value } as EventTarget & HTMLSelectElement;
  onChange({
    target: t,
    currentTarget: t,
  } as ChangeEvent<HTMLSelectElement>);
}

export type SelectFieldProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "role" | "children" | "onChange"
> & {
  options?: SelectFieldOption[];
  children?: ReactNode;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  /** Submits with forms when set. */
  name?: string;
  /** When true, shows a search field and filters options (labels must be plain text for matching). Default false. */
  searchEnabled?: boolean;
  searchPlaceholder?: string;
  /**
   * When true, the options panel is rendered in a `document.body` portal with fixed positioning.
   * Use inside modals or other `overflow: hidden` containers so the menu is not clipped.
   */
  menuPortal?: boolean;
  /**
   * When true, the panel stays inside the trigger wrapper (`position:absolute` below the trigger)
   * instead of portaling to `document.body`. Use inside scroll/table regions so menus stay clipped
   * within the overflow container (e.g. workflow Users assignment grid).
   */
  menuInline?: boolean;
  /**
   * When true, the menu is at least as wide as the trigger and grows with content (capped by the viewport).
   * Option rows use wrapping text so tiles can span multiple lines.
   */
  menuGrowToFitContent?: boolean;
  /**
   * When true, close the opened menu as soon as any parent/container scroll starts.
   * Helpful in dense tables where row focus can shift while scrolling.
   */
  closeOnScroll?: boolean;
  /**
   * When the panel is closed, Enter invokes this callback instead of reopening the menu.
   * Use in grid inline-edit rows so Enter on the last field saves (same as SearchableListCombobox).
   */
  onEnterWhenClosed?: () => void;
  /** Include trigger in grid row arrow-key navigation (`GRID_ROW_ENTER_NAV_SELECTOR`). */
  dataTvEnterField?: boolean;
};

/**
 * Wrapper classes for a SelectField trigger inside `.tbl-wrap.tv-grid-wrap`
 * body/add-row cells — matches {@link gridTextFieldClassName} (`field-comp--xs`, h-8)
 * so inline selects sit flush in `tr[data-tv-row-editing="true"]` cells (`py-0`).
 */
export function gridSelectFieldClassName(extraClassName?: string): string {
  return [
    "w-full min-w-0",
    "[&_button]:!h-8 [&_button]:!min-h-8 [&_button]:!py-0 [&_button]:!px-2",
    "[&_button]:!text-xs [&_button]:!font-normal [&_button]:!leading-tight",
    "[&_button]:!shadow-none [&_button]:focus:!shadow-[var(--shadow-focus-ring)]",
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className={`material-icons shrink-0 text-text-muted !text-xs transition-transform ${open ? "rotate-180" : ""}`.trim()}
      aria-hidden
    >
      expand_more
    </span>
  );
}

/**
 * Single-choice listbox built from a button trigger and a styled panel (not a native `<select>`),
 * so option rows use theme colors; set `searchEnabled` to opt in to the list search box (off by default).
 * Trigger uses `field-comp--md` from `globals.css`.
 */
export const SelectField = forwardRef<HTMLButtonElement, SelectFieldProps>(
  function SelectField(
    {
      options: optionsProp,
      children,
      value = "",
      onChange,
      disabled = false,
      id,
      name,
      className = "",
      searchEnabled = false,
      searchPlaceholder = "Search...",
      menuPortal = false,
      menuInline = false,
      menuGrowToFitContent = false,
      closeOnScroll = false,
      onEnterWhenClosed,
      dataTvEnterField = false,
      onKeyDown,
      onBlur,
      onFocus,
      ...buttonRest
    },
    ref,
  ) {
    const listboxId = useId();
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const optionBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [portalBox, setPortalBox] = useState<{
      /** Set when the menu opens below the trigger (fixed `top`). */
      top?: number;
      /** Set when the menu opens above the trigger (fixed `bottom`). */
      bottom?: number;
      left: number;
      width: number | string;
      minWidth?: number;
      maxWidth?: number;
      maxListPx: number;
    } | null>(null);

    const setTriggerRef = useCallback(
      (el: HTMLButtonElement | null) => {
        triggerRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) (ref as MutableRefObject<HTMLButtonElement | null>).current = el;
      },
      [ref],
    );
    const [open, setOpen] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [panelStyle, setPanelStyle] = useState<CSSProperties>({
      left: 0,
      width: 0,
      top: 0,
      maxHeight: 240,
    });

    const items = useMemo(() => {
      if (optionsProp?.length) return optionsProp;
      if (children !== undefined) return parseOptionsFromChildren(children);
      return [];
    }, [optionsProp, children]);

    const filteredItems = useMemo(() => {
      if (!searchEnabled || !searchQuery.trim()) return items;
      const q = searchQuery.trim().toLowerCase();
      return items.filter((o) =>
        optionMatchText(o).toLowerCase().includes(q),
      );
    }, [items, searchEnabled, searchQuery]);

    const selectedItem = useMemo(
      () => items.find((o) => selectValuesEqual(o.value, value)),
      [items, value],
    );

    const displayLabel = selectedItem?.label ?? (value ? value : "");

    const close = useCallback(() => {
      setOpen(false);
      setSearchQuery("");
    }, []);

    const updatePanelPosition = useCallback(() => {
      if (menuInline) return;
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const gap = 4;
      const margin = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - margin);
      const spaceAbove = Math.max(0, rect.top - margin);
      const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;

      const triggerW = Math.max(
        120,
        Math.min(rect.width, viewportWidth - margin * 2),
      );
      const maxPanelW = viewportWidth - margin * 2;
      const baseLeft = Math.min(
        Math.max(rect.left, margin),
        Math.max(margin, viewportWidth - triggerW - margin),
      );

      if (menuGrowToFitContent) {
        if (openUpward) {
          setPanelStyle({
            left: baseLeft,
            minWidth: triggerW,
            width: "max-content",
            maxWidth: maxPanelW,
            bottom: Math.max(margin, viewportHeight - rect.top + gap),
            maxHeight: Math.max(120, spaceAbove - gap),
          });
        } else {
          setPanelStyle({
            left: baseLeft,
            minWidth: triggerW,
            width: "max-content",
            maxWidth: maxPanelW,
            top: Math.min(viewportHeight - margin, rect.bottom + gap),
            maxHeight: Math.max(120, spaceBelow - gap),
          });
        }
        return;
      }

      const left = baseLeft;
      const width = triggerW;

      if (openUpward) {
        setPanelStyle({
          left,
          width,
          bottom: Math.max(margin, viewportHeight - rect.top + gap),
          maxHeight: Math.max(120, spaceAbove - gap),
        });
      } else {
        setPanelStyle({
          left,
          width,
          top: Math.min(viewportHeight - margin, rect.bottom + gap),
          maxHeight: Math.max(120, spaceBelow - gap),
        });
      }
    }, [menuGrowToFitContent, menuInline]);

    const openPanel = useCallback(() => {
      if (disabled) return;
      setOpen(true);
      const firstEnabled = items.findIndex((o) => !o.disabled);
      setHighlightIdx(firstEnabled >= 0 ? firstEnabled : 0);
      requestAnimationFrame(() => {
        updatePanelPosition();
        if (searchEnabled) searchInputRef.current?.focus();
      });
    }, [disabled, searchEnabled, items, updatePanelPosition]);

    useLayoutEffect(() => {
      if (!open || !menuPortal || menuInline) {
        setPortalBox(null);
        return;
      }
      const el = triggerRef.current;
      if (!el) return;
      const margin = 8;
      const update = () => {
        const r = el.getBoundingClientRect();
        const gap = 4;
        const reserveSearch = searchEnabled ? 52 : 0;
        const footerChrome = 12;
        const vh = window.innerHeight;
        const spaceBelow = Math.max(0, vh - r.bottom - margin);
        const spaceAbove = Math.max(0, r.top - margin);
        const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;

        const triggerW = Math.max(
          120,
          Math.min(r.width, window.innerWidth - margin * 2),
        );
        const maxPanelW = window.innerWidth - margin * 2;
        const left = Math.min(
          Math.max(r.left, margin),
          Math.max(margin, window.innerWidth - triggerW - margin),
        );

        const maxListPx = openUpward
          ? Math.max(
              80,
              Math.min(240, spaceAbove - gap - reserveSearch - footerChrome),
            )
          : Math.max(
              80,
              Math.min(240, spaceBelow - gap - reserveSearch - footerChrome),
            );

        const grow = menuGrowToFitContent
          ? {
              width: "max-content" as const,
              minWidth: triggerW,
              maxWidth: maxPanelW,
            }
          : { width: triggerW };

        if (openUpward) {
          setPortalBox({
            left,
            ...grow,
            bottom: Math.max(margin, vh - r.top + gap),
            maxListPx,
          });
        } else {
          setPortalBox({
            left,
            ...grow,
            top: r.bottom + gap,
            maxListPx,
          });
        }
      };
      update();
      window.addEventListener("scroll", update, true);
      window.addEventListener("resize", update);
      return () => {
        window.removeEventListener("scroll", update, true);
        window.removeEventListener("resize", update);
        setPortalBox(null);
      };
    }, [open, menuPortal, menuInline, menuGrowToFitContent, searchEnabled]);

    useLayoutEffect(() => {
      if (!open || !menuGrowToFitContent || menuPortal || menuInline) return;
      const panel = panelRef.current;
      const trigger = triggerRef.current;
      if (!panel || !trigger) return;
      const margin = 8;
      const vw = window.innerWidth;
      const pw = panel.getBoundingClientRect().width;
      let left = trigger.getBoundingClientRect().left;
      if (left + pw > vw - margin) left = vw - margin - pw;
      if (left < margin) left = margin;
      setPanelStyle((prev) => {
        const prevLeft = typeof prev.left === "number" ? prev.left : 0;
        if (Math.abs(prevLeft - left) < 0.5) return prev;
        return { ...prev, left };
      });
    }, [open, menuGrowToFitContent, menuPortal, menuInline, filteredItems.length]);

    useLayoutEffect(() => {
      if (!open || !menuPortal || !menuGrowToFitContent || !portalBox) return;
      const panel = panelRef.current;
      if (!panel) return;
      const margin = 8;
      const vw = window.innerWidth;
      const pw = panel.getBoundingClientRect().width;
      let left = portalBox.left;
      if (left + pw > vw - margin) left = vw - margin - pw;
      if (left < margin) left = margin;
      if (Math.abs(left - portalBox.left) < 0.5) return;
      setPortalBox((prev) => (prev ? { ...prev, left } : prev));
    }, [open, menuPortal, menuGrowToFitContent, portalBox, filteredItems.length]);

    useEffect(() => {
      if (!open) return;
      const onPointerDown = (e: PointerEvent) => {
        const t = e.target as Node;
        const root = wrapRef.current;
        const panel = panelRef.current;
        const inside =
          (root && root.contains(t)) || (panel && panel.contains(t));
        if (!inside) close();
      };
      document.addEventListener("pointerdown", onPointerDown, true);
      return () =>
        document.removeEventListener("pointerdown", onPointerDown, true);
    }, [open, close]);

    useEffect(() => {
      if (!open || !closeOnScroll) return;
      const onScrollStart = (e: Event) => {
        const target = e.target;
        if (target instanceof Node && panelRef.current?.contains(target)) return;
        close();
      };
      window.addEventListener("scroll", onScrollStart, true);
      return () => window.removeEventListener("scroll", onScrollStart, true);
    }, [open, closeOnScroll, close]);

    useEffect(() => {
      if (!open || menuInline) return;
      updatePanelPosition();
      const onWindowChange = () => updatePanelPosition();
      window.addEventListener("resize", onWindowChange);
      window.addEventListener("scroll", onWindowChange, true);
      return () => {
        window.removeEventListener("resize", onWindowChange);
        window.removeEventListener("scroll", onWindowChange, true);
      };
    }, [open, menuInline, updatePanelPosition]);

    useEffect(() => {
      if (!open || !searchEnabled) return;
      const q = searchQuery.trim().toLowerCase();
      const filtered = !q
        ? items
        : items.filter((o) =>
            optionMatchText(o).toLowerCase().includes(q),
          );
      const firstEnabled = filtered.findIndex((o) => !o.disabled);
      setHighlightIdx(firstEnabled >= 0 ? firstEnabled : 0);
    }, [open, searchQuery, searchEnabled, items]);

    useEffect(() => {
      if (!open) return;
      const el = optionBtnRefs.current[highlightIdx];
      el?.scrollIntoView({ block: "nearest" });
    }, [open, highlightIdx]);

    const moveHighlight = useCallback(
      (direction: 1 | -1) => {
        if (filteredItems.length === 0) return;
        const enabledIdx = filteredItems
          .map((o, i) => (!o.disabled ? i : -1))
          .filter((i) => i >= 0);
        if (enabledIdx.length === 0) return;
        setHighlightIdx((idx) => {
          let pos = enabledIdx.indexOf(idx);
          if (pos < 0) pos = 0;
          const nextPos =
            (pos + direction + enabledIdx.length) % enabledIdx.length;
          return enabledIdx[nextPos]!;
        });
      },
      [filteredItems],
    );

    const pickValue = useCallback(
      (next: string) => {
        emitSelectChange(onChange, next);
        close();
        requestAnimationFrame(() => triggerRef.current?.focus());
      },
      [onChange, close],
    );

    const applyHighlighted = useCallback(() => {
      const o = filteredItems[highlightIdx];
      if (!o || o.disabled) return;
      pickValue(o.value);
    }, [filteredItems, highlightIdx, pickValue]);

    const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
      if (open) {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          moveHighlight(1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          moveHighlight(-1);
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          applyHighlighted();
          return;
        }
        if (e.key === "Tab") {
          close();
          return;
        }
        return;
      }

      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (disabled) return;

      if (e.key === "Enter" && onEnterWhenClosed) {
        e.preventDefault();
        e.stopPropagation();
        onEnterWhenClosed();
        return;
      }

      if (
        e.key === "ArrowDown" ||
        e.key === "Enter" ||
        e.key === " " ||
        e.key === "Spacebar"
      ) {
        e.preventDefault();
        openPanel();
      }
    };

    const listboxMaxStyleMenuPortal = menuPortal
      ? portalBox
        ? { maxHeight: portalBox.maxListPx }
        : { maxHeight: 240 }
      : undefined;

    const searchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveHighlight(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveHighlight(-1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        applyHighlighted();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };

    const optionsListContent =
      filteredItems.length === 0 ? (
        <div className="px-[11px] py-2 text-xs text-text-muted">
          No options
        </div>
      ) : (
        filteredItems.map((opt, idx) => {
          const selected = selectValuesEqual(opt.value, value);
          const hl = idx === highlightIdx;
          return (
            <button
              key={opt.value}
              ref={(el) => {
                optionBtnRefs.current[idx] = el;
              }}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={opt.disabled}
              className={[
                "flex w-full cursor-pointer border-0 px-[11px] py-2 text-left text-xs font-body text-text outline-none transition-[background_0.1s]",
                menuGrowToFitContent
                  ? "items-start whitespace-normal break-words"
                  : "",
                opt.disabled
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-[color:color-mix(in_srgb,var(--color-primary)_10%,transparent)]",
                hl && !opt.disabled
                  ? "bg-[color:color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                  : "bg-transparent",
                selected ? "font-semibold" : "font-normal",
              ]
                .filter(Boolean)
                .join(" ")}
              onMouseEnter={() => setHighlightIdx(idx)}
              onClick={() => {
                if (opt.disabled) return;
                pickValue(opt.value);
              }}
            >
              {opt.optionContent ?? opt.label}
            </button>
          );
        })
      );

    const searchBar = searchEnabled && (
      <div className="border-b border-border p-1.5">
        <SearchInputBar
          ref={searchInputRef}
          embedded
          size="sm"
          wrapperClassName="w-full"
          fieldClassName="w-full"
          type="search"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={searchKeyDown}
          autoComplete="off"
          aria-label={searchPlaceholder}
          inputClassName="bg-surface-muted"
        />
      </div>
    );

    return (
      <div
        ref={wrapRef}
        className={["relative min-w-0", className].filter(Boolean).join(" ")}
      >
        {name ? (
          <input type="hidden" name={name} value={value} disabled={disabled} />
        ) : null}
        <button
          ref={setTriggerRef}
          type="button"
          id={id}
          disabled={disabled}
          data-tv-enter-field={dataTvEnterField ? "true" : undefined}
          className={[
            "field-comp--md cursor-pointer flex w-full min-w-0 items-center justify-between gap-1 text-left",
            open
              ? "border-primary shadow-[var(--shadow-focus-ring)]"
              : "",
            disabled ? "cursor-not-allowed opacity-50" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => (open ? close() : openPanel())}
          onKeyDown={handleTriggerKeyDown}
          onBlur={onBlur}
          onFocus={onFocus}
          {...buttonRest}
        >
          <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
          <Chevron open={open} />
        </button>

        {open && (menuInline || !menuPortal || portalBox) ? (
          menuInline ? (
            <div
              ref={panelRef}
              className={[
                "absolute left-0 top-full z-[100] mt-1 min-w-0 rounded-md border border-border bg-surface",
                "shadow-[0_8px_24px_color-mix(in_srgb,var(--color-text)_12%,transparent)]",
                menuGrowToFitContent ? "min-w-full w-max max-w-full" : "w-full",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {searchBar}
              <div
                id={listboxId}
                role="listbox"
                className="overflow-y-auto py-1"
                style={{ maxHeight: 240 }}
              >
                {optionsListContent}
              </div>
            </div>
          ) : menuPortal && portalBox ? (
            createPortal(
              <div
                ref={panelRef}
                className={[
                  "rounded-md border border-border bg-surface shadow-[0_8px_24px_color-mix(in_srgb,var(--color-text)_12%,transparent)]",
                  menuGrowToFitContent ? "" : "min-w-0",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  position: "fixed",
                  ...(portalBox.top != null ? { top: portalBox.top } : {}),
                  ...(portalBox.bottom != null
                    ? { bottom: portalBox.bottom }
                    : {}),
                  left: portalBox.left,
                  width: portalBox.width,
                  ...(portalBox.minWidth != null
                    ? { minWidth: portalBox.minWidth }
                    : {}),
                  ...(portalBox.maxWidth != null
                    ? { maxWidth: portalBox.maxWidth }
                    : {}),
                  zIndex: 700,
                }}
              >
                {searchBar}
                <div
                  id={listboxId}
                  role="listbox"
                  className="overflow-y-auto py-1"
                  style={listboxMaxStyleMenuPortal}
                >
                  {optionsListContent}
                </div>
              </div>,
              document.body,
            )
          ) : (
            createPortal(
              <div
                ref={panelRef}
                className={[
                  "z-[1000] rounded-md border border-border bg-surface shadow-[0_8px_24px_color-mix(in_srgb,var(--color-text)_12%,transparent)]",
                  menuGrowToFitContent ? "" : "min-w-0",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ position: "fixed", ...panelStyle }}
              >
                {searchBar}
                <div
                  id={listboxId}
                  role="listbox"
                  className="overflow-y-auto py-1"
                  style={{ maxHeight: panelStyle.maxHeight }}
                >
                  {optionsListContent}
                </div>
              </div>,
              document.body,
            )
          )
        ) : null}
      </div>
    );
  },
);
