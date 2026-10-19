"""
DW report registry — metadata and access levels for all report slugs.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional

from apps.datawarehouse.services.dw_report_queries import (
    query_areas_no_data,
    query_areas_orphan_parent,
    query_coverage_area_completeness,
    query_coverage_indicator_by_area,
    query_coverage_indicator_by_timeperiod,
    query_coverage_indicator_subgroup,
    query_data_missing_mrd,
    query_data_orphan_area,
    query_data_orphan_ius,
    query_data_orphan_source,
    query_data_orphan_timeperiod,
    query_data_published,
    query_data_values_out_of_range,
    query_ic_leaf_no_ius,
    query_ic_no_ius,
    query_ic_ius_orphan_refs,
    query_indicators_no_data,
    query_indicators_no_default_subgroup,
    query_indicators_no_ius,
    query_ius_invalid_value_range,
    query_ius_no_ic_mapping,
    query_ius_orphan_refs,
    query_metadata_missing_mandatory,
    query_sources_unused,
    query_subgroups_vals_not_in_ius,
    query_time_periods_unused,
    query_utilisation_ic_coverage,
    query_utilisation_source_usage,
    query_volume_ius_density,
    query_volume_subgroup_distribution,
    query_volume_top_indicators,
)
from apps.datawarehouse.services.dw_published_data_service import PUBLISHED_DATA_COLUMN_DEFS
from apps.shared.exceptions import NotFound

ReportCategory = Literal["quality", "analytics", "data"]
ReportAccessLevel = Literal["PUBLIC", "APP_CLIENT", "AUTHENTICATED", "PERMISSION"]
QueryFn = Callable[..., Any]


@dataclass(frozen=True)
class ReportDefinition:
    slug: str
    title: str
    category: ReportCategory
    description: str
    access_level: ReportAccessLevel
    column_defs: list[str]
    query_fn: QueryFn
    needs_locale: bool = True


# ---------------------------------------------------------------------------
# Column definition lists (drive XLSX/CSV exports)
# ---------------------------------------------------------------------------

_COL_INDICATOR_BASIC = ["i_nid", "i_gid", "i_name"]
_COL_IUS_BASIC = ["ius_nid", "i_nid", "u_nid", "sg_nid"]
_COL_AREA_BASIC = ["ar_nid", "ar_gid", "ar_name"]
_COL_TP_BASIC = ["tp_nid", "tp_timeperiod"]


REPORT_REGISTRY: dict[str, ReportDefinition] = {

    # -------------------------------------------------------------------------
    # Group A — Indicator Quality
    # -------------------------------------------------------------------------
    "quality/indicators/no-ius": ReportDefinition(
        slug="quality/indicators/no-ius",
        title="Indicators with No Subgroup Assigned",
        category="quality",
        description=(
            "ut_indicator LEFT JOIN ut_indicator_unit_subgroup WHERE IUS IS NULL. "
            "No subgroup_breakdown — the indicator has no IUS so there is nothing subgroup-specific to show."
        ),
        access_level="PERMISSION",
        column_defs=_COL_INDICATOR_BASIC,
        query_fn=query_indicators_no_ius,
    ),
    "quality/indicators/no-default-subgroup": ReportDefinition(
        slug="quality/indicators/no-default-subgroup",
        title="Indicators Without Default Subgroup",
        category="quality",
        description=(
            "Has IUS rows but none has ius_is_default_subgroup = True. "
            "Each row includes subgroup_breakdown listing all assigned subgroup values."
        ),
        access_level="PERMISSION",
        column_defs=_COL_INDICATOR_BASIC + ["sg_nid", "sg_gid", "sg_name", "ius_is_default_subgroup"],
        query_fn=query_indicators_no_default_subgroup,
    ),
    "quality/indicators/no-data": ReportDefinition(
        slug="quality/indicators/no-data",
        title="Indicators With No Reported Data",
        category="quality",
        description=(
            "Default-locale ut_indicator rows where i_has_data = False. "
            "Each row returns i_nid, i_gid, i_name, and i_has_data."
        ),
        access_level="PERMISSION",
        column_defs=_COL_INDICATOR_BASIC + ["i_has_data"],
        query_fn=query_indicators_no_data,
    ),

    # -------------------------------------------------------------------------
    # Group B — IUS Quality
    # -------------------------------------------------------------------------
    "quality/ius/invalid-value-range": ReportDefinition(
        slug="quality/ius/invalid-value-range",
        title="IUS with Invalid Value Range",
        category="quality",
        description="ius_min_value > ius_max_value on ut_indicator_unit_subgroup.",
        access_level="PERMISSION",
        column_defs=_COL_IUS_BASIC + ["ius_min_value", "ius_max_value"],
        query_fn=query_ius_invalid_value_range,
    ),
    "quality/ius/no-ic-mapping": ReportDefinition(
        slug="quality/ius/no-ic-mapping",
        title="IUS Not Mapped to Any IC",
        category="quality",
        description="ius_nid not present in any ut_ic_ius.iusnid row.",
        access_level="PERMISSION",
        column_defs=_COL_IUS_BASIC + ["i_name", "u_name", "sg_name"],
        query_fn=query_ius_no_ic_mapping,
    ),
    "quality/ius/orphan-refs": ReportDefinition(
        slug="quality/ius/orphan-refs",
        title="IUS With Broken Dimension References",
        category="quality",
        description=(
            "IUS rows where indicator_nid, unit_nid, or subgroup_val_nid has no matching row "
            "in ut_indicator, ut_unit, or ut_subgroup_vals."
        ),
        access_level="PERMISSION",
        column_defs=_COL_IUS_BASIC + ["i_ref_missing", "u_ref_missing", "sg_ref_missing"],
        query_fn=query_ius_orphan_refs,
    ),

    # -------------------------------------------------------------------------
    # Group C — Area Quality
    # -------------------------------------------------------------------------
    "quality/areas/no-data": ReportDefinition(
        slug="quality/areas/no-data",
        title="Areas With No Data",
        category="quality",
        description="area.data_exist = False.",
        access_level="PERMISSION",
        column_defs=["ar_nid", "ar_id", "ar_name"],
        query_fn=query_areas_no_data,
    ),
    "quality/areas/orphan-parent": ReportDefinition(
        slug="quality/areas/orphan-parent",
        title="Areas With Broken Parent Reference",
        category="quality",
        description="ar_parent_nid != 0 AND parent ar_nid does not exist in ut_area.",
        access_level="PERMISSION",
        column_defs=["ar_nid", "ar_id", "ar_name", "ar_parent_nid"],
        query_fn=query_areas_orphan_parent,
    ),

    # -------------------------------------------------------------------------
    # Group D — Time Period Quality
    # -------------------------------------------------------------------------
    "quality/time-periods/unused": ReportDefinition(
        slug="quality/time-periods/unused",
        title="Unused Time Periods",
        category="quality",
        description="tp_nid not referenced in any ut_data.timeperiod_nid row.",
        access_level="PERMISSION",
        column_defs=_COL_TP_BASIC,
        query_fn=query_time_periods_unused,
    ),

    # -------------------------------------------------------------------------
    # Group E — Subgroup Quality
    # -------------------------------------------------------------------------
    "quality/subgroups/vals-not-in-ius": ReportDefinition(
        slug="quality/subgroups/vals-not-in-ius",
        title="SubgroupVals Not Used in Any IUS",
        category="quality",
        description="sg_nid not present in ut_indicator_unit_subgroup.subgroup_val_nid.",
        access_level="PERMISSION",
        column_defs=["sg_nid", "sg_gid", "sg_name"],
        query_fn=query_subgroups_vals_not_in_ius,
    ),

    # -------------------------------------------------------------------------
    # Group F — Data Value Integrity
    # -------------------------------------------------------------------------
    "quality/data/values-out-of-range": ReportDefinition(
        slug="quality/data/values-out-of-range",
        title="Data Values Outside IUS Range",
        category="quality",
        description="ut_data.data_value < ius.ius_min_value OR ut_data.data_value > ius.ius_max_value.",
        access_level="PERMISSION",
        column_defs=["dt_nid", "ius_nid", "dt_value", "ius_min_value", "ius_max_value", "ar_nid", "tp_nid"],
        query_fn=query_data_values_out_of_range,
    ),
    "quality/data/missing-mrd": ReportDefinition(
        slug="quality/data/missing-mrd",
        title="IUS+Area Combos With No MRD Row",
        category="quality",
        description="For a given ius_nid + ar_nid, no row has dt_is_mrd = True.",
        access_level="PERMISSION",
        column_defs=["ius_nid", "i_name", "u_name", "sg_name", "ar_name"],
        query_fn=query_data_missing_mrd,
    ),

    # -------------------------------------------------------------------------
    # Group G — Metadata Completeness
    # -------------------------------------------------------------------------
    "quality/metadata/missing-mandatory": ReportDefinition(
        slug="quality/metadata/missing-mandatory",
        title="Indicators Missing Mandatory Metadata",
        category="quality",
        description="No ut_metadatareport row for categories where mt_catg_is_mandatory = True.",
        access_level="PERMISSION",
        column_defs=_COL_INDICATOR_BASIC + ["mt_catg_nid", "mt_catg_name"],
        query_fn=query_metadata_missing_mandatory,
    ),

    # -------------------------------------------------------------------------
    # Group H — Source Quality
    # -------------------------------------------------------------------------
    "quality/sources/unused": ReportDefinition(
        slug="quality/sources/unused",
        title="Sources Not Referenced in Data",
        category="quality",
        description="Source IC NID (ic_type='SR') not present in ut_data.source_nid.",
        access_level="PERMISSION",
        column_defs=["src_nid", "src_gid", "src_name"],
        query_fn=query_sources_unused,
    ),

    # -------------------------------------------------------------------------
    # Group I — IC / Classification Quality
    # -------------------------------------------------------------------------
    "quality/indicator-classifications/no-ius": ReportDefinition(
        slug="quality/indicator-classifications/no-ius",
        title="ICs With No IUS Mapping",
        category="quality",
        description="IC NID not in ut_ic_ius.ic_nid; optional ?include_sr=false to exclude source ICs.",
        access_level="PERMISSION",
        column_defs=["ic_nid", "ic_gid", "ic_name", "ic_type"],
        query_fn=query_ic_no_ius,
    ),
    "quality/indicator-classifications/leaf-no-ius": ReportDefinition(
        slug="quality/indicator-classifications/leaf-no-ius",
        title="IC Leaf Nodes Without IUS",
        category="quality",
        description="IC row with no children in the IC hierarchy AND no rows in ut_ic_ius.",
        access_level="PERMISSION",
        column_defs=["ic_nid", "ic_gid", "ic_name", "ic_type"],
        query_fn=query_ic_leaf_no_ius,
    ),
    "quality/ic-ius/orphan-refs": ReportDefinition(
        slug="quality/ic-ius/orphan-refs",
        title="IC-IUS Links With Broken References",
        category="quality",
        description=(
            "Rows in ut_ic_ius where ic_nid is absent from ut_indicator_classifications "
            "OR iusnid is absent from ut_indicator_unit_subgroup."
        ),
        access_level="PERMISSION",
        column_defs=["ic_ius_nid", "ic_nid", "ius_nid", "ic_ref_missing", "ius_ref_missing"],
        query_fn=query_ic_ius_orphan_refs,
    ),

    # -------------------------------------------------------------------------
    # Group N — Data Referential Integrity
    # -------------------------------------------------------------------------
    "quality/data/orphan-ius": ReportDefinition(
        slug="quality/data/orphan-ius",
        title="Data Rows With Missing IUS Reference",
        category="quality",
        description="ut_data.iusnid not in ut_indicator_unit_subgroup — primary link to indicator+unit+subgroup is broken.",
        access_level="PERMISSION",
        column_defs=["dt_nid", "i_name", "u_name", "sg_name", "ar_name", "ius_nid", "tp_timeperiod", "ic_nid", "dt_value"],
        query_fn=query_data_orphan_ius,
    ),
    "quality/data/orphan-area": ReportDefinition(
        slug="quality/data/orphan-area",
        title="Data Rows With Missing Area Reference",
        category="quality",
        description="ut_data.area_nid not in ut_area — the area the data point belongs to no longer exists.",
        access_level="PERMISSION",
        column_defs=["dt_nid", "i_name", "u_name", "sg_name", "ius_nid", "ar_nid", "tp_timeperiod", "dt_value"],
        query_fn=query_data_orphan_area,
    ),
    "quality/data/orphan-timeperiod": ReportDefinition(
        slug="quality/data/orphan-timeperiod",
        title="Data Rows With Missing Time Period Reference",
        category="quality",
        description="ut_data.timeperiod_nid not in ut_timeperiod — the time period no longer exists.",
        access_level="PERMISSION",
        column_defs=["dt_nid", "i_name", "u_name", "sg_name", "ius_nid", "ar_name", "ar_id", "tp_nid", "dt_value"],
        query_fn=query_data_orphan_timeperiod,
    ),
    "quality/data/orphan-source": ReportDefinition(
        slug="quality/data/orphan-source",
        title="Data Rows With Missing Source Reference",
        category="quality",
        description="ut_data.source_nid not in ut_indicator_classifications (only where source_nid IS NOT NULL).",
        access_level="PERMISSION",
        column_defs=["dt_nid", "i_name", "u_name", "sg_name", "ius_nid", "ar_name", "ar_id", "tp_timeperiod", "ic_nid", "dt_value"],
        query_fn=query_data_orphan_source,
    ),

    # -------------------------------------------------------------------------
    # Group J — Coverage & Completeness
    # -------------------------------------------------------------------------
    "analytics/coverage/indicator-by-area": ReportDefinition(
        slug="analytics/coverage/indicator-by-area",
        title="Indicator Coverage by Area",
        category="analytics",
        description=(
            "For each indicator: total areas, areas with data, coverage %. "
            "Optional time_period scopes stats to selected period(s); total_areas becomes "
            "distinct areas reported in ut_data for those periods."
        ),
        access_level="AUTHENTICATED",
        column_defs=_COL_INDICATOR_BASIC + ["total_areas", "areas_with_data", "coverage_pct"],
        query_fn=query_coverage_indicator_by_area,
    ),
    "analytics/coverage/indicator-by-timeperiod": ReportDefinition(
        slug="analytics/coverage/indicator-by-timeperiod",
        title="Indicator Coverage by Time Period",
        category="analytics",
        description=(
            "For each indicator: earliest/latest period, periods with data, total periods. "
            "Optional time_period scopes stats to selected period(s); total_periods becomes "
            "the count of those periods."
        ),
        access_level="AUTHENTICATED",
        column_defs=_COL_INDICATOR_BASIC + ["earliest_period", "latest_period",
                                             "periods_with_data", "total_periods"],
        query_fn=query_coverage_indicator_by_timeperiod,
    ),
    "analytics/coverage/area-completeness": ReportDefinition(
        slug="analytics/coverage/area-completeness",
        title="Area Data Completeness",
        category="analytics",
        description=(
            "For each area: total IUS, IUS with data, completeness %. "
            "Optional time_period scopes stats to selected period(s); total_ius becomes "
            "distinct IUS reported in ut_data for those periods."
        ),
        access_level="AUTHENTICATED",
        column_defs=_COL_AREA_BASIC + ["ar_id", "ar_level", "total_ius", "ius_with_data", "completeness_pct"],
        query_fn=query_coverage_area_completeness,
    ),
    "analytics/coverage/indicator-subgroup": ReportDefinition(
        slug="analytics/coverage/indicator-subgroup",
        title="Indicator Subgroup Coverage",
        category="analytics",
        description="Flat cross-table: every indicator × subgroup-value pair with ius_has_data flag and row count.",
        access_level="AUTHENTICATED",
        column_defs=_COL_INDICATOR_BASIC + ["sg_nid", "sg_gid", "sg_name", "ius_has_data", "data_row_count"],
        query_fn=query_coverage_indicator_subgroup,
    ),

    # -------------------------------------------------------------------------
    # Group K — Data Volume & Distribution
    # -------------------------------------------------------------------------
    "analytics/volume/top-indicators": ReportDefinition(
        slug="analytics/volume/top-indicators",
        title="Top Indicators by Data Volume",
        category="analytics",
        description="Indicators ranked by total ut_data row count. Paginated JSON returns one page; export=true downloads all ranked indicators.",
        access_level="AUTHENTICATED",
        column_defs=_COL_INDICATOR_BASIC + ["total_data_rows"],
        query_fn=query_volume_top_indicators,
    ),
    "analytics/volume/ius-density": ReportDefinition(
        slug="analytics/volume/ius-density",
        title="IUS Data Density",
        category="analytics",
        description="For each IUS: total rows, min/max/avg dt_value, earliest/latest period.",
        access_level="AUTHENTICATED",
        column_defs=["ius_nid", "i_name", "u_name", "sg_name", "total_rows", "min_data_value",
                     "max_data_value", "avg_data_value", "earliest_period", "latest_period"],
        query_fn=query_volume_ius_density,
    ),
    "analytics/volume/subgroup-distribution": ReportDefinition(
        slug="analytics/volume/subgroup-distribution",
        title="Subgroup Distribution in Data",
        category="analytics",
        description="For each subgroup value: data row count, distinct indicators, distinct areas.",
        access_level="AUTHENTICATED",
        column_defs=["sg_nid", "sg_gid", "sg_name", "total_data_rows", "distinct_indicators", "distinct_areas"],
        query_fn=query_volume_subgroup_distribution,
    ),

    # -------------------------------------------------------------------------
    # Group L — IC & Source Utilisation
    # -------------------------------------------------------------------------
    "analytics/utilisation/source-usage": ReportDefinition(
        slug="analytics/utilisation/source-usage",
        title="Source Utilisation Summary",
        category="analytics",
        description="For each source IC: total ut_data rows, distinct IUS, areas, time periods — ranks sources by use.",
        access_level="AUTHENTICATED",
        column_defs=["src_nid", "src_gid", "src_name", "total_data_rows",
                     "distinct_ius", "distinct_areas", "distinct_time_periods"],
        query_fn=query_utilisation_source_usage,
    ),
    "analytics/utilisation/ic-coverage": ReportDefinition(
        slug="analytics/utilisation/ic-coverage",
        title="IC Node Coverage",
        category="analytics",
        description="For each IC node: mapped IUS count, total data rows, distinct areas.",
        access_level="AUTHENTICATED",
        column_defs=["ic_nid", "ic_gid", "ic_name", "ic_type",
                     "mapped_ius_count", "total_data_rows", "distinct_areas"],
        query_fn=query_utilisation_ic_coverage,
    ),

    # -------------------------------------------------------------------------
    # Group M — Published Data
    # -------------------------------------------------------------------------
    "data/published/full": ReportDefinition(
        slug="data/published/full",
        title="Published Data — Full Export",
        category="data",
        description=(
            "Enriched view of ut_data with all filters optional and no mandatory anchor. "
            "page_size ceiling 50000. PUBLIC."
        ),
        access_level="PUBLIC",
        column_defs=PUBLISHED_DATA_COLUMN_DEFS,
        query_fn=query_data_published,
        needs_locale=True,
    ),
}


def get_report(slug: str) -> ReportDefinition:
    """Return the report definition for a slug, or raise NotFound."""
    definition = REPORT_REGISTRY.get(slug)
    if definition is None:
        raise NotFound(f"Report not found: {slug}", identifier=slug)
    return definition


def list_reports() -> list[ReportDefinition]:
    """Return all registered reports in catalogue order."""
    return list(REPORT_REGISTRY.values())
