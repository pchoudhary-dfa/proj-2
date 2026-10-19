/**
 * Title / subtitle / customLabel layout — shared height math and ECharts title[] builder.
 */

import type { TitleComponentOption } from 'echarts';
import type { ChartConfig, FontStyle } from './types';
import {
  buildEchartsTextStyle,
  DEFAULT_CUSTOM_LABEL_SIZE,
  DEFAULT_SUBTITLE_SIZE,
  DEFAULT_TITLE_SIZE,
  measureTextWidth,
  resolveUnderlineColor,
} from './fontUtils';

const TITLE_TOP_START = 4;
const LINE_GAP = 4;
/** Pixels below the title row top + font size where the underline is drawn. */
const UNDERLINE_OFFSET = 3;
/** ECharts `title.padding` default — text is inset this much from the box edge. */
const TITLE_PADDING = 5;

/** Horizontal alignment for a heading row (title / subtitle / customLabel). */
type HeadingAlign = 'left' | 'center' | 'right';

/** Normalize an optional alignment to a valid value, defaulting to centered. */
function resolveHeadingAlign(align: HeadingAlign | undefined): HeadingAlign {
  return align === 'left' || align === 'right' ? align : 'center';
}
/** Space between the title block and a top-positioned legend / colorbar. */
export const TITLE_LEGEND_GAP = 16;
/** Space between a top legend row and the plot grid. */
export const GRID_BELOW_TOP_LEGEND_GAP = 10;
/**
 * Minimum top inset for series legends (radar, line, …) when there is no title.
 * Not applied to map/heatmap visualMap — those stay flush like develop.
 */
export const DEFAULT_TOP_LEGEND_INSET = 14;

interface TitleRow {
  text: string;
  fontSize: number;
  font: FontStyle | undefined;
  defaultSize: number;
}

/** Compute stacked title block height (used for grid + legend top offset). */
export function computeTitleBlockHeight(config: ChartConfig): number {
  const rows: TitleRow[] = [];
  if (config.title) {
    rows.push({
      text: config.title,
      fontSize: config.titleFont?.size ?? DEFAULT_TITLE_SIZE,
      font: config.titleFont,
      defaultSize: DEFAULT_TITLE_SIZE,
    });
  }
  if (config.subtitle) {
    rows.push({
      text: config.subtitle,
      fontSize: config.subtitleFont?.size ?? DEFAULT_SUBTITLE_SIZE,
      font: config.subtitleFont,
      defaultSize: DEFAULT_SUBTITLE_SIZE,
    });
  }
  if (config.customLabel) {
    rows.push({
      text: config.customLabel,
      fontSize: config.customLabelFont?.size ?? DEFAULT_CUSTOM_LABEL_SIZE,
      font: config.customLabelFont,
      defaultSize: DEFAULT_CUSTOM_LABEL_SIZE,
    });
  }
  if (rows.length === 0) return 0;

  let y = TITLE_TOP_START;
  for (const row of rows) {
    y += row.fontSize + LINE_GAP;
  }
  return y + 8; // bottom padding before legend / plot
}

/**
 * Build one ECharts title row.
 * Rich-text tag names must be alphanumeric/underscore only — hyphens break ECharts parsing.
 * Underline is drawn separately via graphic lines (not combining characters).
 */
function buildTitleEntry(
  id: string,
  richKey: string,
  text: string,
  font: FontStyle | undefined,
  defaultSize: number,
  top: number,
  align: HeadingAlign
): TitleComponentOption {
  const richStyle = buildEchartsTextStyle(font, { size: defaultSize });

  // `left: 'left' | 'center' | 'right'` positions the (auto-width) title box and ECharts
  // derives the text anchor from it. Do NOT also set `textAlign` — that applies a second
  // horizontal shift on top of `left`, which leaves 'left' correct but pushes 'center' /
  // 'right' out of place.
  return {
    id,
    text: `{${richKey}|${text}}`,
    left: align,
    top,
    textStyle: {
      rich: {
        [richKey]: richStyle,
      },
    },
  };
}

/**
 * Graphic 1px line under a title row (matches measured text width), anchored to the same
 * edge as the row's alignment so it tracks left/center/right titles. The shape spans
 * `0..width`; the anchor (`left`/`right`) is offset by `TITLE_PADDING` to line up with the
 * title box's inset text, mirroring how ECharts positions `left: 'left' | 'right'` titles.
 */
function buildTitleUnderlineGraphic(
  id: string,
  text: string,
  font: FontStyle | undefined,
  defaultSize: number,
  top: number,
  align: HeadingAlign
): Record<string, unknown> {
  const fontSize = font?.size ?? defaultSize;
  const width = measureTextWidth(text, font, defaultSize);

  const anchor =
    align === 'left'
      ? { left: TITLE_PADDING }
      : align === 'right'
        ? { right: TITLE_PADDING }
        : { left: 'center' as const };

  return {
    id,
    type: 'line',
    ...anchor,
    top: top + fontSize + UNDERLINE_OFFSET,
    shape: { x1: 0, y1: 0, x2: width, y2: 0 },
    style: {
      stroke: resolveUnderlineColor(font),
      lineWidth: 1,
    },
    silent: true,
    z: 10,
  };
}

export interface TitleOptionResult {
  title?: TitleComponentOption[];
  graphic?: Record<string, unknown>[];
}

/** Build ECharts title[] with a running y cursor so font-size changes scale correctly. */
export function buildTitleOption(config: ChartConfig): TitleOptionResult {
  const rows: {
    id: string;
    richKey: string;
    text: string;
    font: FontStyle | undefined;
    defaultSize: number;
    align: HeadingAlign;
  }[] = [];
  if (config.title) {
    rows.push({
      id: 'dfa-title',
      richKey: 'dfaTitle',
      text: config.title,
      font: config.titleFont,
      defaultSize: DEFAULT_TITLE_SIZE,
      align: resolveHeadingAlign(config.titleAlign),
    });
  }
  if (config.subtitle) {
    rows.push({
      id: 'dfa-subtitle',
      richKey: 'dfaSubtitle',
      text: config.subtitle,
      font: config.subtitleFont,
      defaultSize: DEFAULT_SUBTITLE_SIZE,
      align: resolveHeadingAlign(config.subtitleAlign),
    });
  }
  if (config.customLabel) {
    rows.push({
      id: 'dfa-custom-label',
      richKey: 'dfaCustomLabel',
      text: config.customLabel,
      font: config.customLabelFont,
      defaultSize: DEFAULT_CUSTOM_LABEL_SIZE,
      align: resolveHeadingAlign(config.customLabelAlign),
    });
  }
  if (rows.length === 0) return {};

  const titles: TitleComponentOption[] = [];
  const graphics: Record<string, unknown>[] = [];
  let y = TITLE_TOP_START;

  for (const row of rows) {
    titles.push(buildTitleEntry(row.id, row.richKey, row.text, row.font, row.defaultSize, y, row.align));
    if (row.font?.underline) {
      graphics.push(
        buildTitleUnderlineGraphic(`${row.id}-underline`, row.text, row.font, row.defaultSize, y, row.align),
      );
    }
    const fontSize = row.font?.size ?? row.defaultSize;
    y += fontSize + LINE_GAP;
  }

  return {
    title: titles,
    ...(graphics.length > 0 ? { graphic: graphics } : {}),
  };
}
