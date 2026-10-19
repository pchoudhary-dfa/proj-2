/**
 * Public types for the chip search component.
 */

export interface Keyword {
  keywordId: number | string;
  keywordType: string;
  displayText: string;
}

export interface DfaPayload {
  indicator_id: number | null;
  area_id: number | null;
  time_period_id: number | null;
  subgroup_id: number | null;
}

export interface ChipSearchStrings {
  placeholder?: string;
  searchBtnLabel?: string;
  searchLabel?: string;
  clearAllLabel?: string;
  noRecordLabel?: string;
  emptyLabel?: string;
  loadingLabel?: string;
  /** Shown as native tooltip when search button is disabled (e.g. requireIndicatorForSearch but no indicator selected). */
  searchBtnDisabledTooltip?: string;
}

export interface ChipSearchDetail {
  chips: Keyword[];
  payload: unknown;
}

export type ChipSearchCallback = (detail: ChipSearchDetail) => void;

/**
 * Optional layout and chip appearance. Pass as a plain object (or JSON).
 * All fields are optional; omit keys you do not want to override.
 */
export interface ChipSearchStyle {
  /**
   * Fixed shell height in px. When set, padding, font sizes, icons, and dropdown scale proportionally.
   */
  height?: number;
  /**
   * Chip overflow when width is tight: `"shrink"` (default) or `"scroll"` (horizontal chip strip scroll).
   * Only applies when `height` is set.
   */
  chipBehavior?: "shrink" | "scroll";
  /** Chip background, e.g. `var(--color-primary)` or `var(--color-surface-muted)`. */
  bgColor?: string;
  /** Label and × icon colour, e.g. `var(--color-on-primary)` or `var(--color-text)`. */
  textColor?: string;
  /** Full border shorthand, e.g. `1.5px solid var(--color-border)`. */
  borderColor?: string;
  /** Circular background behind the in-chip remove (×) control. */
  crossBgColor?: string;
}

/** @deprecated Use `ChipSearchStyle` instead. */
export type ChipSearchChipStyle = ChipSearchStyle;

export interface ChipSearchOptions {
  /** Base URL for the search API. Suggestions are fetched from baseUrl/search. */
  baseUrl: string;
  /** Locale for `Accept-Language`; applied in the component over optional `headers`. */
  locale?: string;
  minChars?: number;
  debounceMs?: number;
  strings?: ChipSearchStrings;
  payloadPreset?: "dfa";
  enabledSearchbtn?: boolean;
  enabledClearAll?: boolean;
  /** When true, search button is enabled only when at least one chip has keywordType "INDICATOR". */
  requireIndicatorForSearch?: boolean;
  preLoadedData?: string;
  callback?: ChipSearchCallback;
  searchBtnCallback?: ChipSearchCallback;
  onSearch?: ChipSearchCallback;
  onChange?: ChipSearchCallback;
  mapChipsToPayload?: (chips: Keyword[]) => unknown;
  formatKeywordType?: (type: string) => string;
  fetchOptions?: RequestInit;
  /**
   * When proxy disabled: pass `buildHeaders()` from the app (auth/signing). Do not pass `acceptLanguage` — use `locale`.
   * When proxy enabled: omit; only Accept-Language is sent.
   */
  headers?: Record<string, string>;
  /**
   * Layout and chip styling (`height`, `chipBehavior`, `bgColor`, `textColor`, `borderColor`, `crossBgColor`).
   * Plain object or JSON-shaped values. See {@link ChipSearchStyle}.
   */
  style?: ChipSearchStyle;
}

export interface ChipSearchInstance {
  destroy(): void;
  getState(): { chips: Keyword[]; currentQuery: string };
  setChips(chips: Keyword[]): void;
  clear(): void;
  focus(): void;
}
