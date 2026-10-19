/**
 * Chart engine types — framework-agnostic; no React or Next.js.
 * Used by the ECharts-based engine and the transform layer.
 */
export type ChartType = 'line' | 'bar' | 'area' | 'pie' | 'scatter' | 'heatmap' | 'treemap' | 'radar' | 'pyramid';
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
    /** Colors: primary for single series, palette for multi-series */
    primaryColor: string;
    palette: string[];
    /** Typography */
    labelFont: {
        size: number;
        family: string;
        bold: boolean;
        italic: boolean;
        underline: boolean;
    };
    legendFont: {
        size: number;
        family: string;
        bold: boolean;
        italic: boolean;
        underline: boolean;
    };
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
    /** Data label options (line/bar/area) */
    dataLabelPosition?: 'inside' | 'outside';
    dataLabelVisibility?: 'always' | 'onHover';
    dataLabelNumberFormat?: string;
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
}
/** Line, bar, area: categories on X, one or more series with values. */
export interface LineBarAreaData {
    categories: string[];
    series: {
        id: string;
        name: string;
        values: number[];
        stack?: string;
    }[];
}
/** Pie: segments with id, label, value. */
export interface PieChartData {
    segments: {
        id: string;
        label: string;
        value: number;
    }[];
}
/** Scatter XY: correlation chart with numeric X and Y axes. */
export interface ScatterXYData {
    series: {
        id: string;
        name: string;
        points: {
            x: number;
            y: number;
            label: string;
        }[];
    }[];
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
    };
    /** Right wing — positive values. */
    rightSeries: {
        name: string;
        values: number[];
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
}
/** Treemap: hierarchical rectangles sized by value. */
export interface TreemapNode {
    name: string;
    value: number;
    children?: TreemapNode[];
}
export interface TreemapData {
    nodes: TreemapNode[];
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
    series: {
        name: string;
        values: number[];
    }[];
}
export type ChartData = LineBarAreaData | PieChartData | ScatterXYData | HeatmapData | TreemapData | RadarData | PyramidData;
export declare function isLineBarAreaData(data: ChartData): data is LineBarAreaData;
export declare function isPieChartData(data: ChartData): data is PieChartData;
export declare function isScatterXYData(data: ChartData): data is ScatterXYData;
export declare function isPyramidData(data: ChartData): data is PyramidData;
export declare function isHeatmapData(data: ChartData): data is HeatmapData;
export declare function isTreemapData(data: ChartData): data is TreemapData;
export declare function isRadarData(data: ChartData): data is RadarData;
//# sourceMappingURL=types.d.ts.map