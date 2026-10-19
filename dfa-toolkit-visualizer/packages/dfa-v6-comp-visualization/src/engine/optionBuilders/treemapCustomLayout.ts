/**
 * Custom treemap layout algorithms: slice-and-dice and stripes.
 *
 * ECharts natively supports only the squarified algorithm. These functions
 * produce pixel-space rectangles that can be drawn via ECharts custom series.
 */

import type { TreemapNode } from '../types';
import type { FontStyle, RequiredFontStyle } from '../types';

export interface LayoutRect {
  name: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 1 = top-level node, 2 = child node */
  depth: number;
  /** Palette color assigned to this rectangle */
  color: string;
  parentName?: string;
  formattedValue?: string;
  unitFormatCode?: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Layout algorithms ────────────────────────────────────────────────────────

/**
 * Slice-and-dice layout: alternates split direction per depth level.
 * Depth 1 (top-level): horizontal split (left to right).
 * Depth 2 (children): vertical split (top to bottom inside each parent).
 * Each child's share is proportional to its value.
 */
export function layoutSliceDice(
  nodes: TreemapNode[],
  container: Rect,
  palette: string[],
  gap = 2,
): LayoutRect[] {
  const results: LayoutRect[] = [];
  _split(nodes, container, 1, undefined, palette, 'alternate', 'horizontal', gap, results);
  return results;
}

/**
 * Stripes layout: all depth levels split in the same fixed direction.
 * 'vertical'   → rows stacked at every depth (split along Y).
 * 'horizontal' → columns side by side at every depth (split along X).
 */
export function layoutStripes(
  nodes: TreemapNode[],
  container: Rect,
  palette: string[],
  direction: 'vertical' | 'horizontal' = 'vertical',
  gap = 2,
): LayoutRect[] {
  const results: LayoutRect[] = [];
  _split(nodes, container, 1, undefined, palette, 'fixed', direction, gap, results);
  return results;
}

function _split(
  nodes: TreemapNode[],
  container: Rect,
  depth: number,
  parentName: string | undefined,
  palette: string[],
  mode: 'alternate' | 'fixed',
  direction: 'horizontal' | 'vertical',
  gap: number,
  results: LayoutRect[],
): void {
  const total = nodes.reduce((s, n) => s + Math.max(n.value, 0), 0);
  if (total === 0 || container.width <= 0 || container.height <= 0) return;

  // 'horizontal' split = items arranged left to right (split along X axis).
  // 'vertical'   split = items arranged top to bottom (split along Y axis).
  const splitH = direction === 'horizontal';

  let cursor = splitH ? container.x : container.y;
  const available = splitH ? container.width : container.height;
  const totalGaps = (nodes.length - 1) * gap;
  const availableForContent = Math.max(available - totalGaps, 0);

  nodes.forEach((node, i) => {
    const share = Math.max(node.value, 0) / total;
    const isLast = i === nodes.length - 1;
    // Last child fills the remaining space to avoid floating-point drift.
    const dim = isLast
      ? (splitH
          ? container.x + container.width - cursor
          : container.y + container.height - cursor)
      : Math.round(share * availableForContent);

    const w = splitH ? dim : container.width;
    const h = splitH ? container.height : dim;

    const color = depth === 1 ? palette[i % palette.length] : palette[i % palette.length];

    results.push({
      name: node.name,
      value: node.value,
      x: container.x + (splitH ? cursor - container.x : 0),
      y: container.y + (splitH ? 0 : cursor - container.y),
      width: Math.max(w, 0),
      height: Math.max(h, 0),
      depth,
      color,
      parentName,
      formattedValue: node.formattedValue,
      unitFormatCode: node.unitFormatCode,
    });

    if (node.children && node.children.length > 0) {
      const childRect: Rect = {
        x: container.x + (splitH ? cursor - container.x : 0),
        y: container.y + (splitH ? 0 : cursor - container.y),
        width: Math.max(w, 0),
        height: Math.max(h, 0),
      };
      // Next direction: for 'alternate' mode flip, for 'fixed' mode keep same.
      const nextDir: 'horizontal' | 'vertical' = mode === 'alternate'
        ? (direction === 'horizontal' ? 'vertical' : 'horizontal')
        : direction;
      _split(node.children, childRect, depth + 1, node.name, palette, mode, nextDir, gap, results);
    }

    cursor += dim + (isLast ? 0 : gap);
  });
}

// ─── Canvas margin helper ─────────────────────────────────────────────────────

export interface ChartMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Compute pixel margins consumed by the title block and legend so the
 * custom-series rectangles don't paint over them.
 *
 * Mirrors the logic in cartesian.ts (gridTopWithTopLegend, buildLegend) but
 * expressed as four margin values for coordinateSystem:'none' rendering.
 */
export function computeTreemapMargins(config: {
  title?: string;
  subtitle?: string;
  customLabel?: string;
  titleFont?: { size?: number };
  subtitleFont?: { size?: number };
  customLabelFont?: { size?: number };
  showLegend: boolean;
  legendPosition: 'top' | 'bottom' | 'left' | 'right';
  legendFont: { size: number };
  legendBackground?: string;
  legendBorder?: { color?: string; width?: number; radius?: number };
}): ChartMargins {
  // Title block height — matches computeTitleBlockHeight() in titleLayout.ts
  const TITLE_TOP_START = 4;
  const LINE_GAP = 4;
  const DEFAULT_TITLE_SIZE = 18;
  const DEFAULT_SUBTITLE_SIZE = 14;
  const DEFAULT_CUSTOM_LABEL_SIZE = 12;

  const rows: Array<{ fontSize: number }> = [];
  if (config.title)       rows.push({ fontSize: config.titleFont?.size       ?? DEFAULT_TITLE_SIZE });
  if (config.subtitle)    rows.push({ fontSize: config.subtitleFont?.size    ?? DEFAULT_SUBTITLE_SIZE });
  if (config.customLabel) rows.push({ fontSize: config.customLabelFont?.size ?? DEFAULT_CUSTOM_LABEL_SIZE });

  let titleBlockH = 0;
  if (rows.length > 0) {
    let y = TITLE_TOP_START;
    for (const row of rows) y += row.fontSize + LINE_GAP;
    titleBlockH = y + 8;
  }

  // Legend dimensions — mirrors constants from cartesian.ts
  const TITLE_LEGEND_GAP = 16;
  const GRID_BELOW_TOP_LEGEND_GAP = 10;
  const LEGEND_SCROLL_HEIGHT = 40;
  const LEGEND_SCROLL_WIDTH = 120;
  const LEGEND_EDGE_PADDING = 10;
  const EDGE_PAD = 4; // small breathing room between content and edge

  const hasLegend = config.showLegend;
  const pos = config.legendPosition;
  const chromePad = hasLegend && (config.legendBackground || config.legendBorder) ? 12 : 0;
  const legendRowH = hasLegend && (pos === 'top' || pos === 'bottom')
    ? Math.max(14, config.legendFont.size) + 8 + chromePad
    : 0;
  const legendColW = hasLegend && (pos === 'left' || pos === 'right')
    ? LEGEND_SCROLL_WIDTH + LEGEND_EDGE_PADDING
    : 0;

  let top = 0;
  let bottom = EDGE_PAD;
  let left = EDGE_PAD;
  let right = EDGE_PAD;

  if (hasLegend && pos === 'top') {
    const legendTop = titleBlockH > 0 ? titleBlockH + TITLE_LEGEND_GAP : 0;
    top = legendTop + legendRowH + GRID_BELOW_TOP_LEGEND_GAP;
  } else if (hasLegend && pos === 'bottom') {
    top = titleBlockH + (titleBlockH > 0 ? EDGE_PAD : 20);
    bottom = LEGEND_SCROLL_HEIGHT + 8;
  } else if (hasLegend && pos === 'left') {
    top = titleBlockH + (titleBlockH > 0 ? EDGE_PAD : 20);
    left = legendColW;
  } else if (hasLegend && pos === 'right') {
    top = titleBlockH + (titleBlockH > 0 ? EDGE_PAD : 20);
    right = legendColW;
  } else {
    // No legend
    top = titleBlockH + (titleBlockH > 0 ? EDGE_PAD : 20);
  }

  return { top, bottom, left, right };
}

/**
 * Native ECharts treemap centers its content in an 80% box (≈10% gutter per
 * side). The custom-series variants (slice-and-dice, stripes) render at
 * `coordinateSystem: 'none'`, so they must reproduce that gutter manually —
 * otherwise cells paint edge-to-edge and look inconsistent with the native
 * treemap.
 */
const TREEMAP_CONTENT_GUTTER_RATIO = 0.1;

/**
 * Resolve the pixel draw area for custom-series treemaps.
 *
 * Starts from the title/legend margins (so reserved title and legend space is
 * preserved) and then guarantees a minimum proportional gutter on every side so
 * the padding matches the native ECharts treemap. Using `Math.max` means a tall
 * title block or a wide legend column still wins when it needs more room than
 * the gutter.
 */
export function resolveTreemapDrawArea(
  canvasW: number,
  canvasH: number,
  margins: ChartMargins,
): { x: number; y: number; width: number; height: number } {
  const gutterX = canvasW * TREEMAP_CONTENT_GUTTER_RATIO;
  const gutterY = canvasH * TREEMAP_CONTENT_GUTTER_RATIO;

  const left = Math.max(margins.left, gutterX);
  const right = Math.max(margins.right, gutterX);
  const top = Math.max(margins.top, gutterY);
  const bottom = Math.max(margins.bottom, gutterY);

  return {
    x: left,
    y: top,
    width: Math.max(canvasW - left - right, 1),
    height: Math.max(canvasH - top - bottom, 1),
  };
}

// ─── Shared label renderer ────────────────────────────────────────────────────

/** Skip labels only when the rect is effectively invisible. */
const LABEL_MIN_DIM = 3;

/**
 * Render name (and optionally value) labels into a custom-series group element.
 *
 * When `uniformFontSize` is set, every label uses that size (overlap allowed) so
 * all cells in a slice/stripes chart share one consistent size.
 *
 * `layout` modes:
 * - `thinHorizontal` — single-line label for horizontal bars.
 * - `thinVertical` — single-line label for narrow columns.
 * - `auto` — two-line when height allows, otherwise merged single line.
 */
export function renderCustomLabel(opts: {
  group: Record<string, unknown>;
  px: number; py: number; pw: number; ph: number;
  name: string;
  val: string;
  showValue: boolean;
  config: {
    labelFont: { size?: number; family?: string; bold?: boolean; italic?: boolean; color?: string };
    showLabels?: boolean;
  };
  dataFont: RequiredFontStyle;
  layout?: 'auto' | 'thinHorizontal' | 'thinVertical';
  /** When set, all labels use this size (no per-cell fitting). */
  uniformFontSize?: number;
  measureTextWidth: (text: string, font: FontStyle | RequiredFontStyle | undefined, size: number) => number;
  resolveUnderlineColor: (font: FontStyle | RequiredFontStyle | undefined) => string;
}): void {
  const {
    group, px, py, pw, ph, name, val, showValue, config, dataFont,
    layout = 'auto', uniformFontSize, measureTextWidth, resolveUnderlineColor,
  } = opts;

  const pad = 2;
  const availW = pw - pad * 2;
  const availH = ph - pad * 2;
  if (availW < 1 && availH < 1) return;

  const configuredSize = dataFont.size ?? config.labelFont.size ?? 12;
  const fontFamily  = dataFont.family ?? config.labelFont.family ?? 'sans-serif';
  const fontWeight  = dataFont.bold   ? 'bold'   : 'normal';
  const fontStyleV  = dataFont.italic ? 'italic' : 'normal';
  const underline   = dataFont.underline ?? false;
  const ulColor     = underline ? resolveUnderlineColor(dataFont) : '#fff';
  const textColor   = dataFont.color && dataFont.color !== 'inherit'
    ? dataFont.color
    : (config.labelFont.color && config.labelFont.color !== 'inherit' ? config.labelFont.color : '#ffffff');

  const cx = px + pw / 2;
  const cy = py + ph / 2;
  const fs = Math.max(uniformFontSize ?? configuredSize, 8);

  const pushText = (
    text: string,
    x: number,
    y: number,
    size: number,
    maxW: number,
    alpha = 1,
    allowOverflow = false,
  ) => {
    const measureFont = { ...dataFont, size };
    const needsTruncate = !allowOverflow && measureTextWidth(text, measureFont, size) > maxW;
    (group.children as unknown[]).push({
      type: 'text',
      z: 100,
      style: {
        x,
        y,
        text,
        textAlign: 'center',
        textVerticalAlign: 'middle',
        fill: alpha < 1 ? `rgba(255,255,255,${alpha})` : textColor,
        fontSize: size,
        fontFamily,
        fontWeight,
        fontStyle: fontStyleV,
        ...(allowOverflow
          ? {}
          : needsTruncate
            ? { width: maxW, overflow: 'truncate' as const }
            : {}),
      },
    });
    if (underline && size >= 6) {
      const w = Math.min(measureTextWidth(text, measureFont, size), maxW);
      const ulY = y + size * 0.55;
      (group.children as unknown[]).push({
        type: 'line',
        z: 101,
        shape: { x1: x - w / 2, y1: ulY, x2: x + w / 2, y2: ulY },
        style: { stroke: ulColor, lineWidth: Math.max(1, size >= 10 ? 1 : 0.75) },
      });
    }
  };

  // Uniform size: same font on every cell; overflow/overlap is intentional.
  if (uniformFontSize != null) {
    if (layout === 'thinHorizontal' || layout === 'thinVertical' || !showValue) {
      const text = showValue ? `${name}  ${val}` : name;
      pushText(text, cx, cy, fs, Math.max(availW, 1), 1, true);
      return;
    }
    if (showValue && availH >= fs * 2.2) {
      const valFs = Math.max(Math.floor(fs * 0.9), 8);
      pushText(name, cx, cy - fs * 0.55, fs, Math.max(availW, 1), 1, true);
      pushText(val, cx, cy + valFs * 0.55, valFs, Math.max(availW, 1), 0.85, true);
      return;
    }
    pushText(`${name}  ${val}`, cx, cy, fs, Math.max(availW, 1), 1, true);
    return;
  }

  if (layout === 'thinHorizontal') {
    const text = showValue ? `${name}  ${val}` : name;
    pushText(text, cx, cy, fs, availW, 1, true);
    return;
  }

  if (layout === 'thinVertical') {
    const text = showValue ? `${name}  ${val}` : name;
    pushText(text, cx, cy, fs, availW, 1, true);
    return;
  }

  if (availW < LABEL_MIN_DIM || availH < LABEL_MIN_DIM) return;

  if (showValue && availH >= fs * 2.2) {
    const valFs = Math.max(Math.floor(fs * 0.9), 8);
    pushText(name, cx, cy - fs * 0.55, fs, availW, 1, true);
    pushText(val, cx, cy + valFs * 0.55, valFs, availW, 0.85, true);
    return;
  }

  pushText(showValue ? `${name}  ${val}` : name, cx, cy, fs, availW, 1, true);
}

/** Collect leaf node names (nodes without children) for label targeting. */
export function buildLeafNameSet(nodes: TreemapNode[], set = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      buildLeafNameSet(node.children, set);
    } else if (node.name) {
      set.add(node.name);
    }
  }
  return set;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Build a flat name→formattedValue/unitFormatCode lookup across all node depths.
 */
export function buildNodeLookup<K extends 'formattedValue' | 'unitFormatCode'>(
  nodes: TreemapNode[],
  key: K,
  map = new Map<string, string | undefined>(),
): Map<string, string | undefined> {
  for (const node of nodes) {
    if (node.name) map.set(node.name, node[key]);
    if (node.children) buildNodeLookup(node.children, key, map);
  }
  return map;
}
