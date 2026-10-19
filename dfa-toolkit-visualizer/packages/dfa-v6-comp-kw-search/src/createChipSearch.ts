/**
 * Framework-agnostic chip-based search component (no dependencies).
 * Creates a mountable chip search UI with suggestions and optional search/clear buttons.
 */

import type { ChipSearchDetail, ChipSearchInstance, ChipSearchOptions, Keyword } from "./types";
import { mapDfaChipsToPayload } from "./mapDfaChipsToPayload";
import {
  toEl,
  debounce,
  uniqByKey,
  safeTypeLabel,
  emit,
  escapeHtml,
  truncateMiddle,
  svgSearchIcon,
  svgChipIcon,
  svgBadgeIcon,
} from "./utils";

interface SuggestionItem {
  keywordId: number | string;
  keywordType: string;
  displayText: string;
}

interface RenderedState {
  type: "loading" | "empty" | "suggestions" | null;
  suggestions: { keywordId: number | string; keywordType: string }[];
  activeIndex: number;
}

/** Returns true if chips contains at least one with keywordType normalized to "INDICATOR". */
function hasIndicatorChip(chips: Keyword[]): boolean {
  return chips.some(
    (c) => String((c && c.keywordType) || "").toUpperCase() === "INDICATOR",
  );
}

/** Package-local path for search API in reference mode (aligned with app backend). */
const REFERENCE_PATH_SEARCH = "/search";

/** Fallback strings when app does not pass translations. Only required keys. */
const defaultStrings = {
  placeholder: "Search data e.g. GDP, Population Size, India, total, 2022-2025 etc.",
  searchBtnLabel: "Search",
  clearAllLabel: "Clear All",
  noRecordLabel: "No results",
  loadingLabel: "Loading...",
  searchBtnDisabledTooltip: "Please select at least one indicator",
};

/** Extract suggestions array from API response: { data: { results } }, { results }, { data }, or raw array. */
function extractSuggestionsList(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  if (Array.isArray(o.data) && o.data.length >= 0) return o.data;
  if (o.data && typeof o.data === "object" && Array.isArray((o.data as Record<string, unknown>).results))
    return (o.data as { results: unknown[] }).results;
  if (Array.isArray(o.results)) return o.results;
  return [];
}

export function createChipSearch(
  mountEl: HTMLElement | string,
  options: ChipSearchOptions,
): ChipSearchInstance {
  const el = toEl(mountEl);
  const opts = options || {};

  if (!opts.baseUrl)
    throw new Error("createChipSearch: options.baseUrl is required");
  const suggestionsUrl = `${opts.baseUrl.replace(/\/$/, "")}${REFERENCE_PATH_SEARCH}`;

  const minChars = typeof opts.minChars === "number" ? opts.minChars : 3;
  const debounceMs = typeof opts.debounceMs === "number" ? opts.debounceMs : 250;
  const strings = { ...defaultStrings, ...opts.strings };

  const enabledSearchbtn = opts.enabledSearchbtn !== false;
  const enabledClearAll = opts.enabledClearAll === true;

  const callback = typeof opts.callback === "function" ? opts.callback : null;
  const searchBtnCallback = typeof opts.searchBtnCallback === "function" ? opts.searchBtnCallback : null;
  const onSearch = typeof opts.onSearch === "function" ? opts.onSearch : null;
  const onChange = typeof opts.onChange === "function" ? opts.onChange : null;

  const mapChipsToPayload =
    typeof opts.mapChipsToPayload === "function"
      ? opts.mapChipsToPayload
      : opts.payloadPreset === "dfa"
        ? mapDfaChipsToPayload
        : (chips: Keyword[]) => ({ chips });

  const state = {
    chips: [] as Keyword[],
    currentQuery: "",
    suggestions: [] as SuggestionItem[],
    activeIndex: -1,
    loading: false,
    open: false,
  };

  function safeCall(fn: ((arg: ChipSearchDetail) => void) | null, arg: ChipSearchDetail): void {
    if (!fn) return;
    try {
      fn(arg);
    } catch {
      // ignore consumer callback failures
    }
  }

  const placeholderText = strings.placeholder ?? defaultStrings.placeholder;
  const searchBtnText = strings.searchBtnLabel || strings.searchLabel || defaultStrings.searchBtnLabel;
  const clearAllText = strings.clearAllLabel ?? defaultStrings.clearAllLabel;
  const emptyText = strings.noRecordLabel ?? strings.emptyLabel ?? defaultStrings.noRecordLabel;
  const loadingText = strings.loadingLabel ?? defaultStrings.loadingLabel;

  el.innerHTML = `
    <div class="dtk-sch-root">
      <div class="dtk-sch-shell">
        <div class="dtk-sch-row">
          ${svgSearchIcon()}
          <div class="dtk-sch-inputWrap" data-sc="inputwrap" aria-label="Search filters">
            <div class="dtk-sch-chipsWrap" data-sc="chipsWrap"></div>
            <div class="dtk-sch-inputArea" data-sc="inputArea">
              <span class="dtk-sch-placeholder" data-sc="placeholder" aria-hidden="true">${escapeHtml(placeholderText)}</span>
              <input
                class="dtk-sch-input"
                data-sc="input"
                type="text"
                autocomplete="off"
                spellcheck="false"
                aria-placeholder="${escapeHtml(placeholderText)}"
              />
            </div>
          </div>
          <div class="dtk-sch-actions">
            ${
              enabledSearchbtn
                ? `<button class="dtk-sch-btn" data-sc="searchBtn" type="button">${escapeHtml(searchBtnText)}</button>`
                : ""
            }
            ${
              enabledClearAll
                ? `<button class="dtk-sch-btn dtk-sch-btnSecondary" data-sc="clearAllBtn" type="button">${escapeHtml(clearAllText)}</button>`
                : ""
            }
          </div>
        </div>
      </div>
      <div class="dtk-sch-dropdown" data-sc="dropdown" style="display:none" role="listbox" aria-label="Suggestions"></div>
      <div class="dtk-sch-chipsList" data-sc="chipsList" style="display:none" role="dialog" aria-label="All chips"></div>
    </div>
  `.trim();

  const MOBILE_BREAKPOINT = 640;
  function isMobile(): boolean {
    return typeof window !== "undefined" && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  }

  const CHIP_MAX_LABEL_LEN = 22;

  const root = el.querySelector(".dtk-sch-root") as HTMLElement;
  const input = el.querySelector('[data-sc="input"]') as HTMLInputElement;
  const inputWrap = el.querySelector('[data-sc="inputwrap"]') as HTMLElement;
  const placeholderEl = el.querySelector('[data-sc="placeholder"]') as HTMLElement | null;
  const chipsWrap = el.querySelector('[data-sc="chipsWrap"]') as HTMLElement;
  const dropdown = el.querySelector('[data-sc="dropdown"]') as HTMLElement;
  const chipsList = el.querySelector('[data-sc="chipsList"]') as HTMLElement | null;
  const searchBtn = el.querySelector('[data-sc="searchBtn"]') as HTMLButtonElement | null;
  const clearAllBtn = el.querySelector('[data-sc="clearAllBtn"]') as HTMLButtonElement | null;

  if (!root || !input || !dropdown || !inputWrap || !chipsWrap) {
    throw new Error("createChipSearch: failed to render component");
  }

  // When `style.height` is set, derive spacing and type sizes from it (ratios tuned for ~52px) as CSS vars on root.
  // Input/placeholder also get inline font-size and padding so global resets cannot break inherited sizing.
  let heightInputFsPx = "";
  let heightInputPyPx = "";
  let heightSuggestionFsPx = "";
  let heightSuggestionPyPx = "";
  let heightBadgeFsPx = "";
  let heightBadgePyPx = "";
  let heightBadgePxPx = "";

  const layoutH = opts.style?.height;
  if (typeof layoutH === "number" && layoutH > 0) {
    const h = layoutH;
    // --- dimension variables (CSS custom properties work reliably for these) ---
    root.style.setProperty("--sc-h", `${h}px`);
    // when chipBehavior is "scroll": shell clips overflow, chips don't shrink (they scroll), chipsWrap clips vertically
    if (opts.style?.chipBehavior === "scroll") {
      root.style.setProperty("--sc-shell-overflow",    "hidden");
      root.style.setProperty("--sc-chip-shrink",       "0");
      root.style.setProperty("--sc-chips-overflow-y",  "hidden");
    }
    // search icon and suggestion badge icon — ratio gives 26px at h=52
    root.style.setProperty("--sc-left-icon-size", `${Math.max(14, Math.round(h * 0.500))}px`);
    root.style.setProperty("--sc-badge-icon-size", `${Math.max(12, Math.round(h * 0.346))}px`);
    root.style.setProperty("--sc-shell-py", `${Math.max(2, Math.round(h * 0.077))}px`);
    root.style.setProperty("--sc-inputwrap-py", `${Math.max(2, Math.round(h * 0.077))}px`);
    root.style.setProperty("--sc-chip-py", `${Math.max(2, Math.round(h * 0.115))}px`);
    root.style.setProperty("--sc-chip-px", `${Math.max(2, Math.round(h * 0.077))}px`);
    root.style.setProperty("--sc-chip-fs", `${Math.max(10, Math.round(h * 0.250))}px`);
    root.style.setProperty("--sc-chip-icon-size", `${Math.max(10, Math.round(h * 0.250))}px`);
    root.style.setProperty("--sc-chipx-size", `${Math.max(12, Math.round(h * 0.385))}px`);
    root.style.setProperty("--sc-dropdown-max-h", `${Math.round(h * 4.23)}px`);
    // chip and button share the same radius so they look visually consistent at any height
    // ratio calibrated to give 8px at h=52 (matching the default --sc-btn-radius)
    const borderRadiusPx = `${Math.max(4, Math.round(h * 0.154))}px`;
    root.style.setProperty("--sc-btn-radius",  borderRadiusPx);
    root.style.setProperty("--sc-chip-radius", borderRadiusPx);
    // --- text values: also set as CSS custom properties so the cascade picks them up
    // for all elements (static and dynamically-created). Inline styles are kept as extra
    // reinforcement on the static elements that exist at init time. ---
    heightInputFsPx   = `${Math.max(12, Math.round(h * 0.288))}px`;
    heightInputPyPx   = `${Math.max(1,  Math.round(h * 0.096))}px`;
    heightSuggestionFsPx = `${Math.max(12, Math.round(h * 0.288))}px`;
    heightSuggestionPyPx = `${Math.max(4,  Math.round(h * 0.135))}px`;
    heightBadgeFsPx   = `${Math.max(10, Math.round(h * 0.230))}px`;
    heightBadgePyPx   = `${Math.max(2,  Math.round(h * 0.096))}px`;
    heightBadgePxPx   = `${Math.max(6,  Math.round(h * 0.192))}px`;
    root.style.setProperty("--sc-input-fs",      heightInputFsPx);
    root.style.setProperty("--sc-input-py",      heightInputPyPx);
    root.style.setProperty("--sc-suggestion-fs", heightSuggestionFsPx);
    root.style.setProperty("--sc-suggestion-py", heightSuggestionPyPx);
    root.style.setProperty("--sc-badge-fs",      heightBadgeFsPx);
    root.style.setProperty("--sc-badge-py",      heightBadgePyPx);
    root.style.setProperty("--sc-badge-px",      heightBadgePxPx);
    root.style.setProperty("--sc-empty-fs",      heightSuggestionFsPx);
    // Also apply inline to static DOM elements (belt-and-suspenders)
    input.style.fontSize    = heightInputFsPx;
    input.style.paddingTop  = heightInputPyPx;
    input.style.paddingBottom = heightInputPyPx;
    if (placeholderEl) {
      placeholderEl.style.fontSize    = heightInputFsPx;
      placeholderEl.style.paddingTop  = heightInputPyPx;
      placeholderEl.style.paddingBottom = heightInputPyPx;
    }
  }

  // Apply per-instance chip appearance from `style` object when passed by the caller.
  const chipStyle = opts.style;
  if (chipStyle) {
    if (chipStyle.bgColor)       root.style.setProperty("--sc-chip-bg",     chipStyle.bgColor);
    if (chipStyle.textColor)     root.style.setProperty("--sc-chip-text",   chipStyle.textColor);
    if (chipStyle.borderColor)   root.style.setProperty("--sc-chip-border", chipStyle.borderColor);
    if (chipStyle.crossBgColor)  root.style.setProperty("--sc-chip-x-bg",   chipStyle.crossBgColor);
  }

  let destroyed = false;
  let aborter: AbortController | null = null;
  let chipsListOpen = false;
  let mobileQuery: MediaQueryList | null = null;
  function onMobileChange(): void {
    if (destroyed) return;
    renderChips();
    if (chipsListOpen && chipsList) {
      chipsList.style.display = "none";
      chipsListOpen = false;
    }
  }

  let resizeObserver: ResizeObserver | null = null;

  function scrollChipsIntoView(): void {
    chipsWrap.scrollLeft = Math.max(0, chipsWrap.scrollWidth - chipsWrap.clientWidth);
  }

  const searchBtnDisabledTooltipText = strings.searchBtnDisabledTooltip ?? defaultStrings.searchBtnDisabledTooltip;

  function updateSearchButton(): void {
    if (!enabledSearchbtn || !searchBtn) return;
    const requireIndicator = opts.requireIndicatorForSearch === true;
    const canSearch = requireIndicator
      ? hasIndicatorChip(state.chips)
      : state.chips.length > 0;
    searchBtn.disabled = !canSearch;
    searchBtn.classList.toggle("dtk-sch-btnPrimary", canSearch);
    searchBtn.setAttribute("aria-disabled", String(!canSearch));
    searchBtn.title =
      searchBtn.disabled && searchBtnDisabledTooltipText
        ? searchBtnDisabledTooltipText
        : "";
  }

  function updatePlaceholderVisibility(): void {
    if (!placeholderEl) return;
    const isEmpty = input.value.length === 0;
    placeholderEl.classList.toggle("dtk-sch-placeholder-hidden", !isEmpty);
  }

  let renderedState: RenderedState = { type: null, suggestions: [], activeIndex: -1 };

  function setOpen(open: boolean): void {
    state.open = Boolean(open);
    dropdown.style.display = state.open ? "block" : "none";
    if (!state.open) {
      state.activeIndex = -1;
      renderedState = { type: null, suggestions: [], activeIndex: -1 };
    }
  }

  function createChipEl(chip: Keyword): HTMLElement {
    const truncated = truncateMiddle(chip.displayText, CHIP_MAX_LABEL_LEN);
    const chipEl = document.createElement("span");
    chipEl.className = "dtk-sch-chip";
    chipEl.setAttribute("data-sc", "chip");
    chipEl.setAttribute("data-keyword-id", String(chip.keywordId));
    chipEl.setAttribute("data-keyword-type", String(chip.keywordType));
    chipEl.title = chip.displayText;
    chipEl.innerHTML = `
      ${svgChipIcon()}
      <span class="dtk-sch-chipText">${escapeHtml(truncated)}</span>
      <button class="dtk-sch-chipX" type="button" aria-label="Remove ${escapeHtml(
        chip.displayText,
      )}" data-sc="chipx">×</button>
    `.trim();
    return chipEl;
  }

  function renderChipsList(): void {
    if (!chipsList) return;
    chipsList.replaceChildren();
    for (const chip of state.chips) {
      const row = document.createElement("div");
      row.className = "dtk-sch-chipsListItem";
      row.setAttribute("data-sc", "chipsListItem");
      row.setAttribute("data-keyword-id", String(chip.keywordId));
      row.setAttribute("data-keyword-type", String(chip.keywordType));
      const truncated = truncateMiddle(chip.displayText, CHIP_MAX_LABEL_LEN);
      row.innerHTML = `
        <span class="dtk-sch-chipsListItemText">${escapeHtml(truncated)}</span>
        <button class="dtk-sch-chipX" type="button" aria-label="Remove ${escapeHtml(
          chip.displayText,
        )}" data-sc="chipx">×</button>
      `.trim();
      chipsList.appendChild(row);
    }
  }

  function setChipsListOpen(open: boolean): void {
    chipsListOpen = open;
    const btn = el.querySelector('[data-sc="chipMoreBtn"]');
    if (btn) btn.setAttribute("aria-expanded", String(open));
    if (chipsList) {
      chipsList.style.display = open ? "block" : "none";
      if (open) renderChipsList();
    }
  }

  function renderChips(): void {
    chipsWrap.replaceChildren();

    const mobile = isMobile();
    const collapseOnMobile = mobile && state.chips.length >= 1;

    if (collapseOnMobile) {
      /* Mobile: show only "+N" + dropdown button, no chips in the bar (including when only 1 chip) */
      const moreCount = state.chips.length;
      const moreBtn = document.createElement("button");
      moreBtn.className = "dtk-sch-chipMore";
      moreBtn.setAttribute("data-sc", "chipMoreBtn");
      moreBtn.setAttribute("type", "button");
      moreBtn.setAttribute("aria-label", "Show all chips");
      moreBtn.setAttribute("aria-expanded", String(chipsListOpen));
      moreBtn.innerHTML = `
        <span class="dtk-sch-chipMoreBadge">+${moreCount}</span>
        <svg class="dtk-sch-chipMoreArrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      `.trim();
      chipsWrap.appendChild(moreBtn);
    } else {
      for (const chip of state.chips) {
        chipsWrap.appendChild(createChipEl(chip));
      }
    }

    requestAnimationFrame(scrollChipsIntoView);

    updateSearchButton();
  }

  function renderDropdown(): void {
    if (!state.open) return;

    if (state.loading) {
      if (renderedState.type === "suggestions" && renderedState.suggestions.length > 0) {
        dropdown.classList.add("dtk-sch-dropdown-loading");
        return;
      }
      if (renderedState.type !== "loading") {
        dropdown.innerHTML = `<div class="dtk-sch-empty">${escapeHtml(loadingText)}</div>`;
        renderedState = { type: "loading", suggestions: [], activeIndex: -1 };
      }
      return;
    }

    dropdown.classList.remove("dtk-sch-dropdown-loading");

    if (!state.suggestions.length) {
      if (renderedState.type !== "empty") {
        dropdown.innerHTML = `<div class="dtk-sch-empty">${escapeHtml(emptyText)}</div>`;
        renderedState = { type: "empty", suggestions: [], activeIndex: -1 };
      }
      return;
    }

    const suggestionsChanged =
      renderedState.type !== "suggestions" ||
      renderedState.suggestions.length !== state.suggestions.length ||
      !state.suggestions.every(
        (s, i) =>
          renderedState.suggestions[i] &&
          renderedState.suggestions[i].keywordId === s.keywordId &&
          renderedState.suggestions[i].keywordType === s.keywordType,
      );

    if (suggestionsChanged) {
      // Build inline style strings for suggestion text and badge (bypasses CSS variable cascade issues)
      const suggTextStyle = heightSuggestionFsPx
        ? ` style="font-size:${heightSuggestionFsPx}"`
        : "";
      const suggRowStyle = heightSuggestionPyPx
        ? ` style="padding-top:${heightSuggestionPyPx};padding-bottom:${heightSuggestionPyPx}"`
        : "";
      const badgeStyle = heightBadgeFsPx
        ? ` style="font-size:${heightBadgeFsPx};padding:${heightBadgePyPx} ${heightBadgePxPx}"`
        : "";

      dropdown.innerHTML = state.suggestions
        .map((s, idx) => {
          const active = idx === state.activeIndex ? ' data-active="true"' : "";
          const typeLabel = safeTypeLabel(s.keywordType, opts.formatKeywordType);
          return `
            <div class="dtk-sch-suggestion" role="option" tabindex="0" data-sc="suggestion" data-idx="${idx}"${active}${suggRowStyle}>
              <div class="dtk-sch-suggestionLeft">
                ${svgBadgeIcon()}
                <div class="dtk-sch-suggestionText"${suggTextStyle}>${escapeHtml(s.displayText)}</div>
              </div>
              <div class="dtk-sch-badge" data-type="${escapeHtml(String(s.keywordType || ""))}"${badgeStyle}>${escapeHtml(
            typeLabel,
          )}</div>
            </div>
          `.trim();
        })
        .join("");

      renderedState = {
        type: "suggestions",
        suggestions: state.suggestions.map((s) => ({ keywordId: s.keywordId, keywordType: s.keywordType })),
        activeIndex: state.activeIndex,
      };
    } else if (renderedState.activeIndex !== state.activeIndex) {
      const items = dropdown.querySelectorAll('[data-sc="suggestion"]');
      items.forEach((item, idx) => {
        if (idx === state.activeIndex) {
          item.setAttribute("data-active", "true");
        } else {
          item.removeAttribute("data-active");
        }
      });
      renderedState.activeIndex = state.activeIndex;
    }
  }

  function setSuggestions(list: unknown): void {
    const arr = Array.isArray(list) ? list : [];
    state.suggestions = arr
      .filter(
        (x: unknown): x is { keywordId: unknown; keywordType?: string; displayText: unknown } =>
          Boolean(x && typeof x === "object" && x !== null && "displayText" in x && "keywordId" in x),
      )
      .map((x): SuggestionItem => ({
        keywordId: typeof x.keywordId === "number" || typeof x.keywordId === "string" ? x.keywordId : Number(x.keywordId),
        keywordType: x.keywordType || "",
        displayText: String(x.displayText),
      }));
    state.activeIndex = state.suggestions.length ? 0 : -1;
    renderDropdown();
  }

  async function fetchSuggestions(q: string): Promise<void> {
    if (destroyed) return;
    if (q.length < minChars) {
      state.loading = false;
      setSuggestions([]);
      setOpen(false);
      return;
    }

    if (aborter) aborter.abort();
    aborter = new AbortController();

    state.loading = true;
    setOpen(true);
    renderDropdown();

    try {
      const url = `${suggestionsUrl}?q=${encodeURIComponent(q)}`;
      const acceptLanguage =
        opts.locale ?? (typeof navigator !== "undefined" ? navigator.language : "en");
      const init: RequestInit = { signal: aborter.signal, ...opts.fetchOptions };
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (init.headers && typeof init.headers === "object" && !(init.headers instanceof Headers))
        Object.assign(headers, init.headers as Record<string, string>);
      headers["Accept-Language"] = acceptLanguage;
      init.headers = headers;
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      state.loading = false;
      setOpen(true);
      const list = extractSuggestionsList(json);
      setSuggestions(list);
    } catch (e) {
      if (e && (e as Error).name === "AbortError") return;
      state.loading = false;
      setOpen(true);
      setSuggestions([]);
    }
  }

  const debouncedFetch = debounce(fetchSuggestions, debounceMs);

  function currentPayload(): { chips: Keyword[]; payload: unknown } {
    const chipsCopy = state.chips.map((c) => ({ ...c }));
    return {
      chips: chipsCopy,
      payload: mapChipsToPayload(chipsCopy),
    };
  }

  function emitChange(): void {
    const detail = currentPayload();
    emit(el, "chipsearch:change", detail);
    safeCall(onChange, detail);
  }

  const chipKey = (k: Keyword) => `${String(k.keywordType)}::${String(k.keywordId)}`;

  function addChip(keyword: Keyword): void {
    const next = uniqByKey([...state.chips, keyword], chipKey);
    if (next.length === state.chips.length) return;
    state.chips = next;
    renderChips();
    emitChange();
  }

  function removeChip(keywordType: string, keywordId: string | number): void {
    const before = state.chips.length;
    state.chips = state.chips.filter(
      (c) =>
        !(String(c.keywordType) === String(keywordType) && String(c.keywordId) === String(keywordId)),
    );
    if (state.chips.length !== before) {
      renderChips();
      emitChange();
    }
  }

  function onSubmit(source: "searchBtn" | "implicit"): void {
    if (source === "searchBtn" && enabledSearchbtn && searchBtn && searchBtn.disabled) return;
    const detail = currentPayload();
    emit(el, "chipsearch:search", detail);

    if (source === "searchBtn") {
      if (searchBtnCallback) safeCall(searchBtnCallback, detail);
      else safeCall(onSearch, detail);
      return;
    }

    if (callback) safeCall(callback, detail);
    else safeCall(onSearch, detail);
  }

  function onDropdownMouseMove(e: MouseEvent): void {
    const item = (e.target as HTMLElement)?.closest?.('[data-sc="suggestion"]');
    if (!item) return;
    const idx = Number(item.getAttribute("data-idx"));
    if (Number.isFinite(idx) && idx !== state.activeIndex) {
      state.activeIndex = idx;
      renderDropdown();
    }
  }

  function onInput(): void {
    state.currentQuery = input.value || "";
    updatePlaceholderVisibility();
    const q = state.currentQuery.trim();
    if (q.length < minChars) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debouncedFetch(q);
  }

  function moveActive(delta: number): void {
    if (!state.suggestions.length) return;
    const max = state.suggestions.length - 1;
    let next = state.activeIndex + delta;
    if (next < 0) next = max;
    if (next > max) next = 0;
    state.activeIndex = next;
    renderDropdown();
    const activeEl = dropdown.querySelector(`[data-idx="${next}"]`);
    if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }

  function chooseActive(): void {
    if (state.activeIndex < 0) return;
    const s = state.suggestions[state.activeIndex];
    if (!s) return;
    addChip(s);
    input.value = "";
    state.currentQuery = "";
    setOpen(false);
    setSuggestions([]);
    updatePlaceholderVisibility();
    input.focus();

    if (!enabledSearchbtn) onSubmit("implicit");
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "ArrowDown") {
      if (!state.open) {
        const q = (input.value || "").trim();
        if (q.length >= minChars) debouncedFetch(q);
        return;
      }
      e.preventDefault();
      moveActive(1);
      return;
    }
    if (e.key === "ArrowUp") {
      if (!state.open) return;
      e.preventDefault();
      moveActive(-1);
      return;
    }
    if (e.key === "Enter") {
      if (state.open && state.suggestions.length) {
        e.preventDefault();
        chooseActive();
      } else {
        onSubmit(enabledSearchbtn ? "searchBtn" : "implicit");
      }
      return;
    }
    if (e.key === "Escape") {
      if (state.open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (e.key === "Backspace" && !input.value) {
      const last = state.chips[state.chips.length - 1];
      if (last) removeChip(last.keywordType, last.keywordId);
    }
  }

  function onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement | null;
    if (!t) return;

    const chipMoreBtn = t.closest?.('[data-sc="chipMoreBtn"]');
    if (chipMoreBtn) {
      e.preventDefault();
      setChipsListOpen(!chipsListOpen);
      chipMoreBtn.setAttribute("aria-expanded", String(!chipsListOpen));
      return;
    }

    const chipsListItemX = chipsList && t.closest?.('[data-sc="chipsList"] [data-sc="chipx"]');
    if (chipsListItemX) {
      const row = chipsListItemX.closest('[data-sc="chipsListItem"]');
      if (row) {
        removeChip(
          row.getAttribute("data-keyword-type") || "",
          row.getAttribute("data-keyword-id") || "",
        );
        if (state.chips.length === 0) setChipsListOpen(false);
        else renderChipsList();
        renderChips();
      }
      return;
    }

    const chipX = t.closest?.('[data-sc="chipx"]');
    if (chipX) {
      const chipEl = chipX.closest('[data-sc="chip"]');
      if (chipEl) {
        removeChip(
          chipEl.getAttribute("data-keyword-type") || "",
          chipEl.getAttribute("data-keyword-id") || "",
        );
        if (chipsListOpen) {
          if (state.chips.length === 0) setChipsListOpen(false);
          else renderChipsList();
        }
      }
      input.focus();
      return;
    }

    const sugg = t.closest?.('[data-sc="suggestion"]');
    if (sugg) {
      const idx = Number(sugg.getAttribute("data-idx"));
      const item = state.suggestions[idx];
      if (item) {
        addChip(item);
        input.value = "";
        state.currentQuery = "";
        setOpen(false);
        setSuggestions([]);
        updatePlaceholderVisibility();
        input.focus();

        if (!enabledSearchbtn) onSubmit("implicit");
      }
      return;
    }

    const sb = t.closest?.('[data-sc="searchBtn"]');
    if (sb) {
      onSubmit("searchBtn");
      return;
    }

    const cb = t.closest?.('[data-sc="clearAllBtn"]');
    if (cb) {
      api.clear();
      safeCall(callback, currentPayload());
      return;
    }
  }

  function onDocDown(ev: MouseEvent): void {
    if (!root.contains(ev.target as Node)) {
      setOpen(false);
      setChipsListOpen(false);
    }
  }

  function destroy(): void {
    destroyed = true;
    if (aborter) aborter.abort();
    if (mobileQuery) {
      try {
        mobileQuery.removeEventListener("change", onMobileChange);
      } catch {
        // fallback for older browsers
        mobileQuery.removeListener?.(onMobileChange);
      }
      mobileQuery = null;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    input.removeEventListener("input", onInput);
    input.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("click", onClick);
    dropdown.removeEventListener("mousemove", onDropdownMouseMove);
    document.removeEventListener("mousedown", onDocDown, true);
    el.innerHTML = "";
  }

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeyDown);
  root.addEventListener("click", onClick);
  dropdown.addEventListener("mousemove", onDropdownMouseMove);
  document.addEventListener("mousedown", onDocDown, true);

  if (typeof window !== "undefined") {
    mobileQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    try {
      mobileQuery.addEventListener("change", onMobileChange);
    } catch {
      mobileQuery.addListener?.(onMobileChange);
    }
  }
  resizeObserver = new ResizeObserver(() => requestAnimationFrame(scrollChipsIntoView));
  resizeObserver.observe(chipsWrap);

  const api: ChipSearchInstance = {
    destroy,
    getState: () => ({
      chips: state.chips.map((c) => ({ ...c })),
      currentQuery: state.currentQuery,
    }),
    setChips: (chips: Keyword[]) => {
      state.chips = Array.isArray(chips)
        ? uniqByKey(
            chips.map((c) => ({
              keywordId: c.keywordId,
              keywordType: c.keywordType || "",
              displayText: String(c.displayText || ""),
            })),
            chipKey,
          )
        : [];
      renderChips();
      emitChange();
    },
    clear: () => {
      state.chips = [];
      input.value = "";
      state.currentQuery = "";
      setOpen(false);
      setSuggestions([]);
      renderChips();
      updatePlaceholderVisibility();
      emitChange();
    },
    focus: () => input.focus(),
  };

  renderChips();
  updateSearchButton();
  updatePlaceholderVisibility();

  if (typeof opts.preLoadedData === "string" && opts.preLoadedData.trim()) {
    try {
      const parsed = JSON.parse(opts.preLoadedData) as unknown;
      if (Array.isArray(parsed)) {
        api.setChips(parsed as Keyword[]);
      }
    } catch {
      // ignore invalid JSON
    }
  }

  return api;
}
