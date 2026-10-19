import type { SelectFieldOption } from "@/components/SelectField";

type TFn = (key: string, fallback: string) => string;

const ANALYTICAL_REPORT_ITEMS: { value: string; tKey: string; fallback: string }[] = [
  { value: "analytics/coverage/indicator-by-area",       tKey: "INDICATOR_BY_AREA",       fallback: "Indicator Coverage by Area" },
  { value: "analytics/coverage/indicator-by-timeperiod", tKey: "INDICATOR_BY_TIMEPERIOD", fallback: "Indicator Coverage by Time Period" },
  { value: "analytics/coverage/area-completeness",       tKey: "AREA_COMPLETENESS",       fallback: "Area Data Completeness" },
  { value: "analytics/coverage/indicator-subgroup",      tKey: "INDICATOR_SUBGROUP",      fallback: "Indicator Subgroup Coverage" },
  { value: "analytics/volume/top-indicators",            tKey: "TOP_INDICATORS",          fallback: "Top Indicators by Data Volume" },
  { value: "analytics/volume/ius-density",               tKey: "IUS_DENSITY",             fallback: "IUS Data Density" },
  { value: "analytics/volume/subgroup-distribution",     tKey: "SUBGROUP_DISTRIBUTION",   fallback: "Subgroup Distribution in Data" },
  { value: "analytics/utilisation/source-usage",         tKey: "SOURCE_USAGE",            fallback: "Source Utilisation Summary" },
  { value: "analytics/utilisation/ic-coverage",          tKey: "IC_COVERAGE",             fallback: "IC Node Coverage" },
];

const QUALITY_REPORT_ITEMS: { value: string; tKey: string; fallback: string }[] = [
  { value: "quality/indicators/no-ius",                     tKey: "INDICATORS_NO_IUS",                 fallback: "Indicators with No Subgroup Assigned" },
  { value: "quality/indicators/no-default-subgroup",        tKey: "INDICATORS_NO_DEFAULT_SUBGROUP",    fallback: "Indicators Without Default Subgroup" },
  { value: "quality/indicators/no-data",                    tKey: "INDICATORS_NO_DATA",                fallback: "Indicators With No Reported Data" },
  { value: "quality/ius/invalid-value-range",               tKey: "IUS_INVALID_VALUE_RANGE",           fallback: "IUS with Invalid Value Range" },
  { value: "quality/ius/no-ic-mapping",                     tKey: "IUS_NO_IC_MAPPING",                 fallback: "IUS Not Mapped to Any IC" },
  { value: "quality/ius/orphan-refs",                       tKey: "IUS_ORPHAN_REFS",                   fallback: "IUS With Broken Dimension References" },
  { value: "quality/areas/no-data",                         tKey: "AREAS_NO_DATA",                     fallback: "Areas With No Data" },
  { value: "quality/areas/orphan-parent",                   tKey: "AREAS_ORPHAN_PARENT",               fallback: "Areas With Broken Parent Reference" },
  { value: "quality/time-periods/unused",                   tKey: "TIME_PERIODS_UNUSED",               fallback: "Unused Time Periods" },
  { value: "quality/subgroups/vals-not-in-ius",             tKey: "SUBGROUPS_VALS_NOT_IN_IUS",         fallback: "SubgroupVals Not Used in Any IUS" },
  { value: "quality/data/values-out-of-range",              tKey: "DATA_VALUES_OUT_OF_RANGE",          fallback: "Data Values Outside IUS Range" },
  { value: "quality/data/missing-mrd",                      tKey: "DATA_MISSING_MRD",                  fallback: "IUS+Area Combos With No MRD Row" },
  { value: "quality/metadata/missing-mandatory",            tKey: "METADATA_MISSING_MANDATORY",        fallback: "Indicators Missing Mandatory Metadata" },
  { value: "quality/sources/unused",                        tKey: "SOURCES_UNUSED",                    fallback: "Sources Not Referenced in Data" },
  { value: "quality/indicator-classifications/no-ius",      tKey: "IC_NO_IUS",                         fallback: "ICs With No IUS Mapping" },
  { value: "quality/indicator-classifications/leaf-no-ius", tKey: "IC_LEAF_NO_IUS",                    fallback: "IC Leaf Nodes Without IUS" },
  { value: "quality/ic-ius/orphan-refs",                    tKey: "IC_IUS_ORPHAN_REFS",                fallback: "IC-IUS Links With Broken References" },
  { value: "quality/data/orphan-ius",                       tKey: "DATA_ORPHAN_IUS",                   fallback: "Data Rows With Missing IUS Reference" },
  { value: "quality/data/orphan-area",                      tKey: "DATA_ORPHAN_AREA",                  fallback: "Data Rows With Missing Area Reference" },
  { value: "quality/data/orphan-timeperiod",                tKey: "DATA_ORPHAN_TIMEPERIOD",            fallback: "Data Rows With Missing Time Period Reference" },
  { value: "quality/data/orphan-source",                    tKey: "DATA_ORPHAN_SOURCE",                fallback: "Data Rows With Missing Source Reference" },
];

export function getAnalyticalReportOptions(t: TFn): SelectFieldOption[] {
  return ANALYTICAL_REPORT_ITEMS.map(({ value, tKey, fallback }) => ({ value, label: t(tKey, fallback) }));
}

export function getQualityReportOptions(t: TFn): SelectFieldOption[] {
  return QUALITY_REPORT_ITEMS.map(({ value, tKey, fallback }) => ({ value, label: t(tKey, fallback) }));
}

/** Returns the value of the first analytical report option. */
export const ANALYTICAL_REPORT_DEFAULT_VALUE = ANALYTICAL_REPORT_ITEMS[0]?.value ?? "";

/** Returns the value of the first quality report option. */
export const QUALITY_REPORT_DEFAULT_VALUE = QUALITY_REPORT_ITEMS[0]?.value ?? "";

/** @deprecated Use getAnalyticalReportOptions(t) for translated labels. */
export const ANALYTICAL_REPORT_OPTIONS: SelectFieldOption[] = ANALYTICAL_REPORT_ITEMS.map(
  ({ value, fallback }) => ({ value, label: fallback })
);

/** @deprecated Use getQualityReportOptions(t) for translated labels. */
export const QUALITY_REPORT_OPTIONS: SelectFieldOption[] = QUALITY_REPORT_ITEMS.map(
  ({ value, fallback }) => ({ value, label: fallback })
);

/** Returns the value of the first option. */
export function getDefaultReportTypeValue(options: SelectFieldOption[]): string {
  return options[0]?.value ?? "";
}
