import type { CSSProperties } from "react";
import type { EditableGridColumnDef } from "@/components/TableView";
import {
  DUAL_ACTION_COLUMN_WIDTH,
  GRID_CELL_OVERFLOW_HIDDEN,
  GRID_HEADER_TEXT_CLAMP,
  ICON_ACTION_COLUMN_WIDTH,
  TV_COL_ACTIONS_FILTER_TH_DUAL,
  TV_COL_ACTIONS_FILTER_TH_ICON,
  TV_COL_ACTIONS_TD_DUAL,
  TV_COL_ACTIONS_TD_ICON,
  TV_COL_ACTIONS_TH_DUAL,
  TV_COL_ACTIONS_TH_ICON,
  TV_COL_PRIMARY_STICKY_FILTER_TH,
  TV_COL_PRIMARY_STICKY_TD,
  TV_COL_PRIMARY_STICKY_TH,
  TV_COL_SELECT_FILTER_TH,
  TV_COL_SELECT_TD,
  TV_COL_SELECT_TH,
} from "@/components/editableGridColumnClasses";

export type GridColumnStickySide = "none" | "leftPrimary" | "left" | "right";

/**
 * Width tiers for `layout.width` (1 = checkbox column).
 * Values >= 20 are treated as raw pixel width.
 */
export const GRID_COLUMN_WIDTH_TIERS: Record<number, number> = {
  1: 36,
  2: 72,
  3: 100,
  4: 108,
  5: 160,
  6: 180,
  7: 220,
  8: 240,
  9: 280,
  10: 380,
};

export type GridColumnLayout = {
  /** Numeric tier (1–10) or px (>= 20). Use `unit: "%"` for table percentage widths. */
  width: number;
  /** Optional min width in px. */
  minWidth?: number;
  maxWidth?: number;
  unit?: "px" | "%";
  /** `true` = sticky primary column after checkbox; `"right"` = sticky actions column. */
  sticky?: boolean | GridColumnStickySide;
  /**
   * Under `table-layout: fixed`, this column absorbs horizontal slack (no fixed width/max).
   * Use on one primary data column so sticky action columns stay at their fixed width.
   */
  main?: boolean;
};

function resolveNumericGridWidthPx(width: number): number {
  if (width in GRID_COLUMN_WIDTH_TIERS) {
    return GRID_COLUMN_WIDTH_TIERS[width]!;
  }
  if (width >= 20) {
    return width;
  }
  return GRID_COLUMN_WIDTH_TIERS[5] ?? 160;
}

function normalizeGridColumnStickySide(
  sticky?: boolean | GridColumnStickySide
): GridColumnStickySide {
  if (sticky === true || sticky === "leftPrimary") {
    return "leftPrimary";
  }
  if (sticky === "left" || sticky === "right") {
    return sticky;
  }
  return "none";
}

function cssWidth(value: number, unit: "px" | "%" = "px"): string | number {
  return unit === "%" ? `${value}%` : value;
}

/** Sticky actions columns with fixed CSS width hooks — skip inline width when matched. */
function stickyRightUsesActionClasses(width: number): boolean {
  const px = resolveNumericGridWidthPx(width);
  return px === ICON_ACTION_COLUMN_WIDTH || px === DUAL_ACTION_COLUMN_WIDTH;
}

const BOX = "box-border";

/** Sticky trailing data column (not icon/dual action width). */
const STICKY_RIGHT_DATA_TH =
  "sticky right-0 z-50 border-l border-border bg-surface-muted px-2 py-2";
const STICKY_RIGHT_DATA_FILTER_TH =
  "th-search-cell sticky right-0 z-50 border-l border-border bg-surface-muted p-1";
const STICKY_RIGHT_DATA_TD =
  "sticky right-0 z-20 border-l border-border bg-surface";
const STICKY_LEFT_TH =
  "sticky left-0 z-50 border-r border-border bg-surface-muted";
const STICKY_LEFT_FILTER_TH =
  "th-search-cell sticky left-0 z-50 border-r border-border bg-surface-muted";
const STICKY_LEFT_TD = "sticky left-0 z-20 border-r border-border bg-surface";

export type ResolveGridColumnClassesOptions = {
  showFilterRow?: boolean;
  /** When set, enables stacked sticky-left chrome (inset borders, etc.). */
  columns?: EditableGridColumnDef<unknown>[];
  columnIndex?: number;
};

function isLeadingStickyColumn<TRow>(
  col: EditableGridColumnDef<TRow>
): boolean {
  if (col.layout?.width === 1) {
    return true;
  }
  const sticky = normalizeGridColumnStickySide(col.layout?.sticky);
  return sticky === "left" || sticky === "leftPrimary";
}

/** Rendered width for sticky inset math. */
function resolveGridColumnWidthPx<TRow>(
  col: EditableGridColumnDef<TRow>
): number {
  if (!col.layout) {
    return 0;
  }
  if (col.layout.width === 1) {
    return GRID_COLUMN_WIDTH_TIERS[1] ?? 36;
  }
  const { width, minWidth, maxWidth, unit = "px" } = col.layout;
  const px = resolveNumericGridWidthPx(width);
  if (stickyRightUsesActionClasses(width)) {
    if (px === ICON_ACTION_COLUMN_WIDTH) {
      return 80;
    }
    if (px === DUAL_ACTION_COLUMN_WIDTH) {
      return DUAL_ACTION_COLUMN_WIDTH;
    }
  }
  if (maxWidth != null) {
    return maxWidth;
  }
  if (minWidth != null) {
    return minWidth;
  }
  if (unit === "px") {
    return px;
  }
  return px;
}

function hasFollowingLeadingStickyColumn<TRow>(
  columns: EditableGridColumnDef<TRow>[],
  columnIndex: number
): boolean {
  const next = columns[columnIndex + 1];
  return next != null && isLeadingStickyColumn(next);
}

function appendLeadingStickyLeftChrome<TRow>(
  parts: string[],
  col: EditableGridColumnDef<TRow>,
  options?: ResolveGridColumnClassesOptions
): void {
  if (options?.columns == null || options.columnIndex == null) {
    return;
  }
  const sticky = normalizeGridColumnStickySide(col.layout?.sticky);
  if (
    sticky === "left" &&
    hasFollowingLeadingStickyColumn(options.columns, options.columnIndex)
  ) {
    parts.push("!border-r-0");
  }
}

/** Inline width/min/max from numeric `layout`. */
export function resolveGridColumnCellStyle<TRow>(
  col: EditableGridColumnDef<TRow>
): CSSProperties | undefined {
  if (!col.layout) {
    return undefined;
  }
  const { width, minWidth, maxWidth, unit = "px", sticky, main } = col.layout;

  if (width === 1) {
    return undefined;
  }

  const stickySide = normalizeGridColumnStickySide(sticky);
  if (stickySide === "right" && stickyRightUsesActionClasses(width)) {
    return undefined;
  }

  const resolvedPx = unit === "px" ? resolveNumericGridWidthPx(width) : width;

  if (main) {
    const style: CSSProperties = { width: "auto", maxWidth: "none" };
    if (minWidth != null) {
      style.minWidth = minWidth;
    } else if (unit === "px") {
      style.minWidth = resolvedPx;
    } else {
      style.minWidth = cssWidth(resolvedPx, unit);
    }
    if (maxWidth != null) {
      style.maxWidth = maxWidth;
    }
    return style;
  }

  const style: CSSProperties = {
    width: cssWidth(resolvedPx, unit),
  };

  if (minWidth != null) {
    style.minWidth = minWidth;
  } else if (unit === "px") {
    style.minWidth = resolvedPx;
  }

  if (maxWidth != null) {
    style.maxWidth = maxWidth;
  } else if (unit === "px") {
    style.maxWidth = resolvedPx;
  }

  return style;
}

function stickyRightThClasses(width: number, hasFilter: boolean): string[] {
  const px = resolveNumericGridWidthPx(width);
  if (px === ICON_ACTION_COLUMN_WIDTH) {
    return [hasFilter ? TV_COL_ACTIONS_FILTER_TH_ICON : TV_COL_ACTIONS_TH_ICON];
  }
  if (px === DUAL_ACTION_COLUMN_WIDTH) {
    return [hasFilter ? TV_COL_ACTIONS_FILTER_TH_DUAL : TV_COL_ACTIONS_TH_DUAL];
  }
  return [
    hasFilter ? STICKY_RIGHT_DATA_FILTER_TH : STICKY_RIGHT_DATA_TH,
    BOX,
  ];
}

function stickyRightTdClasses(width: number): string[] {
  const px = resolveNumericGridWidthPx(width);
  if (px === ICON_ACTION_COLUMN_WIDTH) {
    return [TV_COL_ACTIONS_TD_ICON];
  }
  if (px === DUAL_ACTION_COLUMN_WIDTH) {
    return [TV_COL_ACTIONS_TD_DUAL];
  }
  return [STICKY_RIGHT_DATA_TD, BOX];
}

/** Rendered width for sticky-right inset math (matches globals.css action vars). */
function resolveStickyRightColumnWidthPx<TRow>(
  col: EditableGridColumnDef<TRow>
): number {
  return resolveGridColumnWidthPx(col);
}

function trailingStickyRightColumns<TRow>(
  columns: EditableGridColumnDef<TRow>[],
  columnIndex: number
): EditableGridColumnDef<TRow>[] {
  const trailing: EditableGridColumnDef<TRow>[] = [];
  for (let i = columnIndex + 1; i < columns.length; i++) {
    const next = columns[i];
    if (normalizeGridColumnStickySide(next.layout?.sticky) === "right") {
      trailing.push(next);
    }
  }
  return trailing;
}

/**
 * Inline sticky inset (`left` / `right`) for stacked sticky columns.
 * Leading sticky-left columns after the first (e.g. Path after ID) and
 * trailing sticky-right columns before the edge (e.g. Status before Action).
 */
export function resolveGridColumnStickyInsetStyle<TRow>(
  col: EditableGridColumnDef<TRow>,
  columns: EditableGridColumnDef<TRow>[],
  columnIndex: number
): CSSProperties | undefined {
  const sticky = normalizeGridColumnStickySide(col.layout?.sticky);
  const inset: CSSProperties = {};

  if (sticky === "right") {
    const trailing = trailingStickyRightColumns(columns, columnIndex);
    if (trailing.length > 0) {
      if (trailing.length === 1) {
        const width = trailing[0].layout?.width;
        if (width != null && stickyRightUsesActionClasses(width)) {
          const px = resolveNumericGridWidthPx(width);
          if (px === ICON_ACTION_COLUMN_WIDTH) {
            inset.right = "var(--tv-col-actions-icon-width)";
          } else if (px === DUAL_ACTION_COLUMN_WIDTH) {
            inset.right = "var(--tv-col-actions-dual-width)";
          }
        }
      }
      if (inset.right == null) {
        const offsetPx = trailing.reduce(
          (sum, trailingCol) =>
            sum + resolveStickyRightColumnWidthPx(trailingCol),
          0
        );
        if (offsetPx > 0) {
          inset.right = offsetPx;
        }
      }
    }
  } else if (
    (sticky === "left" || sticky === "leftPrimary") &&
    col.layout?.width !== 1
  ) {
    const preceding = columns
      .slice(0, columnIndex)
      .filter(isLeadingStickyColumn);
    if (preceding.length > 0) {
      if (
        preceding.length === 1 &&
        preceding[0].layout?.width === 1
      ) {
        inset.left = "var(--tv-col-select-width, 36px)";
      } else {
        const offsetPx = preceding.reduce(
          (sum, leadingCol) => sum + resolveGridColumnWidthPx(leadingCol),
          0
        );
        if (offsetPx > 0) {
          inset.left = offsetPx;
        }
      }
    }
  }

  return Object.keys(inset).length > 0 ? inset : undefined;
}

function appendHeaderTextClamp<TRow>(
  parts: string[],
  col: EditableGridColumnDef<TRow>
): void {
  if (col.headerTextClamp) {
    parts.push(GRID_HEADER_TEXT_CLAMP);
  }
}

function appendCellOverflowHidden<TRow>(
  parts: string[],
  col: EditableGridColumnDef<TRow>
): void {
  if (col.cellOverflowHidden) {
    parts.push(GRID_CELL_OVERFLOW_HIDDEN);
  }
}

export function resolveGridColumnThClasses<TRow>(
  col: EditableGridColumnDef<TRow>,
  options?: ResolveGridColumnClassesOptions
): string {
  if (!col.layout) {
    const parts: string[] = [];
    appendHeaderTextClamp(parts, col);
    if (col.headerThClassName) parts.push(col.headerThClassName);
    return parts.filter(Boolean).join(" ");
  }
  const { width } = col.layout;
  const sticky = normalizeGridColumnStickySide(col.layout.sticky);
  const hasFilter =
    options?.showFilterRow !== false && col.filterCell != null;
  const parts: string[] = [];

  if (width === 1) {
    parts.push(hasFilter ? TV_COL_SELECT_FILTER_TH : TV_COL_SELECT_TH);
  } else if (sticky === "right") {
    parts.push(...stickyRightThClasses(width, hasFilter));
  } else if (sticky === "left") {
    parts.push(hasFilter ? STICKY_LEFT_FILTER_TH : STICKY_LEFT_TH);
    parts.push(BOX);
    appendLeadingStickyLeftChrome(parts, col, options);
  } else if (sticky === "leftPrimary") {
    parts.push(
      hasFilter ? TV_COL_PRIMARY_STICKY_FILTER_TH : TV_COL_PRIMARY_STICKY_TH
    );
    parts.push(BOX);
    if (hasFilter) {
      parts.push("th-search-cell");
    }
  } else {
    parts.push(BOX);
    if (hasFilter) {
      parts.push("th-search-cell");
    }
  }

  if (col.layout.main) {
    parts.push("tv-col-main");
  }

  appendHeaderTextClamp(parts, col);
  if (col.headerThClassName) parts.push(col.headerThClassName);
  if (col.filterThClassName) parts.push(col.filterThClassName);

  return parts.filter(Boolean).join(" ");
}

export function resolveGridColumnTdClasses<TRow>(
  col: EditableGridColumnDef<TRow>,
  options?: ResolveGridColumnClassesOptions
): string {
  if (!col.layout) {
    const parts: string[] = [];
    appendCellOverflowHidden(parts, col);
    if (col.className) parts.push(col.className);
    return parts.filter(Boolean).join(" ");
  }
  const { width } = col.layout;
  const sticky = normalizeGridColumnStickySide(col.layout.sticky);
  const parts: string[] = [];

  if (width === 1) {
    parts.push(TV_COL_SELECT_TD);
  } else if (sticky === "right") {
    parts.push(...stickyRightTdClasses(width));
  } else {
    parts.push(BOX);
    if (sticky === "leftPrimary") {
      parts.push(TV_COL_PRIMARY_STICKY_TD);
    } else if (sticky === "left") {
      parts.push(STICKY_LEFT_TD);
      appendLeadingStickyLeftChrome(parts, col, options);
    }
  }

  if (col.layout.main) {
    parts.push("tv-col-main");
  }

  appendCellOverflowHidden(parts, col);
  if (col.className) parts.push(col.className);

  return parts.filter(Boolean).join(" ");
}

/** `<col>` width for `table-layout: fixed` — main column stays auto so it absorbs slack. */
export function resolveGridColElementStyle<TRow>(
  col: EditableGridColumnDef<TRow>
): CSSProperties | undefined {
  if (!col.layout) {
    return undefined;
  }
  const { width, minWidth, unit = "px", sticky, main } = col.layout;
  if (width === 1) {
    return { width: "var(--tv-col-select-width, 36px)" };
  }
  const stickySide = normalizeGridColumnStickySide(sticky);
  if (stickySide === "right" && stickyRightUsesActionClasses(width)) {
    const px = resolveNumericGridWidthPx(width);
    return { width: `${px}px` };
  }
  if (main) {
    const style: CSSProperties = { width: "auto" };
    if (minWidth != null) {
      style.minWidth = minWidth;
    } else if (unit === "%") {
      style.minWidth = `${width}%`;
    } else {
      style.minWidth = resolveNumericGridWidthPx(width);
    }
    return style;
  }
  if (unit === "%") {
    return { width: `${width}%` };
  }
  const px = resolveNumericGridWidthPx(width);
  return { width: `${px}px` };
}

export function gridColElementClassName<TRow>(
  col: EditableGridColumnDef<TRow>
): string | undefined {
  if (!col.layout) {
    return undefined;
  }
  if (col.layout.main) {
    return "tv-col-main";
  }
  const stickySide = normalizeGridColumnStickySide(col.layout.sticky);
  if (stickySide !== "right") {
    return undefined;
  }
  if (col.layout.width === DUAL_ACTION_COLUMN_WIDTH) {
    return "tv-col-actions-col-dual";
  }
  if (col.layout.width === ICON_ACTION_COLUMN_WIDTH) {
    return "tv-col-actions-col-icon";
  }
  return undefined;
}

