"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCore } from "@/contexts/CoreContext";
import type { Locale } from "@/lib/i18n/config";
import { ROUTES } from "@/lib/constants";
import {
  clearVizSearchHandoffFromSession,
  setVizSearchHandoffToSession,
} from "@/lib/visualizer/sessionAdapter";
import { getReferenceApiClientBaseUrl } from "@/lib/appConfig/utils";
import { getSharedCustomTooltip } from "@/components/CustomTooltip";
import { Loader } from "@/components/Loader";
import { useSignedFetchHeaders } from "@/hooks/useSignedFetchHeaders";
import { SEARCH_PATH_SEGMENT } from "@/lib/constants";
import type { ChipSearchStyle } from "dfa-v6-comp-kw-search";

// Dynamic import so the server never loads dfa-v6-comp-kw-search (avoids "handler is not a function")
async function loadCreateChipSearch(): Promise<
  (el: HTMLElement, options: Parameters<typeof import("dfa-v6-comp-kw-search").createChipSearch>[1]) => { destroy(): void }
> {
  const mod = await import("dfa-v6-comp-kw-search");
  await import("dfa-v6-comp-kw-search/style.css");
  return mod.createChipSearch;
}

type Keyword = {
  keywordId: number | string;
  keywordType: string;
  displayText: string;
};

export type ChipSearchDetail = { chips: Keyword[]; payload: unknown };

type VendorInstance = {
  destroy: () => void;
  setChips?: (chips: Keyword[]) => void;
};

declare global {
  interface Window {
    __originalFetch?: typeof fetch;
  }
}

/**
 * Installs a fetch interceptor for the search API.
 * Returns filtered mock data from SearchComponentMockData.json based on the search query.
 */
function installFetchInterceptor(
  apiUrlPattern: string,
  mockSuggestions: Keyword[],
): () => void {
  if (typeof window === "undefined" || window.__originalFetch) return () => { };

  const originalFetch = window.fetch;
  window.__originalFetch = originalFetch;

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (!url.startsWith(apiUrlPattern)) {
      return originalFetch(input, init);
    }

    const searchParams = new URL(url).searchParams;
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const results = q
      ? mockSuggestions.filter((item) =>
        String(item.displayText ?? "").toLowerCase().includes(q),
      )
      : mockSuggestions;

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return () => {
    if (window.__originalFetch) {
      window.fetch = window.__originalFetch;
      delete window.__originalFetch;
    }
  };
}

export function VendorChipSearch({
  locale,
  resultsPath,
  onApply,
  initialChips,
  containerClassName,
  style,
}: {
  locale: Locale;
  resultsPath?: string;
  /** When provided, called on apply with no redirect (e.g. for header search on visualizer). */
  onApply?: (detail: ChipSearchDetail) => void;
  /** Pre-loaded chips (e.g. from context) so search shows current selection; synced when it changes. */
  initialChips?: Keyword[];
  /** Optional class for the root wrapper (e.g. header can pass fixed height + overflow to prevent overlap). */
  containerClassName?: string;
  /**
   * Layout and chip options (`height`, `chipBehavior`, `bgColor`, …). Plain object or JSON-shaped values;
   * forwarded to `createChipSearch`. Not the same as DOM inline styles on the wrapper.
   */
  style?: ChipSearchStyle;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<VendorInstance | null>(null);
  /** When true, onChange was triggered by our setChips sync (sidebar → header); skip calling onApply to avoid update loop. */
  const syncingFromContextRef = useRef(false);
  const tooltipCleanupRef = useRef<(() => void) | null>(null);
  /** Tracks chip count so we scroll right when user adds a chip; set after initial scroll-left. */
  const initialChipsLengthRef = useRef(0);
  /** True after we've applied initial chips once (so we can tell "user added" vs "first load with selection"). */
  const hasInitialChipsBeenSetRef = useRef(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const { t, dataWarehouseId } = useCore();
  const baseUrl = getReferenceApiClientBaseUrl(dataWarehouseId);
  const headers = useSignedFetchHeaders(
    baseUrl ? `${baseUrl}${SEARCH_PATH_SEGMENT}` : undefined,
    { acceptLanguage: locale }
  );

  const resultsUrl = resultsPath ?? `/${locale}${ROUTES.VISUALIZER}`;

  const searchStrings = {
    placeholder: t("SEARCH_PLACEHOLDER"),
    searchBtnLabel: t("SEARCH_BUTTON"),
    clearAllLabel: t("SEARCH_CLEAR_ALL"),
    noRecordLabel: t("SEARCH_NO_RESULTS"),
    loadingLabel: t("COMMON_LOADING"),
    searchBtnDisabledTooltip: t("SEARCH_SELECT_ONE_INDICATOR"),
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    /**
     * Writes `dfa_viz_search_handoff` for the landing / body search only.
     * The in-header instance must not call this: on refresh, that would re-store a partial chip
     * list and hydration would prefer it over `dfa_visualizer_selection`, dropping time/subgroup
     * that only exist in persisted sidebar state.
     */
    const persistHandoffOnly = (detail: ChipSearchDetail) => {
      const chips = Array.isArray(detail?.chips) ? detail.chips : [];
      if (chips.length === 0) {
        clearVizSearchHandoffFromSession();
        return;
      }
      setVizSearchHandoffToSession(chips);
    };

    /**
     * Landing: keep session handoff in sync on every chip add/remove so the list matches the UI
     * before the user clicks Search (and survives focus/order quirks). Visualizer header: only
     * updates app state via `onApply`; persistence is `setVisualizerSelectionToSession` on the page.
     */
    const handleApply = (detail: ChipSearchDetail) => {
      if (onApply) {
        onApply(detail);
        return;
      }
      persistHandoffOnly(detail);
      router.push(resultsUrl);
    };

    const preLoadedData =
      initialChips?.length ? JSON.stringify(initialChips) : "";

    let cancelled = false;
    loadCreateChipSearch()
      .then((createChipSearch) => {
        if (cancelled || !mountRef.current) return;
        instanceRef.current?.destroy?.();
        instanceRef.current = createChipSearch(mount, {
          baseUrl,
          locale,
          headers,
          minChars: 3,
          requireIndicatorForSearch: true,
          strings: {
            placeholder: searchStrings.placeholder,
            searchBtnLabel: searchStrings.searchBtnLabel,
            clearAllLabel: onApply ? "" : searchStrings.clearAllLabel,
            noRecordLabel: searchStrings.noRecordLabel,
            loadingLabel: searchStrings.loadingLabel,
            searchBtnDisabledTooltip: searchStrings.searchBtnDisabledTooltip,
          },
          payloadPreset: "dfa",
          enabledSearchbtn: !onApply,
          enabledClearAll: !!onApply,
          style,
          preLoadedData,
          searchBtnCallback: (detail) => {
            handleApply(detail as ChipSearchDetail);
          },
          callback: (detail) => {
            try {
              const chips = Array.isArray(detail?.chips) ? detail.chips : [];
              if (chips.length === 0) {
                clearVizSearchHandoffFromSession();
                if (onApply) onApply({ chips: [], payload: null });
                return;
              }
            } catch {
              // Ignore storage failures
            }
            handleApply(detail as ChipSearchDetail);
          },
          // Header: sync filters only (no handoff). Landing: update handoff on each chip change.
          onChange: onApply
            ? (detail) => {
                if (syncingFromContextRef.current) {
                  syncingFromContextRef.current = false;
                  return;
                }
                onApply(detail as ChipSearchDetail);
              }
            : (detail) => {
                persistHandoffOnly(detail as ChipSearchDetail);
              },
        });

        // Attach custom tooltip to search button (when disabled) and chips (delegated)
        const tooltip = getSharedCustomTooltip();
        const cleanupFns: (() => void)[] = [];

        const searchBtn = mount.querySelector<HTMLButtonElement>('[data-sc="searchBtn"]');
        if (searchBtn) {
          const showBtnTooltip = () => {
            if (searchBtn.disabled && searchStrings.searchBtnDisabledTooltip) {
              tooltip.scheduleShow(searchStrings.searchBtnDisabledTooltip, searchBtn);
            }
          };
          const hideBtnTooltip = () => tooltip.hide();
          searchBtn.addEventListener("mouseenter", showBtnTooltip);
          searchBtn.addEventListener("mouseleave", hideBtnTooltip);
          searchBtn.addEventListener("focus", showBtnTooltip);
          searchBtn.addEventListener("blur", hideBtnTooltip);
          const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") hideBtnTooltip();
          };
          searchBtn.addEventListener("keydown", onKey);
          cleanupFns.push(() => {
            searchBtn.removeEventListener("mouseenter", showBtnTooltip);
            searchBtn.removeEventListener("mouseleave", hideBtnTooltip);
            searchBtn.removeEventListener("focus", showBtnTooltip);
            searchBtn.removeEventListener("blur", hideBtnTooltip);
            searchBtn.removeEventListener("keydown", onKey);
          });
        }

        // Copy chip title to data-tooltip-text and remove title so only our custom tooltip shows (no native alt/title tooltip)
        const chipsWrap = mount.querySelector('[data-sc="chipsWrap"]');
        const stripNativeChipTitle = (container: Element) => {
          container.querySelectorAll('[data-sc="chip"]').forEach((chip) => {
            const el = chip as HTMLElement;
            if (el.title) {
              el.setAttribute("data-tooltip-text", el.title);
              el.removeAttribute("title");
            }
          });
        };
        if (chipsWrap) {
          stripNativeChipTitle(chipsWrap);
          const chipTitleObserver = new MutationObserver(() => {
            tooltip.hide(); // hide when chips change (e.g. backspace removes chip) so tooltip doesn't persist
            stripNativeChipTitle(chipsWrap);
          });
          chipTitleObserver.observe(chipsWrap, { childList: true, subtree: true });
          cleanupFns.push(() => chipTitleObserver.disconnect());
        }

        const chipTooltipShow = (e: MouseEvent) => {
          const chip = (e.target as Element)?.closest?.('[data-sc="chip"]');
          if (!chip) return;
          const el = chip as HTMLElement;
          const text = el.getAttribute("data-tooltip-text") || el.title || "";
          if (text) tooltip.scheduleShow(text, el);
        };
        const chipTooltipHide = (e: MouseEvent) => {
          const chip = (e.target as Element)?.closest?.('[data-sc="chip"]');
          const related = (e.relatedTarget as Element)?.closest?.('[data-sc="chip"]');
          if (chip && !related) tooltip.hide();
        };
        mount.addEventListener("mouseover", chipTooltipShow, true);
        mount.addEventListener("mouseout", chipTooltipHide, true);
        cleanupFns.push(() => {
          mount.removeEventListener("mouseover", chipTooltipShow, true);
          mount.removeEventListener("mouseout", chipTooltipHide, true);
        });

        tooltipCleanupRef.current = () => {
          cleanupFns.forEach((fn) => fn());
          tooltipCleanupRef.current = null;
        };

        // Header search: initial load scroll left (after library's rAF scroll-to-right); clear-all as icon with aria-label
        if (onApply) {
          initialChipsLengthRef.current = initialChips?.length ?? 0;
          // Double rAF so we run after the chip-search library's requestAnimationFrame(scrollChipsIntoView)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!mountRef.current) return;
              const chipsWrap = mountRef.current.querySelector<HTMLElement>('[data-sc="chipsWrap"]');
              if (chipsWrap) chipsWrap.scrollLeft = 0;
              const clearAllBtn = mountRef.current.querySelector<HTMLButtonElement>('[data-sc="clearAllBtn"]');
              if (clearAllBtn) applyClearAllButtonStyle(clearAllBtn);
            });
          });
        }

        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });

    return () => {
      cancelled = true;
      tooltipCleanupRef.current?.();
      tooltipCleanupRef.current = null;
      instanceRef.current?.destroy?.();
      instanceRef.current = null;
    };
  }, [
    resultsUrl,
    router,
    baseUrl,
    locale,
    headers,
    onApply,
    style,
    searchStrings.placeholder,
    searchStrings.searchBtnLabel,
    searchStrings.clearAllLabel,
    searchStrings.noRecordLabel,
    searchStrings.loadingLabel,
    searchStrings.searchBtnDisabledTooltip,
  ]);

  // Apply compact clear-all button styling (header search). Use SVG with inline style so size wins over library CSS.
  // When style.height is set, derive button and icon size proportionally (ratio gives 18/32px at h=52).
  const applyClearAllButtonStyle = (btn: HTMLButtonElement) => {
    const h = style?.height;
    const iconSize = h ? Math.max(12, Math.round(h * 0.346)) : 18;
    const btnSize  = h ? Math.max(20, Math.round(h * 0.615)) : 32;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:${iconSize}px;height:${iconSize}px;min-width:${iconSize}px;min-height:${iconSize}px;flex-shrink:0;display:block"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    btn.setAttribute("aria-label", searchStrings.clearAllLabel);
    const baseStyle = {
      width: `${btnSize}px`,
      height: `${btnSize}px`,
      minWidth: `${btnSize}px`,
      padding: "0",
      border: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#4b5563",
      background: "transparent",
      boxShadow: "none",
    };
    Object.assign(btn.style, baseStyle);
    // Keep same look on hover (no color/background change) without using globals.css
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "transparent";
      btn.style.boxShadow = "none";
      btn.style.color = "#4b5563";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "transparent";
      btn.style.boxShadow = "none";
      btn.style.color = "#4b5563";
    });
  };

  // Sync initialChips into the vendor instance when it changes (e.g. user removed chip in sidebar).
  // When onApply (header): first load with selection → scroll to start (left); when user adds a chip → scroll to end.
  useEffect(() => {
    if (!ready || initialChips === undefined) return;
    const instance = instanceRef.current;
    if (instance?.setChips) {
      syncingFromContextRef.current = true;
      instance.setChips(initialChips);
    }
    if (onApply && mountRef.current) {
      const clearAllBtn = mountRef.current.querySelector<HTMLButtonElement>('[data-sc="clearAllBtn"]');
      if (clearAllBtn) applyClearAllButtonStyle(clearAllBtn);
      const prevLen = initialChipsLengthRef.current;
      const userAddedChip = hasInitialChipsBeenSetRef.current && initialChips.length > prevLen;

      let scrollTimeoutId: ReturnType<typeof setTimeout> | undefined;
      if (userAddedChip) {
        requestAnimationFrame(() => {
          const chipsWrap = mountRef.current?.querySelector<HTMLElement>('[data-sc="chipsWrap"]');
          if (chipsWrap) chipsWrap.scrollLeft = Math.max(0, chipsWrap.scrollWidth - chipsWrap.clientWidth);
        });
      } else {
        // Scroll row to start (left) so chips begin at left; delay so we run after library's scroll
        scrollTimeoutId = setTimeout(() => {
          const chipsWrap = mountRef.current?.querySelector<HTMLElement>('[data-sc="chipsWrap"]');
          if (chipsWrap) chipsWrap.scrollLeft = 0;
        }, 50);
      }

      if (initialChips.length > 0) hasInitialChipsBeenSetRef.current = true;
      initialChipsLengthRef.current = initialChips.length;

      return () => {
        if (scrollTimeoutId != null) clearTimeout(scrollTimeoutId);
      };
    }
  }, [ready, initialChips, onApply, style?.height, searchStrings.clearAllLabel]);

  return (
    <div
      className={containerClassName ?? "relative min-h-[40px] w-full"}
      style={style?.height !== undefined ? { height: `${style.height}px` } : undefined}
    >
      <div ref={mountRef} className="min-h-[40px] h-full w-full" />
      {!ready ? (
        <>
          <div
            className="absolute inset-0 flex items-center justify-center rounded-md border border-border bg-surface-muted/90 px-md py-sm shadow-sm"
            aria-hidden="true"
          >
            <Loader size={30} showStatusText={false} ariaLabel={t("SEARCH_LOADING_SR")} />
          </div>
          <div className="sr-only" aria-live="polite">
            {t("SEARCH_LOADING_SR")}
          </div>
        </>
      ) : null}
    </div>
  );
}

