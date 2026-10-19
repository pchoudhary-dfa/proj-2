import { TreemapNode, FontStyle, RequiredFontStyle } from '../types';
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
/**
 * Slice-and-dice layout: alternates split direction per depth level.
 * Depth 1 (top-level): horizontal split (left to right).
 * Depth 2 (children): vertical split (top to bottom inside each parent).
 * Each child's share is proportional to its value.
 */
export declare function layoutSliceDice(nodes: TreemapNode[], container: Rect, palette: string[], gap?: number): LayoutRect[];
/**
 * Stripes layout: all depth levels split in the same fixed direction.
 * 'vertical'   → rows stacked at every depth (split along Y).
 * 'horizontal' → columns side by side at every depth (split along X).
 */
export declare function layoutStripes(nodes: TreemapNode[], container: Rect, palette: string[], direction?: 'vertical' | 'horizontal', gap?: number): LayoutRect[];
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
export declare function computeTreemapMargins(config: {
    title?: string;
    subtitle?: string;
    customLabel?: string;
    titleFont?: {
        size?: number;
    };
    subtitleFont?: {
        size?: number;
    };
    customLabelFont?: {
        size?: number;
    };
    showLegend: boolean;
    legendPosition: 'top' | 'bottom' | 'left' | 'right';
    legendFont: {
        size: number;
    };
    legendBackground?: string;
    legendBorder?: {
        color?: string;
        width?: number;
        radius?: number;
    };
}): ChartMargins;
/**
 * Resolve the pixel draw area for custom-series treemaps.
 *
 * Starts from the title/legend margins (so reserved title and legend space is
 * preserved) and then guarantees a minimum proportional gutter on every side so
 * the padding matches the native ECharts treemap. Using `Math.max` means a tall
 * title block or a wide legend column still wins when it needs more room than
 * the gutter.
 */
export declare function resolveTreemapDrawArea(canvasW: number, canvasH: number, margins: ChartMargins): {
    x: number;
    y: number;
    width: number;
    height: number;
};
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
export declare function renderCustomLabel(opts: {
    group: Record<string, unknown>;
    px: number;
    py: number;
    pw: number;
    ph: number;
    name: string;
    val: string;
    showValue: boolean;
    config: {
        labelFont: {
            size?: number;
            family?: string;
            bold?: boolean;
            italic?: boolean;
            color?: string;
        };
        showLabels?: boolean;
    };
    dataFont: RequiredFontStyle;
    layout?: 'auto' | 'thinHorizontal' | 'thinVertical';
    /** When set, all labels use this size (no per-cell fitting). */
    uniformFontSize?: number;
    measureTextWidth: (text: string, font: FontStyle | RequiredFontStyle | undefined, size: number) => number;
    resolveUnderlineColor: (font: FontStyle | RequiredFontStyle | undefined) => string;
}): void;
/** Collect leaf node names (nodes without children) for label targeting. */
export declare function buildLeafNameSet(nodes: TreemapNode[], set?: Set<string>): Set<string>;
/**
 * Build a flat name→formattedValue/unitFormatCode lookup across all node depths.
 */
export declare function buildNodeLookup<K extends 'formattedValue' | 'unitFormatCode'>(nodes: TreemapNode[], key: K, map?: Map<string, string | undefined>): Map<string, string | undefined>;
export {};
//# sourceMappingURL=treemapCustomLayout.d.ts.map