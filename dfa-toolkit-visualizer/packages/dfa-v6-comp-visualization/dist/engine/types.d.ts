/**
 * Chart engine types — framework-agnostic; no React or Next.js.
 * Used by the ECharts-based engine and the transform layer.
 */
export type ChartType = 'line' | 'bar' | 'area' | 'pie' | 'scatter' | 'heatmap' | 'treemap' | 'treemapSliceDice' | 'treemapStripes' | 'radar' | 'pyramid' | 'map' | 'sunburst' | 'dotMatrix' | 'hundredMinus';
/** Optional typography for headings, axis titles, and other configurable labels. */
export interface FontStyle {
    size?: number;
    family?: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    /** Request underline. Title block uses graphic lines; other labels use rich-text rules (see fontUtils). */
    underline?: boolean;
}
/** Required typography on labelFont / legendFont (existing consumers always provide these). */
export interface RequiredFontStyle {
    size: number;
    family: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color?: string;
}
export interface ChartConfig {
    type: ChartType;
    /** Axes and labels */
    showXAxis: boolean;
    showYAxis: boolean;
    showGrid: boolean;
    showLabels: boolean;
    showLegend: boolean;
    legendPosition: 'top' | 'bottom' | 'left' | 'right';
    labelOrientation: 'horizontal' | 'vertical';
    /**
     * When false, hide category/value tick labels but keep the axis (title/line/ticks).
     * Defaults to `showXAxis` when omitted (backward compatible).
     */
    showXAxisTickLabels?: boolean;
    /** Same as showXAxisTickLabels for the Y axis. Defaults to `showYAxis` when omitted. */
    showYAxisTickLabels?: boolean;
    /** Colors: primary for single series, palette for multi-series */
    primaryColor: string;
    palette: string[];
    /** Typography */
    labelFont: RequiredFontStyle;
    legendFont: RequiredFontStyle;
    /** Bar/line options */
    columnSpacing?: number;
    lineThickness?: number;
    chartVariant?: string;
    /** Pie options */
    pieDonut?: boolean;
    pieSemi?: boolean;
    pieLabelsInside?: boolean;
    pieLabelsOutside?: boolean;
    /** Y-axis range (optional) */
    yAxisMin?: number | '';
    yAxisMax?: number | '';
    yAxisInterval?: number | '';
    /**
     * Swap category/value axes (v5 lnInverted / Highcharts chart.inverted).
     * Line charts: categories on Y, values on X. Additive — omit for default orientation.
     */
    inverted?: boolean;
    /** Data label options (line/bar/area) */
    dataLabelPosition?: 'inside' | 'outside';
    dataLabelVisibility?: 'always' | 'onHover';
    dataLabelNumberFormat?: string;
    /**
     * Pie outside-label connector (leader) lines.
     * When omitted, defaults to true whenever outside labels are shown (backward compatible).
     * Dashboard maps general.dataValueLabels.enableLeaderLine here.
     */
    dataLabelLeaderLineEnabled?: boolean;
    /** Data-label box fill (v5 DtLblBgClr). */
    dataLabelBackgroundColor?: string;
    /** Data-label box border (v5 DtLblBrdrClr). */
    dataLabelBorderColor?: string;
    dataLabelBorderWidth?: number;
    dataLabelBorderRadius?: number;
    /** Data-label pixel offset from default position (v5 DtLblX / DtLblY). */
    dataLabelOffsetX?: number;
    dataLabelOffsetY?: number;
    /** When true, prefer server-provided formattedValues for display over client numberFormat. */
    useUnitDefaultFormat?: boolean;
    /** Optional grid overrides (e.g. for compact preview). When set, used instead of computed values. */
    grid?: {
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
    };
    /** Scatter options */
    scatterSymbolSize?: number;
    scatterSymbol?: string;
    /** ECharts grid.backgroundColor (line/bar/area/scatter). Pie: fills chart canvas when no grid. Empty = transparent. */
    plotAreaBackgroundColor?: string;
    /** Map-specific label toggles (area name, data value, area id). */
    mapLabels?: {
        showAreaName: boolean;
        showDataValue: boolean;
        showAreaId: boolean;
    };
    /** ECharts-native title, shown inside the canvas (included in PNG/SVG exports). */
    title?: string;
    subtitle?: string;
    /** Free-text annotation rendered below subtitle, above the legend (position-independent). */
    customLabel?: string;
    /** Typography overrides for each heading level. */
    titleFont?: FontStyle;
    subtitleFont?: FontStyle;
    customLabelFont?: FontStyle;
    /**
     * Horizontal alignment for each heading row (independent per row).
     * Defaults to 'center' when omitted, preserving prior behavior.
     */
    titleAlign?: 'left' | 'center' | 'right';
    subtitleAlign?: 'left' | 'center' | 'right';
    customLabelAlign?: 'left' | 'center' | 'right';
    /** Axis title text (e.g. "Life expectancy") — all cartesian chart types. */
    xAxisLabel?: string;
    yAxisLabel?: string;
    xAxisLabelFont?: FontStyle;
    yAxisLabelFont?: FontStyle;
    /** Typography for X-axis tick labels (category/value ticks). Falls back to labelFont. */
    xAxisTickFont?: FontStyle;
    /** Typography for Y-axis tick labels. Falls back to labelFont. */
    yAxisTickFont?: FontStyle;
    /** Typography for series / point value labels. Falls back to labelFont. */
    dataLabelFont?: FontStyle;
    /** Background color for the full ECharts canvas (option.backgroundColor). */
    chartAreaBackgroundColor?: string;
    /** Full-canvas background image URL (stretches to chart area; overrides chartAreaBackgroundColor). */
    chartAreaBackgroundImageUrl?: string;
    /** CSS border drawn on the ChartRendererWrapper container div (supports border-radius). */
    chartAreaBorder?: {
        color?: string;
        width?: number;
        radius?: number;
    };
    /** ECharts grid border (plot area). No border-radius — canvas limitation. */
    plotAreaBorder?: {
        color?: string;
        width?: number;
    };
    /** Plot-region background image URL (stretches to grid bounds; overrides plotAreaBackgroundColor). */
    plotAreaBackgroundImageUrl?: string;
    /** Legend background fill and border. */
    legendBackground?: string;
    legendBorder?: {
        color?: string;
        width?: number;
        radius?: number;
    };
    /** Per-axis label rotation in degrees. Overrides the binary `labelOrientation` when set. */
    xAxisLabelRotation?: number;
    yAxisLabelRotation?: number;
    /**
     * Axis baseline line style (additive). When omitted, axisLine stays `{ show: true }` with
     * ECharts defaults. `width: 0` hides the line.
     */
    xAxisLine?: {
        color?: string;
        width?: number;
    };
    yAxisLine?: {
        color?: string;
        width?: number;
    };
    /**
     * Per-axis grid (splitLine) style. When omitted, falls back to `showGrid` with hardcoded
     * dashed `#e0e0e0`. Prefer these when hosts expose color/width/dash controls.
     */
    xAxisGrid?: {
        show: boolean;
        color?: string;
        width?: number;
        dashStyle?: string;
    };
    yAxisGrid?: {
        show: boolean;
        color?: string;
        width?: number;
        dashStyle?: string;
    };
    /** Show axis tick marks between labels. Defaults to true when axis is shown. */
    xAxisTicks?: boolean;
    yAxisTicks?: boolean;
    /** Wrap long category/value axis tick labels onto multiple lines. */
    xAxisLabelWrap?: boolean;
    yAxisLabelWrap?: boolean;
    /** Horizontal align for axis title (`nameTextStyle.align`). */
    xAxisLabelAlign?: 'left' | 'center' | 'right';
    yAxisLabelAlign?: 'left' | 'center' | 'right';
    /** Rotate series data-value labels (degrees). Independent of axis tick rotation. */
    dataLabelRotation?: number;
    /** Prepend category name to data-value labels when true. */
    dataLabelShowCategory?: boolean;
    /**
     * When true, legend overlays the plot (`legend.floating`) and does not reserve a full
     * margin band for its position.
     */
    legendFloating?: boolean;
    /** Text shown centred in the wrapper when data is empty and this prop is provided. */
    noDataText?: string;
    /**
     * Data-point symbol for line / area / scatter series (all series share one shape).
     * ECharts built-ins: 'circle' | 'rect' | 'roundRect' | 'triangle' | 'diamond' | 'pin' | 'arrow'.
     * 'none' hides markers on line/area. When omitted, defaults to 'circle'.
     * Legend icons automatically mirror the chosen symbol.
     */
    seriesSymbol?: 'circle' | 'rect' | 'roundRect' | 'triangle' | 'diamond' | 'pin' | 'arrow' | 'none';
    /** Size of data-point markers in px. Defaults: line/area = 6, scatter = 10. */
    seriesSymbolSize?: number;
    /**
     * Border width in px drawn around each data-point marker on line/area charts.
     * Applies to all series. When omitted, ECharts default (0 = no border) is used.
     * Does not affect 'none' markers (hidden markers have no visible border).
     */
    seriesSymbolBorderWidth?: number;
    /**
     * CSS colour string for the border drawn around each data-point marker on line/area charts.
     * Only takes effect when seriesSymbolBorderWidth > 0.
     * When omitted and borderWidth > 0, ECharts falls back to the series colour.
     */
    seriesSymbolBorderColor?: string;
    /**
     * When false, tooltips are disabled entirely (ECharts tooltip.show = false).
     * Defaults to true (existing behavior unchanged when absent).
     */
    tooltipEnabled?: boolean;
    /**
     * 'axis' (default) — ECharts axis-trigger: shows all series for the hovered X position.
     * 'item' — item-trigger: shows a rich card for the single hovered data point.
     * Applies to line, bar, area, and radar charts.
     */
    tooltipTrigger?: 'axis' | 'item';
    /**
     * Controls which dimension fields appear in the rich item-trigger tooltip.
     * Only used when tooltipTrigger === 'item'.
     */
    tooltipFields?: {
        indicator?: boolean;
        /** Unit display name from pointMeta.unitName. Opt-in (`true` to show). */
        unit?: boolean;
        timePeriod?: boolean;
        subgroup?: boolean;
        area?: boolean;
        /** Source name — currently empty from primary API; included when available. */
        source?: boolean;
        /** Footnote text — currently empty from primary API; included when available. */
        footnote?: boolean;
    };
    /**
     * Master gate for dual value Y-axes on vertical line / bar / area charts.
     * When absent or false, behavior is identical to a single Y-axis.
     * Requires at least one series with `yAxisIndex: 1` to activate the right axis.
     */
    enableSecondaryYAxis?: boolean;
    /**
     * Show the secondary (right) Y-axis chrome when dual axes are active.
     * Defaults to true when omitted. Series still scale on axis 1 when false.
     */
    showSecondaryYAxis?: boolean;
    secondaryYAxisMin?: number | '';
    secondaryYAxisMax?: number | '';
    secondaryYAxisInterval?: number | '';
    secondaryYAxisLabel?: string;
    secondaryYAxisLabelFont?: FontStyle;
    secondaryYAxisTickFont?: FontStyle;
    secondaryYAxisLabelRotation?: number;
    /** Secondary axis baseline (falls back to primary yAxisLine when omitted). */
    secondaryYAxisLine?: {
        color?: string;
        width?: number;
    };
    /** Secondary axis tick marks (falls back to primary yAxisTicks when omitted). */
    secondaryYAxisTicks?: boolean;
}
/**
 * Rich per-point metadata for enhanced tooltips (experimental — additive).
 * All fields optional so existing consumers are unaffected when absent.
 */
export interface PointMeta {
    indicatorName?: string;
    /** Unit display name (e.g. "Percent", "Number"). Shown when tooltipFields.unit === true. */
    unitName?: string;
    timePeriodName?: string;
    subgroupName?: string;
    areaName?: string;
    /** Stable area id for highlight / join (optional). */
    areaId?: string;
    /** Source display name (ic_name). Currently empty from primary API. */
    sourceName?: string;
    /** Footnote text. Currently empty from primary API. */
    footnote?: string;
}
/**
 * Optional per-series chart type override (combo charts).
 * When omitted, the series uses the parent ChartConfig.type / builder defaults.
 */
export type SeriesChartTypeOverride = 'line' | 'bar' | 'area' | 'scatter';
/**
 * Optional per-series style overrides for line/bar/area (and scatter).
 * All fields additive — omit to keep palette / global ChartConfig behavior.
 */
export interface SeriesStyleOverrides {
    color?: string;
    borderColor?: string;
    /** Hover / emphasis fill (ECharts emphasis.itemStyle.color). */
    emphasisColor?: string;
    lineStyle?: {
        type?: string;
        width?: number;
    };
    symbol?: string;
    symbolSize?: number;
    showSymbol?: boolean;
    /** Marker/item chrome; `color` overrides marker fill while stroke uses series `color`. */
    itemStyle?: {
        color?: string;
        borderColor?: string;
        borderWidth?: number;
    };
    seriesType?: SeriesChartTypeOverride;
}
/** One series in a line/bar/area chart. */
export interface LineBarAreaSeriesItem extends SeriesStyleOverrides {
    id: string;
    name: string;
    values: number[];
    stack?: string;
    formattedValues?: (string | undefined)[];
    unitFormatCodes?: (string | undefined)[];
    /**
     * Value-axis binding when `enableSecondaryYAxis` is on (vertical line/bar/area).
     * `0` or omitted = primary (left); `1` = secondary (right). Ignored when the gate is off.
     */
    yAxisIndex?: 0 | 1;
}
/** Line, bar, area: categories on X, one or more series with values. */
export interface LineBarAreaData {
    categories: string[];
    /**
     * Stable x-dimension keys aligned to `categories` (additive).
     * Used by hosts for rename/reorder/recolor without relying on display labels.
     */
    categoryIds?: string[];
    /**
     * Per-category colors aligned to `categories` (additive).
     * When set at index i, option builders emit per-point itemStyle.color for that tick
     * across all series unless a higher-precedence `pointColors[series][i]` is set
     * (point color → category color → series color → palette).
     */
    categoryColors?: (string | undefined)[];
    series: LineBarAreaSeriesItem[];
    /**
     * Per-point rich metadata for item-trigger tooltips (experimental — additive).
     * Indexed as pointMeta[seriesIndex][categoryIndex].
     * Absent when tooltip enrichment is not needed (existing behavior unchanged).
     */
    pointMeta?: PointMeta[][];
    /**
     * Per-point colors indexed as pointColors[seriesIndex][categoryIndex] (additive).
     * When set, option builders emit per-point itemStyle.color for that cell.
     * Precedence at draw time: point color → categoryColors → series color → palette.
     * Omit for unchanged behavior (hosts that only use categoryColors / series.color).
     */
    pointColors?: (string | undefined)[][];
}
/** Pie: segments with id, label, value. */
export interface PieChartData {
    segments: {
        id: string;
        label: string;
        value: number;
        formattedValue?: string;
        unitFormatCode?: string;
        /** Optional explicit segment color (additive). When set, overrides palette[i]. */
        color?: string;
    }[];
}
/** One series in a scatter XY chart. */
export interface ScatterSeriesItem extends SeriesStyleOverrides {
    id: string;
    name: string;
    points: {
        x: number;
        y: number;
        label: string;
        formattedX?: string;
        formattedY?: string;
        unitFormatCodeX?: string;
        unitFormatCodeY?: string;
    }[];
}
/** Scatter XY: correlation chart with numeric X and Y axes. */
export interface ScatterXYData {
    series: ScatterSeriesItem[];
    xAxisLabel: string;
    yAxisLabel: string;
}
/**
 * Population pyramid (diverging horizontal bar chart).
 * Two wings share a common category Y-axis; left wing values are pre-negated
 * so ECharts renders them extending left from the center axis.
 */
export interface PyramidData {
    kind: 'pyramid';
    /** Y-axis category labels (e.g. age groups, areas, time periods). */
    categories: string[];
    /** Left wing — values are already negated for ECharts rendering. */
    leftSeries: {
        name: string;
        values: number[];
        formattedValues?: (string | undefined)[];
        unitFormatCodes?: (string | undefined)[];
    };
    /** Right wing — positive values. */
    rightSeries: {
        name: string;
        values: number[];
        formattedValues?: (string | undefined)[];
        unitFormatCodes?: (string | undefined)[];
    };
}
/**
 * Heatmap: two categorical axes with cell values.
 * cells items are [xIndex, yIndex, value] — only cells that have data are included.
 */
export interface HeatmapData {
    /** X-axis category labels (columns). */
    xCategories: string[];
    /** Y-axis category labels (rows). */
    yCategories: string[];
    /** Cell values: [xIndex, yIndex, value]. Only cells with data are included. */
    cells: [number, number, number][];
    /** Minimum value across all cells (for visualMap color scale). */
    min: number;
    /** Maximum value across all cells (for visualMap color scale). */
    max: number;
    /** Parallel formatted values for cells: same indices as cells. */
    formattedCells?: (string | undefined)[];
    /** Unit format codes for cells: same indices as cells. */
    unitFormatCells?: (string | undefined)[];
}
/** Treemap: hierarchical rectangles sized by value. */
export interface TreemapNode {
    name: string;
    value: number;
    children?: TreemapNode[];
    formattedValue?: string;
    unitFormatCode?: string;
}
export interface TreemapData {
    nodes: TreemapNode[];
}
/**
 * Treemap with slice-and-dice layout (alternating H/V cuts per depth level).
 * Uses the same TreemapNode shape as TreemapData; rendered via ECharts custom series.
 */
export interface SliceDiceTreemapData {
    kind: 'sliceDice';
    nodes: TreemapNode[];
}
/**
 * Treemap with stripes layout (all splits in one fixed direction at every depth).
 * Uses the same TreemapNode shape as TreemapData; rendered via ECharts custom series.
 */
export interface StripesTreemapData {
    kind: 'stripes';
    nodes: TreemapNode[];
    /** 'vertical' = stacked rows (default). 'horizontal' = side-by-side columns. */
    direction?: 'vertical' | 'horizontal';
}
/**
 * Sunburst: hierarchical radial chart using the same node shape as treemap.
 * Concentric rings represent dimension levels; arc sizes are proportional to values.
 */
export interface SunburstData {
    kind: 'sunburst';
    nodes: TreemapNode[];
}
/**
 * Dot matrix: single percentage (0–100) as a 10×10 circle grid.
 * Each filled circle = 1%; the last circle may be partially filled for decimals.
 */
export interface DotMatrixData {
    kind: 'dotMatrix';
    value: number;
    label?: string;
    subLabel?: string;
    formattedValue?: string;
}
/**
 * 100 Minus: single percentage as a donut with value + (100 − value) segments
 * and a centered numeric label.
 */
export interface HundredMinusData {
    kind: 'hundredMinus';
    value: number;
    label?: string;
    formattedValue?: string;
}
/**
 * Radar (spider): spokes = indicators, one polygon per series.
 * Each indicator has a max for ECharts axis scaling (per-spoke).
 */
export interface RadarData {
    /** Spoke labels with per-indicator max for radar axis scaling. */
    indicators: {
        name: string;
        max: number;
    }[];
    /** One polygon per series — values align with indicators order. */
    series: Array<SeriesStyleOverrides & {
        /** Stable identity used when polygons are reordered or renamed. */
        id?: string;
        name: string;
        values: number[];
        formattedValues?: (string | undefined)[];
        unitFormatCodes?: (string | undefined)[];
    }>;
    /**
     * Per-spoke rich metadata for item-trigger tooltips (experimental — additive).
     * Indexed as spokeMeta[seriesIndex][spokeIndex].
     * Absent when tooltip enrichment is not needed.
     */
    spokeMeta?: PointMeta[][];
}
/**
 * Choropleth map: GeoJSON geometry + per-area values + classification bins.
 * The geoJSON object is a raw FeatureCollection (registered via echarts.registerMap).
 */
export interface MapChartData {
    kind: 'map';
    /** Raw GeoJSON FeatureCollection for echarts.registerMap. */
    geoJSON: unknown;
    /** Unique name used for registerMap / series.map — prevents collisions across re-renders. */
    mapName: string;
    /** Per-area data: areaId must match GeoJSON feature.properties.ID_ (case-insensitive join done upstream). */
    features: {
        name: string;
        areaId: string;
        value: number | null;
        selected: boolean;
    }[];
    classification: {
        breaks: number[];
        colors: string[];
        labels: string[];
    };
    /** Color for areas with no data value. */
    nullColor: string;
    /** Color for areas not in the user's selection (dimmed). */
    dimColor: string;
    /** Map polygon border (from IU / viz theme — v5 borderColor). */
    borderColor?: string;
    /** Map polygon hover fill (from IU / viz theme — v5 hoverOverColor). */
    hoverOverColor?: string;
}
export type ChartData = LineBarAreaData | PieChartData | ScatterXYData | HeatmapData | TreemapData | SliceDiceTreemapData | StripesTreemapData | SunburstData | DotMatrixData | HundredMinusData | RadarData | PyramidData | MapChartData;
export declare function isLineBarAreaData(data: ChartData): data is LineBarAreaData;
export declare function isPieChartData(data: ChartData): data is PieChartData;
export declare function isScatterXYData(data: ChartData): data is ScatterXYData;
export declare function isPyramidData(data: ChartData): data is PyramidData;
export declare function isHeatmapData(data: ChartData): data is HeatmapData;
export declare function isTreemapData(data: ChartData): data is TreemapData;
export declare function isSliceDiceTreemapData(data: ChartData): data is SliceDiceTreemapData;
export declare function isStripesTreemapData(data: ChartData): data is StripesTreemapData;
export declare function isSunburstData(data: ChartData): data is SunburstData;
export declare function isDotMatrixData(data: ChartData): data is DotMatrixData;
export declare function isHundredMinusData(data: ChartData): data is HundredMinusData;
export declare function isRadarData(data: ChartData): data is RadarData;
export declare function isMapChartData(data: ChartData): data is MapChartData;
//# sourceMappingURL=types.d.ts.map