export interface Indicator {
  id: string;
  name: string;
  code: string;
  description: string;
  sectorId?: string;
  goalId?: string;
  themeId?: string;
  defaultTimeStart: number;
  defaultTimeEnd: number;
  defaultArea: string;
  defaultSubgroup: string;
  unit: string;
  source: string;
  frequency: string;
  tags: string[];
  aliases: string[];
  thumbnailData?: DataPoint[];
  definition?: string;
  disaggregation?: string;
  methodOfComputation?: string;
}

export interface DataPoint {
  year: number;
  value: number;
  area?: string;
  subgroup?: string;
  /** Time period id from API (e.g. "2020", "Q1.2012") so table and chart use same dimension. */
  timePeriodId?: string;
  /** Time period display name for column headers. */
  timePeriodName?: string;
}

/** Dimensions (what was requested / what the response contains). Spec Section 3.1 */
export interface DimensionCardinality {
  indicators: number;
  subgroups: number;
  areas: number;
  timePeriods: number;
}

/** One row in the visualizer result set. Spec Section 3.1 */
export interface DataRow {
  indicatorId: string;
  indicatorName: string;
  subgroupId: string;
  subgroupName: string;
  areaId: string;
  areaName: string;
  timePeriodId: string;
  timePeriodName: string;
  value: number;
  unit?: string;
  /** Server-formatted display string (e.g. "$1,234.00"); present when unit has a format code. */
  formattedValue?: string;
  /** Unit format code from the API (e.g. "USD", "PERCENTAGE"). */
  unitFormatCode?: string;
}

/** Common API response shape. Spec Section 3.1 */
export interface VisualizerDataResponse {
  cardinality: DimensionCardinality;
  rows: DataRow[];
  meta?: {
    defaultAxisSuggestions?: "time_on_x" | "area_on_x" | "indicator_on_x" | "subgroup_on_x";
    /** From Data API meta.subgroup: sv_gid → sv_order for chart axis/series ordering. */
    subgroupOrderByGid?: Record<string, number | null>;
  };
}

export interface FilterValues {
  dimension: "sector" | "goal" | "theme" | null;
  dimensionValue: string | null;
  indicator: string[];
  timeStart: number | null;
  timeEnd: number | null;
  selectedYears?: number[];
  area: string[];
  subgroup: string[];
}

/** Empty filter state (no dimension, indicator, area, subgroup, or time). */
export const emptyFilterValues: FilterValues = {
  dimension: null,
  dimensionValue: null,
  indicator: [],
  timeStart: null,
  timeEnd: null,
  area: [],
  subgroup: [],
};

/** Side panel filter section keys. */
export type FilterSectionKey = "indicator" | "subgroup" | "timePeriod" | "area";

/** Single selected item in a filter section (id = API identifier, label = display name; nid = numeric id when available, used in API to keep URLs short). */
export type SelectedItem = { 
  id: string; 
  label: string; 
  nid?: number;
  unitGid?: string;
  unitName?: string;
};

/** Selected components per section for the visualizer side panel. */
export type SelectedComponents = Partial<Record<FilterSectionKey, SelectedItem[]>>;

/** Empty selection state (all sections explicitly []). Use when clearing header chips so modals show no selection. */
export const EMPTY_SELECTED_COMPONENTS: SelectedComponents = {
  indicator: [],
  area: [],
  subgroup: [],
  timePeriod: [],
};

/** Theme for a filter section block (badge and border colors). */
export type SectionTheme = {
  bgColor: string;
  primaryColor: string;
};

export interface Sector {
  id: string;
  name: string;
}

export interface Area {
  id: string;
  name: string;
  type: "country" | "state" | "district" | "block" | "village";
  parentId?: string;
  path?: string[];
}

export interface Subgroup {
  id: string;
  name: string;
  type: string;
}

export interface SearchSuggestion {
  id: string;
  label: string;
  type: "indicator" | "area" | "subgroup" | "time_period";
  value: unknown;
}

export interface SearchChip {
  id: string;
  label: string;
  type: "indicator" | "area" | "subgroup" | "time_period";
  value: unknown;
}

export type DimensionKind = 'indicator' | 'subgroup' | 'area' | 'time';

/** Scatter XY mapping: selects which dimension supplies the two numeric measures and how dots are grouped. */
export interface ScatterMapping {
  measureDimension: DimensionKind;
  xMeasure: { id: string; label: string };
  yMeasure: { id: string; label: string };
  colorDimension: DimensionKind | null;
}

/** Available dimension values for populating scatter dropdowns. */
export interface DimensionValues {
  indicators: { id: string; label: string }[];
  subgroups: { id: string; label: string }[];
  areas: { id: string; label: string }[];
  timePeriods: { id: string; label: string }[];
}

/** Visualization (chart) settings: type, axes, colors, typography. Used by UI and transform layer. */
export interface VisualizationConfig {
  title: string;
  /** Unit or other summary shown below title (e.g. from API rows). */
  subtitle?: string;
  description: string;
  descriptionPosition: "above" | "below";
  showDescription: boolean;
  chartType: "line" | "bar" | "pie" | "area" | "advanced";
  chartVariant: string;
  /** Card / outer visualization area (title, legend margins, toggles). Applied by the app shell, not ECharts. */
  chartAreaBackgroundColor?: string;
  /** Data region inside axes (ECharts grid.backgroundColor). Pie: full chart canvas when set. Empty = transparent. */
  plotAreaBackgroundColor?: string;
  mapping?: {
    xDimension: "time" | "indicator" | "subgroup" | "area";
    seriesDimension: "time" | "indicator" | "subgroup" | "area" | null;
    /** Second series dimension for composite series (e.g. indicator + area). */
    seriesDimension2?: "time" | "indicator" | "subgroup" | "area" | null;
  };
  showXAxis: boolean;
  showYAxis: boolean;
  showLabels: boolean;
  showLegend: boolean;
  showGrid: boolean;
  legendPosition: "top" | "bottom" | "left" | "right";
  labelOrientation: "horizontal" | "vertical";
  yAxisRange?: {
    min: number | "";
    max: number | "";
    interval: number | "";
  };
  chartColor: string;
  theme: string;
  customColors?: string[];
  columnSpacing?: number;
  lineThickness?: number;
  dataValues?: {
    position: "inside" | "outside";
    visibility: "always" | "onHover";
    numberFormat: string;
    /** When true (default), use server-provided formatted_data_value for display; when false, use client numberFormat. */
    useUnitDefaultFormat?: boolean;
  };
  pieSettings?: {
    convertToPercentages: boolean;
    insideLabels: { showLabels: boolean; showValues: boolean };
    outsideLabels: {
      showValues: boolean;
      endLinesAtEdge: boolean;
      useSliceColor: boolean;
    };
  };
  scatterSettings?: {
    symbolSize: number;
    symbol: 'circle' | 'rect' | 'triangle' | 'diamond';
  };
  scatterMapping?: ScatterMapping;
  mapClassification?: {
    method: 'equal_interval' | 'quantile' | 'custom';
    k: number;
    customBreaks?: number[];
    colors?: string[];
  };
  mapLabels?: {
    showAreaName: boolean;
    showDataValue: boolean;
    showAreaId: boolean;
  };
  titleFont: FontStyle;
  /** Font for subtitle (below title). Default size 12px. */
  subtitleFont: FontStyle;
  descriptionFont: FontStyle;
  labelFont: FontStyle;
  legendFont: FontStyle;
}

export interface FontStyle {
  size: number;
  family: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

const defaultFont: FontStyle = {
  size: 12,
  family: 'Inter',
  bold: false,
  italic: false,
  underline: false,
};

/**
 * Returns default visualization config for the given options.
 * Used to initialize viz state in VisualizationTab.
 */
export function getDefaultVisualizationConfig(options: {
  title: string;
  primaryColor: string;
  theme: string;
}): VisualizationConfig {
  const { title, primaryColor, theme } = options;
  return {
    title,
    subtitle: '',
    description: '',
    descriptionPosition: 'below',
    showDescription: false,
    chartType: 'line',
    chartVariant: 'straight',
    showXAxis: true,
    showYAxis: true,
    showLabels: true,
    showLegend: true,
    showGrid: true,
    legendPosition: 'top',
    labelOrientation: 'horizontal',
    chartColor: primaryColor,
    theme,
    columnSpacing: 43,
    lineThickness: 2,
    dataValues: {
      position: 'outside',
      visibility: 'always',
      numberFormat: '1,000[.00]',
      useUnitDefaultFormat: true,
    },
    pieSettings: {
      convertToPercentages: false,
      insideLabels: { showLabels: true, showValues: true },
      outsideLabels: {
        showValues: false,
        endLinesAtEdge: false,
        useSliceColor: false,
      },
    },
    scatterSettings: {
      symbolSize: 10,
      symbol: 'circle',
    },
    mapClassification: {
      method: 'equal_interval',
      k: 4,
    },
    mapLabels: {
      showAreaName: false,
      showDataValue: false,
      showAreaId: false,
    },
    titleFont: { ...defaultFont, size: 14, bold: true },
    subtitleFont: { ...defaultFont, size: 12 },
    descriptionFont: { ...defaultFont, size: 14 },
    labelFont: { ...defaultFont },
    legendFont: { ...defaultFont },
  };
}
