import { MOCK_DASHBOARD_ROWS } from "@/components/dashboard/dashboardsGridColumns";
import { VISUALIZATION_TYPES, VisualizationState } from "../visualizations/types";

export type SectionManagementValues = {
  backgroundColor: string;
  borderColor: string;
  fontColor: string;
  selectedSectionBgColor: string;
  selectedSectionFontColor: string;
  hoverOverBgColor: string;
  hoverOverFontColor: string;
  bottomMargin: string;
};

export type HeaderFooterConfigValues = {
  name: string;
  selectedHeaderFooterId: string;
  headerHtml: string;
  mobileHeaderHtml: string;
  footerHtml: string;
  footerFixedAtBottom: boolean;
  faviconUrl: string;
};

export type GlobalScriptValues = {
  css: string;
  js: string;
};

export type MultipleLanguageSupportValues = {
  enableLanguage: boolean;
  datawarehouseLabel: string;
};

export type DashboardFormValues = {
  dashboardName: string;
  mapUrl: string;
  dashboardUrl: string;
  resolution: string;
  datawarehouseId: string;
  globalScripts: GlobalScriptValues;
  headerFooter: HeaderFooterConfigValues;
  sectionManagement: SectionManagementValues;
  multipleLanguageSupport: MultipleLanguageSupportValues;
};

export type DashboardListRow = {
  id: string;
  title: string;
  numericId: number;
  datawarehouse: string;
  datawarehouseId: string;
  languages: string[];
  mapUrl: string;
  dashboardUrl: string;
  resolution: string;
  publishUrl: string;
  publishedAt: string;
  role: string;
  modifiedDate: string;
  modifiedTime: string;
};

export type DatawarehouseOption = {
  value: string;
  label: string;
};


export const DEFAULT_SECTION_MANAGEMENT: SectionManagementValues = {
  backgroundColor: "#FFFFFF",
  borderColor: "#FFFFFF",
  fontColor: "#1A1A1A",
  selectedSectionBgColor: "#00000",
  selectedSectionFontColor: "#BBAF71",
  hoverOverBgColor: "#53836E",
  hoverOverFontColor: "#FFFFFF",
  bottomMargin: "#FFFFFF",
};

export const DEFAULT_HEADER_FOOTER_CONFIG: HeaderFooterConfigValues = {
  name: "Default header and footer",
  selectedHeaderFooterId: "",
  headerHtml: "",
  mobileHeaderHtml: "",
  footerHtml: "",
  footerFixedAtBottom: false,
  faviconUrl: "",
};

export const DEFAULT_GLOBAL_SCRIPTS: GlobalScriptValues = {
  css: "",
  js: "",
};

export const DEFAULT_MULTIPLE_LANGUAGE_SUPPORT: MultipleLanguageSupportValues = {
  enableLanguage: false,
  datawarehouseLabel: "",
};

export const EMPTY_DASHBOARD_FORM: DashboardFormValues = {
  dashboardName: "",
  mapUrl: "https://dfadml.dataforall.org/",
  dashboardUrl: "",
  resolution: "Width = 1024px",
  datawarehouseId: "",
  globalScripts: { ...DEFAULT_GLOBAL_SCRIPTS },
  headerFooter: { ...DEFAULT_HEADER_FOOTER_CONFIG },
  sectionManagement: { ...DEFAULT_SECTION_MANAGEMENT },
  multipleLanguageSupport: { ...DEFAULT_MULTIPLE_LANGUAGE_SUPPORT },
};


export type VisualizationTypeId =
  | "bar"
  | "area"
  | "line"
  | "map"
  | "pie"
  | "table"
  | "tree"
  | "percent"
  | "html"
  | "text"
  | "image"
  | "video"
  | "tile";

export type VisualizationTypeOption = {
  id: VisualizationTypeId;
  label: string;
  icon: string;
};

export type VisualizationSettingsValues = {
  name: string;
  typeId: VisualizationTypeId;
};

export type FilterTypeId = "select_list" | "global";

export type FilterTypeOption = {
  id: FilterTypeId;
  label: string;
  icon: string;
};

export const FILTER_TYPES: FilterTypeOption[] = [
  { id: "select_list", label: "Select list filter", icon: "filter_list" },
  { id: "global", label: "Global filter", icon: "language" },
];

export type FilterItem = {
  id: string;
  name: string;
  filterType: FilterTypeId;
  viewType: string;
  dataType: string;
  label: string;
  enableSearch: boolean;
  datawarehouseConnection: string;
};

export const EMPTY_FILTER_ITEM: Omit<FilterItem, "id" | "name" | "filterType"> = {
  viewType: "",
  dataType: "",
  label: "",
  enableSearch: false,
  datawarehouseConnection: "",
};

export type DragPayload =
  | { dragType: "visualization"; dragData: VisualizationState }
  | { dragType: "select_list_filter"; dragData: FilterItem }
  | { dragType: "global_filter"; dragData: FilterItem };

export function rowToFormValues(row: DashboardListRow): DashboardFormValues {
  return {
    dashboardName: row.title,
    mapUrl: row.mapUrl,
    dashboardUrl: row.dashboardUrl,
    resolution: row.resolution,
    datawarehouseId: row.datawarehouseId,
    globalScripts: { ...DEFAULT_GLOBAL_SCRIPTS },
    headerFooter: { ...DEFAULT_HEADER_FOOTER_CONFIG },
    sectionManagement: { ...DEFAULT_SECTION_MANAGEMENT },
    multipleLanguageSupport: { ...DEFAULT_MULTIPLE_LANGUAGE_SUPPORT },
  };
}

export function formValuesToRow(
  values: DashboardFormValues,
  existing: Partial<DashboardListRow> | null,
  datawarehouseLabel: string,
): DashboardListRow {
  const id = existing?.id ?? String(Date.now());
  const parsedId = Number(id);
  const numericId =
    existing?.numericId ??
    (Number.isFinite(parsedId) ? parsedId : Date.now());
  const now = new Date();
  const modifiedDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const modifiedTime = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const slug = values.dashboardName.trim().toLowerCase().replace(/\s+/g, "-");
  const publishUrl =
    values.dashboardUrl.trim() ||
    existing?.publishUrl || ''

  return {
    id,
    title: values.dashboardName.trim(),
    numericId,
    datawarehouse: datawarehouseLabel,
    datawarehouseId: values.datawarehouseId,
    languages: existing?.languages ?? ["en"],
    mapUrl: values.mapUrl.trim(),
    dashboardUrl: values.dashboardUrl.trim(),
    resolution: values.resolution.trim(),
    publishUrl,
    publishedAt: existing?.publishedAt ?? `${modifiedDate} ${modifiedTime}`,
    role: existing?.role ?? "Admin",
    modifiedDate,
    modifiedTime,
  };
}

export function findDashboardById(id: string): DashboardListRow | undefined {
  return MOCK_DASHBOARD_ROWS.find((row) => row.id === id);
}

export function iconFromType(typeId:VisualizationTypeId){
  return VISUALIZATION_TYPES.find((type) => type.id === typeId)?.icon || ""
}