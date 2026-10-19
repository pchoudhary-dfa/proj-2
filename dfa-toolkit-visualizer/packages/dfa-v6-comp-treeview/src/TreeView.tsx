import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";

/**
 * Tree view UI (expandable rows, checkboxes, labels).
 * Styling is token-driven via styles.css; uses design tokens from
 * packages/design-tokens/tokens.css when loaded by the app.
 */

export type TreeNode = {
  id: string;
  label: string;
  type?: string;
  hasChildren?: boolean;
  path?: string;
  /** Count shown as a badge on the right when `enableCount` is true on the TreeView. */
  count?: number;
};

export type TreeViewApi = {
  getData(): TreeNode[];
  clearData(): void;
  expandAll(): void;
  collapseAll(): void;
  selectAll(): void;
  deselectAll(): void;
  /** Select all direct children of `parentId` (cached children only; no-op if not loaded). */
  selectChildrenOf(parentId: string): void;
  /** Deselect all direct children of `parentId` (cached children only; no-op if not loaded). */
  deselectChildrenOf(parentId: string): void;
};

export type TreeViewProps = {
  roots: TreeNode[];
  loadChildren?: (parentId: string) => Promise<TreeNode[]>;
  multiSelect?: boolean;
  selectedIds?: (string | number)[];
  /** IDs of nodes whose checkbox/radio should be rendered disabled (visible but not selectable). */
  disabledIds?: (string | number)[];
  onSelectionChange?: (selected: TreeNode[]) => void;
  onReady?: (api: TreeViewApi) => void;
  flatItems?: TreeNode[];
  /** Labels for per-parent "Select All" / "Deselect All" under expanded nodes (tree mode only). Defaults to "Select All" / "Deselect All". */
  childActionLabels?: { selectAll: string; deselectAll: string };
  /** When true, render `id` (e.g. area `ar_id`) in muted text before the primary `label` (name). */
  showIdAfterLabel?: boolean;
  /** When true, render `node.count` as a badge on the right side of each row. */
  enableCount?: boolean;
  /** When true, hides the checkbox/radio input. Selected rows are highlighted instead. */
  disableCheckbox?: boolean;
  /** Icon rendered before the label of every row. Applied uniformly to all nodes at all levels. */
  icon?: React.ReactNode;
};

function normalizeId(id: string | number): string {
  return String(id);
}

/** Every parent id that has `hasChildren` and a cache entry (tree is fully loaded under that node for expand-all). */
function collectExpandableParentIds(
  nodes: TreeNode[],
  cache: Map<string, TreeNode[]>
): Set<string> {
  const ids = new Set<string>();
  function walk(items: TreeNode[]) {
    for (const n of items) {
      if (n.hasChildren && cache.has(n.id)) ids.add(n.id);
      const children = cache.get(n.id);
      if (children?.length) walk(children);
    }
  }
  walk(nodes);
  return ids;
}

/** IDs for nodes currently visible in the tree (respects expand/collapse; does not include descendants of collapsed nodes). */
function collectVisibleIds(
  nodes: TreeNode[],
  expandedSet: Set<string>,
  childrenMap: Map<string, TreeNode[]>
): string[] {
  const ids: string[] = [];
  function walk(items: TreeNode[]) {
    for (const n of items) {
      ids.push(n.id);
      if (expandedSet.has(n.id)) {
        const children = childrenMap.get(n.id);
        if (children?.length) walk(children);
      }
    }
  }
  walk(nodes);
  return ids;
}

const DEFAULT_CHILD_ACTION_LABELS = { selectAll: "Select All", deselectAll: "Deselect All" };

export const TreeView = forwardRef<TreeViewApi, TreeViewProps>(function TreeView(
  {
    roots,
    loadChildren,
    multiSelect = true,
    selectedIds = [],
    disabledIds: disabledIdsProp,
    onSelectionChange,
    onReady,
    flatItems,
    childActionLabels: childActionLabelsProp,
    showIdAfterLabel = false,
    enableCount = false,
    disableCheckbox = false,
    icon,
  },
  ref
) {
  const disabledSet = useMemo(
    () => new Set((disabledIdsProp ?? []).map(normalizeId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [(disabledIdsProp ?? []).map(normalizeId).sort().join(",")]
  );
  const childActionLabels = useMemo(
    () => ({ ...DEFAULT_CHILD_ACTION_LABELS, ...childActionLabelsProp }),
    [childActionLabelsProp]
  );
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() =>
    new Set(selectedIds.map(normalizeId))
  );
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Map<string, TreeNode[]>>(new Map());
  const [loadingParents, setLoadingParents] = useState<Set<string>>(new Set());
  const idToNodeRef = useRef(new Map<string, TreeNode>());

  const isFlatMode = flatItems !== undefined && flatItems.length >= 0;

  const updateIdToNode = useCallback((nodes: TreeNode[], cache: Map<string, TreeNode[]>) => {
    const map = idToNodeRef.current;
    function add(n: TreeNode) {
      map.set(n.id, n);
    }
    nodes.forEach(add);
    cache.forEach((children) => children.forEach(add));
  }, []);

  useEffect(() => {
    updateIdToNode(roots, childrenCache);
    if (isFlatMode && flatItems) flatItems.forEach((n) => idToNodeRef.current.set(n.id, n));
  }, [roots, childrenCache, isFlatMode, flatItems, updateIdToNode]);

  const getData = useCallback((): TreeNode[] => {
    const map = idToNodeRef.current;
    return Array.from(selectedSet).map((id) => {
      const n = map.get(id);
      return n ?? { id, label: id, type: undefined, hasChildren: false };
    });
  }, [selectedSet]);

  const clearData = useCallback(() => {
    setSelectedSet(new Set());
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  const expandAll = useCallback(async () => {
    if (isFlatMode || !loadChildren) return;
    const nextCache = new Map(childrenCache);
    const queue: TreeNode[] = [...roots];
    while (queue.length > 0) {
      const n = queue.shift()!;
      if (n.hasChildren && !nextCache.has(n.id)) {
        try {
          const children = await loadChildren(n.id);
          nextCache.set(n.id, children);
        } catch {
          /* ignore load errors */
        }
      }
      const loaded = nextCache.get(n.id);
      if (loaded?.length) {
        for (const child of loaded) queue.push(child);
      }
    }
    const expandable = collectExpandableParentIds(roots, nextCache);
    setChildrenCache(nextCache);
    setExpandedSet(expandable);
  }, [isFlatMode, roots, childrenCache, loadChildren]);

  const collapseAll = useCallback(() => {
    setExpandedSet(new Set());
  }, []);

  const selectAll = useCallback(() => {
    if (isFlatMode) {
      const items = flatItems ?? [];
      if (items.length === 0) return;
      setSelectedSet((prev) => {
        const next = new Set(prev);
        items.forEach((n) => { if (!disabledSet.has(n.id)) next.add(n.id); });
        const map = idToNodeRef.current;
        const selected = Array.from(next).map(
          (i) => map.get(i) ?? { id: i, label: i, type: undefined, hasChildren: false }
        );
        queueMicrotask(() => onSelectionChange?.(selected));
        return next;
      });
      return;
    }
    setSelectedSet((prev) => {
      const visible = collectVisibleIds(roots, expandedSet, childrenCache);
      const next = new Set(prev);
      visible.forEach((id) => { if (!disabledSet.has(id)) next.add(id); });
      const map = idToNodeRef.current;
      const selected = Array.from(next).map(
        (i) => map.get(i) ?? { id: i, label: i, type: undefined, hasChildren: false }
      );
      queueMicrotask(() => onSelectionChange?.(selected));
      return next;
    });
  }, [isFlatMode, flatItems, roots, childrenCache, expandedSet, onSelectionChange, disabledSet]);

  const deselectAll = useCallback(() => {
    if (isFlatMode) {
      const items = flatItems ?? [];
      if (items.length === 0) return;
      setSelectedSet((prev) => {
        const next = new Set(prev);
        items.forEach((n) => { if (!disabledSet.has(n.id)) next.delete(n.id); });
        const map = idToNodeRef.current;
        const selected = Array.from(next).map(
          (i) => map.get(i) ?? { id: i, label: i, type: undefined, hasChildren: false }
        );
        queueMicrotask(() => onSelectionChange?.(selected));
        return next;
      });
      return;
    }
    setSelectedSet((prev) => {
      const visible = new Set(collectVisibleIds(roots, expandedSet, childrenCache));
      const next = new Set(prev);
      visible.forEach((id) => { if (!disabledSet.has(id)) next.delete(id); });
      const map = idToNodeRef.current;
      const selected = Array.from(next).map(
        (i) => map.get(i) ?? { id: i, label: i, type: undefined, hasChildren: false }
      );
      queueMicrotask(() => onSelectionChange?.(selected));
      return next;
    });
  }, [isFlatMode, flatItems, roots, childrenCache, expandedSet, onSelectionChange, disabledSet]);

  const handleSelectDirectChildren = useCallback(
    (parentId: string) => {
      const children = childrenCache.get(parentId);
      if (!children?.length) return;
      setSelectedSet((prev) => {
        const next = new Set(prev);
        children.forEach((c) => { if (!disabledSet.has(c.id)) next.add(c.id); });
        const map = idToNodeRef.current;
        const selected = Array.from(next).map(
          (i) => map.get(i) ?? { id: i, label: i, type: undefined, hasChildren: false }
        );
        queueMicrotask(() => onSelectionChange?.(selected));
        return next;
      });
    },
    [childrenCache, onSelectionChange, disabledSet]
  );

  const handleDeselectDirectChildren = useCallback(
    (parentId: string) => {
      const children = childrenCache.get(parentId);
      if (!children?.length) return;
      setSelectedSet((prev) => {
        const next = new Set(prev);
        children.forEach((c) => { if (!disabledSet.has(c.id)) next.delete(c.id); });
        const map = idToNodeRef.current;
        const selected = Array.from(next).map(
          (i) => map.get(i) ?? { id: i, label: i, type: undefined, hasChildren: false }
        );
        queueMicrotask(() => onSelectionChange?.(selected));
        return next;
      });
    },
    [childrenCache, onSelectionChange, disabledSet]
  );

  const selectChildrenOf = useCallback(
    (parentId: string) => handleSelectDirectChildren(parentId),
    [handleSelectDirectChildren]
  );
  const deselectChildrenOf = useCallback(
    (parentId: string) => handleDeselectDirectChildren(parentId),
    [handleDeselectDirectChildren]
  );

  const apiRef = useRef<TreeViewApi>({
    getData,
    clearData,
    expandAll,
    collapseAll,
    selectAll,
    deselectAll,
    selectChildrenOf,
    deselectChildrenOf,
  });
  apiRef.current.getData = getData;
  apiRef.current.clearData = clearData;
  apiRef.current.expandAll = expandAll;
  apiRef.current.collapseAll = collapseAll;
  apiRef.current.selectAll = selectAll;
  apiRef.current.deselectAll = deselectAll;
  apiRef.current.selectChildrenOf = selectChildrenOf;
  apiRef.current.deselectChildrenOf = deselectChildrenOf;

  useEffect(() => {
    onReady?.(apiRef.current);
  }, [onReady]);

  useImperativeHandle(ref, () => apiRef.current, []);

  // Sync from prop only when the set of ids changes (stable key avoids loop when parent passes new array ref each render)
  const selectedIdsKey = [...selectedIds].map(normalizeId).sort().join(",");
  useEffect(() => {
    const next = new Set(selectedIds.map(normalizeId));
    setSelectedSet((prev) => {
      if (prev.size !== next.size || [...prev].some((id) => !next.has(id))) return next;
      return prev;
    });
  }, [selectedIdsKey]);

  const handleToggleSelect = useCallback(
    (node: TreeNode, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const id = node.id;
      if (disabledSet.has(id)) return;
      setSelectedSet((prev) => {
        const next = new Set(prev);
        if (multiSelect) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else {
          next.clear();
          next.add(id);
        }
        const map = idToNodeRef.current;
        const selected = Array.from(next).map((i) => map.get(i) ?? { id: i, label: i, type: undefined, hasChildren: false });
        queueMicrotask(() => onSelectionChange?.(selected));
        return next;
      });
    },
    [multiSelect, onSelectionChange, disabledSet]
  );

  const handleExpand = useCallback(
    async (node: TreeNode) => {
      if (!loadChildren || !node.hasChildren) return;
      const id = node.id;
      if (childrenCache.has(id)) {
        setExpandedSet((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        return;
      }
      setLoadingParents((p) => new Set(p).add(id));
      try {
        const children = await loadChildren(id);
        setChildrenCache((c) => new Map(c).set(id, children));
        setExpandedSet((prev) => new Set(prev).add(id));
      } finally {
        setLoadingParents((p) => {
          const next = new Set(p);
          next.delete(id);
          return next;
        });
      }
    },
    [loadChildren, childrenCache]
  );

  const renderRow = useCallback(
    (node: TreeNode, depth: number, showPath: boolean) => {
      const id = node.id;
      const checked = selectedSet.has(id);
      const isDisabled = disabledSet.has(id);
      const hasChildren = node.hasChildren ?? false;
      const expanded = expandedSet.has(id);
      const isLoading = loadingParents.has(id);
      const showChevron = hasChildren && !isFlatMode;

      const basePaddingPx = 8;
      const rowPaddingLeft = basePaddingPx + (isFlatMode ? 0 : depth * 16);
      const rowAriaLabel =
        showIdAfterLabel ? `${node.label} (${node.id})` : node.label;

      const rowClassName = [
        "dtk-tv-row",
        isDisabled ? "dtk-tv-row-disabled" : "",
        // When disableCheckbox is on, suppress the full-row hover so only the content area highlights
        disableCheckbox ? "dtk-tv-row-no-hover" : "",
      ].filter(Boolean).join(" ");

      // When disableCheckbox is active, the content area (everything after the chevron)
      // receives the selection highlight so the chevron keeps its own independent hover.
      const contentClassName = [
        "dtk-tv-row-content",
        disableCheckbox && checked ? "dtk-tv-row-selected" : "",
      ].filter(Boolean).join(" ");

      const contentNode = (
        <>
          {!disableCheckbox && (
            multiSelect ? (
              <input
                type="checkbox"
                className="dtk-tv-checkbox"
                checked={checked}
                disabled={isDisabled}
                onChange={() => {}}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSelect(node, e);
                }}
                aria-label={rowAriaLabel}
              />
            ) : (
              <input
                type="radio"
                name="dtk-tv-radio"
                className="dtk-tv-checkbox"
                checked={checked}
                disabled={isDisabled}
                onChange={() => {}}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSelect(node, e);
                }}
                aria-label={rowAriaLabel}
              />
            )
          )}
          {icon && (
            <span className="dtk-tv-icon" aria-hidden>
              {icon}
            </span>
          )}
          <div
            className="dtk-tv-label-wrap"
            onClick={(e) => {
              e.stopPropagation();
              if (!isDisabled) handleToggleSelect(node, e);
            }}
          >
            {showIdAfterLabel ? (
              node.label !== node.id ? (
                <span className="dtk-tv-label-line">
                  
                  <span className="dtk-tv-label">{node.label}</span>
                  <span className="dtk-tv-node-id">({node.id})</span>
                </span>
              ) : (
                <span className="dtk-tv-label">{node.label}</span>
              )
            ) : (
              <span className="dtk-tv-label">{node.label}</span>
            )}
            {showPath && node.path && (
              <span className="dtk-tv-path">{node.path}</span>
            )}
          </div>
          {node.type && <span className="dtk-tv-type">{node.type}</span>}
          {enableCount && node.count !== undefined && (
            <span className="dtk-tv-count">{node.count}</span>
          )}
        </>
      );

      return (
        <React.Fragment key={id}>
          <div
            className={rowClassName}
            style={{
              paddingLeft: rowPaddingLeft + "px",
              // When disableCheckbox is on, the content div handles its own right padding
              paddingRight: disableCheckbox ? 0 : basePaddingPx + "px",
            }}
            onClick={() => showChevron && handleExpand(node)}
          >
            {!isFlatMode &&
              (showChevron ? (
                <span
                  className={`dtk-tv-chevron ${expanded ? "dtk-tv-chevron-open" : ""}`}
                  aria-hidden
                  aria-label={expanded ? "Collapse" : "Expand"}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExpand(node);
                  }}
                >
                  {expanded ? (
                    <svg className="dtk-tv-chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  ) : (
                    <svg className="dtk-tv-chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </span>
              ) : (
                <span className="dtk-tv-chevron-placeholder" aria-hidden />
              ))}
            {disableCheckbox ? (
              <div
                className={contentClassName}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isDisabled) handleToggleSelect(node, e);
                }}
              >
                {contentNode}
              </div>
            ) : (
              contentNode
            )}
          </div>
          {!isFlatMode &&
            multiSelect &&
            expanded &&
            (childrenCache.get(id)?.length ?? 0) > 0 && (
              <div
                className="dtk-tv-level-actions"
                style={{
                  paddingLeft: basePaddingPx + (depth + 1) * 16 + "px",
                  paddingRight: basePaddingPx + "px",
                }}
                onClick={(e) => e.stopPropagation()}
                role="group"
                aria-label={`${node.label}: child selection`}
              >
                <button
                  type="button"
                  className="dtk-tv-level-action-link"
                  onClick={() => handleSelectDirectChildren(id)}
                >
                  {childActionLabels.selectAll}
                </button>
                <button
                  type="button"
                  className="dtk-tv-level-action-link"
                  onClick={() => handleDeselectDirectChildren(id)}
                >
                  {childActionLabels.deselectAll}
                </button>
              </div>
            )}
          {!isFlatMode && expanded && childrenCache.get(id)?.map((child) => renderRow(child, depth + 1, false))}
        </React.Fragment>
      );
    },
    [
      selectedSet,
      expandedSet,
      childrenCache,
      loadingParents,
      isFlatMode,
      multiSelect,
      disabledSet,
      handleExpand,
      handleToggleSelect,
      childActionLabels,
      handleSelectDirectChildren,
      handleDeselectDirectChildren,
      showIdAfterLabel,
      enableCount,
      disableCheckbox,
      icon,
    ]
  );

  if (isFlatMode) {
    const items = flatItems ?? [];
    if (items.length === 0) {
      return (
        <div className="dtk-tv-root">
          <div className="dtk-tv-list">
            <div className="dtk-tv-empty">No items to display.</div>
          </div>
        </div>
      );
    }
    return (
      <div className="dtk-tv-root">
        <div className="dtk-tv-list">
          {items.map((node) => renderRow(node, 0, true))}
        </div>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <div className="dtk-tv-root">
        <div className="dtk-tv-list">
          <div className="dtk-tv-empty">No items to display.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dtk-tv-root">
      <div className="dtk-tv-list">
        {roots.map((node) => renderRow(node, 0, false))}
      </div>
    </div>
  );
});
