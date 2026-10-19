import { SESSION_STORAGE_KEYS } from "@/lib/constants";
import type {
  FilterSectionKey,
  SelectedComponents,
  SelectedItem,
} from "@/lib/visualizer/types";
import type { VisualizationConfig } from "@/lib/visualizer/types";

/**
 * ---------------------------------------------------------------------------
 * Session storage model (visualizer)
 * ---------------------------------------------------------------------------
 *
 * `VIZ_SEARCH_HANDOFF` — One-shot transfer from the **body** chip search (home
 * landing) to `/visualizer`. The header search must not write this key: refresh
 * should restore from `VISUALIZER_SELECTION` only. Handoff holds the full
 * `Keyword[]` before Search. It is consumed on first `/visualizer` load
 * (`drainVizSearchHandoffChips`) and then removed — it disappears from DevTools
 * after navigation by design.
 *
 * `VISUALIZER_SELECTION` — Canonical `SelectedComponents` while the user works
 * on `/visualizer`. Persisted on every selection change so a tab refresh
 * restores the sidebar and Data API params without re-reading search handoff.
 *
 * Legacy keys `dfa_search_chips` / `dfa_search_payload` are no longer written;
 * we still read `dfa_search_chips` once for migration and delete both.
 *
 * `VISUALIZER_PENDING_VIZ_CONFIG` — Save-to-gallery sign-in redirect only.
 * ---------------------------------------------------------------------------
 */

/** Vendor search chip shape (keywordId, keywordType, displayText). */
export interface SearchChipVendor {
  keywordId: number | string;
  keywordType: string;
  displayText?: string;
}

/** Legacy chip shape (id, label, type). */
export interface SearchChipLegacy {
  id?: string | number;
  label?: string;
  type?: string;
  value?: unknown;
}

export type SearchChip = SearchChipVendor | SearchChipLegacy;

function isVendorChip(c: SearchChip): c is SearchChipVendor {
  return "keywordId" in c && "keywordType" in c;
}

/**
 * Map search API `keywordType` values to sidebar sections.
 * Backend uses `TIME_PERIOD` (see KeywordTypeEnum); the chip widget may use "Time Period".
 */
function chipTypeToSectionKey(type: string): FilterSectionKey | null {
  const t = (type ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (t === "INDICATOR") return "indicator";
  if (t === "AREA") return "area";
  if (t === "SUBGROUP") return "subgroup";
  if (t === "TIME_PERIOD" || t === "TIMEPERIOD" || t === "TIME" || t === "YEAR") {
    return "timePeriod";
  }
  return null;
}

/**
 * Maps persisted search chips to sidebar `SelectedComponents`.
 * Supports multiple chips per section (e.g. several subgroups or years).
 */
export function chipsToSelectedComponents(chips: SearchChip[]): SelectedComponents {
  const result: SelectedComponents = {};
  if (!Array.isArray(chips) || chips.length === 0) return result;

  for (const chip of chips) {
    let section: FilterSectionKey | null;
    let id: string;
    let label: string;

    if (isVendorChip(chip)) {
      section = chipTypeToSectionKey(chip.keywordType);
      id = String(chip.keywordId ?? "");
      label = chip.displayText ?? id;
    } else {
      const type = (chip.type ?? "").toLowerCase().replace(/\s+/g, "_");
      if (type === "indicator") section = "indicator";
      else if (type === "area") section = "area";
      else if (type === "subgroup") section = "subgroup";
      else if (type === "time_period") section = "timePeriod";
      else section = null;
      id = String(chip.id ?? "");
      label = chip.label ?? id;
    }

    if (!section || !id) continue;
    const list = result[section] ?? [];
    if (list.some((existing) => existing.id === id)) continue;
    const item: SelectedItem = { id, label };
    list.push(item);
    result[section] = list;
  }

  return result;
}

/** Vendor keywordType strings for syncing sidebar → header chip search. */
const SECTION_KEY_TO_KEYWORD_TYPE: Record<FilterSectionKey, string> = {
  indicator: "Indicator",
  area: "Area",
  subgroup: "Subgroup",
  timePeriod: "Time Period",
};

/**
 * Converts sidebar selection to vendor chip shape for `preLoadedData` / header search.
 */
export function selectedComponentsToVendorChips(
  selected: SelectedComponents
): SearchChipVendor[] {
  if (!selected || typeof selected !== "object") return [];
  const out: SearchChipVendor[] = [];
  const keys: FilterSectionKey[] = ["indicator", "area", "subgroup", "timePeriod"];
  for (const section of keys) {
    const list = selected[section];
    if (!Array.isArray(list)) continue;
    const keywordType = SECTION_KEY_TO_KEYWORD_TYPE[section];
    for (const item of list) {
      if (!item?.id) continue;
      out.push({
        keywordId: item.nid ?? item.id,
        keywordType,
        displayText: item.label ?? String(item.id),
      });
    }
  }
  return out;
}

/** JSON envelope written by chip search when navigating to the visualizer. */
export interface VizSearchHandoffEnvelope {
  v: 1;
  chips: SearchChip[];
}

function parseChipsFromHandoffRaw(raw: string): SearchChip[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const chips = (parsed as VizSearchHandoffEnvelope).chips;
      if (Array.isArray(chips)) return chips;
    }
    if (Array.isArray(parsed)) return parsed as SearchChip[];
  } catch {
    return null;
  }
  return null;
}

/**
 * Clears deprecated keys so old single-write payloads cannot shadow selection.
 */
export function clearLegacySearchSessionKeys(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.LEGACY_SEARCH_CHIPS);
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.LEGACY_SEARCH_PAYLOAD);
  } catch {
    // ignore
  }
}

/**
 * Writes the one-shot handoff consumed by the visualizer after search apply.
 */
export function setVizSearchHandoffToSession(chips: SearchChip[]): void {
  if (typeof window === "undefined") return;
  try {
    clearLegacySearchSessionKeys();
    const envelope: VizSearchHandoffEnvelope = { v: 1, chips };
    sessionStorage.setItem(
      SESSION_STORAGE_KEYS.VIZ_SEARCH_HANDOFF,
      JSON.stringify(envelope)
    );
  } catch {
    // quota / private mode
  }
}

/**
 * Removes handoff and legacy keys without reading (e.g. user cleared all chips).
 */
export function clearVizSearchHandoffFromSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.VIZ_SEARCH_HANDOFF);
    clearLegacySearchSessionKeys();
  } catch {
    // ignore
  }
}

/**
 * Cached result of the first drain in this tab so React Strict Mode (double
 * mount) does not read storage twice after the first drain emptied it.
 */
let searchHandoffDrainCache: SearchChip[] | null | undefined = undefined;

/**
 * Reads and clears the search handoff from session storage (new key, then
 * legacy `dfa_search_chips` once). Returns the same array on subsequent calls
 * until `resetSearchHandoffDrainCache()` runs (e.g. when leaving `/visualizer`).
 */
export function drainVizSearchHandoffChips(): SearchChip[] | null {
  if (searchHandoffDrainCache !== undefined) {
    return searchHandoffDrainCache;
  }
  if (typeof window === "undefined") {
    searchHandoffDrainCache = null;
    return null;
  }

  let chips: SearchChip[] | null = null;

  const handoffRaw = sessionStorage.getItem(SESSION_STORAGE_KEYS.VIZ_SEARCH_HANDOFF);
  if (handoffRaw) {
    chips = parseChipsFromHandoffRaw(handoffRaw);
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.VIZ_SEARCH_HANDOFF);
  }

  if (!chips?.length) {
    const legacyRaw = sessionStorage.getItem(SESSION_STORAGE_KEYS.LEGACY_SEARCH_CHIPS);
    if (legacyRaw) {
      chips = parseChipsFromHandoffRaw(legacyRaw);
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.LEGACY_SEARCH_CHIPS);
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.LEGACY_SEARCH_PAYLOAD);
    }
  }

  searchHandoffDrainCache = chips?.length ? chips : null;
  return searchHandoffDrainCache;
}

/** Reset drain cache when the user navigates away from the visualizer shell. */
export function resetSearchHandoffDrainCache(): void {
  searchHandoffDrainCache = undefined;
}

/**
 * Persists sidebar selection for refresh on `/visualizer` only.
 * Drops the key when there is no indicator (empty / cleared state).
 */
export function setVisualizerSelectionToSession(selected: SelectedComponents): void {
  if (typeof window === "undefined") return;
  if (!selected?.indicator?.length) {
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_SELECTION);
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_VIZ_CONFIG);
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_UI_STATE);
    return;
  }
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEYS.VISUALIZER_SELECTION, JSON.stringify(selected));
  } catch {
    // ignore quota or serialization errors
  }
}

/**
 * Reads persisted visualizer selection. Returns null if missing or invalid.
 */
export function getVisualizerSelectionFromSession(): SelectedComponents | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEYS.VISUALIZER_SELECTION);
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const selected = parsed as Record<string, unknown>;
    const indicator = selected.indicator;
    if (!Array.isArray(indicator) || indicator.length === 0) return null;
    const result: SelectedComponents = { indicator: indicator as SelectedItem[] };
    if (Array.isArray(selected.area)) result.area = selected.area as SelectedItem[];
    if (Array.isArray(selected.subgroup)) result.subgroup = selected.subgroup as SelectedItem[];
    if (Array.isArray(selected.timePeriod)) result.timePeriod = selected.timePeriod as SelectedItem[];
    return result;
  } catch {
    return null;
  }
}

/**
 * Persists chart appearance (type, colors, fonts, mapping, etc.) so a tab
 * refresh restores the user's customisations alongside the sidebar selection.
 * Tied to the `VISUALIZER_SELECTION` lifecycle — cleared when selection is
 * cleared or the user navigates away from `/visualizer`.
 */
export function setVisualizerVizConfigToSession(config: VisualizationConfig | null): void {
  if (typeof window === "undefined") return;
  if (!config) {
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_VIZ_CONFIG);
    return;
  }
  try {
    sessionStorage.setItem(
      SESSION_STORAGE_KEYS.VISUALIZER_VIZ_CONFIG,
      JSON.stringify(config),
    );
  } catch {
    // ignore quota / serialization errors
  }
}

export function getVisualizerVizConfigFromSession(): VisualizationConfig | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEYS.VISUALIZER_VIZ_CONFIG);
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as VisualizationConfig;
  } catch {
    return null;
  }
}

/**
 * ---------------------------------------------------------------------------
 * UI state persistence (visualizer)
 * ---------------------------------------------------------------------------
 * Stores whether the edit/insights side panel is open and which tab is active
 * inside the edit settings panel, so a refresh restores the same UI.
 * Cleared alongside selection/config when indicator selection is cleared.
 * ---------------------------------------------------------------------------
 */

export type VisualizerSidePanelView = "edit" | "insights";

export type VisualizerEditSettingsTabId = "basic" | "colors" | "typography";

export interface VisualizerUiStateEnvelopeV1 {
  v: 1;
  sidePanelOpen: boolean;
  sidePanelView: VisualizerSidePanelView;
  /** Active tab within the edit settings panel; ignored when view is "insights". */
  editSettingsTab: VisualizerEditSettingsTabId;
}

function isVisualizerUiStateEnvelopeV1(x: unknown): x is VisualizerUiStateEnvelopeV1 {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.v !== 1) return false;
  if (typeof o.sidePanelOpen !== "boolean") return false;
  if (o.sidePanelView !== "edit" && o.sidePanelView !== "insights") return false;
  if (o.editSettingsTab !== "basic" && o.editSettingsTab !== "colors" && o.editSettingsTab !== "typography") {
    return false;
  }
  return true;
}

export function setVisualizerUiStateToSession(state: {
  sidePanelOpen: boolean;
  sidePanelView: VisualizerSidePanelView;
  editSettingsTab?: VisualizerEditSettingsTabId;
}): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: VisualizerUiStateEnvelopeV1 = {
      v: 1,
      sidePanelOpen: state.sidePanelOpen,
      sidePanelView: state.sidePanelView,
      editSettingsTab: state.editSettingsTab ?? "basic",
    };
    sessionStorage.setItem(SESSION_STORAGE_KEYS.VISUALIZER_UI_STATE, JSON.stringify(envelope));
  } catch {
    // ignore quota / serialization errors
  }
}

export function getVisualizerUiStateFromSession(): VisualizerUiStateEnvelopeV1 | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEYS.VISUALIZER_UI_STATE);
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isVisualizerUiStateEnvelopeV1(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Sign-out while a gallery item was open: drop title/subtitle/description from the
 * persisted viz config so the next load uses data-derived headings, but keep chart
 * chrome (type, colors, fonts, mapping) for continuity.
 */
export function stripGalleryTextFromSessionVizConfig(): void {
  if (typeof window === "undefined") return;
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEYS.VISUALIZER_VIZ_CONFIG);
  if (raw == null || raw === "") return;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return;
    delete parsed.title;
    delete parsed.subtitle;
    delete parsed.description;
    parsed.showDescription = false;
    sessionStorage.setItem(
      SESSION_STORAGE_KEYS.VISUALIZER_VIZ_CONFIG,
      JSON.stringify(parsed),
    );
  } catch {
    // ignore
  }
}

/**
 * Persists pending visualization config used by save-to-gallery sign-in redirect.
 * When null, removes the key.
 */
export function setPendingVizConfigToSession(config: VisualizationConfig | null): void {
  if (typeof window === "undefined") return;
  if (!config) {
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_PENDING_VIZ_CONFIG);
    return;
  }
  try {
    sessionStorage.setItem(
      SESSION_STORAGE_KEYS.VISUALIZER_PENDING_VIZ_CONFIG,
      JSON.stringify(config)
    );
  } catch {
    // ignore quota/serialization errors
  }
}

/**
 * Reads pending visualization config from session.
 */
export function getPendingVizConfigFromSession(): VisualizationConfig | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(
    SESSION_STORAGE_KEYS.VISUALIZER_PENDING_VIZ_CONFIG
  );
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as VisualizationConfig;
  } catch {
    return null;
  }
}

/**
 * Clears pending visualization config from session.
 */
export function clearPendingVizConfigFromSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_PENDING_VIZ_CONFIG);
}
