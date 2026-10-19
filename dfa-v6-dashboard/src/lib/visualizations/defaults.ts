import type {
  AxisLineSettings,
  AxisSettings,
  ChartAreaSettings,
  PlotAreaSettings,
  ChartBorderSettings,
  ChartSettings,
  CustomHtmlSettings,
  CustomTextSettings,
  CustomImageSettings,
  CustomVideoSettings,
  DataSettings,
  DataValueLabelSettings,
  FontStyle,
  GeneralSettings,
  GridLineSettings,
  HighlightSelectedAreaSettings,
  LegendSettings,
  SecondaryAxisSettings,
  TitleEntry,
  TitleSettings,
  TooltipSettings,
  VisualizationSettings,
  VisualizationState,
  SeriesSettings,
  CategoriesSettings,
  ThemeSettings,
  AdvanceSettings
} from "./types";

// ─── Primitives ──────────────────────────────────────────────────────────────

export const DEFAULT_FONT_STYLE: FontStyle = {
  fontFamily: "",
  fontSize: "",
  color: "#000000",
  bold: false,
  italic: false,
  underline: false,
};

// ─── General > Chart Area ────────────────────────────────────────────────────

export const DEFAULT_CHART_BORDER: ChartBorderSettings = {
  width: 0,
  radius: 0,
  color: "#000000",
};

export const DEFAULT_CHART_AREA: ChartAreaSettings = {
  fontFamily: "",
  backgroundColor: "#ffffff",
  noDataText: "No data available",
};

// ── General > Plot Area ──────────────────────────────────────────────────

export const DEFAULT_PLOT_AREA: PlotAreaSettings = {
  backgroundColor: "#ffffff",
  borderColor: "#ffffff",
  width: 0,
  backgroundImageUrl: "",
}

// ── General > Title ─────────────────────────────────────────────────────────

export const DEFAULT_TITLE_ENTRY: TitleEntry = {
  text: "",
  dynamic: false,
  dynamicTokens: [],
  fontStyle: { ...DEFAULT_FONT_STYLE },
  align: "left",
};

export const DEFAULT_TITLE_SETTINGS: TitleSettings = {
  title: { ...DEFAULT_TITLE_ENTRY },
  subTitle: { ...DEFAULT_TITLE_ENTRY },
  customLabels: { ...DEFAULT_TITLE_ENTRY },
};

// ─── General > Highlight Selected Area ───────────────────────────────────────

export const DEFAULT_HIGHLIGHT_SELECTED_AREA: HighlightSelectedAreaSettings = {
  enabled: false,
  dataLabel: false,
};

// ─── General > Axis ──────────────────────────────────────────────────────────

export const DEFAULT_AXIS_LINE: AxisLineSettings = {
  color: "#000000",
  width: 0,
};

export const DEFAULT_GRID_LINES: GridLineSettings = {
  color: "#000000",
  width: 0,
  dashStyle: "SHORT_",
};

export const DEFAULT_AXIS_SETTINGS: AxisSettings = {
  title: "",
  titleFontStyle: { ...DEFAULT_FONT_STYLE },
  titleAlign: "left",
  labelsEnabled: true,
  labelsFontStyle: { ...DEFAULT_FONT_STYLE },
  enableTextWrap: false,
  axisLine: { ...DEFAULT_AXIS_LINE },
  gridLines: { ...DEFAULT_GRID_LINES },
  ticksEnabled: true,
};

// ─── General > Secondary Axis ────────────────────────────────────────────────

export const DEFAULT_SECONDARY_AXIS: SecondaryAxisSettings = {
  enabled: false,
};

// ─── General > Data Value Labels ─────────────────────────────────────────────

export const DEFAULT_DATA_VALUE_LABELS: DataValueLabelSettings = {
  labelsEnabled: true,
  labelAlign: "center",
  labelRotation: 0,
  fontStyle: { ...DEFAULT_FONT_STYLE },
  showCategories: false,
  labelFormat: "",
};

// ─── General > Legend ─────────────────────────────────────────────────────────

export const DEFAULT_LEGEND: LegendSettings = {
  displayLegend: true,
  textStyle: { ...DEFAULT_FONT_STYLE },
  position: "bottom",
  floatOnTop: false,
};

// ─── General > Tooltip ───────────────────────────────────────────────────────

export const DEFAULT_TOOLTIP: TooltipSettings = {
  disable: false,
  indicator: false,
  unit: false,
  subgroup: false,
  timePeriod: false,
  area: false,
  source: false,
  footnote: false,
};

// ─── General (combined) ──────────────────────────────────────────────────────

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  chartArea: { ...DEFAULT_CHART_AREA },
  plotArea: { ...DEFAULT_PLOT_AREA },
  chartBorder: { ...DEFAULT_CHART_BORDER },
  title: {
    title: { ...DEFAULT_TITLE_ENTRY },
    subTitle: { ...DEFAULT_TITLE_ENTRY },
    customLabels: { ...DEFAULT_TITLE_ENTRY },
  },
  colorTheme: "",
  highlightSelectedArea: { ...DEFAULT_HIGHLIGHT_SELECTED_AREA },
  axisHorizontal: { ...DEFAULT_AXIS_SETTINGS },
  axisVertical: { ...DEFAULT_AXIS_SETTINGS },
  secondaryAxis: { ...DEFAULT_SECONDARY_AXIS },
  dataValueLabels: { ...DEFAULT_DATA_VALUE_LABELS },
  legend: { ...DEFAULT_LEGEND },
  tooltip: { ...DEFAULT_TOOLTIP },
};

// ─── Other Tab Defaults ──────────────────────────────────────────────────────

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  typeId: "bar",
  chartVariant: ""
};

export const DEFAULT_DATA_SETTINGS: DataSettings = {
  indicators: [],
  subgroups: [],
  areas: [],
  timePeriods: [],
  mapping: { xDimension: "time", seriesDimension: null },
};

export const DEFAULT_SERIES_SETTINGS: SeriesSettings = {
  sortByList: "",
}

export const DEFAULT_CATEGORIES_SETTINGS: CategoriesSettings = {
  sortByList: ""
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  enableTheme: false,
  globalSubgroupColor: false,
  enableGlobalUIColor: false
}

export const DEFAULT_ADVANCE_SETTINGS: AdvanceSettings = {
  datawarehouseId: 1,
  contextMenu:{enabled:false}
}

// ─── Custom Type Defaults ────────────────────────────────────────────────────

export const DEFAULT_CUSTOM_HTML: CustomHtmlSettings = {
  html: "",
  noDataText: "",
  enableChildHook: false,
  datawarehouseConnection: "",
  enableExternalApi: false,
  enableContextMenu: false,
};

export const DEFAULT_CUSTOM_TEXT: CustomTextSettings = {
  text: "",
  fontFamily: "",
  bold: false,
  italic: false,
  underline: false,
  color: "#000000",
};

export const DEFAULT_CUSTOM_IMAGE: CustomImageSettings = {
  source: "media",
  mediaFile: "",
  url: "",
  width: "100",
  height: "100",
  unit: "%",
  borderWidth: 0,
  borderRadius: 0,
  align: "center",
};

export const DEFAULT_CUSTOM_VIDEO: CustomVideoSettings = {
  source: "media",
  mediaFile: "",
  videoUrl: "",
  width: "",
  height: "",
  autoSize: true,
};

// ─── Top-level Defaults ──────────────────────────────────────────────────────

export const DEFAULT_VISUALIZATION_SETTINGS: VisualizationSettings = {
  charts: { ...DEFAULT_CHART_SETTINGS },
  data: { ...DEFAULT_DATA_SETTINGS },
  general: { ...DEFAULT_GENERAL_SETTINGS },
  series: { ...DEFAULT_SERIES_SETTINGS },
  categories: { ...DEFAULT_CATEGORIES_SETTINGS },
  theme: { ...DEFAULT_THEME_SETTINGS },
  advance: { ...DEFAULT_ADVANCE_SETTINGS },
  customHtml: { ...DEFAULT_CUSTOM_HTML },
  customText: { ...DEFAULT_CUSTOM_TEXT },
  customImage: { ...DEFAULT_CUSTOM_IMAGE },
  customVideo: { ...DEFAULT_CUSTOM_VIDEO },
};

export const EMPTY_VISUALIZATION_STATE: VisualizationState = {
  vizId: "",
  name: "",
  typeId: "bar",
  inUse: false,
  settings: { ...DEFAULT_VISUALIZATION_SETTINGS },
};

// ─── Dynamic tab definitions ────────────────────────────────────────────────

type TabDef = { id: string; label: string };

const CHART_TABS: TabDef[] = [
  { id: "charts", label: "Charts" },
  { id: "data", label: "Data" },
  { id: "general", label: "General" },
  { id: "series", label: "Series" },
  { id: "categories", label: "Categories" },
  { id: "theme", label: "Theme" },
  { id: "advance", label: "Advance" },
];

const TABLE_TABS: TabDef[] = [
  { id: "charts", label: "Charts" },
  { id: "general", label: "General" },
  { id: "theme", label: "Theme" },
  { id: "advance", label: "Advance" },
];

const TREEMAP_TABS: TabDef[] = [
  { id: "charts", label: "Charts" },
  { id: "general", label: "General" },
  { id: "advance", label: "Advance" },
];

const PERCENTAGE_TABS: TabDef[] = [
  { id: "charts", label: "Charts" },
  { id: "general", label: "General" },
  { id: "series", label: "Series" },
  { id: "advance", label: "Advance" },
];

const HTML_TABS: TabDef[] = [
  { id: "charts", label: "Charts" },
  { id: "data", label: "Data" },
  { id: "customize_html", label: "Customize HTML" },
  { id: "advance", label: "Advance" },
];

const TEXT_TABS: TabDef[] = [
  { id: "charts", label: "Charts" },
  { id: "general", label: "General" },
];

const IMAGE_TABS: TabDef[] = [
  { id: "charts", label: "Charts" },
  { id: "general", label: "General" },
];

const VIDEO_TABS: TabDef[] = [
  { id: "charts", label: "Charts" },
  { id: "general", label: "General" },
];

export function getTabsForType(typeId: string): TabDef[] {
  switch (typeId) {
    case "html":
      return HTML_TABS;
    case "text":
      return TEXT_TABS;
    case "image":
      return IMAGE_TABS;
    case "video":
      return VIDEO_TABS;
    case "table":
      return TABLE_TABS;
    case "tree":
      return TREEMAP_TABS;
    case "percent":
      return PERCENTAGE_TABS;
    default:
      return CHART_TABS;
  }
}