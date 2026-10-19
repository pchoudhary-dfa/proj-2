/**
 * Shared `<th>` / `<td>` classes for `EditableDataGrid` tables with checkbox,
 * sticky primary column, and sticky actions column (indicators, units, …).
 * Checkbox width is `--tv-col-select-width` (36px) on `.tv-grid-table` — fixed
 * with max-width so wide tables (e.g. indicators) do not stretch the select column.
 * Keep column widths in table/grid column configs (not page CSS).
 *
 * Action columns use exactly two widths:
 * - {@link DUAL_ACTION_COLUMN_WIDTH} (148px) — icon + labeled button (dataset Open, compute Run, …)
 * - {@link ICON_ACTION_COLUMN_WIDTH} (72px) — icon-only (workflow Configure, inline save/cancel, …)
 */

import type { CSSProperties } from "react";

/** Checkbox column — label row */
export const TV_COL_SELECT_TH = "tv-col-select-th";
/** Checkbox column — filter row */
export const TV_COL_SELECT_FILTER_TH = "tv-col-select-filter-th";
/** Checkbox column — body */
export const TV_COL_SELECT_TD = "tv-col-select-td";

/** First data column, sticky after checkbox — label row */
export const TV_COL_PRIMARY_STICKY_TH = "tv-col-primary-sticky-th";
/** First data column — filter row */
export const TV_COL_PRIMARY_STICKY_FILTER_TH = "tv-col-primary-sticky-filter-th";
/** First data column — body */
export const TV_COL_PRIMARY_STICKY_TD = "tv-col-primary-sticky-td";

/** Non-style hook for scripted focus/query selectors. */
export const TV_COL_KEY_HIGH = "tv-col-high";

/** Icon + labeled button (Configure + Open, Run + delete, …). */
export const DUAL_ACTION_COLUMN_WIDTH = 148;
/** Icon-only actions (Configure, save/cancel pair, …). */
export const ICON_ACTION_COLUMN_WIDTH = 100;

export const DUAL_ACTION_COLUMN_LAYOUT = {
  width: DUAL_ACTION_COLUMN_WIDTH,
  minWidth: DUAL_ACTION_COLUMN_WIDTH,
  maxWidth: DUAL_ACTION_COLUMN_WIDTH,
  sticky: "right" as const,
};

export const ICON_ACTION_COLUMN_LAYOUT = {
  width: ICON_ACTION_COLUMN_WIDTH,
  minWidth: ICON_ACTION_COLUMN_WIDTH,
  maxWidth: ICON_ACTION_COLUMN_WIDTH,
  sticky: "right" as const,
};

const TV_COL_ACTIONS_DUAL_W = `box-border w-[${DUAL_ACTION_COLUMN_WIDTH}px] min-w-[${DUAL_ACTION_COLUMN_WIDTH}px] max-w-[${DUAL_ACTION_COLUMN_WIDTH}px]`;
const TV_COL_ACTIONS_ICON_W = `box-border w-[${ICON_ACTION_COLUMN_WIDTH}px] min-w-[${ICON_ACTION_COLUMN_WIDTH}px] max-w-[${ICON_ACTION_COLUMN_WIDTH}px]`;

/** Inline styles for dual-action header/filter cells (locks width under `table-layout: fixed`). */
export function dualActionColumnThExtras(
  width: number = DUAL_ACTION_COLUMN_WIDTH
): {
  headerThStyle: CSSProperties;
  filterThExtraProps: { style: CSSProperties };
} {
  const style: CSSProperties = {
    width,
    minWidth: width,
    maxWidth: width,
  };
  return {
    headerThStyle: style,
    filterThExtraProps: { style },
  };
}

/**
 * Keep long header labels inside their column — set `headerTextClamp: true` on the column def.
 * Covers sort headers (`.th-sort-wrap`) and plain label headers (`.th-merged-label`).
 */
export const GRID_HEADER_TEXT_CLAMP =
  "overflow-hidden [&_.th-merged-label]:min-w-0 [&_.th-merged-label]:overflow-hidden [&_.th-sort-wrap]:w-full [&_.th-sort-wrap]:max-w-full [&_.th-sort-wrap]:min-w-0 [&_.th-sort-wrap>span]:block [&_.th-sort-wrap>span]:truncate";

/** Clip body cell content — set `cellOverflowHidden: true` on the column def. */
export const GRID_CELL_OVERFLOW_HIDDEN = "overflow-hidden";

/** Compact bordered grid icon — `btn-comp-ghost--grid-icon` + tone in globals.css. */
const TV_GRID_ICON = "btn-comp-ghost--grid-icon";

/**
 * Configure (settings) — grid icon + primary tone.
 * Prefer {@link GridConfigureButton} from `@/components/GridConfigureButton`.
 */
export const TV_GRID_CONFIGURE_BTN = `${TV_GRID_ICON} btn-comp-ghost--primary`;

/** Bordered grid control with short label — same height as grid-icon, auto width for text. */
export const TV_GRID_CONFIGURE_LABELED_BTN = "btn-comp-ghost--grid-labeled";

/** Inline grid save (check) — grid icon + success tone. */
export const TV_GRID_SAVE_BTN = `${TV_GRID_ICON} btn-comp-ghost--success`;

/** Inline grid cancel (close) — grid icon + danger tone. */
export const TV_GRID_CANCEL_BTN = `${TV_GRID_ICON} btn-comp-ghost--danger`;

/** Sticky add-row save/cancel — {@link ICON_ACTION_COLUMN_WIDTH}px. */
export const ADD_ROW_ACTIONS_TD_ICON = `tv-col-actions-td-icon indicator-actions-col add-row-actions-center sticky right-0 z-20 ${TV_COL_ACTIONS_ICON_W} border-l border-border bg-inherit`;

/** Sticky actions column ({@link ICON_ACTION_COLUMN_WIDTH}px) — icon-only buttons. */
export const TV_COL_ACTIONS_TH_ICON =
  `tv-col-actions-th-icon indicator-actions-col add-row-actions-center sticky right-0 z-50 ${TV_COL_ACTIONS_ICON_W} border-l border-border bg-surface-muted text-center`;
export const TV_COL_ACTIONS_FILTER_TH_ICON =
  `tv-col-actions-filter-th-icon indicator-actions-col add-row-actions-center th-search-cell sticky right-0 z-50 ${TV_COL_ACTIONS_ICON_W} border-l border-border bg-surface-muted`;
export const TV_COL_ACTIONS_TD_ICON =
  `tv-col-actions-td-icon indicator-actions-col add-row-actions-center sticky right-0 z-20 ${TV_COL_ACTIONS_ICON_W} border-l border-border bg-surface`;

/** Sticky actions column ({@link DUAL_ACTION_COLUMN_WIDTH}px) — labeled + icon button pair. */
export const TV_COL_ACTIONS_TH_DUAL =
  `tv-col-actions-th-dual indicator-actions-col add-row-actions-center sticky right-0 z-50 ${TV_COL_ACTIONS_DUAL_W} border-l border-border bg-surface-muted text-center`;
export const TV_COL_ACTIONS_FILTER_TH_DUAL =
  `tv-col-actions-filter-th-dual indicator-actions-col add-row-actions-center th-search-cell sticky right-0 z-50 ${TV_COL_ACTIONS_DUAL_W} border-l border-border bg-surface-muted`;
export const TV_COL_ACTIONS_TD_DUAL =
  `tv-col-actions-td-dual indicator-actions-col add-row-actions-center sticky right-0 z-20 ${TV_COL_ACTIONS_DUAL_W} border-l border-border bg-surface`;
