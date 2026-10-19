import type { VisualizationTypeId } from "@/lib/dashboards/types";
import { AreaItem } from "dfa-v6-comp-area";
import { IndicatorItem } from "dfa-v6-comp-indicator";
import { SubgroupItem } from "dfa-v6-comp-subgroup";
import { TimePeriodItem } from "dfa-v6-comp-timeperiod";

// ─── Shared Primitives ───────────────────────────────────────────────────────

export type FontStyle = {
  fontFamily: string;
  fontSize: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type TextAlign = "left" | "center" | "right";

export type LegendPosition = "left" | "right" | "bottom" | "top";

// ─── General Settings Sub-types ──────────────────────────────────────────────

export type ChartBorderSettings = {
  width: number;
  radius: number;
  color: string;
};

export type ChartAreaSettings = {
  fontFamily: string;
  backgroundColor: string;
  noDataText: string;
};

export type PlotAreaSettings = {
  backgroundColor: string;
  borderColor: string;
  width: number;
  backgroundImageUrl: string;
}

export type TitleTabId = "title" | "subTitle" | "customLabels";

export type TitleEntry = {
  text: string;
  dynamic: boolean;
  dynamicTokens: string[];
  fontStyle: FontStyle;
  align: TextAlign;
};

export type TitleSettings = {
  title: TitleEntry;
  subTitle: TitleEntry;
  customLabels: TitleEntry;
};

export type HighlightSelectedAreaSettings = {
  enabled: boolean;
  dataLabel: boolean;
};

export type AxisLineSettings = {
  color: string;
  width: number;
};

export type GridLineSettings = {
  color: string;
  width: number;
  dashStyle: string;
};

export type AxisSettings = {
  title: string;
  titleFontStyle: FontStyle;
  titleAlign: TextAlign;
  labelsEnabled: boolean;
  labelsFontStyle: FontStyle;
  enableTextWrap: boolean;
  axisLine: AxisLineSettings;
  gridLines: GridLineSettings;
  ticksEnabled: boolean;
};

export type SecondaryAxisSettings = {
  enabled: boolean;
};

export type DataValueLabelSettings = {
  labelsEnabled: boolean;
  labelAlign: TextAlign;
  labelRotation: number;
  fontStyle: FontStyle;
  showCategories: boolean;
  labelFormat: string;
};

export type LegendSettings = {
  displayLegend: boolean;
  textStyle: FontStyle;
  position: LegendPosition;
  floatOnTop: boolean;
};

export type TooltipSettings = {
  disable: boolean;
  indicator: boolean;
  unit: boolean;
  subgroup: boolean;
  timePeriod: boolean;
  area: boolean;
  source: boolean;
  footnote: boolean;
};

export type GeneralSettings = {
  chartArea: ChartAreaSettings;
  chartBorder: ChartBorderSettings;
  plotArea: PlotAreaSettings;
  colorTheme: string;
  title: TitleSettings;
  highlightSelectedArea: HighlightSelectedAreaSettings;
  axisHorizontal: AxisSettings;
  axisVertical: AxisSettings;
  secondaryAxis: SecondaryAxisSettings;
  dataValueLabels: DataValueLabelSettings;
  legend: LegendSettings;
  tooltip: TooltipSettings;
};

// ─── Axis / Series Mapping ───────────────────────────────────────────────────

export type DimensionKind = "time" | "indicator" | "subgroup" | "area";

export const CHART_LAYOUT_DIMENSIONS: DimensionKind[] = [
  "time",
  "indicator",
  "subgroup",
  "area",
];

export const DIMENSION_LABELS: Record<DimensionKind, string> = {
  time: "Time Period",
  indicator: "Indicator",
  subgroup: "Subgroup",
  area: "Area",
};

export type AxisSeriesMapping = {
  xDimension: DimensionKind;
  seriesDimension: DimensionKind | null;
  seriesDimension2?: DimensionKind | null;
};

// ─── Custom Type Settings ────────────────────────────────────────────────────

export type CustomHtmlSettings = {
  html: string;
  noDataText: string;
  enableChildHook: boolean;
  datawarehouseConnection: string;
  enableExternalApi: boolean;
  enableContextMenu: boolean;
};

export type CustomTextSettings = {
  text: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
};

export type CustomImageSettings = {
  source: "media" | "url";
  mediaFile: string;
  url: string;
  width: string;
  height: string;
  unit: "%" | "px";
  borderWidth: number;
  borderRadius: number;
  align: "left" | "center" | "right";
};

export type CustomVideoSettings = {
  source: "media" | "url";
  mediaFile: string;
  videoUrl: string;
  width: string;
  height: string;
  autoSize: boolean;
};

// ─── Other Tab Settings (placeholders for future expansion) ──────────────────

export type ChartSettings = {
  typeId: VisualizationTypeId;
  chartVariant: string;
};

export type DataSettings = {
  indicators: IndicatorItem[];
  subgroups: SubgroupItem[];
  areas: AreaItem[];
  timePeriods: TimePeriodItem[];
  mapping: AxisSeriesMapping;
};

export type SeriesSettings = {
  sortByList: string;
  series?: [{ name: string, color: string, borderColor: string, hoverColor: string, lineType: string, lineWidth: string, enableGlobalUI: boolean, gapBetweenCol: number, innerSize: number, marker: { selected: boolean, markerFillColor: string, markerLineColor: string, markerWidth: number, markerBorderWidth: number } }]
};

export type CategoriesSettings = {
  sortByList: string;
  categories?: [{ name: string, color: string; index: number }];
};

export type ThemeSettings = {
  enableTheme: boolean;
  globalSubgroupColor: boolean;
  enableGlobalUIColor: boolean;
  areaExceptionList?: string;
  enableUnitBasedTheme?: boolean;
  indicator?: [];
};

export type AdvanceSettings = {
  datawarehouseId: number;
  contextMenu: { 
    enabled: boolean, 
    labels?: { visibility: boolean, outsideMenu: boolean }, 
    table?: { visibility: boolean, outsideMenu: boolean }, 
    downloadAndShare?: { visibility: boolean, outsideMenu: boolean }, 
    sort?: { visibility: boolean, outsideMenu: boolean }, 
    fullView?: { visibility: boolean, outsideMenu: boolean }, 
    mapSpecific?: { visibility: boolean, outsideMenu: boolean,value?:string }, 
    metadata?: { visibility: boolean, outsideMenu: boolean } 
  }
};

// ─── Top-level State ─────────────────────────────────────────────────────────

export type VisualizationSettings = {
  charts: ChartSettings;
  data: DataSettings;
  general: GeneralSettings;
  series: SeriesSettings;
  categories: CategoriesSettings;
  theme: ThemeSettings;
  advance: AdvanceSettings;
  customHtml?: CustomHtmlSettings;
  customText?: CustomTextSettings;
  customImage?: CustomImageSettings;
  customVideo?: CustomVideoSettings;
};

export type VisualizationState = {
  vizId: string;
  name: string;
  typeId: VisualizationTypeId;
  inUse: boolean;
  settings: VisualizationSettings;
};

type ChartVariantType = {
  id: string;
  label: string;
  icon: string;
};

export const VISUALIZATION_TYPES: {
  id: VisualizationTypeId;
  label: string;
  icon: string;
  chartVariant: ChartVariantType[];
}[] = [
    {
      id: "bar", label: "Bar", icon: "bar_chart", chartVariant: [
        { id: "vertical", label: "Grouped Column", icon: "bar_chart_4_bars" },
        { id: "stacked-vertical", label: "Stacked", icon: "stacked_bar_chart" },
        { id: "stacked_percent", label: "Stacked Percent", icon: "full_stacked_bar_chart" },
        { id: "horizontal", label: "Basic Bar", icon: "align_horizontal_left" },
        { id: "stacked-horizontal", label: "Stacked Bar", icon: "view_agenda" },
        { id: "stacked_percent_bar", label: "Stacked Bar Percent", icon: "horizontal_split" },
      ],
    },
    {
      id: "area", label: "Area", icon: "area_chart", chartVariant: [
        { id: "basic", label: "Basic", icon: "area_chart" },
        { id: "stacked", label: "Stacked", icon: "stacked_line_chart" },
        { id: "stacked_percent", label: "Stacked Percent", icon: "full_stacked_bar_chart" },
      ],
    },
    {
      id: "line", label: "Line", icon: "show_chart", chartVariant: [
        { id: "line", label: "Line Chart", icon: "show_chart" },
        { id: "spline", label: "Spline", icon: "line_curve" },
        { id: "polar_line", label: "Polar Line", icon: "track_changes" },
        { id: "spider_web", label: "Spider Web", icon: "radar" },
      ],
    },
    {
      id: "map", label: "Map", icon: "public", chartVariant: [
        { id: "basic_map", label: "Map", icon: "map" },
        { id: "marker_map", label: "Marker Map", icon: "location_on" },
      ],
    },
    {
      id: "pie", label: "Pie", icon: "pie_chart", chartVariant: [
        { id: "pie", label: "Pie", icon: "pie_chart" },
        { id: "pieDonut", label: "Donut", icon: "donut_large" },
        { id: "pieSemi", label: "Semi Donut", icon: "data_usage" },
      ],
    },
    { id: "table", label: "Table", icon: "table_chart", chartVariant: [] },
    {
      id: "tree", label: "Tree", icon: "account_tree", chartVariant: [
        { id: "sunburst", label: "Sunburst", icon: "flare" },
        { id: "tree_map_square", label: "Tree Map Square", icon: "grid_view" },
        { id: "tree_map_slice_and_dice", label: "Tree Map Slice and Dice", icon: "view_module" },
        { id: "tree_map_stripe", label: "Tree Map Stripe", icon: "view_week" },
      ],
    },
    {
      id: "percent", label: "Percent", icon: "percent", chartVariant: [
        { id: "dfa_dot_matrix", label: "DFA Dot Matrix", icon: "grid_on" },
        { id: "hundered_minus", label: "Hundered Minus", icon: "horizontal_rule" },
      ],
    },
  ];

export const CUSTOM_TYPES: { id: VisualizationTypeId; label: string; icon: string }[] = [
  { id: "html", label: "HTML", icon: "code" },
  { id: "text", label: "Text", icon: "edit" },
  { id: "tile", label: "Tile", icon: "grid_view" },
  { id: "image", label: "Image", icon: "image" },
  { id: "video", label: "Video", icon: "videocam" },
];