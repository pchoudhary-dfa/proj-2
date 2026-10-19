"use client";

/**
 * Time period select UI (quick-select buttons, list, summary).
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
import { DEFAULT_TIME_PERIOD_YEARS } from "./mock/timePeriodData";

export type TimePeriodItem = { id: string | number; label: string; nid?: number };

const REFERENCE_PATH_TIME_PERIODS = "/time-periods";

/** In-memory cache for time period options per baseUrl and locale (reference mode). */
const timePeriodOptionsCache = new Map<string, TimePeriodItem[]>();

function normalizeTimePeriodItem(item: Record<string, unknown>): TimePeriodItem {
  const nid = item.tp_nid as number | undefined;
  const id = item.tp_nid ?? item.tp_timeperiod ?? item.id;
  const label = (item.tp_timeperiod ?? item.label ?? (id != null ? String(id) : "")) as string;
  return {
    id: id as string | number,
    label: label || String(id),
    ...(nid != null ? { nid } : {}),
  };
}

export type TimePeriodSelectApi = {
  getSelected(): TimePeriodItem[];
  clear(): void;
  setSelectedIds(ids: (string | number)[]): void;
};

function resolveLocaleAcceptLanguage(locale: string | undefined): string {
  return locale ?? (typeof navigator !== "undefined" ? navigator.language : "en");
}

/** Sets `Accept-Language` from `locale` and merges over optional app headers (auth, signing). */
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

export type TimePeriodSelectProps = {
  /** When provided without fetchOptions, options are fetched from baseUrl/time-periods and cached (reference mode). */
  baseUrl?: string;
  multiSelect?: boolean;
  /** Locale for `Accept-Language` on reference fetches (applied inside the component). */
  locale?: string;
  /**
   * When calling the API directly (proxy disabled), pass `buildHeaders()` from the app. Do not pass `acceptLanguage` — use `locale`.
   * When the proxy is enabled, omit — only Accept-Language is sent.
   */
  headers?: Record<string, string>;
  /**
   * When provided and non-empty, these items are used as the time period options and no API call is made
   * (e.g. time periods already present in chart/visualization data). When undefined, null, or empty,
   * options are loaded via options, fetchOptions, or baseUrl/time-periods as usual.
   */
  preloadedData?: TimePeriodItem[] | null;
  options?: TimePeriodItem[];
  fetchOptions?: () => Promise<TimePeriodItem[]>;
  initialSelectedIds?: (string | number)[];
  initialSelectedItems?: TimePeriodItem[];
  onReady?: (api: TimePeriodSelectApi) => void;
  onChange?: (selected: TimePeriodItem[]) => void;
  quickSelectCounts?: number[];
  /** Optional custom loading UI (e.g. brand loader). When not provided, shows text-only loading state. */
  loadingComponent?: ReactNode;
  strings?: {
    quickSelectLabel?: string;
    recent5?: string;
    recent10?: string;
    recent20?: string;
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
  quickSelectLabel: "Quick Select",
  recent5: "Recent 5",
  recent10: "Recent 10",
  recent20: "Recent 20",
  selectAll: "Select All",
  deselectAll: "Deselect All",
  loadingLabel: "Loading...",
  emptyLabel: "No time periods available.",
  summaryNone: "No years selected",
  summaryOne: "1 year selected",
  summaryMany: "{n} years selected",
  summarySelectedPanelTitle: "Selected time periods",
  close: "Close",
};

function getRecentItems(
  itemsNewestFirst: TimePeriodItem[],
  n: number
): TimePeriodItem[] {
  return itemsNewestFirst.slice(0, n);
}

const DEFAULT_QUICK_SELECT_COUNTS = [5, 10, 20];

export function TimePeriodSelect({
  baseUrl,
  multiSelect = true,
  locale,
  headers: headersProp,
  preloadedData,
  options: optionsProp,
  fetchOptions,
  initialSelectedIds = [],
  initialSelectedItems = [],
  onReady,
  onChange,
  quickSelectCounts = DEFAULT_QUICK_SELECT_COUNTS,
  loadingComponent,
  strings: stringsProp,
}: TimePeriodSelectProps) {
  const hasPreloadedData = Array.isArray(preloadedData) && preloadedData.length > 0;
  const isReferenceMode = Boolean(baseUrl && !fetchOptions && !hasPreloadedData);
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
  const [selectedIds, setSelectedIds] = useState<(string | number)[]>(() =>
    normalizeSelectedIds(
      initialSelectedIds.length > 0
        ? initialSelectedIds
        : initialSelectedItems.map((i) => i.id)
    )
  );
  const [options, setOptions] = useState<TimePeriodItem[]>(
    optionsProp ?? DEFAULT_TIME_PERIOD_YEARS
  );
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const optionsRef = useRef<TimePeriodItem[]>(options);
  const selectedIdsRef = useRef<(string | number)[]>(selectedIds);
  const listRef = useRef<ListViewApi | null>(null);
  const [showSelectedPanel, setShowSelectedPanel] = useState(false);
  const [panelDraftItems, setPanelDraftItems] = useState<TimePeriodItem[]>([]);
  const panelDraftItemsRef = useRef<TimePeriodItem[]>([]);
  panelDraftItemsRef.current = panelDraftItems;
  const [panelAnimatedOpen, setPanelAnimatedOpen] = useState(false);

  optionsRef.current = options;
  selectedIdsRef.current = selectedIds;

  /** Options displayed newest first (for time periods: 2026 → 1977). */
  const optionsNewestFirst = useMemo(() => [...options].reverse(), [options]);

  useEffect(() => {
    if (hasPreloadedData) {
      setOptions(preloadedData!);
      setOptionsLoading(false);
      setOptionsError(null);
      return;
    }
    if (fetchOptions) {
      setOptionsError(null);
      setOptionsLoading(true);
      fetchOptions()
        .then((items) => {
          setOptions(Array.isArray(items) ? items : []);
        })
        .catch((err) => {
          setOptionsError(
            err instanceof Error ? err.message : "Failed to load time periods"
          );
          setOptions(DEFAULT_TIME_PERIOD_YEARS);
        })
        .finally(() => {
          setOptionsLoading(false);
        });
      return;
    }
    if (isReferenceMode && baseUrl) {
      const base = baseUrl.replace(/\/$/, "");
      const acceptLanguage = resolveLocaleAcceptLanguage(locale);
      const cacheKey = `${base}|${acceptLanguage}`;
      const cached = timePeriodOptionsCache.get(cacheKey);
      if (cached !== undefined) {
        setOptions(cached);
        setOptionsLoading(false);
        setOptionsError(null);
        return;
      }
      setOptionsError(null);
      setOptionsLoading(true);
      fetch(`${base}${REFERENCE_PATH_TIME_PERIODS}`, {
        headers: referenceFetchHeaders(locale, headersProp),
      })
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
          const items = data.map(normalizeTimePeriodItem);
          timePeriodOptionsCache.set(cacheKey, items);
          setOptions(items);
        })
        .catch((err) => {
          setOptionsError(
            err instanceof Error ? err.message : "Failed to load time periods"
          );
          setOptions(DEFAULT_TIME_PERIOD_YEARS);
        })
        .finally(() => {
          setOptionsLoading(false);
        });
      return;
    }
    if (optionsProp !== undefined && optionsProp !== null) {
      setOptions(Array.isArray(optionsProp) ? optionsProp : []);
    } else {
      setOptions(DEFAULT_TIME_PERIOD_YEARS);
    }
  }, [hasPreloadedData, preloadedData, fetchOptions, optionsProp, isReferenceMode, baseUrl, locale]);

  // Stable key so effect does not run when parent passes new array ref with same contents (avoids max update depth).
  const rawInitialIds =
    initialSelectedIds.length > 0
      ? initialSelectedIds
      : initialSelectedItems.map((i) => i.id);
  const initialSelectionKey = rawInitialIds.map(String).sort().join(",");
  const optionsReadyKey = options.length > 0 ? "ready" : "empty";

  // Normalize initial selection to option ids; match by id, label (case-insensitive), or nid (chip keywordId)
  useEffect(() => {
    const fromItems =
      initialSelectedItems.length > 0
        ? initialSelectedItems
        : initialSelectedIds.map((id) => ({ id, label: String(id) }));
    if (fromItems.length === 0) {
      setSelectedIds((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    if (options.length === 0) {
      const rawIds = rawInitialIds;
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
    const normalized = fromItems
      .map((item) => {
        const wantLabel = item.label?.trim().toLowerCase();
        const option = options.find(
          (o) =>
            String(o.id) === String(item.id) ||
            (wantLabel != null && o.label?.trim().toLowerCase() === wantLabel) ||
            String((o as TimePeriodItem).nid) === String(item.id) ||
            (o as TimePeriodItem).nid === Number(item.id)
        );
        return option ? option.id : null;
      })
      .filter((id): id is string | number => id != null);
    setSelectedIds((prev) => {
      const next = normalizeSelectedIds(normalized);
      if (
        prev.length !== next.length ||
        prev.some((id, i) => String(id) !== String(next[i]))
      )
        return next;
      return prev;
    });
  }, [optionsReadyKey, initialSelectionKey, options, normalizeSelectedIds]);

  const getSelected = useCallback((): TimePeriodItem[] => {
    if (showSelectedPanel) {
      return panelDraftItemsRef.current.map((it) => ({
        id: it.id,
        label: it.label ?? String(it.id),
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

  const apiRef = useRef<TimePeriodSelectApi>({
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
      onChange?.(nextSelected as TimePeriodItem[]);
    },
    [multiSelect, onChange]
  );

  const applyDraftAndClose = useCallback(() => {
    handleSelectionChange(panelDraftItemsRef.current as ListViewItem[]);
    setShowSelectedPanel(false);
    setPanelAnimatedOpen(false);
  }, [handleSelectionChange]);

  const handleSummaryClick = useCallback(() => {
    const current = getSelected();
    panelDraftItemsRef.current = current;
    setPanelDraftItems(current);
    setShowSelectedPanel(true);
  }, [getSelected]);

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

  const handleQuickSelect = useCallback(
    (n: number) => {
      const recent = getRecentItems(optionsNewestFirst, n);
      setSelectedIds(normalizeSelectedIds(recent.map((item) => item.id)));
    },
    [optionsNewestFirst, normalizeSelectedIds]
  );

  const handleSelectAll = useCallback(() => {
    const visibleIds = new Set(optionsNewestFirst.map((s) => s.id));
    setSelectedIds((prev) => {
      const prevSet = new Set(prev.map(String));
      visibleIds.forEach((id) => prevSet.add(String(id)));
      return [...prevSet];
    });
  }, [optionsNewestFirst]);

  const handleDeselectAll = useCallback(() => {
    if (optionsNewestFirst.length === 0) {
      setSelectedIds([]);
      return;
    }
    const visibleIds = new Set(optionsNewestFirst.map((s) => String(s.id)));
    setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(String(id))));
  }, [optionsNewestFirst]);

  const listViewItems: ListViewItem[] = useMemo(
    () => optionsNewestFirst.map((o) => ({ id: o.id, label: o.label })),
    [optionsNewestFirst]
  );

  const activeQuickSelect = useMemo(() => {
    const idSet = new Set(selectedIds.map(String));
    for (const n of quickSelectCounts) {
      const recent = getRecentItems(optionsNewestFirst, n).map((i) =>
        String(i.id)
      );
      if (
        recent.length === selectedIds.length &&
        recent.every((id) => idSet.has(id))
      ) {
        return n;
      }
    }
    return null;
  }, [optionsNewestFirst, selectedIds, quickSelectCounts]);

  const summaryIds = useMemo(
    () =>
      showSelectedPanel
        ? panelDraftItems.map((i) => i.id)
        : selectedIds,
    [showSelectedPanel, panelDraftItems, selectedIds]
  );

  const selectedCount = summaryIds.length;

  const selectionSummaryText = useMemo(() => {
    if (summaryIds.length === 0) return null;
    const years = summaryIds
      .map((id) => {
        const byId = parseInt(String(id), 10);
        if (!Number.isNaN(byId)) return byId;
        return null;
      })
      .filter((y): y is number => y !== null);
    if (years.length === 0)
      return summaryIds.length === 1
        ? "1 year selected"
        : `${summaryIds.length} years selected`;
    const min = Math.min(...years);
    const max = Math.max(...years);
    if (min === max) return `1 year selected (${min})`;
    return `${summaryIds.length} years selected (${min} - ${max})`;
  }, [summaryIds]);

  const summaryEl =
    selectedCount === 0 ? (
      <>{strings.summaryNone}</>
    ) : selectionSummaryText ? (
      (() => {
        const m = selectionSummaryText.match(/^(\d+)(.*)$/);
        if (m) {
          return (
            <>
              <span className="dtk-tp-count">{m[1]}</span>
              {m[2]}
            </>
          );
        }
        return selectionSummaryText;
      })()
    ) : null;

  const quickSelectLabel = (n: number) => {
    if (n === 5) return strings.recent5;
    if (n === 10) return strings.recent10;
    if (n === 20) return strings.recent20;
    return `Recent ${n}`;
  };

  return (
    <div className="dtk-tp-root">
      <div className="dtk-tp-stack">
        {multiSelect ? (
          <div className="dtk-tp-quick-select">
            <p className="dtk-tp-quick-select-label">{strings.quickSelectLabel}</p>
            <div className="dtk-tp-quick-select-buttons">
              {quickSelectCounts.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleQuickSelect(n)}
                  disabled={optionsLoading}
                  className={`dtk-tp-quick-btn ${
                    activeQuickSelect === n ? "dtk-tp-quick-btn-active" : ""
                  }`}
                >
                  {quickSelectLabel(n)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {multiSelect ? (
          <div className="dtk-tp-actions">
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={optionsLoading}
              className="dtk-tp-action-btn"
            >
              {strings.selectAll}
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              disabled={optionsLoading}
              className="dtk-tp-action-btn"
            >
              {strings.deselectAll}
            </button>
          </div>
        ) : null}

        <div className="dtk-tp-content">
          <div className="dtk-tp-list-wrap">
            {optionsLoading ? (
              loadingComponent ? (
                <div className="dtk-tp-loading-slot">{loadingComponent}</div>
              ) : (
                <div className="dtk-tp-empty dtk-tp-loading">{strings.loadingLabel}</div>
              )
            ) : optionsError ? (
              <div className="dtk-tp-error">{optionsError}</div>
            ) : listViewItems.length === 0 ? (
              <div className="dtk-tp-empty">{strings.emptyLabel}</div>
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

          <div
            className={`dtk-tp-summary${multiSelect && selectedCount > 0 ? " dtk-tp-summary-clickable" : ""}`}
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
            {summaryEl}
          </div>
        </div>

        {multiSelect && showSelectedPanel ? (
          <div
            className={`dtk-tp-selected-panel ${panelAnimatedOpen ? "dtk-tp-selected-panel-is-open" : ""}`}
            role="dialog"
            aria-label={strings.summarySelectedPanelTitle}
          >
            <div className="dtk-tp-selected-panel-header">
              <span className="dtk-tp-selected-panel-title">
                {strings.summarySelectedPanelTitle}
              </span>
              <button
                type="button"
                className="dtk-tp-selected-panel-close"
                onClick={applyDraftAndClose}
                aria-label={strings.close}
                title={strings.close}
              >
                ×
              </button>
            </div>
            <div className="dtk-tp-selected-panel-list">
              {panelDraftItems.length === 0 ? (
                <div className="dtk-tp-empty">{strings.summaryNone}</div>
              ) : (
                <ListView
                  items={panelDraftItems as ListViewItem[]}
                  multiSelect={multiSelect}
                  selectedIds={panelDraftItems.map((i) => i.id)}
                  onSelectionChange={(selected) => {
                    const selectedIdSet = new Set(selected.map((s) => String(s.id)));
                    const filtered = panelDraftItemsRef.current.filter((item) =>
                      selectedIdSet.has(String(item.id))
                    );
                    panelDraftItemsRef.current = filtered;
                    setPanelDraftItems(filtered);
                  }}
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
