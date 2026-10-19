"""
API parameter name constants for datawarehouse routers.
Use these in Query(), Path(), Body() via alias= so naming is consistent and easy to change.
All names are snake_case. Comment after each (or group) lists which router file(s) use it.
"""
from __future__ import annotations

from typing import Union

# ---------------------------------------------------------------------------
# Path parameters (used in route path and Path(..., alias=...))
# ---------------------------------------------------------------------------
# Used in: all routers
PATH_DW_ID = "dw_id"

# Used in: language (get one, delete by code)
PATH_LANG_CODE = "lang_code"

# Used in: indicator_classification, areas, area_levels, unit, indicator, ius, sg_vals, time_periods, indicator_metadata, sg_categories (update endpoint)
PATH_IDENTIFIER = "identifier"

# Used in: indicator_classification (get one IC, create, update, delete)
PATH_IC_IDENTIFIER = "ic_identifier"  # route segment for /ic/{ic_identifier}/ius and /ic/{ic_identifier}/indicators

# Used in: sg_categories (get one category, delete, values endpoints)
PATH_SG_CATEGORY_IDENTIFIER = "sg_category_identifier"

# Used in: sg_categories (update endpoint)
PATH_CATEGORY_IDENTIFIER = "category_identifier"

# Used in: sg_categories (value by value identifier)
PATH_VALUE_IDENTIFIER = "value_identifier"

# Used in: area_levels (update, delete, association-count by level_nid)
PATH_LEVEL_NID = "level_nid"

# Used in: areas (update by ar_nid, delete by ar_nid)
PATH_AR_NID = "ar_nid"

# Used in: ius (list IUS for indicator)
PATH_INDICATOR_IDENTIFIER = "indicator_identifier"

# ---------------------------------------------------------------------------
# Query parameters – pagination / list (used in multiple routers)
# ---------------------------------------------------------------------------
# Used in: indicator_classification, areas, area_levels, unit, indicator, ius, sg_categories, sg_vals, time_periods, data, search
QUERY_PAGE = "page"

# Used in: indicator_classification, areas, area_levels, unit, indicator, ius, sg_categories, sg_vals, time_periods, data
QUERY_PAGE_SIZE = "page_size"

# Used in: iam (resources list)
QUERY_IS_DW_SPEC = "is_dw_spec"

# Default page size when page_size is provided in query but empty or invalid (pagination applied only when page_size is present)
DEFAULT_PAGE_SIZE = 10

# Used in: ius, sg_categories
QUERY_SCOPE = "scope"

# Used in: search router (max result limit; not pagination page size)
QUERY_LIMIT = "limit"

# Used in: indicator_classification, unit, indicator, ius
QUERY_SORT_ORDER = "sort_order"
QUERY_SORT_FIELD = "sort_field"
QUERY_SEARCH = "search"
QUERY_TIMEPERIOD_FREQUENCY = "timeperiod_frequency"
QUERY_MAX_TIMEPERIOD_NID = "max_timeperiod_nid"
# Multi-entity search for GET /dw/{dw_id}/indicators: search_by=entity1|entity2, search=term1|term2 (separator from IUS_GID_SEPARATOR)
QUERY_SEARCH_BY = "search_by"
# GET /workflow/{dw_id}/data-points — text search dimension (search + search_by)
UNIFIED_DATAPOINT_SEARCH_BY_VALUES: tuple[str, ...] = ("indicator_unit", "subgroup", "area")
# Allowed sort_field values; map to internal row dict keys i_name, u_name, sg_name, ar_name
UNIFIED_DATAPOINT_SORT_FIELDS: tuple[str, ...] = ("indicator_name", "unit_name", "subgroup", "area")
UNIFIED_DATAPOINT_SORT_FIELD_TO_ROW_KEY: dict[str, str] = {
    "indicator_name": "i_name",
    "unit_name": "u_name",
    "subgroup": "sg_name",
    "area": "ar_name",
}
# dataset_data_point denormalized columns for DB-level sort on large-pending path
UNIFIED_DATAPOINT_SORT_FIELD_TO_DDP_COLUMN: dict[str, str] = {
    "indicator_name": "indicator_name",
    "unit_name": "unit_name",
    "subgroup": "subgroup_name",
    "area": "area_name",
}
# Allowed search_by entity values for indicators list (order matches search terms)
# Text search: indicator, unit, subgroup, ic. Boolean (indicator table): highisgood, data_exist, indicator_global
INDICATOR_SEARCH_BY_ENTITIES: tuple[str, ...] = (
    "indicator",
    "unit",
    "subgroup",
    "ic",
    "highisgood",
    "data_exist",
    "indicator_global",
)
# Indicator boolean fields: term is parsed as true/false (e.g. true, false, 1, 0, yes, no)
INDICATOR_SEARCH_BOOLEAN_ENTITIES: tuple[str, ...] = ("highisgood", "data_exist", "indicator_global")

# Source search fields for search_by parameter (external keys)
SOURCE_SEARCH_BY_FIELDS: tuple[str, ...] = (
    "src_name",
    "src_short_name", 
    "src_publisher",
    "src_title",
    "src_year"
)

# Time period search fields for search_by parameter (external keys)
TIME_PERIOD_SEARCH_BY_FIELDS: tuple[str, ...] = (
    "tp_timeperiod",
    "tp_periodicity",
    "tp_startdate",
    "tp_enddate"
)

# Scope values for time periods API
TIME_PERIOD_SCOPE_VALUES: tuple[str, ...] = ("ALL", "NO_DATA")
# Frequency filter values for time periods API (A=Annual, M=Monthly, Q=Quarterly)
TIME_PERIOD_FREQUENCY_VALUES: tuple[str, ...] = ("A", "M", "Q", "ALL")


def get_source_field_mapping(ICModel):
    """
    Map external search_by keys to SQLAlchemy model fields for sources.
    Uses alias_loader to get the external-to-internal mapping.
    """
    from apps.datawarehouse.utils.alias_loader import get_external_to_internal_mapping
    
    # Get the mapping from external keys to internal field names
    external_to_internal = get_external_to_internal_mapping("ut_sources")
    
    # Map external keys to actual SQLAlchemy model attributes
    field_mapping = {}
    for external_key in SOURCE_SEARCH_BY_FIELDS:
        internal_field = external_to_internal.get(external_key)
        if internal_field:
            field_mapping[external_key] = getattr(ICModel, internal_field)
    
    return field_mapping


def get_timeperiod_field_mapping():
    """
    Map external search_by keys to SQLAlchemy model fields for time periods.
    Uses alias_loader to get the external-to-internal mapping.
    """
    from apps.datawarehouse.utils.alias_loader import get_external_to_internal_mapping
    from apps.datawarehouse.models.datawarehouse import TimePeriod
    
    # Get the mapping from external keys to internal field names
    external_to_internal = get_external_to_internal_mapping("ut_timeperiod")
    
    # Map external keys to actual SQLAlchemy model attributes
    field_mapping = {}
    for external_key in TIME_PERIOD_SEARCH_BY_FIELDS:
        internal_field = external_to_internal.get(external_key)
        if internal_field:
            field_mapping[external_key] = getattr(TimePeriod, internal_field)
    
    return field_mapping


# Used in: indicator_classification, areas
QUERY_HIERARCHICAL = "hierarchical"
QUERY_INCLUDE_IC_IUS_COUNTS = "include_ic_ius_counts"

# Used in: indicator_classification
QUERY_IC_TYPE = "ic_type"
# Allowed ic_type values for Indicator Classifications API (same set as GET .../indicator-classifications/type). SR uses the dedicated Sources module and stays excluded.
IC_TYPE_ALLOWED_FOR_IC_API: tuple[str, ...] = ("SC", "GL", "CF", "TH", "IT", "CN")
# Source module: ic_type for Source/Publisher rows (stored in ut_indicator_classifications_<locale>).
IC_TYPE_SR = "SR"
# Publisher parent rows use ic_parent_nid = -1; Source child rows use ic_parent_nid = publisher's ic_nid.
SOURCE_PUBLISHER_PARENT_NID = -1

# ---------------------------------------------------------------------------
# Meta response fields: table-wise allowlist (internal field names only).
# Only these fields are included in meta.ic, meta.indicator, meta.sg, meta.unit, meta.metadata.
# Empty list or missing key = include all schema fields.
# Alias resolution (internal -> external keys) is done in the service using db_tbl_cols_mapping.
# ---------------------------------------------------------------------------
META_RESPONSE_FIELDS: dict[str, list[str]] = {
    "ic": ["ic_nid", "ic_gid", "ic_name", "ic_order","ic_type"],
    "indicator": [
        "indicator_nid",
        "indicator_gid",
        "indicator_name",
        "indicator_order",
        "indicator_info",
        "indicator_global",
        "short_name",
        "keywords",
        "data_exist",
        "highisgood",
    ],
    "unit": ["unit_nid", "unit_gid", "unit_name", "unit_format"],
    "sg": ["subgroup_val_nid", "subgroup_val_gid", "subgroup_val", "subgroup_val_order"],
    "metadata": [
        "metadatareport_nid",
        "target_nid",
        "category_nid",
        "metadata",
        "categoryname",
        "categorygid",
        "categoryorder",
    ],
}

# Meta response keys (used when assigning to response meta; no query param equivalent).
META_IC_DETAIL = "ic_detail"
META_IC_PARENT_DTL = "ic_parent_dtl"

# Entity type(s) per meta key for resolving internal -> alias when by_alias=True.
# For "metadata", value is dict: schema_field -> (entity_type, mapping_key) for alias lookup.
META_FIELD_ENTITY_MAP: dict[str, Union[str, dict[str, tuple[str, str]]]] = {
    "ic": "ut_indicator_classifications",
    "indicator": "ut_indicator",
    "unit": "ut_unit",
    "sg": "ut_subgroup_vals",
    "metadata": {
        "metadatareport_nid": ("ut_metadatareport", "metadatareport_nid"),
        "target_nid": ("ut_metadatareport", "target_nid"),
        "category_nid": ("ut_metadatareport", "category_nid"),
        "metadata": ("ut_metadatareport", "metadata_text"),
        "categoryname": ("ut_metadata_category", "categoryname"),
        "categorygid": ("ut_metadata_category", "categorygid"),
        "categoryorder": ("ut_metadata_category", "categoryorder"),
    },
}

QUERY_IC_PARENT_NID = "ic_parent_nid"
QUERY_FILTER_GLOBAL = "global_filter"

# Used in: indicator_classification (get one, list IUS for IC, list indicators for IC)
QUERY_RETURN_SUBGROUP = "return_subgroup"
QUERY_IC_MAPPED_FILTER = "ic_mapped"
QUERY_GIVE_IUS = "give_ius"
QUERY_GIVE_IU_ONLY = "give_iu_only"
QUERY_GIVE_IC = "give_ic"

# Used in: areas (list: filter by comma-separated area_id/area_nid/area_gid; path segment "identifier" uses PATH_IDENTIFIER)
QUERY_LEVEL = "level"
QUERY_KEYWORD = "keyword"

QUERY_IDENTIFIER = "identifier"  # areas list only: comma-separated area_id, area_nid, or area_gid
QUERY_IDENTIFIER_CHILDREN = "identifier_children"  # areas list: when identifier set, true=direct children, false=exact areas only
QUERY_ARL_INFO = "arl_info"

# Used in: sg_categories (list: filter by sg_cat_nid/sg_cat_gid)
QUERY_SG_CAT_IDENTIFIER = "sg_cat_identifier"
# Used in: sg_categories list / sg_categories-values — used_in.subgroup_count (junction-based; see routers)
QUERY_USED_IN = "used_in"

# Used in: indicator (list, get one)
QUERY_IUS = "ius"
QUERY_IU = "iu"
QUERY_IC = "ic"
QUERY_METADATA = "metadata"

QUERY_TIME_PERIOD = "time_period"
QUERY_AREA = "area"
QUERY_AREA_LEVEL = "area_level"

# Used in: ius (and data for filter params)
QUERY_I_GID = "i_gid"
QUERY_U_GID = "u_gid"
QUERY_SG_GID = "sg_gid"
QUERY_IC_GID = "ic_gid"
# Used in: ius list endpoints and data endpoint (NID or GID identifier filters)
QUERY_I_IDENTIFIER = "i_identifier"
QUERY_U_IDENTIFIER = "u_identifier"
QUERY_SG_IDENTIFIER = "sg_identifier"
QUERY_IC_IDENTIFIER = "ic_identifier"
QUERY_IUS_IDENTIFIER = "ius_identifier"
QUERY_AR_IDENTIFIER = "ar_identifier"
QUERY_TP_IDENTIFIER = "tp_identifier"
QUERY_SRC_IDENTIFIER = "src_identifier"
QUERY_WITH_VALIDATION = "with_validation"
QUERY_INDICATOR = "indicator"
QUERY_UNIT = "unit"
QUERY_SUBGROUP = "subgroup"
# When subgroup=true: optional list sg_gid_with_compute_formula per unit (subgroups that have a compute target IUS)
QUERY_SUBGROUP_COMPUTE_FORMULA = "subgroup_compute_formula"
# When subgroup=true: if True, return only default subgroup id/gid (omit full subgroup list and ius_nid)
QUERY_DEFAULT_SUBGROUP_ONLY = "default_subgroup_only"
# When true: each s_gid[unit] includes ius_nid list parallel to sg_gid (GET indicators list)
QUERY_INCLUDE_IUS = "ius"
QUERY_FORCE = "force"

# Used in: sg_vals
QUERY_INC_SUBGROUPS = "subgroup_info"
QUERY_FILTER_TYPE = "filter_type"

# Used in: sg_categories (all values view)
QUERY_VIEW = "view"
# Used in: sg_category_values (flat view: include category names in meta.sg_cat_info keyed by sg_cat_gid)
QUERY_SG_CAT_INFO = "sg_cat_info"

# Used in: data
QUERY_I_NID = "i_nid"
QUERY_IC_NID = "ic_nid"
QUERY_U_NID = "u_nid"
QUERY_SG_NID = "sg_nid"
QUERY_IUS_NID = "ius_nid"
QUERY_IUS_GID = "ius_gid"
QUERY_AR_NID = "ar_nid"
QUERY_AR_ID = "ar_id"
QUERY_TP_NID = "tp_nid"
QUERY_TP_TIMEPERIOD = "tp_timeperiod"
QUERY_I_INFO = "i_info"
QUERY_U_INFO = "u_info"
QUERY_SV_INFO = "sv_info"
QUERY_IUS_INFO = "ius_info"
QUERY_IC_INFO = "ic_info"
QUERY_TP_INFO = "tp_info"
QUERY_AR_INFO = "ar_info"
QUERY_ISDEFAULTENABLED = "isdefaultenabled"
QUERY_ISDEFAULTSUBGROUP = "isdefaultsubgroup"

# Used in: search (limit also used in data)
QUERY_Q = "q"
QUERY_KEYWORD_TYPES = "keyword_types"

# Used in: indicator_metadata
QUERY_INDICATOR_META = "indicator"

# Used in: metadata_category (list filter)
QUERY_MT_CATG_TYPE = "mt_catg_type"

# ---------------------------------------------------------------------------
# Body parameter names (OpenAPI request body key)
# ---------------------------------------------------------------------------
# Used in: indicator_classification (create, update)
BODY_DATA = "data"

# Used in: areas (create, update)
BODY_AREA_DATA = "area_data"

# Used in: areas (association-count, multiple-delete), area_levels (create, update, association-count, multiple-delete)
BODY_BODY = "body"

# ---------------------------------------------------------------------------
# Association-count response keys (used in get_association_counts and association-count endpoints)
# Use these instead of hardcoding keys so responses stay consistent and configurable.
# ---------------------------------------------------------------------------
ASSOC_DATA_COUNT = "data_count"
ASSOC_IUS_COUNT = "ius_count"
ASSOC_CHILDREN_COUNT = "children_count"
ASSOC_DESCENDANTS_COUNT = "descendants_count"
ASSOC_AREA_COUNT = "area_count"
ASSOC_SG_COUNT = "subgroup_count"
# Unit service uses data_rows/ius_rows for association-count response
ASSOC_DATA_ROWS = "data_rows"
ASSOC_IUS_ROWS = "ius_rows"

# Used in: metadata_category (association-count)
ASSOC_INDICATOR_COUNT = "indicator_count"


# Used in: indicator_metadata (update)
BODY_UPDATE_ITEMS = "update_items"

# ---------------------------------------------------------------------------
# Lang table string prefix: marks untranslated strings in locale tables (change later)
# ---------------------------------------------------------------------------
LANG_PREFIX = "#"

# ---------------------------------------------------------------------------
# IUS composite GID format: separator is stored in system_configuration (key_code=IUS_GID_SEPARATOR, app_key=DFA_CORE).
# Read at runtime via apps.shared.utils.ius_utils.get_ius_gid_separator(); used in ius, data, indicator_classification.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Compute Engine Constants
# ---------------------------------------------------------------------------

# Operation types (matching Laravel process_type enum)
OPERATION_TOTAL = "TOTAL"
OPERATION_PERCENT = "PERCENT" 
OPERATION_TIME = "TIME"
OPERATION_MINUS = "MINUS"
OPERATION_AREA = "AREA"

# Process status values
STATUS_PENDING = "PENDING"
STATUS_IN_PROGRESS = "IN-PROGRESS"
STATUS_DONE = "DONE"
STATUS_CANCELLED = "CANCELLED"
STATUS_DELETED = "DELETED"

# Job status values for detailed logs
JOB_STATUS_PASSED = "PASSED"
JOB_STATUS_FAILED = "FAILED"

# Default source attribution values (matching Laravel defaults)
DEFAULT_SRC_PUBLISHER = "DFA"
DEFAULT_SRC_TITLE = "Calculated"

# Periodicity mapping (matching Laravel config/constants.php)
PERIODICITY_MAP = {
    'A': 'Annually',
    'Q': 'Quarterly', 
    'M': 'Monthly',
    'D': 'Daily',
    'H': 'Halfyearly',
    'F': 'Fortnightly'
}

# Formula operation types (for API)
FORMULA_OPERATION_SUM = "sum"
FORMULA_OPERATION_PERCENTAGE = "percentage"
FORMULA_OPERATION_MINUS = "minus"
FORMULA_OPERATION_TIME = "TIME"
FORMULA_OPERATION_AREA = "AREA"

# Source types for formula configuration
SOURCE_TYPE_IC = "ic"  # Indicator Classification
SOURCE_TYPE_IU = "iu"  # Indicator-Unit
SOURCE_TYPE_IUS = "ius"  # Indicator-Unit-Subgroup

# Time period frequency codes
FREQ_ANNUALLY = "A"
FREQ_QUARTERLY = "Q"
FREQ_MONTHLY = "M"
FREQ_DAILY = "D"
FREQ_HALFYEARLY = "H"
FREQ_FORTNIGHTLY = "F"

# Laravel compatibility mapping (Laravel uses lowercase: a, h, q, m, d)
FREQUENCY_COMPATIBILITY_MAP = {
    'a': 'A',  # annually
    'h': 'H',  # halfyearly  
    'q': 'Q',  # quarterly
    'm': 'M',  # monthly
    'd': 'D'   # daily
    # Note: Laravel doesn't have fortnightly ('f'), so no mapping needed
}

# Aggregation types for TIME operations
AGG_TYPE_SUM = "sum"
AGG_TYPE_AVG = "avg"

# Default values
DEFAULT_DECIMAL_PLACES = 2
DEFAULT_LANGUAGE = "en"
DEFAULT_PRIORITY = 0

# Table name template for dynamic log tables
LOG_DETAILS_TABLE_TEMPLATE = "ce_process_time_log_{log_id}_details"

# Background job types for compute engine
JOB_TYPE_COMPUTE_CREATE_JOBS = "compute_create_jobs"
JOB_TYPE_COMPUTE_TOTAL = "compute_total"
JOB_TYPE_COMPUTE_PERCENT = "compute_percent"
JOB_TYPE_COMPUTE_TIME = "compute_time"
JOB_TYPE_COMPUTE_MINUS = "compute_minus"
JOB_TYPE_COMPUTE_AREA = "compute_area"
