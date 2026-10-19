"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { SearchInputBar } from "@/components/SearchInputBar";
import { textFieldClassName } from "@/components/TextField";
import { useCore } from "@/contexts/CoreContext";
import { SecondaryButton } from "@/components/SecondaryButton";
import { PrimaryButton } from "@/components/PrimaryButton";

export type MultiSelectOption = {
  value: string;
  label: string;
};

export type HierarchicalMultiSelectNode = {
  id: string;
  label: string;
  children: HierarchicalMultiSelectNode[];
};

type MultiSelectDropdownProps = {
  /** When true, the list panel is shown */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: MultiSelectOption[];
  selectedValues: string[];
  onToggleValue: (value: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Shown in the trigger when nothing is selected */
  emptyLabel?: string;
  /** When false, hides the search field; keyboard nav still works from the trigger. Default true. */
  searchEnabled?: boolean;
  searchPlaceholder?: string;
  className?: string;
  /** Trigger button field sizing; grid add-rows should pass {@link gridTextFieldClassName} + flex layout. */
  triggerClassName?: string;
  disabled?: boolean;
  /** Optional summary for the trigger; default shows first label + count badge */
  renderTriggerSummary?: (selectedValues: string[], options: MultiSelectOption[]) => ReactNode;
  /** Passed to the trigger button for table keyboard navigation */
  triggerDataAttrs?: Record<string, string>;
  /**
   * When true, panel is portaled to `document.body` with fixed position (use inside overflow-hidden tables/modals).
   */
  menuPortal?: boolean;
  /**
   * When true, the portal panel expands to fit the widest option label (no horizontal scroll).
   * Default false (panel width matches the trigger button width).
   */
  autoWidth?: boolean;
  /** Max height of the scrollable options list in px. Default 320. */
  maxMenuHeight?: number;
  /** Which direction the panel opens. Default "bottom". */
  placement?: "bottom" | "top";
  /** Optional select-all row over currently visible options */
  showSelectAll?: boolean;
  selectAllLabel?: string;
  deselectAllLabel?: string;
  /**
   * Exclusive “All” checkbox above the option list. When its value is in
   * `selectedValues`, individual options render unchecked; selecting an
   * individual clears the all value (parent must update `selectedValues`).
   */
  exclusiveTopOption?: { value: string; label: string };
  /** Optional footer flow with selected count + Reset/OK actions */
  showFooterActions?: boolean;
  selectedCountLabel?: string;
  resetLabel?: string;
  applyLabel?: string;
  onReset?: () => void;
  onApply?: () => void;
  /** Enables tree-based indicator picker behavior */
  isHierarchical?: boolean;
  hierarchicalTree?: HierarchicalMultiSelectNode[];
  hierarchicalTreeLoading?: boolean;
  hierarchicalHeader?: ReactNode;
  hierarchicalRowsByNode?: Record<string, MultiSelectOption[]>;
  hierarchicalNodeLoading?: Record<string, boolean>;
  hierarchicalExpandedNodeIds?: Set<string>;
  onHierarchicalToggleExpand?: (node: HierarchicalMultiSelectNode) => void;
  onHierarchicalLoadNode?: (node: HierarchicalMultiSelectNode) => void;
  hierarchicalSearchQuery?: string;
  hierarchicalEmptyTreeLabel?: string;
  hierarchicalNoValuesLabel?: string;
  /** When false, selecting a tree node toggles only that node's own row values. */
  hierarchicalCascadeSelection?: boolean;
};

type HierarchicalVisibleItem =
  | {
      kind: "node";
      id: string;
      node: HierarchicalMultiSelectNode;
      depth: number;
      isExpanded: boolean;
      hasChildren: boolean;
      parentId?: string;
    }
  | {
      kind: "value";
      id: string;
      value: MultiSelectOption;
      depth: number;
      node: HierarchicalMultiSelectNode;
      parentId: string;
    };

const DEFAULT_MAX_MENU_HEIGHT = 320;
const MIN_LIST_HEIGHT = 80;

function Mi({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-icons ${className}`.trim()} aria-hidden>
      {name}
    </span>
  );
}

function defaultTriggerSummary(
  selectedValues: string[],
  options: MultiSelectOption[],
  emptyLabel: string
): ReactNode {
  if (selectedValues.length === 0) {
    return <span className="text-text-muted">{emptyLabel}</span>;
  }
  const first = options.find((o) => o.value === selectedValues[0]);
  const firstLabel = first?.label ?? selectedValues[0];
  return (
    <>
      <span className="truncate text-text">{firstLabel}</span>
      {selectedValues.length > 1 && (
        <span className="ml-1 inline-flex shrink-0 h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
          +{selectedValues.length - 1}
        </span>
      )}
    </>
  );
}

/**
 * Multi-select with optional search, keyboard navigation, and checkboxes.
 * Outside clicks close the panel via a document listener (no fullscreen overlay),
 * so mouse interaction works inside table/stacking contexts.
 */
export function MultiSelectDropdown({
  open,
  onOpenChange,
  options,
  selectedValues,
  onToggleValue,
  searchQuery,
  onSearchChange,
  emptyLabel,
  searchEnabled = true,
  searchPlaceholder,
  className = "",
  triggerClassName = `${textFieldClassName("sm")} flex h-8 items-center justify-between gap-1 px-2 text-xs`,
  disabled = false,
  renderTriggerSummary,
  triggerDataAttrs,
  menuPortal = false,
  autoWidth = false,
  maxMenuHeight = DEFAULT_MAX_MENU_HEIGHT,
  placement = "bottom",
  showSelectAll = false,
  selectAllLabel = "Select All",
  deselectAllLabel = "Deselect All",
  exclusiveTopOption,
  showFooterActions = false,
  selectedCountLabel,
  resetLabel = "Reset",
  applyLabel = "OK",
  onReset,
  onApply,
  isHierarchical = false,
  hierarchicalTree = [],
  hierarchicalTreeLoading = false,
  hierarchicalHeader,
  hierarchicalRowsByNode = {},
  hierarchicalNodeLoading = {},
  hierarchicalExpandedNodeIds = new Set<string>(),
  onHierarchicalToggleExpand,
  onHierarchicalLoadNode,
  hierarchicalSearchQuery = "",
  hierarchicalEmptyTreeLabel = "No classification tree for this type.",
  hierarchicalNoValuesLabel = "No values",
  hierarchicalCascadeSelection = true,
}: MultiSelectDropdownProps) {
  const { t } = useCore();
  const resolvedEmptyLabel = emptyLabel ?? `${t("SELECT", "Select")}...`;
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? `${t("SEARCH", "Search")}...`;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLLabelElement | null>>([]);
  const treeItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [treeHighlightIdx, setTreeHighlightIdx] = useState(0);
  const [portalBox, setPortalBox] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxWidth: number;
    maxListPx: number;
  } | null>(null);

  const visibleOptions = useMemo(() => {
    if (!searchEnabled || !searchQuery.trim()) return options;
    const q = searchQuery.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q)
    );
  }, [options, searchEnabled, searchQuery]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const exclusiveAllSelected = Boolean(
    exclusiveTopOption && selectedSet.has(exclusiveTopOption.value)
  );
  const allVisibleOptionsSelected = useMemo(
    () =>
      visibleOptions.length > 0 &&
      visibleOptions.every((opt) => selectedSet.has(opt.value)),
    [visibleOptions, selectedSet]
  );

  const listOptionCount =
    visibleOptions.length + (exclusiveTopOption ? 1 : 0);

  const toggleSelectAllVisible = useCallback(() => {
    if (visibleOptions.length === 0) return;
    if (allVisibleOptionsSelected) {
      for (const opt of visibleOptions) {
        if (selectedSet.has(opt.value)) onToggleValue(opt.value);
      }
      return;
    }
    for (const opt of visibleOptions) {
      if (!selectedSet.has(opt.value)) onToggleValue(opt.value);
    }
  }, [allVisibleOptionsSelected, onToggleValue, visibleOptions, selectedSet]);

  const clearSearch = useCallback(() => {
    if (searchEnabled && searchQuery) onSearchChange("");
  }, [onSearchChange, searchEnabled, searchQuery]);

  const close = useCallback(() => {
    clearSearch();
    onOpenChange(false);
    requestAnimationFrame(() => triggerButtonRef.current?.focus());
  }, [clearSearch, onOpenChange]);

  const handleReset = useCallback(
    (event?: ReactMouseEvent<HTMLButtonElement>) => {
      event?.preventDefault();
      event?.stopPropagation();
      if (onReset) {
        onReset();
        return;
      }
      for (const value of selectedValues) onToggleValue(value);
    },
    [onReset, onToggleValue, selectedValues]
  );

  const handleApply = useCallback(
    (event?: ReactMouseEvent<HTMLButtonElement>) => {
      event?.preventDefault();
      event?.stopPropagation();
      if (onApply) {
        onApply();
        return;
      }
      close();
    },
    [close, onApply]
  );

  const openPanel = useCallback(() => {
    if (disabled) return;
    onOpenChange(true);
    requestAnimationFrame(() => {
      if (isHierarchical || searchEnabled) searchInputRef.current?.focus();
    });
  }, [disabled, isHierarchical, onOpenChange, searchEnabled]);

  useLayoutEffect(() => {
    if (!open || !menuPortal) {
      setPortalBox(null);
      return;
    }
    const el = triggerButtonRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const gap = 4;
      const reserveSearch = searchEnabled ? 52 : 0;
      const baseWidth = Math.max(r.width, 180);
      const maxWidth = Math.max(baseWidth, window.innerWidth - r.left - 8);
      if (placement === "top") {
        const maxListPx = Math.max(
          MIN_LIST_HEIGHT,
          Math.min(maxMenuHeight, r.top - gap - reserveSearch - 12)
        );
        setPortalBox({ bottom: window.innerHeight - r.top + gap, left: r.left, width: baseWidth, maxWidth, maxListPx });
      } else {
        const top = r.bottom + gap;
        const maxListPx = Math.max(
          MIN_LIST_HEIGHT,
          Math.min(maxMenuHeight, window.innerHeight - top - reserveSearch - 12)
        );
        setPortalBox({ top, left: r.left, width: baseWidth, maxWidth, maxListPx });
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
  }, [open, menuPortal, searchEnabled, placement, maxMenuHeight]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuPortal && panelRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, close, menuPortal]);

  useEffect(() => {
    if (open || !searchEnabled || !searchQuery) return;
    onSearchChange("");
  }, [open, onSearchChange, searchEnabled, searchQuery]);

  useEffect(() => {
    if (!open) return;
    setHighlightIdx(0);
    setTreeHighlightIdx(0);
    requestAnimationFrame(() => {
      if (isHierarchical || searchEnabled) searchInputRef.current?.focus();
    });
  }, [isHierarchical, open, searchEnabled]);

  useEffect(() => {
    if (isHierarchical) return;
    if (!open) return;
    if (listOptionCount === 0) {
      setHighlightIdx(0);
      return;
    }
    setHighlightIdx((idx) => Math.max(0, Math.min(idx, listOptionCount - 1)));
  }, [isHierarchical, open, listOptionCount]);

  useEffect(() => {
    if (isHierarchical) return;
    if (!open) return;
    const el = optionRefs.current[highlightIdx];
    el?.scrollIntoView({ block: "nearest" });
  }, [isHierarchical, open, highlightIdx]);

  useEffect(() => {
    if (!isHierarchical || !open) return;
    const el = treeItemRefs.current[treeHighlightIdx];
    el?.scrollIntoView({ block: "nearest" });
  }, [isHierarchical, open, treeHighlightIdx]);

  const moveHighlight = useCallback(
    (direction: 1 | -1) => {
      if (listOptionCount === 0) return;
      setHighlightIdx((idx) => {
        const next = idx + direction;
        if (next < 0) return listOptionCount - 1;
        if (next >= listOptionCount) return 0;
        return next;
      });
    },
    [listOptionCount]
  );

  const toggleHighlightedValue = useCallback(() => {
    if (!open || listOptionCount === 0) return;
    if (exclusiveTopOption && highlightIdx === 0) {
      onToggleValue(exclusiveTopOption.value);
      return;
    }
    const optIdx = exclusiveTopOption ? highlightIdx - 1 : highlightIdx;
    const current = visibleOptions[optIdx];
    if (!current) return;
    onToggleValue(current.value);
  }, [
    exclusiveTopOption,
    highlightIdx,
    listOptionCount,
    onToggleValue,
    open,
    visibleOptions,
  ]);

  const triggerSummary = useMemo(() => {
    if (renderTriggerSummary) {
      return renderTriggerSummary(selectedValues, options);
    }
    if (exclusiveAllSelected && exclusiveTopOption) {
      return <span className="text-text">{exclusiveTopOption.label}</span>;
    }
    return defaultTriggerSummary(selectedValues, options, resolvedEmptyLabel);
  }, [
    renderTriggerSummary,
    selectedValues,
    options,
    resolvedEmptyLabel,
    exclusiveAllSelected,
    exclusiveTopOption,
  ]);

  const searchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      toggleHighlightedValue();
      return;
    }
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      close();
    }
  };

  const listSection = (
    <div
      className={`list-pick-options overflow-y-auto px-1 pb-1 ${searchEnabled ? "" : "pt-1"}`.trim()}
      style={
        menuPortal && portalBox
          ? { maxHeight: portalBox.maxListPx }
          : { maxHeight: maxMenuHeight }
      }
    >
      {exclusiveTopOption ? (
        <label
          ref={(el) => {
            optionRefs.current[0] = el;
          }}
          className={`list-pick-option list-pick-option--all flex cursor-pointer items-center gap-2 border-b border-border px-2 py-1.5 text-xs font-medium ${
            highlightIdx === 0
              ? "bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
              : "hover:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
          }`}
          onMouseEnter={() => setHighlightIdx(0)}
        >
          <input
            type="checkbox"
            className="checkbox-comp"
            checked={exclusiveAllSelected}
            onChange={() => onToggleValue(exclusiveTopOption.value)}
          />
          <span className={`text-text${autoWidth ? " whitespace-nowrap" : ""}`}>{exclusiveTopOption.label}</span>
        </label>
      ) : null}
      {visibleOptions.length === 0 && !exclusiveTopOption ? (
        <div className="px-2 py-2 text-xs text-text-muted">No values</div>
      ) : visibleOptions.length === 0 ? null : (
        visibleOptions.map((opt, idx) => {
          const listIdx = exclusiveTopOption ? idx + 1 : idx;
          const selected =
            !exclusiveAllSelected && selectedValues.includes(opt.value);
          return (
            <label
              ref={(el) => {
                optionRefs.current[listIdx] = el;
              }}
              key={opt.value}
              className={`list-pick-option flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs ${
                listIdx === highlightIdx
                  ? "bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
                  : "hover:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
              }`}
              onMouseEnter={() => setHighlightIdx(listIdx)}
            >
              <input
                type="checkbox"
                className="checkbox-comp"
                checked={selected}
                onChange={() => onToggleValue(opt.value)}
              />
              <span className={`text-text${autoWidth ? " whitespace-nowrap" : ""}`}>{opt.label}</span>
            </label>
          );
        })
      )}
    </div>
  );

  const searchSection =
    searchEnabled && (
      <div className="list-pick-search p-1.5">
        <SearchInputBar
          ref={searchInputRef}
          embedded
          size="sm"
          wrapperClassName="w-full"
          fieldClassName="w-full"
          placeholder={resolvedSearchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={searchKeyDown}
          autoFocus
          aria-label={resolvedSearchPlaceholder}
          inputClassName="bg-surface-muted"
        />
      </div>
    );

  const hierarchicalSearchNeedle = useMemo(
    () => hierarchicalSearchQuery.trim().toLowerCase(),
    [hierarchicalSearchQuery]
  );

  const hierarchicalRowVisible = useCallback(
    (row: MultiSelectOption) => {
      if (!hierarchicalSearchNeedle) return true;
      return (
        row.label.toLowerCase().includes(hierarchicalSearchNeedle) ||
        row.value.toLowerCase().includes(hierarchicalSearchNeedle)
      );
    },
    [hierarchicalSearchNeedle]
  );

  const collectBranchValues = useCallback(
    (node: HierarchicalMultiSelectNode): string[] => {
      const out = new Set<string>();
      const visit = (current: HierarchicalMultiSelectNode) => {
        for (const row of hierarchicalRowsByNode[current.id] ?? []) out.add(row.value);
        for (const child of current.children ?? []) visit(child);
      };
      visit(node);
      return Array.from(out);
    },
    [hierarchicalRowsByNode]
  );

  const hierarchicalVisibleItems = useMemo(() => {
    const out: HierarchicalVisibleItem[] = [];
    const walk = (nodes: HierarchicalMultiSelectNode[], depth: number, parentId?: string): boolean => {
      let anyVisible = false;
      for (const node of nodes) {
        const rows = hierarchicalRowsByNode[node.id] ?? [];
        const visibleRows = rows.filter(hierarchicalRowVisible);
        const hasChildren = node.children.length > 0;
        const isExpanded = hierarchicalExpandedNodeIds.has(node.id);

        const childVisibleStart = out.length;
        const childAnyVisible = hasChildren ? walk(node.children, depth + 1, node.id) : false;
        const childEntries = out.splice(childVisibleStart);

        const shouldShow =
          !hierarchicalSearchNeedle ||
          node.label.toLowerCase().includes(hierarchicalSearchNeedle) ||
          visibleRows.length > 0 ||
          childAnyVisible;
        if (!shouldShow) {
          continue;
        }
        anyVisible = true;

        out.push({
          kind: "node",
          id: `node-${node.id}`,
          node,
          depth,
          isExpanded,
          hasChildren,
          parentId,
        });

        if (isExpanded) {
          if (!hasChildren) {
            for (const row of visibleRows) {
              out.push({
                kind: "value",
                id: `value-${node.id}-${row.value}`,
                value: row,
                depth: depth + 1,
                node,
                parentId: node.id,
              });
            }
          }
          out.push(...childEntries);
        }
      }
      return anyVisible;
    };
    walk(hierarchicalTree, 0);
    return out;
  }, [
    hierarchicalExpandedNodeIds,
    hierarchicalRowVisible,
    hierarchicalRowsByNode,
    hierarchicalSearchNeedle,
    hierarchicalTree,
  ]);

  useEffect(() => {
    if (!isHierarchical || !open) return;
    if (hierarchicalVisibleItems.length === 0) {
      setTreeHighlightIdx(0);
      return;
    }
    setTreeHighlightIdx((idx) => Math.max(0, Math.min(idx, hierarchicalVisibleItems.length - 1)));
  }, [hierarchicalVisibleItems.length, isHierarchical, open]);

  const hierarchicalNodeParentById = useMemo(() => {
    const parentById = new Map<string, string>();
    const walk = (nodes: HierarchicalMultiSelectNode[], parentId?: string) => {
      for (const node of nodes) {
        if (parentId) parentById.set(node.id, parentId);
        if (node.children.length > 0) walk(node.children, node.id);
      }
    };
    walk(hierarchicalTree);
    return parentById;
  }, [hierarchicalTree]);

  const moveTreeHighlight = useCallback(
    (direction: 1 | -1) => {
      if (hierarchicalVisibleItems.length === 0) return;
      setTreeHighlightIdx((idx) => {
        const next = idx + direction;
        if (next < 0) return hierarchicalVisibleItems.length - 1;
        if (next >= hierarchicalVisibleItems.length) return 0;
        return next;
      });
    },
    [hierarchicalVisibleItems.length]
  );

  const toggleHighlightedTreeValue = useCallback(() => {
    const current = hierarchicalVisibleItems[treeHighlightIdx];
    if (!current) return;
    if (current.kind === "value") {
      onToggleValue(current.value.value);
      return;
    }
    const branchValues = hierarchicalCascadeSelection
      ? collectBranchValues(current.node)
      : (hierarchicalRowsByNode[current.node.id] ?? []).map((row) => row.value);
    if (branchValues.length === 0) return;
    const allSelected = branchValues.every((v) => selectedSet.has(v));
    for (const value of branchValues) {
      if (allSelected && selectedSet.has(value)) onToggleValue(value);
      if (!allSelected && !selectedSet.has(value)) onToggleValue(value);
    }
  }, [
    collectBranchValues,
    hierarchicalCascadeSelection,
    hierarchicalRowsByNode,
    hierarchicalVisibleItems,
    onToggleValue,
    selectedSet,
    treeHighlightIdx,
  ]);

  const handleTreeArrowRight = useCallback(() => {
    const current = hierarchicalVisibleItems[treeHighlightIdx];
    if (!current || current.kind !== "node") return;
    if (!current.isExpanded) {
      onHierarchicalToggleExpand?.(current.node);
      onHierarchicalLoadNode?.(current.node);
      return;
    }
    moveTreeHighlight(1);
  }, [
    hierarchicalVisibleItems,
    moveTreeHighlight,
    onHierarchicalLoadNode,
    onHierarchicalToggleExpand,
    treeHighlightIdx,
  ]);

  const handleTreeArrowLeft = useCallback(() => {
    const current = hierarchicalVisibleItems[treeHighlightIdx];
    if (!current) return;
    if (current.kind === "node" && current.isExpanded) {
      onHierarchicalToggleExpand?.(current.node);
      return;
    }
    const parentId =
      current.kind === "node" ? hierarchicalNodeParentById.get(current.node.id) : current.parentId;
    if (!parentId) return;
    const parentIndex = hierarchicalVisibleItems.findIndex(
      (item) => item.kind === "node" && item.node.id === parentId
    );
    if (parentIndex >= 0) setTreeHighlightIdx(parentIndex);
  }, [hierarchicalNodeParentById, hierarchicalVisibleItems, onHierarchicalToggleExpand, treeHighlightIdx]);

  const selectAllSection =
    showSelectAll && visibleOptions.length > 0 ? (
      <div className="border-b border-border px-2 py-1.5">
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={toggleSelectAllVisible}
        >
          {allVisibleOptionsSelected ? deselectAllLabel : selectAllLabel}
        </button>
      </div>
    ) : null;

  const footerSection = showFooterActions ? (
    <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-2">
      <span className="text-xs text-text-muted">
        {selectedCountLabel ?? `${selectedValues.length} selected`}
      </span>
      <div className="flex items-center gap-2">
        <SecondaryButton type="button" onClick={handleReset}>
          {resetLabel}
        </SecondaryButton>
        <PrimaryButton type="button" onClick={handleApply}>
          {applyLabel}
        </PrimaryButton>
      </div>
    </div>
  ) : null;

  const hierarchicalSection = (
    <>
      {hierarchicalHeader ? <div className="mb-1 p-2">{hierarchicalHeader}</div> : null}
      <div className="max-h-[320px] overflow-y-auto border-y border-border px-2 py-1" role="tree">
        {hierarchicalTreeLoading ? (
          <div className="px-2 py-3 text-xs text-text-muted">{t("LOADING", "Loading...")}</div>
        ) : hierarchicalVisibleItems.length === 0 ? (
          <div className="px-2 py-3 text-xs text-text-muted">{hierarchicalEmptyTreeLabel}</div>
        ) : (
          hierarchicalVisibleItems.map((item, idx) => {
            if (item.kind === "value") {
              const isSelected = selectedSet.has(item.value.value);
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    treeItemRefs.current[idx] = el;
                  }}
                  type="button"
                  role="treeitem"
                  aria-selected={isSelected}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${
                    idx === treeHighlightIdx
                      ? "bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
                      : "hover:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
                  }`}
                  style={{ paddingLeft: item.depth * 12 + 8 }}
                  onMouseEnter={() => setTreeHighlightIdx(idx)}
                  onClick={() => onToggleValue(item.value.value)}
                >
                  <input type="checkbox" className="checkbox-comp" checked={isSelected} readOnly />
                  <span className="text-text">{item.value.label}</span>
                </button>
              );
            }

            const branchValues = hierarchicalCascadeSelection
              ? collectBranchValues(item.node)
              : (hierarchicalRowsByNode[item.node.id] ?? []).map((row) => row.value);
            const selectedInBranch = branchValues.filter((gid) => selectedSet.has(gid)).length;
            const branchAllSelected = branchValues.length > 0 && selectedInBranch === branchValues.length;
            const branchPartlySelected =
              selectedInBranch > 0 && selectedInBranch < branchValues.length;
            const nodeLoading = hierarchicalNodeLoading[item.node.id] === true;

            return (
              <div key={item.id} className="py-0.5">
                <button
                  ref={(el) => {
                    treeItemRefs.current[idx] = el;
                  }}
                  type="button"
                  role="treeitem"
                  aria-expanded={item.hasChildren ? item.isExpanded : undefined}
                  aria-selected={branchAllSelected}
                  className={`flex w-full items-center gap-1 rounded px-1 py-1 text-left text-xs ${
                    idx === treeHighlightIdx
                      ? "bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
                      : "hover:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
                  }`}
                  style={{ paddingLeft: item.depth * 12 + 4 }}
                  onMouseEnter={() => setTreeHighlightIdx(idx)}
                  onClick={() => {
                    const valuesToToggle = hierarchicalCascadeSelection
                      ? branchValues
                      : (hierarchicalRowsByNode[item.node.id] ?? []).map((row) => row.value);
                    const allSelected = valuesToToggle.every((value) => selectedSet.has(value));
                    for (const value of valuesToToggle) {
                      if (allSelected && selectedSet.has(value)) onToggleValue(value);
                      if (!allSelected && !selectedSet.has(value)) onToggleValue(value);
                    }
                  }}
                >
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded text-text-muted hover:bg-surface"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onHierarchicalToggleExpand?.(item.node);
                      onHierarchicalLoadNode?.(item.node);
                    }}
                  >
                    <Mi
                      name={item.isExpanded ? "expand_more" : "chevron_right"}
                      className="!text-sm"
                    />
                  </span>
                  <input
                    type="checkbox"
                    className="checkbox-comp"
                    checked={branchAllSelected}
                    disabled={branchValues.length === 0}
                    ref={(el) => {
                      if (el) el.indeterminate = branchPartlySelected;
                    }}
                    readOnly
                  />
                  <span className="text-text">{item.node.label}</span>
                  {nodeLoading ? (
                    <span className="ml-auto text-xs text-text-muted">
                      {t("LOADING", "Loading...")}
                    </span>
                  ) : null}
                </button>
                {item.isExpanded &&
                !item.hasChildren &&
                Object.prototype.hasOwnProperty.call(hierarchicalRowsByNode, item.node.id) &&
                (hierarchicalRowsByNode[item.node.id] ?? []).filter(hierarchicalRowVisible).length === 0 ? (
                  <p className="px-2 py-1 text-xs text-text-muted" style={{ paddingLeft: item.depth * 12 + 20 }}>
                    {hierarchicalNoValuesLabel}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </>
  );

  const panelClass =
    "list-pick-panel rounded-md border border-border bg-surface shadow-lg";

  const panelInner = (
    <>
      {isHierarchical ? (
        hierarchicalSection
      ) : (
        <>
          {searchSection}
          {selectAllSection}
          {listSection}
        </>
      )}
      {footerSection}
    </>
  );

  return (
    <div ref={wrapRef} className={`relative min-w-0 w-full list-pick-wrap ${className}`.trim()}>
      <button
        ref={triggerButtonRef}
        type="button"
        disabled={disabled}
        className={`list-pick-trigger ${triggerClassName} transition-colors ${
          disabled
            ? "cursor-not-allowed border-border bg-surface-muted text-text-muted opacity-70"
            : open
              ? "border-primary bg-surface shadow-[var(--shadow-focus-ring)]"
              : "border-border bg-surface hover:border-[color:color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]"
        }`}
        {...triggerDataAttrs}
        onClick={() => {
          if (disabled) return;
          if (open) close();
          else openPanel();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            if (!open) {
              openPanel();
              return;
            }
            if (isHierarchical) toggleHighlightedTreeValue();
            else toggleHighlightedValue();
            return;
          }
          if (e.key === "ArrowDown") {
            if (!open) return;
            e.preventDefault();
            if (isHierarchical) moveTreeHighlight(1);
            else moveHighlight(1);
            return;
          }
          if (e.key === "ArrowUp") {
            if (!open) return;
            e.preventDefault();
            if (isHierarchical) moveTreeHighlight(-1);
            else moveHighlight(-1);
            return;
          }
          if (isHierarchical && e.key === "ArrowRight") {
            if (!open) return;
            e.preventDefault();
            handleTreeArrowRight();
            return;
          }
          if (isHierarchical && e.key === "ArrowLeft") {
            if (!open) return;
            e.preventDefault();
            handleTreeArrowLeft();
            return;
          }
          if (e.key === "Escape" && open) {
            e.preventDefault();
            close();
          }
        }}
      >
        <span className="flex min-w-0 flex-1 items-center overflow-hidden text-xs">{triggerSummary}</span>
        <Mi name="expand_more" className="!text-sm shrink-0 text-text-muted" />
      </button>

      {open &&
        (!menuPortal || portalBox) &&
        (menuPortal && portalBox ? (
          createPortal(
            <div
              ref={panelRef}
              className={panelClass}
              style={{
                position: "fixed",
                ...(portalBox.top !== undefined ? { top: portalBox.top } : {}),
                ...(portalBox.bottom !== undefined ? { bottom: portalBox.bottom } : {}),
                left: portalBox.left,
                ...(autoWidth
                  ? { minWidth: portalBox.width, width: "max-content", maxWidth: portalBox.maxWidth }
                  : { width: portalBox.width }),
                zIndex: 700,
              }}
            >
              {panelInner}
            </div>,
            document.body
          )
        ) : (
          <div
            ref={panelRef}
            className={`${panelClass} absolute left-0 z-[80] min-w-[180px] ${placement === "top" ? "bottom-full mb-0.5" : "top-full mt-0.5"}`}
          >
            {panelInner}
          </div>
        ))}
    </div>
  );
}
