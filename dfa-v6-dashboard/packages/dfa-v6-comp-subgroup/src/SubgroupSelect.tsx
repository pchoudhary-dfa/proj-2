"use client";

/**
 * Subgroup select UI (search, actions, list, summary).
 * Styling is token-driven via styles.css; uses design tokens from
 * packages/design-tokens/tokens.css when loaded by the app.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ListView,
  type ListViewApi,
  type ListViewItem,
} from "dfa-v6-comp-list-view";
import { DEFAULT_SUBGROUP_OPTIONS } from "./mock/subgroupData";

export type SubgroupItem = { id: string | number; label: string; nid?: number };

const REFERENCE_PATH_SUBGROUPS = "/subgroups";

/** In-memory cache for subgroup options per baseUrl (and locale) so reopening the modal does not refetch. */
const subgroupOptionsCache = new Map<string, SubgroupItem[]>();

function normalizeSubgroupItem(item: Record<string, unknown>): SubgroupItem {
  const nid = item.sg_nid as number | undefined;
  const id = (item.sg_gid as string) ?? (item.sg_nid as number) ?? item.id;
  const label = (item.sg_name as string) ?? (item.label as string) ?? (id != null ? String(id) : "");
  return {
    id: id as string | number,
    label: label || String(id),
    ...(nid != null ? { nid } : {}),
  };
}

export type SubgroupSelectApi = {
  getSelected(): SubgroupItem[];
  clear(): void;
  setSelectedIds(ids: (string | number)[]): void;
};

function resolveLocaleAcceptLanguage(locale: string | undefined): string {
  return locale ?? (typeof navigator !== "undefined" ? navigator.language : "en");
}

function referenceFetchHeaders(
  locale: string | undefined,
  headers?: Record<string, string>,
): Record<string, string> {
  const acceptLanguage = resolveLocaleAcceptLanguage(locale);
  if (headers) {
    return { ...headers, "Accept-Language": acceptLanguage };
  }
  return { "Accept-Language": acceptLanguage };
}

export type SubgroupSelectProps = {
  /** When provided without fetchOptions, options are fetched from baseUrl/subgroups and cached (reference mode). */
  baseUrl?: string;
  multiSelect?: boolean;
  /** Locale for `Accept-Language` on reference fetches (applied inside the component). */
  locale?: string;
  /** When proxy disabled: `buildHeaders()` from the app. Do not pass `acceptLanguage` — use `locale`. */
  headers?: Record<string, string>;
  /** When provided (array), these options are used and no API is called. When undefined, options are fetched from baseUrl/subgroups (or fetchOptions) as usual. Pass [] to show no options without calling the API. */
  preloadedSubgroupOptions?: SubgroupItem[];
  options?: SubgroupItem[];
  fetchOptions?: () => Promise<SubgroupItem[]>;
  initialSelectedIds?: (string | number)[];
  initialSelectedItems?: SubgroupItem[];
  onReady?: (api: SubgroupSelectApi) => void;
  onChange?: (selected: SubgroupItem[]) => void;
  /** Optional custom loading UI (e.g. brand loader). When not provided, shows text-only loading state. */
  loadingComponent?: ReactNode;
  strings?: {
    searchPlaceholder?: string;
    selectAll?: string;
    deselectAll?: string;
    loadingLabel?: string;
    emptyLabel?: string;
    summaryNone?: string;
    summaryOne?: string;
    summaryMany?: string;
    summarySelectedPanelTitle?: string;
    close?: string;
  };
};

const defaultStrings = {
  searchPlaceholder: "Search subgroups...",
  selectAll: "Select All",
  deselectAll: "Deselect All",
  loadingLabel: "Loading...",
  emptyLabel: "No subgroups match your search.",
  summaryNone: "No subgroups selected",
  summaryOne: "1 subgroup selected",
  summaryMany: "{n} subgroups selected",
  summarySelectedPanelTitle: "Selected subgroups",
  close: "Close",
};

export function SubgroupSelect({
  baseUrl,
  multiSelect = true,
  locale,
  headers: headersProp,
  preloadedSubgroupOptions,
  options: optionsProp,
  fetchOptions,
  initialSelectedIds = [],
  initialSelectedItems = [],
  onReady,
  onChange,
  loadingComponent,
  strings: stringsProp,
}: SubgroupSelectProps) {
  const usePreloadedData =
    preloadedSubgroupOptions !== undefined &&
    Array.isArray(preloadedSubgroupOptions);
  const isReferenceMode = Boolean(
    baseUrl && !fetchOptions && !usePreloadedData
  );
  const strings = { ...defaultStrings, ...stringsProp };
  const normalizeSelectedIds = useCallback(
    (ids: (string | number)[]) => {
      if (multiSelect) {
        return ids;
      }
      const lastSelectedId = ids.length > 0 ? ids[ids.length - 1] : undefined;
      return lastSelectedId == null ? [] : [lastSelectedId];
    },
    [multiSelect]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<(string | number)[]>(() =>
    normalizeSelectedIds(
      initialSelectedIds.length > 0
        ? initialSelectedIds
        : initialSelectedItems.map((i) => i.id)
    )
  );
  const [options, setOptions] = useState<SubgroupItem[]>(
    optionsProp ?? DEFAULT_SUBGROUP_OPTIONS
  );
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const optionsRef = useRef<SubgroupItem[]>(options);
  const selectedIdsRef = useRef<(string | number)[]>(selectedIds);
  const listRef = useRef<ListViewApi | null>(null);
  const [showSelectedPanel, setShowSelectedPanel] = useState(false);
  const [panelDraftItems, setPanelDraftItems] = useState<SubgroupItem[]>([]);
  const panelDraftItemsRef = useRef<SubgroupItem[]>([]);
  panelDraftItemsRef.current = panelDraftItems;
  const [panelAnimatedOpen, setPanelAnimatedOpen] = useState(false);

  optionsRef.current = options;
  selectedIdsRef.current = selectedIds;

  useEffect(() => {
    if (fetchOptions) {
      setOptionsError(null);
      setOptionsLoading(true);
      fetchOptions()
        .then((items) => {
          setOptions(Array.isArray(items) ? items : []);
        })
        .catch((err) => {
          setOptionsError(
            err instanceof Error ? err.message : "Failed to load subgroups"
          );
          setOptions(DEFAULT_SUBGROUP_OPTIONS);
        })
        .finally(() => {
          setOptionsLoading(false);
        });
      return;
    }
    if (usePreloadedData) {
      setOptions(preloadedSubgroupOptions);
      setOptionsLoading(false);
      setOptionsError(null);
      return;
    }
    if (isReferenceMode && baseUrl) {
      const base = baseUrl.replace(/\/$/, "");
      const acceptLanguage = resolveLocaleAcceptLanguage(locale);
      const cacheKey = `${base}|${acceptLanguage}`;
      const cached = subgroupOptionsCache.get(cacheKey);
      if (cached !== undefined) {
        setOptions(cached);
        setOptionsLoading(false);
        setOptionsError(null);
        return;
      }
      setOptionsError(null);
      setOptionsLoading(true);
      const url = `${base}${REFERENCE_PATH_SUBGROUPS}`;
      fetch(url, { headers: referenceFetchHeaders(locale, headersProp) })
        .then((res) => res.json())
        .then((json: unknown) => {
          const data = (
            json &&
            typeof json === "object" &&
            "data" in json &&
            Array.isArray((json as { data?: unknown }).data)
              ? (json as { data: Record<string, unknown>[] }).data
              : Array.isArray(json)
                ? json
                : []
          ) as Record<string, unknown>[];
          const items = data.map(normalizeSubgroupItem);
          subgroupOptionsCache.set(cacheKey, items);
          setOptions(items);
        })
        .catch((err) => {
          setOptionsError(
            err instanceof Error ? err.message : "Failed to load subgroups"
          );
          setOptions(DEFAULT_SUBGROUP_OPTIONS);
        })
        .finally(() => {
          setOptionsLoading(false);
        });
      return;
    }
    if (optionsProp !== undefined && optionsProp !== null) {
      setOptions(Array.isArray(optionsProp) ? optionsProp : []);
    } else {
      setOptions(DEFAULT_SUBGROUP_OPTIONS);
    }
  }, [
    fetchOptions,
    optionsProp,
    isReferenceMode,
    usePreloadedData,
    baseUrl,
    locale,
    preloadedSubgroupOptions,
  ]);

  // Stable key so effect does not run when parent passes new array ref with same contents (avoids max update depth).
  const rawInitialIds =
    initialSelectedIds.length > 0
      ? initialSelectedIds
      : initialSelectedItems.map((i) => i.id);
  const initialSelectionKey = rawInitialIds.map(String).sort().join(",");
  const optionsReadyKey = options.length > 0 ? "ready" : "empty";

  // Resolve initial selection so chip id (keywordId/nid) or label matches list option; checkbox shows checked
  useEffect(() => {
    const rawIds =
      initialSelectedIds.length > 0
        ? initialSelectedIds
        : initialSelectedItems.map((i) => i.id);
    if (options.length === 0) {
      setSelectedIds((prev) => {
        const next = normalizeSelectedIds(rawIds);
        if (
          prev.length !== next.length ||
          prev.some((id, i) => String(id) !== String(next[i]))
        )
          return next;
        return prev;
      });
      return;
    }
    const resolved = rawIds
      .map((idVal) => {
        const idStr = String(idVal);
        const initialItem = initialSelectedItems.find((i) => String(i.id) === idStr);
        let match = options.find(
          (o) =>
            String(o.id) === idStr ||
            String((o as SubgroupItem).nid) === idStr ||
            (o as SubgroupItem).nid === Number(idVal)
        );
        if (!match && initialItem?.label != null) {
          const wantLabel = initialItem.label.trim().toLowerCase();
          match = options.find(
            (o) => o.label?.trim().toLowerCase() === wantLabel
          );
        }
        return match != null ? match.id : null;
      })
      .filter((id): id is string | number => id != null);
    setSelectedIds((prev) => {
      const next = normalizeSelectedIds(resolved);
      if (
        prev.length !== next.length ||
        prev.some((id, i) => String(id) !== String(next[i]))
      )
        return next;
      return prev;
    });
  }, [optionsReadyKey, initialSelectionKey, options, normalizeSelectedIds]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase();
    return options.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        String(item.id).toLowerCase().includes(q)
    );
  }, [searchQuery, options]);

  const listViewItems: ListViewItem[] = useMemo(
    () => filteredItems.map((o) => ({ id: o.id, label: o.label })),
    [filteredItems]
  );

  const getSelected = useCallback((): SubgroupItem[] => {
    if (showSelectedPanel) {
      return panelDraftItemsRef.current.map((it) => ({
        id: it.id,
        label: it.label,
        ...(it.nid != null ? { nid: it.nid } : {}),
      }));
    }
    return optionsRef.current.filter((o) =>
      selectedIdsRef.current.some((id) => String(id) === String(o.id))
    );
  }, [showSelectedPanel]);

  const clear = useCallback(() => {
    setSelectedIds([]);
    listRef.current?.clearData();
    onChange?.([]);
  }, [onChange]);

  const setSelectedIdsHandler = useCallback(
    (ids: (string | number)[]) => {
      setSelectedIds(normalizeSelectedIds(ids));
    },
    [normalizeSelectedIds]
  );

  const apiRef = useRef<SubgroupSelectApi>({
    getSelected,
    clear,
    setSelectedIds: setSelectedIdsHandler,
  });
  apiRef.current.getSelected = getSelected;
  apiRef.current.clear = clear;
  apiRef.current.setSelectedIds = setSelectedIdsHandler;

  useEffect(() => {
    onReady?.(apiRef.current);
  }, [onReady]);

  const handleListReady = useCallback((api: ListViewApi) => {
    listRef.current = api;
  }, []);

  const handleSelectionChange = useCallback(
    (selected: ListViewItem[]) => {
      const nextSelected = multiSelect ? selected : selected.slice(-1);
      setSelectedIds(nextSelected.map((s) => s.id));
      onChange?.(nextSelected as SubgroupItem[]);
    },
    [multiSelect, onChange]
  );

  const applyDraftAndClose = useCallback(() => {
    handleSelectionChange(panelDraftItemsRef.current as ListViewItem[]);
    setShowSelectedPanel(false);
    setPanelAnimatedOpen(false);
  }, [handleSelectionChange]);

  const handleSummaryClick = useCallback(() => {
    const current = optionsRef.current.filter((o) =>
      selectedIdsRef.current.some((id) => String(id) === String(o.id))
    );
    panelDraftItemsRef.current = current;
    setPanelDraftItems(current);
    setShowSelectedPanel(true);
  }, []);

  useEffect(() => {
    if (showSelectedPanel) {
      setPanelAnimatedOpen(false);
      requestAnimationFrame(() => setPanelAnimatedOpen(true));
    } else {
      setPanelAnimatedOpen(false);
    }
  }, [showSelectedPanel]);

  useEffect(() => {
    if (selectedIds.length === 0 && showSelectedPanel) {
      setShowSelectedPanel(false);
      setPanelAnimatedOpen(false);
    }
  }, [selectedIds.length, showSelectedPanel]);

  useEffect(() => {
    if (!multiSelect && showSelectedPanel) {
      setShowSelectedPanel(false);
      setPanelAnimatedOpen(false);
    }
  }, [multiSelect, showSelectedPanel]);

  const handleSelectAll = useCallback(() => {
    const visibleIds = new Set(filteredItems.map((s) => s.id));
    setSelectedIds((prev) => {
      const prevSet = new Set(prev.map(String));
      visibleIds.forEach((id) => prevSet.add(String(id)));
      return [...prevSet];
    });
  }, [filteredItems]);

  const handleDeselectAll = useCallback(() => {
    if (filteredItems.length === 0) {
      setSelectedIds([]);
      return;
    }
    const visibleIds = new Set(filteredItems.map((s) => String(s.id)));
    setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(String(id))));
  }, [filteredItems]);

  const selectedCount = showSelectedPanel ? panelDraftItems.length : selectedIds.length;
  const summaryInner =
    selectedCount === 0 ? (
      <>{strings.summaryNone}</>
    ) : (
      <>
        <span className="dtk-sg-count">{selectedCount}</span>
        {" "}
        {selectedCount === 1 ? "subgroup" : "subgroups"} selected
      </>
    );

  return (
    <div className="dtk-sg-root">
      <div className="dtk-sg-main">
        <div className="dtk-sg-content">
          <div className="dtk-sg-search-wrap">
            <span className="dtk-sg-search-icon" aria-hidden />
            <input
              type="text"
              placeholder={strings.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="dtk-sg-search"
              aria-label={strings.searchPlaceholder}
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                className="dtk-sg-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                title="Clear"
              >
                ×
              </button>
            ) : null}
          </div>

          {multiSelect ? (
            <div className="dtk-sg-actions">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={optionsLoading}
                className="dtk-sg-action-btn"
              >
                {strings.selectAll}
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={optionsLoading}
                className="dtk-sg-action-btn"
              >
                {strings.deselectAll}
              </button>
            </div>
          ) : null}

          <div className="dtk-sg-list-wrap">
            {optionsLoading ? (
              loadingComponent ? (
                <div className="dtk-sg-loading-slot">{loadingComponent}</div>
              ) : (
                <div className="dtk-sg-empty dtk-sg-loading">{strings.loadingLabel}</div>
              )
            ) : optionsError ? (
              <div className="dtk-sg-error">{optionsError}</div>
            ) : listViewItems.length === 0 ? (
              <div className="dtk-sg-empty">{strings.emptyLabel}</div>
            ) : (
              <ListView
                items={listViewItems}
                multiSelect={multiSelect}
                selectedIds={selectedIds}
                onSelectionChange={handleSelectionChange}
                onReady={handleListReady}
              />
            )}
          </div>

          {multiSelect && showSelectedPanel && (
            <div
              className={`dtk-sg-selected-panel ${panelAnimatedOpen ? "dtk-sg-selected-panel-is-open" : ""}`}
              role="dialog"
              aria-label={strings.summarySelectedPanelTitle}
            >
              <div className="dtk-sg-selected-panel-header">
                <span className="dtk-sg-selected-panel-title">
                  {strings.summarySelectedPanelTitle}
                </span>
                <button
                  type="button"
                  className="dtk-sg-selected-panel-close"
                  onClick={applyDraftAndClose}
                  aria-label={strings.close}
                  title={strings.close}
                >
                  ×
                </button>
              </div>
              <div className="dtk-sg-selected-panel-list">
                {panelDraftItems.length === 0 ? (
                  <div className="dtk-sg-empty">{strings.summaryNone}</div>
                ) : (
                  <ListView
                    items={panelDraftItems}
                    multiSelect={multiSelect}
                    selectedIds={panelDraftItems.map((i) => i.id)}
                    onSelectionChange={(selected) => {
                      panelDraftItemsRef.current = selected as SubgroupItem[];
                      setPanelDraftItems(selected as SubgroupItem[]);
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div
          className={`dtk-sg-summary${multiSelect && selectedCount > 0 ? " dtk-sg-summary-clickable" : ""}`}
          onClick={multiSelect && selectedCount > 0 ? handleSummaryClick : undefined}
          role={multiSelect && selectedCount > 0 ? "button" : undefined}
          tabIndex={multiSelect && selectedCount > 0 ? 0 : undefined}
          aria-label={multiSelect && selectedCount > 0 ? strings.summarySelectedPanelTitle : undefined}
          onKeyDown={
            multiSelect && selectedCount > 0
              ? (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSummaryClick();
                  }
                }
              : undefined
          }
        >
          {summaryInner}
        </div>
      </div>
    </div>
  );
}
