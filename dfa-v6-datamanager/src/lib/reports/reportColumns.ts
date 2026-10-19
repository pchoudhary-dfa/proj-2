/**
 * Report column definitions — maps each report slug to its display fields,
 * and each field key to its [translationKey, englishFallback] label pair.
 */

// ---------------------------------------------------------------------------
// Field label map: fieldKey → [translationKey, englishFallback]
// ---------------------------------------------------------------------------

export const FIELD_LABEL_MAP: Record<string, [string, string]> = {
  // Indicator fields
  i_nid:                  ["INDICATOR_NID",          "Indicator NID"],
  i_gid:                  ["INDICATOR_GID",          "Indicator GID"],
  i_name:                 ["LABEL_INDICATOR",        "Indicator"],
  // Unit fields
  u_nid:                  ["UNIT_NID",               "Unit NID"],
  // Subgroup fields
  sg_nid:                 ["SUBGROUP_NID",           "Subgroup NID"],
  sg_gid:                 ["SUBGROUP_GID",           "Subgroup GID"],
  sg_name:                ["SUBGROUP",               "Subgroup"],
  // Area fields
  ar_nid:                 ["AREA_NID",               "Area NID"],
  ar_gid:                 ["AREA_ID",                "Area ID"],
  ar_id:                  ["AREA_ID",                "Area ID"],
  ar_name:                ["AREA",                   "Area"],
  ar_level:               ["AREA_LEVEL",             "Area Level"],
  ar_parent_nid:          ["PARENT_AREA_NID",        "Parent Area NID"],
  // Time period fields
  tp_nid:                 ["TIME_PERIOD_NID",        "Time Period NID"],
  tp_timeperiod:          ["TIME_PERIOD",            "Time Period"],
  // Source fields
  src_nid:                ["SOURCE_NID",             "Source NID"],
  src_gid:                ["SOURCE_GID",             "Source GID"],
  src_name:               ["SOURCE",                 "Source"],
  // IC fields
  ic_nid:                 ["IC_NID",                 "IC NID"],
  ic_gid:                 ["IC_GID",                 "IC GID"],
  ic_name:                ["IC_NAME",                "IC Name"],
  ic_type:                ["IC_TYPE",                "IC Type"],
  ic_ius_nid:             ["IC_IUS_NID",             "IC-IUS NID"],
  // IUS derived display fields (resolved via lookup maps in quality-report page)
  ius_i_name:             ["LABEL_INDICATOR",        "Indicator"],
  ius_u_name:             ["LABEL_UNIT",             "Unit"],
  ius_sg_name:            ["SUBGROUP",               "Subgroup"],
  // IUS fields
  ius_combination:        ["IUS_COMBINATION",        "IUS (Indicator | Unit | Subgroup)"],
  ius_nid:                ["IUS_NID",                "IUS NID"],
  ius_min_value:          ["MIN_VALUE",              "Min Value"],
  ius_max_value:          ["MAX_VALUE",              "Max Value"],
  ius_has_data:           ["HAS_DATA",               "Has Data"],
  ius_is_default_subgroup:["IS_DEFAULT",             "Is Default"],
  // Broken reference flags
  i_ref_missing:          ["INDICATOR_REF_MISSING",  "Indicator Ref Missing"],
  u_ref_missing:          ["UNIT_REF_MISSING",       "Unit Ref Missing"],
  sg_ref_missing:         ["SUBGROUP_REF_MISSING",   "Subgroup Ref Missing"],
  ic_ref_missing:         ["IC_REF_MISSING",         "IC Ref Missing"],
  ius_ref_missing:        ["IUS_REF_MISSING",        "IUS Ref Missing"],
  // Data row fields
  dt_nid:                 ["DATA_NID",               "Data NID"],
  dt_value:               ["VALUE",                  "Value"],
  // Metadata fields
  mt_catg_nid:            ["METADATA_CATG_NID",      "Metadata Category NID"],
  mt_catg_name:           ["METADATA_CATG",          "Metadata Category"],
  // Unit name (returned as join on ius-density)
  u_name:                 ["LABEL_UNIT",              "Unit"],
  // Virtual display columns (computed from multiple backend fields)
  i_u_name:               ["LABEL_INDICATOR",          "Indicator"],
  period_span:            ["PERIOD_SPAN",             "Period Span"],
  period_coverage:        ["PERIOD_COVERAGE",         "Coverage"],
  // Coverage analytics fields
  total_areas:            ["TOTAL_AREAS",            "Total Areas"],
  areas_with_data:        ["AREAS_WITH_DATA",        "Areas with Data"],
  coverage_pct:           ["COVERAGE_PCT",           "Coverage %"],
  earliest_period:        ["EARLIEST_PERIOD",        "Earliest Period"],
  latest_period:          ["LATEST_PERIOD",          "Latest Period"],
  periods_with_data:      ["PERIODS_WITH_DATA",      "Periods with Data"],
  total_periods:          ["TOTAL_PERIODS",          "Total Periods"],
  total_ius:              ["TOTAL_IUS",              "Total IUS"],
  ius_with_data:          ["IUS_WITH_DATA",          "IUS with Data"],
  completeness_pct:       ["COMPLETENESS_PCT",       "Completeness %"],
  data_row_count:         ["DATA_ROW_COUNT",         "Data Row Count"],
  // Volume analytics fields
  total_data_rows:        ["TOTAL_DATA_ROWS",        "Total Data Rows"],
  total_rows:             ["TOTAL_ROWS",             "Total Rows"],
  min_data_value:         ["MIN_DATA_VALUE",         "Min Value"],
  max_data_value:         ["MAX_DATA_VALUE",         "Max Value"],
  avg_data_value:         ["AVG_DATA_VALUE",         "Avg Value"],
  distinct_indicators:    ["DISTINCT_INDICATORS",    "Distinct Indicators"],
  distinct_areas:         ["DISTINCT_AREAS",         "Distinct Areas"],
  distinct_ius:           ["DISTINCT_IUS",           "Distinct IUS"],
  distinct_time_periods:  ["DISTINCT_TIME_PERIODS",  "Distinct Time Periods"],
  mapped_ius_count:       ["MAPPED_IUS_COUNT",       "Mapped IUS Count"],
};

// ---------------------------------------------------------------------------
// Display fields: slug → fields to SHOW in the UI table
//
// Rules applied per report:
//   • Where the API returns both *_nid and *_gid/*_name, hide the _nid.
//   • Where only _nid is available (no name/gid alternative), keep it
//     because it is the only meaningful identifier for that dimension.
//   • dt_nid (row PK) is always hidden — it has no analytical value.
//   • ic_ius_nid (row PK) is hidden for the same reason.
// ---------------------------------------------------------------------------

export const REPORT_DISPLAY_FIELDS: Record<string, string[]> = {

  // ── Group A: Indicator Quality ──────────────────────────────────────────
  "quality/indicators/no-ius": [
    "i_name",
  ],
  "quality/indicators/no-default-subgroup": [
    "i_name", "ius_is_default_subgroup",
  ],
  "quality/indicators/no-data": [
    "i_name",
  ],

  // ── Group B: IUS Quality ────────────────────────────────────────────────
  "quality/ius/invalid-value-range": [
    "ius_i_name", "ius_sg_name", "ius_min_value", "ius_max_value",
  ],
  "quality/ius/no-ic-mapping": [
    "ius_i_name", "ius_sg_name",
  ],
  "quality/ius/orphan-refs": [
    "ius_i_name", "ius_sg_name", "i_ref_missing", "u_ref_missing", "sg_ref_missing",
  ],

  // ── Group C: Area Quality ───────────────────────────────────────────────
  "quality/areas/no-data": [
    "ar_id", "ar_name",
  ],
  // ar_parent_nid is the broken FK value — the whole point of the report
  "quality/areas/orphan-parent": [
    "ar_id", "ar_name", "ar_parent_nid",
  ],

  // ── Group D: Time Period Quality ────────────────────────────────────────
  "quality/time-periods/unused": [
    "tp_timeperiod",
  ],

  // ── Group E: Subgroup Quality ───────────────────────────────────────────
  "quality/subgroups/vals-not-in-ius": [
    "sg_name",
  ],

  // ── Group F: Data Value Integrity ───────────────────────────────────────
  // i_name / ar_name are now returned by the backend via joins
  "quality/data/values-out-of-range": [
    "i_name", "ar_name", "tp_nid", "dt_value", "ius_min_value", "ius_max_value",
  ],
  "quality/data/missing-mrd": [
    "i_u_name", "sg_name", "ar_name",
  ],

  // ── Group G: Metadata Completeness ──────────────────────────────────────
  "quality/metadata/missing-mandatory": [
    "i_name", "mt_catg_name",
  ],

  // ── Group H: Source Quality ─────────────────────────────────────────────
  "quality/sources/unused": [
    "src_name",
  ],

  // ── Group I: IC / Classification Quality ────────────────────────────────
  "quality/indicator-classifications/no-ius": [
    "ic_name", "ic_type",
  ],
  "quality/indicator-classifications/leaf-no-ius": [
    "ic_name", "ic_type",
  ],
  // ic_ius_nid is the row PK — hidden; ic_name now returned via join
  "quality/ic-ius/orphan-refs": [
    "ic_name", "ic_ref_missing", "ius_ref_missing",
  ],

  // ── Group N: Data Referential Integrity ─────────────────────────────────
  // dt_nid (row PK) hidden; i_name / ar_name now returned via joins
  "quality/data/orphan-ius": [
    "i_name", "ar_name", "dt_value",
  ],
  "quality/data/orphan-area": [
    "i_name", "dt_value",
  ],
  "quality/data/orphan-timeperiod": [
    "i_name", "dt_value",
  ],
  "quality/data/orphan-source": [
    "i_name",
  ],

  // ── Group J: Coverage & Completeness ────────────────────────────────────
  "analytics/coverage/indicator-by-area": [
    "i_name", "total_areas", "areas_with_data", "coverage_pct",
  ],
  "analytics/coverage/indicator-by-timeperiod": [
    "i_name", "period_span", "period_coverage",
  ],
  "analytics/coverage/area-completeness": [
    "ar_id", "ar_name", "ar_level", "total_ius", "ius_with_data", "completeness_pct",
  ],
  "analytics/coverage/indicator-subgroup": [
    "i_name", "sg_name", "ius_has_data", "data_row_count",
  ],

  // ── Group K: Data Volume & Distribution ─────────────────────────────────
  "analytics/volume/top-indicators": [
    "i_name", "total_data_rows",
  ],
  // i_name / u_name / sg_name now returned via joins
  "analytics/volume/ius-density": [
    "i_u_name", "sg_name", "total_rows", "min_data_value", "max_data_value",
    "avg_data_value", "period_span",
  ],
  "analytics/volume/subgroup-distribution": [
    "sg_name", "total_data_rows", "distinct_indicators", "distinct_areas",
  ],

  // ── Group L: IC & Source Utilisation ────────────────────────────────────
  "analytics/utilisation/source-usage": [
    "src_name",
    "total_data_rows", "distinct_ius", "distinct_areas", "distinct_time_periods",
  ],
  "analytics/utilisation/ic-coverage": [
    "ic_name", "ic_type",
    "mapped_ius_count", "total_data_rows", "distinct_areas",
  ],
};

// ---------------------------------------------------------------------------
// Report slugs that accept a time_period query parameter
// ---------------------------------------------------------------------------

export const REPORT_SUPPORTS_TIME_PERIOD = new Set([
  // Quality data integrity reports
  "quality/data/values-out-of-range",
  "quality/data/orphan-ius",
  "quality/data/orphan-area",
  "quality/data/orphan-source",
  // Analytics reports
  "analytics/volume/top-indicators",
  "analytics/volume/subgroup-distribution",
  "analytics/utilisation/source-usage",
  "analytics/utilisation/ic-coverage",
  "analytics/coverage/indicator-by-area",
  "analytics/coverage/indicator-by-timeperiod",
  "analytics/coverage/area-completeness",
]);

// ---------------------------------------------------------------------------
// Column width heuristic based on field key suffix
// ---------------------------------------------------------------------------

export function columnWidthFor(fieldKey: string): number {
  if (fieldKey === "ius_combination")                      return 340;
  if (fieldKey === "period_span")                          return 220;
  if (fieldKey === "i_u_name" || fieldKey === "ius_i_name") return 260;
  if (fieldKey === "ar_id")                                return 120;
  if (fieldKey === "ar_level")                             return 120;
  if (fieldKey.endsWith("_nid"))                          return 80;
  if (fieldKey.endsWith("_gid"))                          return 120;
  if (fieldKey.endsWith("_name") || fieldKey === "i_name") return 200;
  if (fieldKey === "tp_timeperiod" || fieldKey.endsWith("_period")) return 130;
  if (fieldKey.endsWith("_missing") || fieldKey.endsWith("_has_data") || fieldKey.endsWith("_is_default_subgroup")) return 110;
  if (fieldKey.endsWith("_pct"))                          return 110;
  if (fieldKey.endsWith("_type"))                         return 100;
  return 130;
}
