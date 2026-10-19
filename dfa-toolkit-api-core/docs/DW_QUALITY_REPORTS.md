# DW Reports

## 1. Overview

This feature provides **31 reports** across three categories for any registered datawarehouse DB:

- **Quality reports (21)** — surface structural, data completeness, and referential integrity gaps for data managers to correct before publication. Includes orphan-reference checks across `ut_data`, `ut_indicator_unit_subgroup`, and `ut_ic_ius`.
- **Analytical reports (9)** — provide insight into data volume, coverage, and utilisation. Examples: indicator coverage by area (with subgroup breakdown), top indicators by data volume, source utilisation.
- **Data reports (1)** — `data/published/full`: enriched view of `ut_data` with all filters optional, `page_size` ceiling 50 000, PUBLIC. Designed for ETL consumers and bulk data exports.

Each report is available as:
- **Paginated JSON** — for programmatic consumption and UI display
- **Downloadable file** — CSV, XLSX, PDF, or DOCX on demand

**Access levels** vary by report category — see Section 3a for the full matrix.

**Base path:** `GET /dw/{dw_id}/reports/`

---

## 2. Report Catalogue

### Quality Reports

#### Group A — Indicator Quality

| Slug | Title | Core Logic |
|------|-------|------------|
| `quality/indicators/no-ius` | Indicators with No Subgroup Assigned | `ut_indicator` LEFT JOIN `ut_indicator_unit_subgroup` WHERE IUS IS NULL. No `subgroup_breakdown` — the indicator has no IUS so there is nothing subgroup-specific to show. |
| `quality/indicators/no-default-subgroup` | Indicators Without Default Subgroup | Has IUS rows but none has `ius_is_default_subgroup = True`. Each row includes `subgroup_breakdown` listing all assigned subgroup values with `is_default` flag per entry. |
| `quality/indicators/no-data` | Indicators With No Reported Data | `indicator.i_has_data = False`. Each row includes `subgroup_breakdown` listing all subgroup values that exist in the warehouse for this indicator's IUS, with `has_data` flag per entry. |

#### Group B — IUS Quality

| Slug | Title | Core Logic |
|------|-------|------------|
| `quality/ius/invalid-value-range` | IUS with Invalid Value Range | `ius_min_value > ius_max_value` on `ut_indicator_unit_subgroup` |
| `quality/ius/no-ic-mapping` | IUS Not Mapped to Any IC | `ius_nid` not present in any `ut_ic_ius.iusnid` row |
| `quality/ius/orphan-refs` | IUS With Broken Dimension References | IUS rows where `indicator_nid`, `unit_nid`, or `subgroup_val_nid` has no matching row in `ut_indicator`, `ut_unit`, or `ut_subgroup_vals`. Returns one row per broken IUS with boolean flags `i_ref_missing`, `u_ref_missing`, `sg_ref_missing` identifying which dimensions are broken. |

#### Group C — Area Quality

| Slug | Title | Core Logic |
|------|-------|------------|
| `quality/areas/no-data` | Areas With No Data | `area.i_has_data = False` |
| `quality/areas/orphan-parent` | Areas With Broken Parent Reference | `ar_parent_nid != 0` AND parent `ar_nid` does not exist in `ut_area` |

#### Group D — Time Period Quality

| Slug | Title | Core Logic |
|------|-------|------------|
| `quality/time-periods/unused` | Unused Time Periods | `tp_nid` not referenced in any `ut_data.timeperiod_nid` row |

#### Group E — Subgroup Quality

| Slug | Title | Core Logic |
|------|-------|------------|
| `quality/subgroups/vals-not-in-ius` | SubgroupVals Not Used in Any IUS | `sg_nid` not present in `ut_indicator_unit_subgroup.subgroup_val_nid` |

#### Group F — Data Value Integrity

| Slug | Title | Core Logic |
|------|-------|------------|
| `quality/data/values-out-of-range` | Data Values Outside IUS Range | `ut_data.data_value < ius.ius_min_value` OR `ut_data.data_value > ius.ius_max_value` |
| `quality/data/missing-mrd` | IUS+Area Combos With No MRD Row | For a given `ius_nid + ar_nid`, no row has `dt_is_mrd = True` |

#### Group G — Metadata Completeness

| Slug | Title | Core Logic |
|------|-------|------------|
| `quality/metadata/missing-mandatory` | Indicators Missing Mandatory Metadata | No `ut_metadatareport` row for categories where `ut_metadata_category.mt_catg_is_mandatory = True` |

#### Group H — Source Quality

| Slug | Title | Core Logic |
|------|-------|------------|
| `quality/sources/unused` | Sources Not Referenced in Data | Source IC NID (`ic_type = 'SR'`) not present in `ut_data.source_nid` — output uses `src_nid`, `src_gid`, `src_name` |

#### Group I — IC / Classification Quality

| Slug | Title | Core Logic |
|------|-------|------------|
| `quality/indicator-classifications/no-ius` | ICs With No IUS Mapping | IC NID not in `ut_ic_ius.ic_nid`; optional `?include_sr=false` to exclude source ICs |
| `quality/indicator-classifications/leaf-no-ius` | IC Leaf Nodes Without IUS | IC row with no children in the IC hierarchy AND no rows in `ut_ic_ius` |
| `quality/ic-ius/orphan-refs` | IC-IUS Links With Broken References | Rows in `ut_ic_ius` where `ic_nid` is absent from `ut_indicator_classifications` OR `iusnid` is absent from `ut_indicator_unit_subgroup`. These dangling join-table rows silently corrupt any IC→IUS→data traversal. Returns boolean flags `ic_ref_missing`, `ius_ref_missing`. |

#### Group N — Data Referential Integrity

Checks that every foreign key in `ut_data` resolves to an existing row in its reference table. These are the most critical integrity failures: orphan data rows can never be displayed or exported correctly regardless of how much other data is valid.

| Slug | Title | Core Logic |
|------|-------|------------|
| `quality/data/orphan-ius` | Data Rows With Missing IUS Reference | `ut_data.iusnid` not in `ut_indicator_unit_subgroup` — the primary link to indicator + unit + subgroup is broken. These rows cannot be enriched or filtered by IUS. |
| `quality/data/orphan-area` | Data Rows With Missing Area Reference | `ut_data.area_nid` not in `ut_area` — the area the data point belongs to no longer exists. |
| `quality/data/orphan-timeperiod` | Data Rows With Missing Time Period Reference | `ut_data.timeperiod_nid` not in `ut_timeperiod` — the time period the data point belongs to no longer exists. |
| `quality/data/orphan-source` | Data Rows With Missing Source Reference | `ut_data.source_nid` not in `ut_indicator_classifications` — the source IC the data point cites no longer exists. Only checked where `source_nid IS NOT NULL`. |

> These four reports are always **on-the-fly** and **AUTHENTICATED** — they scan `ut_data` directly and expose raw FK values that should not be visible to public callers.

---

### Generic / Analytical Reports

#### Group J — Coverage & Completeness

| Slug | Title | What it answers |
|------|-------|-----------------|
| `analytics/coverage/indicator-by-area` | Indicator Coverage by Area | For each indicator: total areas, areas with at least one data point, coverage % — plus a `subgroup_breakdown` array showing coverage % per subgroup value, so sparse subgroups are visible alongside sparse geographies. |
| `analytics/coverage/indicator-by-timeperiod` | Indicator Coverage by Time Period | For each indicator: earliest period, latest period, total periods with data — plus a `subgroup_breakdown` array showing the time period range and count per subgroup value, revealing which subgroups have temporal gaps. |
| `analytics/coverage/area-completeness` | Area Data Completeness | For each area: total IUS, IUS with data, completeness % — identifies under-reported areas. |
| `analytics/coverage/indicator-subgroup` | Indicator Subgroup Coverage | Flat cross-table: every indicator × subgroup-value pair with `has_data` flag and data row count. Use `?indicator=` to scope to a single indicator. |

#### Group K — Data Volume & Distribution

| Slug | Title | What it answers |
|------|-------|-----------------|
| `analytics/volume/top-indicators` | Top Indicators by Data Volume | Indicators ranked by total `ut_data` row count; configurable `?top_n=` (default 20) — useful for identifying the most vs least populated indicators |
| `analytics/volume/ius-density` | IUS Data Density | For each IUS: total data rows, `ius_min_value`/`ius_max_value`/avg `dt_value`, earliest/latest time period — quickly shows which IUS combinations carry the most data |
| `analytics/volume/subgroup-distribution` | Subgroup Distribution in Data | For each subgroup value: how many data rows reference it, across how many indicators and areas — reveals dominant subgroups and under-used ones |

#### Group L — IC & Source Utilisation

| Slug | Title | What it answers |
|------|-------|-----------------|
| `analytics/utilisation/source-usage` | Source Utilisation Summary | For each source IC: total `ut_data` rows referencing it, number of distinct IUS using it, number of distinct areas and time periods covered — ranks sources by actual use; output uses `src_nid`, `src_gid`, `src_name` |
| `analytics/utilisation/ic-coverage` | IC Node Coverage | For each IC node: number of directly mapped IUS (via `ut_ic_ius`), total data rows in those IUS, total areas covered — shows which classifications have rich data backing |

---

### Data Reports

#### Group M — Published Data

| Slug | Title | What it answers |
|------|-------|-----------------|
| `data/published/full` | Published Data — Full Export | Enriched view of `ut_data` with all filters optional and no mandatory anchor. `page_size` ceiling raised to 50 000. Designed for ETL consumers, bulk data exports, and public portals. `PUBLIC`. |

---

## 3. Endpoint Reference

### 3a. Access Levels

Each report has an explicit access level. The level controls what auth the caller must supply.

| Access Level | Requirement | Who uses it |
|---|---|---|
| `PUBLIC` | No auth — open to any caller | Public portals, embeds, anonymous dashboards |
| `AUTHENTICATED` | Valid JWT (`Authorization: Bearer <token>`) | Logged-in data managers, internal tools |

**Report access level matrix:**

| Category | Slugs | Access level | Reason |
|---|---|---|---|
| Data reports | `data/published/full` | `PUBLIC` | Unrestricted bulk export; all filters optional; open to any caller |
| Analytical reports | `analytics/*` | `PUBLIC` | Aggregated summaries and stats; no raw sensitive data |
| Quality reports — structural | `quality/indicators/*`, `quality/ius/*`, `quality/areas/*`, `quality/time-periods/*`, `quality/subgroups/*`, `quality/data/values-out-of-range`, `quality/data/missing-mrd`, `quality/metadata/*`, `quality/sources/*`, `quality/indicator-classifications/*`, `quality/ic-ius/*` | `AUTHENTICATED` | Internal audit — surfaces structural gaps not intended for public view |
| Quality reports — referential integrity | `quality/data/orphan-*` | `AUTHENTICATED` | Expose raw broken FK values from `ut_data`; strictly internal |

> **Implementation note:** The router checks `request.state.user` (set by `AuthMiddleware`). For `PUBLIC` endpoints, the middleware still runs but does not reject unauthenticated requests — it simply leaves `request.state.user = None`. The route handler does not need to call any auth dependency.

### 3b. Summary — All Counts

```http
GET /dw/{dw_id}/reports/summary
Accept-Language: en
```

Returns all 31 report counts in a single JSON call. Public access — no auth required.

**Response:**
```json
{
  "status": "success",
  "message": "Report summary retrieved successfully",
  "data": {
    "quality": {
      "indicators_no_ius": 12,
      "indicators_no_default_subgroup": 4,
      "indicators_no_data": 31,
      "ius_invalid_value_range": 1,
      "ius_no_ic_mapping": 18,
      "areas_no_data": 6,
      "areas_orphan_parent": 0,
      "time_periods_unused": 3,
      "subgroups_vals_not_in_ius": 14,
      "data_values_out_of_range": 0,
      "data_missing_mrd": 11,
      "metadata_missing_mandatory": 8,
      "sources_unused": 3,
      "ics_no_ius": 22,
      "ics_leaf_no_ius": 7,
      "ius_orphan_refs": 0,
      "ic_ius_orphan_refs": 0,
      "data_orphan_ius": 0,
      "data_orphan_area": 0,
      "data_orphan_timeperiod": 0,
      "data_orphan_source": 0
    },
    "analytics": {
      "total_indicators": 245,
      "total_ius": 1320,
      "total_areas": 38,
      "total_time_periods": 24,
      "total_data_rows": 184200,
      "total_sources": 14
    }
  },
  "meta": null
}
```

### 3c. Report Detail — JSON (Paginated)

```http
GET /dw/{dw_id}/reports/{report_slug}?page=1&page_size=50
Accept-Language: en
```

**Universal query parameters (all reports):**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number (1-based) |
| `page_size` | integer | `50` | Rows per page (max `5000`; max `10000` for `data/published/mrd`; max `50000` for `data/published/full`) |
| `format` | string | — | Triggers download: `csv`, `xlsx`, `pdf`, `docx` |
| `view` | string | `tabular` | Response shape: `tabular`, `visualizer`, `fact` — see Section 3e |
| `top_n` | integer | `20` | Only for `analytics/volume/top-indicators` |
| `include_sr` | boolean | `false` | Only for `quality/indicator-classifications/no-ius` |
| `aggregate_by` | string | — | Only for `data/published/mrd` and `data/published/full`. Comma-separated dimensions to group by. Activates aggregation mode — see Section 3d. |
| `agg` | string | `count` | Only for data reports in aggregation mode. Comma-separated functions: `count`, `sum`, `avg`, `min`, `max`. |

**Response (view=tabular, default):**
```json
{
  "status": "success",
  "message": "Indicators with No Subgroup Assigned retrieved successfully",
  "data": [
    { "i_nid": 101, "i_gid": "IND_LITERACY", "i_name": "Adult Literacy Rate" }
  ],
  "meta": { "total_count": 12, "count": 12, "page": 1, "page_size": 50, "total_pages": 1 }
}
```

---

### 3d. Filters for Data Reports (`data/published/mrd` and `data/published/full`)

#### Simple filters (identity and boolean)

| Parameter | Type | Description |
|-----------|------|-------------|
| `indicator` | string | Indicator NID or GID, comma-separated for multiple |
| `unit` | string | Unit NID or GID, comma-separated |
| `subgroup` | string | SubgroupVal NID or GID, comma-separated |
| `area` | string | Area NID or GID, comma-separated |
| `area_level` | integer | Filter by area administrative level |
| `time_period` | string | Time period string (`2020`, `2020-Q1`), comma-separated |
| `source` | string | Source IC NID or GID, comma-separated |
| `ic` | string | IC NID or GID — resolves to IUS via `ut_ic_ius`, then filters `iusnid`. Usable alongside `indicator`. |
| `ius` | string | Composite GID (`i_gid\|u_gid\|sg_gid`) or IUS NID |
| `ismrd` | boolean | `true` = MRD rows only; `false` = non-MRD; omit = all |
| `isplannedvalue` | boolean | `true` = planned; `false` = actual; omit = all |
| `istextualdata` | boolean | `true` = textual; `false` = numeric; omit = all |
| `isdefaultsubgroup` | string | Default `true`. When `indicator` is set without `subgroup`/`ius`: `true` = default-subgroup IUS only (empty if none); `false` = non-default IUS only (empty if none); `all` = all subgroups. Ignored when `subgroup` or `ius` is set. |

#### Advanced filter — `filter` (repeatable, operator-aware)

For fine-grained control over numeric, string, and date-like fields, use the repeatable `filter` parameter with the syntax `field:operator:value`.

```http
GET /dw/{dw_id}/reports/data/published/mrd
  ?filter=dt_value:gt:50
  &filter=dt_value:lte:100
  &filter=i_name:like:literacy
  &filter=tp_timeperiod:gte:2018
  &filter=ar_name:like:district
```

**Supported operators:**

| Operator | SQL equivalent | Applicable field types |
|----------|---------------|------------------------|
| `eq` | `= value` | numeric, string, boolean |
| `neq` | `!= value` | numeric, string |
| `gt` | `> value` | numeric, time period string |
| `gte` | `>= value` | numeric, time period string |
| `lt` | `< value` | numeric, time period string |
| `lte` | `<= value` | numeric, time period string |
| `like` | `LIKE '%value%'` | string fields only |
| `in` | `IN (v1, v2, …)` | numeric, string — value is comma-separated |

**Filterable fields:**

| Field | Type | Supported operators |
|-------|------|---------------------|
| `data_value` | numeric | `eq`, `neq`, `gt`, `gte`, `lt`, `lte` |
| `i_name` | string | `eq`, `like`, `in` |
| `u_name` | string | `eq`, `like`, `in` |
| `sg_name` | string | `eq`, `like`, `in` |
| `ar_name` | string | `eq`, `like`, `in` |
| `area_level` | numeric | `eq`, `gt`, `gte`, `lt`, `lte` |
| `tp_timeperiod` | string | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in` |
| `src_name` | string | `eq`, `like`, `in` |
| `dt_is_mrd` | boolean | `eq` |
| `dt_is_planned_value` | boolean | `eq` |
| `dt_is_textual` | boolean | `eq` |

> **Validation:** An unknown field or operator returns `400 Bad Request` with the offending filter listed in `errors`. Multiple `filter` params on the same field are ANDed together.

> All filters are optional for both data reports. `data/published/mrd` is naturally bounded by MRD uniqueness; `data/published/full` is bounded by auth and a higher `page_size` ceiling.

#### Aggregation mode — `aggregate_by` + `agg`

When `aggregate_by` is present the endpoint switches from raw-row mode to aggregation mode. All existing filters apply as the `WHERE` clause; the result rows contain the grouped dimensions plus the requested aggregate functions computed over `data_value`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `aggregate_by` | string | Comma-separated list of dimensions to group by. Required to activate aggregation mode. |
| `agg` | string | Comma-separated aggregate functions to compute. Default: `count`. Allowed: `count`, `sum`, `avg`, `min`, `max`. |

**Valid `aggregate_by` dimensions:**

| Dimension | Columns included in GROUP BY |
|-----------|------------------------------|
| `indicator` | `i_nid`, `i_gid`, `i_name` |
| `unit` | `u_nid`, `u_gid`, `u_name` |
| `subgroup` | `sg_nid`, `sg_gid`, `sg_name` |
| `area` | `ar_nid`, `ar_gid`, `ar_name`, `ar_level` |
| `area_level` | `ar_level` only (collapses individual areas into their level) |
| `time_period` | `tp_nid`, `tp_timeperiod` |
| `source` | `src_nid`, `src_gid`, `src_name` |
| `dt_is_mrd` | `dt_is_mrd` |
| `dt_is_planned_value` | `dt_is_planned_value` |

Multiple dimensions are combined: `aggregate_by=indicator,area` groups by indicator × area.

**`agg` functions (applied to `data_value`):**

| Function | Output field | Notes |
|----------|-------------|-------|
| `count` | `dt_value_count` | Counts non-NULL `dt_value` rows in the group |
| `sum` | `dt_value_sum` | Sum of numeric `dt_value`; NULL for textual rows |
| `avg` | `dt_value_avg` | Average; rounded to 4 decimal places; NULL for textual rows |
| `min` | `dt_value_min` | Minimum numeric `dt_value` in the group |
| `max` | `dt_value_max` | Maximum numeric `dt_value` in the group |

> Aggregation mode automatically excludes textual rows (`dt_is_textual = FALSE`) for `sum`, `avg`, `min`, `max`. The `count` function counts all rows including textual ones unless `?istextualdata=false` is set explicitly.

**Response shape (aggregation mode):**
```json
{
  "status": "success",
  "message": "Published data aggregation retrieved successfully",
  "data": [
    {
      "i_nid": 101, "i_gid": "IND_LITERACY", "i_name": "Adult Literacy Rate",
      "ar_nid": 5,  "ar_gid": "AR_NATIONAL", "ar_name": "National", "ar_level": 1,
      "dt_value_count": 14,
      "dt_value_avg": 72.3285,
      "dt_value_sum": 1012.6,
      "dt_value_min": 61.0,
      "dt_value_max": 85.5
    },
    {
      "i_nid": 101, "i_gid": "IND_LITERACY", "i_name": "Adult Literacy Rate",
      "ar_nid": 6,  "ar_gid": "AR_REGION_A", "ar_name": "Region A", "ar_level": 2,
      "dt_value_count": 8,
      "dt_value_avg": 68.1250,
      "dt_value_sum": 545.0,
      "dt_value_min": 55.3,
      "dt_value_max": 79.8
    }
  ],
  "meta": { "total_count": 42, "count": 2, "page": 1, "page_size": 50, "total_pages": 1 }
}
```

**Example aggregation requests:**
```http
# Average and count per area — MRD view, no extra filter needed
GET /dw/{dw_id}/reports/data/published/mrd
  ?indicator=IND_LITERACY&aggregate_by=area&agg=count,avg

# Full stats per indicator × time period across all data
GET /dw/{dw_id}/reports/data/published/full
  ?indicator=IND_LITERACY&area_level=1&aggregate_by=indicator,time_period&agg=count,avg,min,max

# Sum grouped by source from the full dataset — download as XLSX
GET /dw/{dw_id}/reports/data/published/full
  ?ic=IC_EDUCATION&aggregate_by=source&agg=count,sum&format=xlsx

# Aggregation by subgroup from MRD snapshot
GET /dw/{dw_id}/reports/data/published/mrd
  ?indicator=IND_LITERACY&aggregate_by=subgroup&agg=count,avg

# Data density by area level across full dataset
GET /dw/{dw_id}/reports/data/published/full
  ?indicator=IND_LITERACY&aggregate_by=area_level&agg=count,avg,sum
```

> **Validation:** An unknown dimension or function returns `400 Bad Request`. Requesting `agg=sum` or `agg=avg` without any numeric filter or `istextualdata=false` is allowed — the service silently skips NULL values in the aggregate. Download formats (`?format=`) work in aggregation mode and export the flattened aggregate rows.

**Example requests (raw mode):**
```http
# MRD snapshot for one indicator, value > 30, download as XLSX
GET /dw/{dw_id}/reports/data/published/mrd
  ?indicator=IND_LITERACY&filter=dt_value:gt:30&format=xlsx

# Full dataset scoped to WHO sources, area level 2, value between 0–100, CSV
GET /dw/{dw_id}/reports/data/published/full
  ?source=SRC_WHO&area_level=2&filter=dt_value:gte:0&filter=dt_value:lte:100&format=csv

# Textual data where subgroup contains "Female" — MRD view
GET /dw/{dw_id}/reports/data/published/mrd
  ?indicator=IND_EDU&istextualdata=true&filter=sg_name:like:Female
```

---

### 3e. View Formats (`?view=`)

Every report supports three response shapes via the `view` query parameter. The underlying query is identical — only the serialisation changes.

#### `view=tabular` (default)

Array of row objects with all columns. Best for grids, data tables, and exports.

```json
{
  "data": [
    { "i_nid": 101, "i_gid": "IND_LITERACY", "i_name": "Adult Literacy Rate", "coverage_pct": 72.5 },
    { "i_nid": 102, "i_gid": "IND_MORT",     "i_name": "Child Mortality Rate", "coverage_pct": 45.0 }
  ],
  "meta": { "total_count": 245, "count": 2, "page": 1, "page_size": 50, "total_pages": 5 }
}
```

#### `view=visualizer`

Chart-ready series data. Suited for bar, line, and pie charts. The `chart_type` field is a suggestion — callers may render differently.

```json
{
  "data": {
    "chart_type": "bar",
    "labels": ["Adult Literacy Rate", "Child Mortality Rate"],
    "series": [
      { "name": "Coverage %", "values": [72.5, 45.0] }
    ]
  },
  "meta": { "total_count": 245 }
}
```

For multi-series reports (e.g. `analytics/coverage/indicator-subgroup`):
```json
{
  "data": {
    "chart_type": "grouped_bar",
    "labels": ["2018", "2019", "2020", "2021"],
    "series": [
      { "name": "Total",   "values": [1200, 1350, 1100, 1420] },
      { "name": "Female",  "values": [600,  680,  540,  710] },
      { "name": "Male",    "values": [600,  670,  560,  710] }
    ]
  },
  "meta": { "total_count": 4 }
}
```

#### `view=fact`

Single aggregate card. Best for dashboard summary tiles. Returns one value with context and optional percentage.

```json
{
  "data": {
    "value": 12,
    "label": "Indicators with No Subgroup Assigned",
    "context": "out of 245 total indicators",
    "percentage": 4.9
  },
  "meta": null
}
```

**View support matrix** — not all views are meaningful for all reports:

| Report group | tabular | visualizer | fact | Notes |
|---|---|---|---|---|
| `quality/indicators/no-ius` | ✓ | — | ✓ | No `subgroup_breakdown` — nothing to disaggregate |
| `quality/indicators/no-default-subgroup` | ✓ | ✓ grouped_bar | ✓ | `subgroup_breakdown` shows assigned subgroups + `ius_is_default_subgroup` flag |
| `quality/indicators/no-data` | ✓ | ✓ grouped_bar | ✓ | `subgroup_breakdown` shows assigned subgroups + `ius_has_data` flag |
| Other quality reports | ✓ | — | ✓ | |
| `analytics/coverage/indicator-by-area` | ✓ | ✓ grouped_bar | ✓ | `subgroup_breakdown` always included inline |
| `analytics/coverage/indicator-by-timeperiod` | ✓ | ✓ grouped_bar | ✓ | `subgroup_breakdown` always included inline |
| `analytics/coverage/area-completeness` | ✓ | ✓ bar | ✓ | |
| `analytics/coverage/indicator-subgroup` | ✓ | ✓ grouped_bar | ✓ | |
| `analytics/volume/top-indicators` | ✓ | ✓ bar | ✓ | |
| `analytics/volume/ius-density` | ✓ | ✓ scatter | — | |
| `analytics/volume/subgroup-distribution` | ✓ | ✓ pie | ✓ | |
| `analytics/utilisation/*` | ✓ | ✓ bar | ✓ | |
| `data/published/full` | ✓ | — | — | All rows; all filters optional; PUBLIC |
| `quality/ius/orphan-refs` | ✓ | — | ✓ | |
| `quality/ic-ius/orphan-refs` | ✓ | — | ✓ | |
| `quality/data/orphan-*` | ✓ | — | ✓ | |

> Requesting an unsupported view for a report returns `400 Bad Request`: `"view 'visualizer' is not supported for this report"`.

**Inline `subgroup_breakdown` structure** (present in all `quality/indicators/*`, `indicator-by-area`, and `indicator-by-timeperiod` responses):

**`subgroup_breakdown` is present only where it adds information beyond what the parent row already states.** For `quality/indicators/no-ius` it is omitted — the indicator has no IUS at all, so listing warehouse subgroups with `is_assigned: false` repeats the obvious. It is included in `no-default-subgroup` (which specific assigned subgroup is missing the default flag?) and `no-data` (which assigned subgroup has no data?), and in both coverage reports (what is the per-subgroup coverage figure?).

*quality/indicators/no-ius* — **no `subgroup_breakdown`**. The issue is at indicator level; there are no subgroup assignments to disaggregate.
```json
{ "i_nid": 101, "i_gid": "IND_LITERACY", "i_name": "Adult Literacy Rate" }
```

*quality/indicators/no-default-subgroup* — shows each assigned subgroup value with `ius_is_default_subgroup`. Tells the data manager exactly which entry to promote as default:
```json
{
  "i_nid": 102, "i_gid": "IND_MORT", "i_name": "Child Mortality Rate",
  "subgroup_breakdown": [
    { "sg_nid": 1, "sg_gid": "SG_TOTAL",  "sg_name": "Total",  "ius_is_default_subgroup": false },
    { "sg_nid": 2, "sg_gid": "SG_FEMALE", "sg_name": "Female", "ius_is_default_subgroup": false }
  ]
}
```

*quality/indicators/no-data* — shows each assigned subgroup value with `ius_has_data`. Tells the data manager which disaggregations are missing data:
```json
{
  "i_nid": 103, "i_gid": "IND_EDU", "i_name": "School Enrolment",
  "subgroup_breakdown": [
    { "sg_nid": 1, "sg_gid": "SG_TOTAL",  "sg_name": "Total",  "ius_has_data": false },
    { "sg_nid": 2, "sg_gid": "SG_FEMALE", "sg_name": "Female", "ius_has_data": false }
  ]
}
```

*analytics/coverage/indicator-by-area* — the **parent row is derived from the default subgroup** (`ius_is_default_subgroup = True` in `ut_indicator_unit_subgroup`). In DFA this is the "Total" subgroup — the aggregate view shown on the indicator detail page. The subgroup breakdown then adds the disaggregated rows alongside it. `total_areas` at subgroup level is the number of areas that have that specific subgroup's IUS combination (varies per subgroup — Female may cover 10 areas, Male 28). `coverage_pct` at subgroup level uses the **parent's** `total_areas` as denominator so percentages are directly comparable across subgroups:
```json
[
  {
    "i_nid": 101, "i_gid": "IND_LITERACY", "i_name": "Adult Literacy Rate",
    "total_areas": 38, "areas_with_data": 28, "coverage_pct": 73.7,
    "subgroup_breakdown": [
      { "sg_nid": 1, "sg_gid": "SG_TOTAL",  "sg_name": "Total",  "total_areas": 38, "areas_with_data": 28, "coverage_pct": 73.7 },
      { "sg_nid": 2, "sg_gid": "SG_FEMALE", "sg_name": "Female", "total_areas": 10, "areas_with_data": 10, "coverage_pct": 20.0 },
      { "sg_nid": 3, "sg_gid": "SG_MALE",   "sg_name": "Male",   "total_areas": 28, "areas_with_data": 18, "coverage_pct": 53.7 }
    ]
  },
  {
    "i_nid": 102, "i_gid": "IND_POP", "i_name": "Population Size",
    "total_areas": 50, "areas_with_data": 40, "coverage_pct": 80.0,
    "subgroup_breakdown": [
      { "sg_nid": 1, "sg_gid": "SG_TOTAL",  "sg_name": "Total",  "total_areas": 50, "areas_with_data": 40, "coverage_pct": 80.0 },
      { "sg_nid": 2, "sg_gid": "SG_FEMALE", "sg_name": "Female", "total_areas": 20, "areas_with_data": 18, "coverage_pct": 35.0 },
      { "sg_nid": 3, "sg_gid": "SG_MALE",   "sg_name": "Male",   "total_areas": 30, "areas_with_data": 22, "coverage_pct": 45.0 }
    ]
  }
]
```

> **Parent = default subgroup ("Total"):** `parent.areas_with_data` and `parent.coverage_pct` are derived from the IUS where `ius_is_default_subgroup = True` — not a UNION across all subgroups. This matches what the indicator detail page shows, making the parent a consistent headline figure. In the example above, `parent.areas_with_data (28) = Total.areas_with_data (28)` is not a coincidence — they represent the same IUS. `coverage_pct` (subgroup) = `areas_with_data / parent.total_areas × 100` — using the parent denominator makes it immediately clear how much of the indicator's geographic scope each disaggregated subgroup covers.

*analytics/coverage/indicator-by-timeperiod* — same derivation rule: the **parent row reflects the default subgroup** (`ius_is_default_subgroup = True`). `total_periods` is the warehouse-wide count of `ut_timeperiod` rows — constant across all subgroups and used as denominator. Different subgroups may span different date ranges:
```json
[
  {
    "i_nid": 101, "i_gid": "IND_LITERACY", "i_name": "Adult Literacy Rate",
    "earliest_period": "2010", "latest_period": "2023", "periods_with_data": 8, "total_periods": 14,
    "subgroup_breakdown": [
      { "sg_nid": 1, "sg_gid": "SG_TOTAL",  "sg_name": "Total",  "earliest_period": "2010", "latest_period": "2023", "periods_with_data": 8, "total_periods": 14 },
      { "sg_nid": 2, "sg_gid": "SG_FEMALE", "sg_name": "Female", "earliest_period": "2015", "latest_period": "2021", "periods_with_data": 4, "total_periods": 14 },
      { "sg_nid": 3, "sg_gid": "SG_MALE",   "sg_name": "Male",   "earliest_period": "2015", "latest_period": "2021", "periods_with_data": 4, "total_periods": 14 }
    ]
  }
]
```

> `total_periods` is constant (same warehouse denominator for all) so callers can compute `periods_with_data / total_periods` as temporal coverage % at any granularity.

---

### 3f. Report Download

Adding `?format=` to any report endpoint triggers a file download. Pagination is disabled — all matching rows are exported regardless of `page`/`page_size`. For reports with inline `subgroup_breakdown`, the export flattens the nested array into one row per indicator × subgroup value.

```http
GET /dw/{dw_id}/reports/quality/indicators/no-ius?format=xlsx
GET /dw/{dw_id}/reports/quality/indicators/no-data?format=csv
GET /dw/{dw_id}/reports/analytics/coverage/indicator-by-area?format=xlsx
GET /dw/{dw_id}/reports/analytics/coverage/indicator-by-timeperiod?format=pdf
GET /dw/{dw_id}/reports/data/published/mrd?indicator=IND_LITERACY&format=pdf
GET /dw/{dw_id}/reports/data/published/full?indicator=IND_LITERACY&format=xlsx
```

---

## 4. Download Formats

| Format | Media Type | Extension | Notes |
|--------|-----------|-----------|-------|
| `xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `.xlsx` | Translated column headers; auto-fit column widths; bold header row |
| `csv` | `text/csv` | `.csv` | UTF-8 BOM for Excel compatibility; all values as strings; datetimes as ISO 8601 |
| `pdf` | `application/pdf` | `.pdf` | Landscape A4 for wide tables (> 4 columns); portrait otherwise; alternating row colours; DW name and timestamp in subtitle |
| `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `.docx` | Heading + subtitle paragraph + auto-fit table; bold header row |

**Filename pattern:** `{REPORT_SLUG}_{dw_name}_{YYYY-MM-DD-HH-MM-SS}.{ext}`

Example: `QUALITY_INDICATORS_NO_IUS_my_dw_2025-05-11-14-30-00.xlsx`

**Response headers (all formats):**
```
Content-Disposition: attachment; filename="QUALITY_INDICATORS_NO_IUS_my_dw_2025-05-11-14-30-00.xlsx"
Access-Control-Expose-Headers: Content-Disposition
```

---

## 5. Query Logic

### Group A — Indicator Quality

All three queries fetch the indicator rows first, then a second query loads the `subgroup_breakdown` for each indicator in the result set (batched by i_nid list to avoid N+1).

```sql
-- quality/indicators/no-ius — single query, no subgroup_breakdown
SELECT i.indicator_nid AS i_nid, i.indicator_gid AS i_gid, i.indicator_name AS i_name
FROM ut_indicator_<locale> i
LEFT JOIN ut_indicator_unit_subgroup ius ON ius.indicator_nid = i.indicator_nid
WHERE ius.iusnid IS NULL;

-- quality/indicators/no-default-subgroup — main rows
SELECT DISTINCT i.indicator_nid AS i_nid, i.indicator_gid AS i_gid, i.indicator_name AS i_name
FROM ut_indicator_<locale> i
JOIN ut_indicator_unit_subgroup ius ON ius.indicator_nid = i.indicator_nid
WHERE i.indicator_nid NOT IN (
    SELECT indicator_nid FROM ut_indicator_unit_subgroup WHERE isdefaultsubgroup = TRUE
);

-- subgroup_breakdown: assigned subgroup values + ius_is_default_subgroup flag
SELECT sv.subgroup_val_nid AS sg_nid, sv.subgroup_val_gid AS sg_gid, sv.subgroup_val AS sg_name,
       COALESCE(MAX(ius.isdefaultsubgroup), FALSE) AS ius_is_default_subgroup
FROM ut_indicator_unit_subgroup ius
JOIN ut_subgroup_vals_<locale> sv ON sv.subgroup_val_nid = ius.subgroup_val_nid
WHERE ius.indicator_nid IN (:indicator_nids)
GROUP BY sv.subgroup_val_nid, sv.subgroup_val_gid, sv.subgroup_val;

-- quality/indicators/no-data — main rows
SELECT indicator_nid AS i_nid, indicator_gid AS i_gid, indicator_name AS i_name
FROM ut_indicator_<locale>
WHERE data_exist = FALSE;

-- subgroup_breakdown: per-IUS subgroup with ius_has_data flag
SELECT ius.indicator_nid AS i_nid,
       sv.subgroup_val_nid AS sg_nid, sv.subgroup_val_gid AS sg_gid, sv.subgroup_val AS sg_name,
       ius.data_exist AS ius_has_data
FROM ut_indicator_unit_subgroup ius
JOIN ut_subgroup_vals_<locale> sv ON sv.subgroup_val_nid = ius.subgroup_val_nid
WHERE ius.indicator_nid IN (:indicator_nids);
```

### Group B — IUS Quality

```sql
-- IUS with invalid value range
SELECT iusnid AS ius_nid, indicator_nid AS i_nid, unit_nid AS u_nid, subgroup_val_nid AS sg_nid,
       min_value AS ius_min_value, max_value AS ius_max_value
FROM ut_indicator_unit_subgroup
WHERE min_value > 0 AND max_value > 0 AND min_value > max_value;

-- IUS not mapped to any IC
SELECT ius.iusnid AS ius_nid, ius.indicator_nid AS i_nid, ius.unit_nid AS u_nid, ius.subgroup_val_nid AS sg_nid
FROM ut_indicator_unit_subgroup ius
WHERE NOT EXISTS (SELECT 1 FROM ut_ic_ius ii WHERE ii.iusnid = ius.iusnid);

-- IUS with broken dimension references
-- i_ref_missing / u_ref_missing / sg_ref_missing flags tell the data manager which lookup is broken
SELECT
    ius.iusnid             AS ius_nid,
    ius.indicator_nid      AS i_nid,
    ius.unit_nid           AS u_nid,
    ius.subgroup_val_nid   AS sg_nid,
    (indi.indicator_nid IS NULL)   AS i_ref_missing,
    (u.unit_nid IS NULL)           AS u_ref_missing,
    (sv.subgroup_val_nid IS NULL)  AS sg_ref_missing
FROM ut_indicator_unit_subgroup ius
LEFT JOIN ut_indicator_<locale>     indi ON indi.indicator_nid    = ius.indicator_nid
LEFT JOIN ut_unit_<locale>          u    ON u.unit_nid             = ius.unit_nid
LEFT JOIN ut_subgroup_vals_<locale> sv   ON sv.subgroup_val_nid    = ius.subgroup_val_nid
WHERE indi.indicator_nid IS NULL
   OR u.unit_nid          IS NULL
   OR sv.subgroup_val_nid IS NULL;
```

### Group C — Area Quality

```sql
-- Areas with no data
SELECT area_nid AS ar_nid, area_gid AS ar_gid, area_name AS ar_name FROM ut_area_<locale> WHERE data_exist = FALSE;

-- Orphan areas (broken parent reference)
SELECT a.area_nid AS ar_nid, a.area_gid AS ar_gid, a.area_name AS ar_name, a.area_parent_nid AS ar_parent_nid
FROM ut_area_<locale> a
WHERE a.area_parent_nid != 0
  AND NOT EXISTS (
      SELECT 1 FROM ut_area_<locale> p WHERE p.area_nid = a.area_parent_nid
  );
```

### Group D — Time Period Quality

```sql
-- Unused time periods
SELECT tp.timeperiod_nid AS tp_nid, tp.timeperiod AS tp_timeperiod
FROM ut_timeperiod tp
WHERE NOT EXISTS (SELECT 1 FROM ut_data d WHERE d.timeperiod_nid = tp.timeperiod_nid);
```

### Group E — Subgroup Quality

```sql
-- SubgroupVals not used in any IUS
SELECT sv.subgroup_val_nid AS sg_nid, sv.subgroup_val_gid AS sg_gid, sv.subgroup_val AS sg_name
FROM ut_subgroup_vals_<locale> sv
WHERE NOT EXISTS (
    SELECT 1 FROM ut_indicator_unit_subgroup ius WHERE ius.subgroup_val_nid = sv.subgroup_val_nid
);
```

### Group F — Data Value Integrity

```sql
-- Data values outside IUS range
SELECT d.data_nid AS dt_nid, d.iusnid AS ius_nid, d.data_value AS dt_value,
       ius.min_value AS ius_min_value, ius.max_value AS ius_max_value,
       d.area_nid AS ar_nid, d.timeperiod_nid AS tp_nid
FROM ut_data d
JOIN ut_indicator_unit_subgroup ius ON ius.iusnid = d.iusnid
WHERE d.istextualdata = FALSE
  AND d.data_value IS NOT NULL
  AND ius.min_value > 0 AND ius.max_value > 0
  AND (d.data_value < ius.min_value OR d.data_value > ius.max_value);

-- IUS+Area combos with no MRD row
SELECT d.iusnid AS ius_nid, d.area_nid AS ar_nid
FROM ut_data d
GROUP BY d.iusnid, d.area_nid
HAVING SUM(CASE WHEN d.ismrd = TRUE THEN 1 ELSE 0 END) = 0;
```

### Group G — Metadata Completeness

```sql
-- Indicators missing mandatory metadata
SELECT i.indicator_nid AS i_nid, i.indicator_gid AS i_gid, i.indicator_name AS i_name,
       mc.categorynid AS mt_catg_nid, mc.categoryname AS mt_catg_name
FROM ut_indicator_<locale> i
CROSS JOIN ut_metadata_category_<locale> mc
WHERE mc.ismandatory = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM ut_metadatareport_<locale> mr
      WHERE mr.target_nid = i.indicator_nid AND mr.category_nid = mc.categorynid
        AND TRIM(COALESCE(mr.metadata_text, '')) != ''
  );
```

### Group H — Source Quality

```sql
-- Sources not referenced in data
SELECT ic.ic_nid AS src_nid, ic.ic_gid AS src_gid, ic.ic_name AS src_name
FROM ut_indicator_classifications_<locale> ic
WHERE ic.ic_type = 'SR'
  AND NOT EXISTS (SELECT 1 FROM ut_data d WHERE d.source_nid = ic.ic_nid);
```

### Group I — IC / Classification Quality

```sql
-- ICs with no IUS mapping
SELECT ic.ic_nid, ic.ic_gid, ic.ic_name, ic.ic_type
FROM ut_indicator_classifications_<locale> ic
WHERE NOT EXISTS (SELECT 1 FROM ut_ic_ius ii WHERE ii.ic_nid = ic.ic_nid);
-- Append: AND ic.ic_type != 'SR'  when include_sr=false (default)

-- IC leaf nodes with no IUS mapping
SELECT ic.ic_nid, ic.ic_gid, ic.ic_name, ic.ic_type
FROM ut_indicator_classifications_<locale> ic
WHERE NOT EXISTS (
    SELECT 1 FROM ut_indicator_classifications_<locale> child WHERE child.ic_parent_nid = ic.ic_nid
)
AND NOT EXISTS (SELECT 1 FROM ut_ic_ius ii WHERE ii.ic_nid = ic.ic_nid);

-- IC-IUS links with broken references (ic_ref_missing / ius_ref_missing flags)
SELECT
    ii.ic_iusnid           AS ic_ius_nid,
    ii.ic_nid,
    ii.iusnid              AS ius_nid,
    (ic.ic_nid  IS NULL)   AS ic_ref_missing,
    (ius.iusnid IS NULL)   AS ius_ref_missing
FROM ut_ic_ius ii
LEFT JOIN ut_indicator_classifications_<locale> ic  ON ic.ic_nid   = ii.ic_nid
LEFT JOIN ut_indicator_unit_subgroup            ius ON ius.iusnid   = ii.iusnid
WHERE ic.ic_nid  IS NULL
   OR ius.iusnid IS NULL;
```

### Group N — Data Referential Integrity

```sql
-- quality/data/orphan-ius
-- Most critical: the primary IUS link is missing; the row cannot be enriched or served
SELECT d.data_nid AS dt_nid, d.iusnid AS ius_nid, d.area_nid AS ar_nid,
       d.timeperiod_nid AS tp_nid, d.source_nid AS ic_nid,
       d.data_value AS dt_value, d.textual_data_value AS dt_text_value
FROM ut_data d
WHERE NOT EXISTS (
    SELECT 1 FROM ut_indicator_unit_subgroup ius WHERE ius.iusnid = d.iusnid
);

-- quality/data/orphan-area
SELECT d.data_nid AS dt_nid, d.iusnid AS ius_nid, d.area_nid AS ar_nid,
       d.timeperiod_nid AS tp_nid, d.data_value AS dt_value
FROM ut_data d
WHERE NOT EXISTS (
    SELECT 1 FROM ut_area_<locale> a WHERE a.area_nid = d.area_nid
);

-- quality/data/orphan-timeperiod
SELECT d.data_nid AS dt_nid, d.iusnid AS ius_nid, d.timeperiod_nid AS tp_nid,
       d.area_nid AS ar_nid, d.data_value AS dt_value
FROM ut_data d
WHERE NOT EXISTS (
    SELECT 1 FROM ut_timeperiod tp WHERE tp.timeperiod_nid = d.timeperiod_nid
);

-- quality/data/orphan-source (only checks rows where source_nid is populated)
SELECT d.data_nid AS dt_nid, d.iusnid AS ius_nid, d.source_nid AS ic_nid,
       d.area_nid AS ar_nid, d.timeperiod_nid AS tp_nid
FROM ut_data d
WHERE d.source_nid IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM ut_indicator_classifications_<locale> ic WHERE ic.ic_nid = d.source_nid
  );
```

### Group J — Coverage & Completeness

Both `indicator-by-area` and `indicator-by-timeperiod` run two queries: the indicator-level aggregate first, then a per-subgroup breakdown batched over the returned indicator NIDs.

```sql
-- analytics/coverage/indicator-by-area — indicator totals
-- Parent row is derived from the default subgroup (isdefaultsubgroup = True), not a UNION across all subgroups.
-- This matches the headline figure shown on the indicator detail page.
SELECT
    i.indicator_nid AS i_nid, i.indicator_gid AS i_gid, i.indicator_name AS i_name,
    COUNT(DISTINCT a.area_nid)                                                          AS total_areas,
    COUNT(DISTINCT d.area_nid)                                                          AS areas_with_data,
    ROUND(COUNT(DISTINCT d.area_nid) * 100.0 / NULLIF(COUNT(DISTINCT a.area_nid), 0), 1) AS coverage_pct
FROM ut_indicator_<locale> i
JOIN ut_indicator_unit_subgroup def_ius
    ON def_ius.indicator_nid   = i.indicator_nid
   AND def_ius.isdefaultsubgroup = TRUE
CROSS JOIN ut_area_<locale> a
LEFT JOIN ut_data d
    ON d.iusnid    = def_ius.iusnid
   AND d.area_nid  = a.area_nid
GROUP BY i.indicator_nid, i.indicator_gid, i.indicator_name
ORDER BY coverage_pct ASC;

-- subgroup_breakdown for indicator-by-area (batched by indicator_nid list)
-- total_areas = areas with this subgroup's IUS (varies per subgroup, not a global constant)
-- coverage_pct denominator = parent indicator's total_areas (passed in from application layer)
SELECT
    d.indicator_nid AS i_nid,
    sv.subgroup_val_nid AS sg_nid, sv.subgroup_val_gid AS sg_gid, sv.subgroup_val AS sg_name,
    COUNT(DISTINCT d.area_nid) AS total_areas,
    COUNT(DISTINCT d.area_nid) AS areas_with_data
    -- coverage_pct = areas_with_data / parent.total_areas * 100 (computed in service layer)
FROM ut_data d
JOIN ut_subgroup_vals_<locale> sv ON sv.subgroup_val_nid = d.subgroup_val_nid
WHERE d.indicator_nid IN (:indicator_nids)
GROUP BY d.indicator_nid, sv.subgroup_val_nid, sv.subgroup_val_gid, sv.subgroup_val;

-- analytics/coverage/indicator-by-timeperiod — indicator totals
-- Parent row is derived from the default subgroup (isdefaultsubgroup = True), not a UNION across all subgroups.
-- total_periods is a scalar subquery (constant across all rows; same warehouse denominator).
SELECT
    i.indicator_nid AS i_nid, i.indicator_gid AS i_gid, i.indicator_name AS i_name,
    MIN(tp.timeperiod)                   AS earliest_period,
    MAX(tp.timeperiod)                   AS latest_period,
    COUNT(DISTINCT d.timeperiod_nid)     AS periods_with_data,
    (SELECT COUNT(*) FROM ut_timeperiod) AS total_periods
FROM ut_indicator_<locale> i
JOIN ut_indicator_unit_subgroup def_ius
    ON def_ius.indicator_nid    = i.indicator_nid
   AND def_ius.isdefaultsubgroup = TRUE
JOIN ut_data d    ON d.iusnid          = def_ius.iusnid
JOIN ut_timeperiod tp ON tp.timeperiod_nid = d.timeperiod_nid
GROUP BY i.indicator_nid, i.indicator_gid, i.indicator_name;

-- subgroup_breakdown for indicator-by-timeperiod (batched by indicator_nid list)
SELECT
    d.indicator_nid AS i_nid,
    sv.subgroup_val_nid AS sg_nid, sv.subgroup_val_gid AS sg_gid, sv.subgroup_val AS sg_name,
    MIN(tp.timeperiod)               AS earliest_period,
    MAX(tp.timeperiod)               AS latest_period,
    COUNT(DISTINCT d.timeperiod_nid) AS periods_with_data,
    (SELECT COUNT(*) FROM ut_timeperiod) AS total_periods
FROM ut_data d
JOIN ut_subgroup_vals_<locale> sv ON sv.subgroup_val_nid = d.subgroup_val_nid
JOIN ut_timeperiod tp ON tp.timeperiod_nid = d.timeperiod_nid
WHERE d.indicator_nid IN (:indicator_nids)
GROUP BY d.indicator_nid, sv.subgroup_val_nid, sv.subgroup_val_gid, sv.subgroup_val;

-- Area data completeness
SELECT
    a.area_nid AS ar_nid, a.area_gid AS ar_gid, a.area_name AS ar_name,
    COUNT(DISTINCT ius.iusnid)  AS total_ius,
    COUNT(DISTINCT d.iusnid)    AS ius_with_data,
    ROUND(COUNT(DISTINCT d.iusnid) * 100.0 / COUNT(DISTINCT ius.iusnid), 1) AS completeness_pct
FROM ut_area_<locale> a
CROSS JOIN ut_indicator_unit_subgroup ius
LEFT JOIN ut_data d ON d.area_nid = a.area_nid AND d.iusnid = ius.iusnid
GROUP BY a.area_nid, a.area_gid, a.area_name
ORDER BY completeness_pct ASC;
```

### Group K — Data Volume & Distribution

```sql
-- Top indicators by data volume
SELECT
    i.indicator_nid AS i_nid, i.indicator_gid AS i_gid, i.indicator_name AS i_name,
    COUNT(d.data_nid) AS total_data_rows
FROM ut_indicator_<locale> i
JOIN ut_data d ON d.indicator_nid = i.indicator_nid
GROUP BY i.indicator_nid, i.indicator_gid, i.indicator_name
ORDER BY total_data_rows DESC
LIMIT :top_n;

-- IUS data density
SELECT
    ius.iusnid AS ius_nid, ius.indicator_nid AS i_nid, ius.unit_nid AS u_nid, ius.subgroup_val_nid AS sg_nid,
    COUNT(d.data_nid)      AS total_rows,
    MIN(d.data_value)      AS min_data_value,
    MAX(d.data_value)      AS max_data_value,
    AVG(d.data_value)      AS avg_data_value,
    MIN(tp.timeperiod)     AS earliest_period,
    MAX(tp.timeperiod)     AS latest_period
FROM ut_indicator_unit_subgroup ius
JOIN ut_data d ON d.iusnid = ius.iusnid
LEFT JOIN ut_timeperiod tp ON tp.timeperiod_nid = d.timeperiod_nid
GROUP BY ius.iusnid, ius.indicator_nid, ius.unit_nid, ius.subgroup_val_nid
ORDER BY total_rows DESC;

-- Subgroup distribution in data
SELECT
    sv.subgroup_val_nid AS sg_nid, sv.subgroup_val_gid AS sg_gid, sv.subgroup_val AS sg_name,
    COUNT(d.data_nid)              AS total_data_rows,
    COUNT(DISTINCT d.indicator_nid) AS distinct_indicators,
    COUNT(DISTINCT d.area_nid)      AS distinct_areas
FROM ut_subgroup_vals_<locale> sv
LEFT JOIN ut_data d ON d.subgroup_val_nid = sv.subgroup_val_nid
GROUP BY sv.subgroup_val_nid, sv.subgroup_val_gid, sv.subgroup_val
ORDER BY total_data_rows DESC;
```

### Group L — IC & Source Utilisation

```sql
-- Source utilisation summary
SELECT
    ic.ic_nid AS src_nid, ic.ic_gid AS src_gid, ic.ic_name AS src_name,
    COUNT(d.data_nid)              AS total_data_rows,
    COUNT(DISTINCT d.iusnid)       AS distinct_ius,
    COUNT(DISTINCT d.area_nid)     AS distinct_areas,
    COUNT(DISTINCT d.timeperiod_nid) AS distinct_time_periods
FROM ut_indicator_classifications_<locale> ic
LEFT JOIN ut_data d ON d.source_nid = ic.ic_nid
WHERE ic.ic_type = 'SR'
GROUP BY ic.ic_nid, ic.ic_gid, ic.ic_name
ORDER BY total_data_rows DESC;

-- IC node coverage
SELECT
    ic.ic_nid, ic.ic_gid, ic.ic_name, ic.ic_type,
    COUNT(DISTINCT ii.iusnid)      AS mapped_ius_count,
    COUNT(DISTINCT d.data_nid)     AS total_data_rows,
    COUNT(DISTINCT d.area_nid)     AS distinct_areas
FROM ut_indicator_classifications_<locale> ic
LEFT JOIN ut_ic_ius ii ON ii.ic_nid = ic.ic_nid
LEFT JOIN ut_data d ON d.iusnid = ii.iusnid
GROUP BY ic.ic_nid, ic.ic_gid, ic.ic_name, ic.ic_type
ORDER BY total_data_rows DESC;
```

### Group M — Published Data Review

```sql
-- Core query shared by data/published/mrd and data/published/full
-- data/published/mrd adds: AND d.ismrd = TRUE
-- data/published/full: no extra WHERE clause; PUBLIC, all filters optional
-- All WHERE clauses are conditional — only applied when the corresponding filter param is provided
SELECT
    d.data_nid            AS dt_nid,
    d.data_value          AS dt_value,
    d.textual_data_value  AS dt_text_value,
    d.ismrd               AS dt_is_mrd,
    d.isplannedvalue      AS dt_is_planned_value,
    d.istextualdata       AS dt_is_textual,
    -- Indicator
    i.indicator_nid AS i_nid,  i.indicator_gid AS i_gid,  i.indicator_name AS i_name,
    -- Unit
    u.unit_nid AS u_nid,       u.unit_gid AS u_gid,       u.unit_name AS u_name,
    -- SubgroupVal
    sv.subgroup_val_nid AS sg_nid, sv.subgroup_val_gid AS sg_gid, sv.subgroup_val AS sg_name,
    -- Area
    a.area_nid AS ar_nid, a.area_gid AS ar_gid, a.area_name AS ar_name, a.area_level AS ar_level,
    -- Time period
    tp.timeperiod_nid AS tp_nid, tp.timeperiod AS tp_timeperiod,
    -- Source (src_gid / src_name are the output field names; source_nid is the ut_data FK column)
    ic.ic_nid AS ic_nid, ic.ic_gid AS src_gid, ic.ic_name AS src_name
    -- Note: ic_nid output field corresponds to the ut_data.source_nid FK column.
FROM ut_data d
JOIN ut_indicator_<locale>          i   ON i.indicator_nid    = d.indicator_nid
JOIN ut_unit_<locale>               u   ON u.unit_nid          = d.unit_nid
JOIN ut_subgroup_vals_<locale>      sv  ON sv.subgroup_val_nid = d.subgroup_val_nid
JOIN ut_area_<locale>               a   ON a.area_nid          = d.area_nid
LEFT JOIN ut_timeperiod             tp  ON tp.timeperiod_nid   = d.timeperiod_nid
LEFT JOIN ut_indicator_classifications_<locale> ic ON ic.ic_nid = d.source_nid
-- Conditional filters (each applied only when the parameter is supplied):
WHERE 1=1
  AND (:indicator      IS NULL OR d.indicator_nid    IN (:indicator_nids))
  AND (:unit           IS NULL OR d.unit_nid          IN (:unit_nids))
  AND (:subgroup       IS NULL OR d.subgroup_val_nid  IN (:subgroup_nids))
  AND (:area           IS NULL OR d.area_nid          IN (:area_nids))
  AND (:area_level     IS NULL OR a.area_level        = :area_level)
  AND (:time_period    IS NULL OR tp.timeperiod        IN (:time_periods))
  AND (:source         IS NULL OR d.source_nid        IN (:source_nids))
  -- IC filter: resolve IC NID(s) → IUS NIDs via ut_ic_ius, then match iusnid
  AND (:ic             IS NULL OR d.iusnid IN (
          SELECT ii.iusnid FROM ut_ic_ius ii WHERE ii.ic_nid IN (:ic_nids)
      ))
  AND (:ius            IS NULL OR d.iusnid             IN (:ius_nids))
  AND (:ismrd          IS NULL OR d.ismrd              = :ismrd)
  AND (:isplannedvalue IS NULL OR d.isplannedvalue     = :isplannedvalue)
  AND (:istextualdata  IS NULL OR d.istextualdata      = :istextualdata)
  AND (:data_value_min IS NULL OR d.data_value        >= :data_value_min)
  AND (:data_value_max IS NULL OR d.data_value        <= :data_value_max)
ORDER BY i.indicator_name, tp.timeperiod, a.area_name;

```

```

**Aggregation mode query (when `aggregate_by` is present):**

The same JOIN structure and WHERE block apply. The SELECT and GROUP BY are built dynamically from the `aggregate_by` dimensions and `agg` functions requested.

```sql
-- Example: aggregate_by=indicator,area  agg=count,avg,sum,min,max
SELECT
    -- grouped dimensions (built from aggregate_by list):
    i.indicator_nid AS i_nid,  i.indicator_gid AS i_gid,  i.indicator_name AS i_name,
    a.area_nid AS ar_nid,      a.area_gid AS ar_gid,       a.area_name AS ar_name,  a.area_level AS ar_level,
    -- aggregate functions (built from agg list):
    COUNT(d.data_nid)          AS dt_value_count,
    SUM(d.data_value)          AS dt_value_sum,
    AVG(d.data_value)          AS dt_value_avg,
    MIN(d.data_value)          AS dt_value_min,
    MAX(d.data_value)          AS dt_value_max
FROM ut_data d
JOIN ut_indicator_<locale>          i   ON i.indicator_nid    = d.indicator_nid
JOIN ut_unit_<locale>               u   ON u.unit_nid          = d.unit_nid
JOIN ut_subgroup_vals_<locale>      sv  ON sv.subgroup_val_nid = d.subgroup_val_nid
JOIN ut_area_<locale>               a   ON a.area_nid          = d.area_nid
LEFT JOIN ut_timeperiod             tp  ON tp.timeperiod_nid   = d.timeperiod_nid
LEFT JOIN ut_indicator_classifications_<locale> ic ON ic.ic_nid = d.source_nid
WHERE 1=1
  -- same conditional filters as raw mode --
  AND d.istextualdata = FALSE   -- enforced for all agg modes except count-only
GROUP BY
    i.indicator_nid, i.indicator_gid, i.indicator_name,
    a.area_nid, a.area_gid, a.area_name, a.area_level
ORDER BY i.indicator_name, a.area_name;
-- For agg=count only (no numeric function requested), istextualdata filter is NOT forced.
```

**Notes:**
- Both reports share the same JOIN structure and conditional WHERE block shown above.
- `data/published/mrd` appends `AND d.ismrd = TRUE` before all other conditions — no anchor filter required.
- `data/published/full` runs the same query with all filters optional; PUBLIC access, no auth required.
- Both are always **on-the-fly** (never cached).
- `page_size` ceiling: `data/published/mrd` → `10000`; `data/published/full` → `50000`.

```sql
-- data/published/mrd — append after WHERE 1=1:
AND d.ismrd = TRUE
-- then all optional filters follow as before

-- data/published/full — identical WHERE block, all conditions optional, no pre-filter
-- PUBLIC; no auth required
```
- Aggregation mode respects all filters — `?ismrd=true&aggregate_by=area&agg=avg` gives the average MRD data value per area.
- The `group_by` and `SELECT` clauses are built dynamically in the service layer from the validated `aggregate_by` list; SQL injection is prevented by validating each dimension against the allowlist before interpolation.

---

## 6. Implementation Strategy

### 6a. On-the-fly vs Cached — Decision

The 24 reports split into two execution models based on query cost and freshness requirements.

| Category | Execution | Reason |
|----------|-----------|--------|
| **Quality reports — structural (17)** | Always on-the-fly | Fast queries (existence checks, LEFT JOINs); data managers need the freshest view — a cached result that is hours old is misleading |
| **Quality reports — referential integrity (4)** (`quality/data/orphan-*`) | Always on-the-fly | Scan `ut_data` for broken FK rows; must reflect current state; results are actionable only when fresh |
| **`data/published/full`** | Always on-the-fly | No filter requirement; all filters optional; PUBLIC; arbitrary filter combos make caching impractical |
| **Remaining analytics reports (9)** | Lazy cache with event invalidation | Coverage % and aggregations across `ut_data` take 5–15 s on medium warehouses; results are summaries, not real-time signals — stale-serve is acceptable |

### 6b. Analytics Cache Lifecycle

```
First request for an analytics report
    ├── No cache entry → run query, store result_json in dw_report_cache, respond
    └── Cache entry exists
            ├── is_stale = False  → respond from cache instantly
            └── is_stale = True
                    ├── Dispatch bg job to refresh (if refresh_running = False)
                    └── Respond immediately with stale data + meta.is_stale = true
                        and meta.computed_at so the caller knows how old it is

Data mutation (POST / DELETE /dw/{dw_id}/data)
    └── mark_analytics_stale(dw_id) sets is_stale = True for all analytics
        cache rows for that dw_id — called inside data_service.py post-save,
        covering all entry points without touching any router

Manual refresh
    └── POST /dw/{dw_id}/reports/analytics/{slug}/refresh
            → dispatches bg job immediately, sets refresh_running = True
            → responds 202 Accepted with estimated completion
```

The **stale-serve pattern** is intentional: analytics are summaries, not real-time signals. A user sees data immediately while a background job refreshes, rather than waiting 15 seconds for a live query.

### 6c. File Download Strategy

Files are **never stored on disk or in the database.** The cache stores only `result_json` (compact text).

| Report type | On download request |
|-------------|-------------------|
| Quality (on-the-fly) | Run live query → render to requested format → stream |
| Analytics (cached) | Deserialise `result_json` → render to format → stream (~200 ms, no DB query) |

This avoids blob storage, filesystem management, and file expiry entirely.

### 6d. Cache Storage — `dw_report_cache` (app_db migration)

A new table in the core app DB (not per-warehouse) stores analytics results keyed by `(dw_id, report_slug, locale)`.

```sql
CREATE TABLE dw_report_cache (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    dw_id            VARCHAR(100) NOT NULL,
    report_slug      VARCHAR(150) NOT NULL,
    locale           VARCHAR(10)  NOT NULL DEFAULT 'en',
    computed_at      DATETIME     NOT NULL,
    is_stale         TINYINT(1)   NOT NULL DEFAULT 0,
    refresh_running  TINYINT(1)   NOT NULL DEFAULT 0,
    row_count        INT          NOT NULL DEFAULT 0,
    result_json      LONGTEXT,
    UNIQUE KEY uq_report_cache (dw_id, report_slug, locale)
);
```

### 6e. Invalidation Trigger

`mark_analytics_stale(dw_id)` is called at the end of any successful data mutation in `apps/datawarehouse/services/data_service.py` (upsert and delete). No router or middleware changes required.

```python
def mark_analytics_stale(app_db: Session, dw_id: str) -> None:
    app_db.query(DwReportCache).filter(
        DwReportCache.dw_id == dw_id,
        DwReportCache.report_slug.like("analytics/%"),
    ).update({"is_stale": True, "refresh_running": False})
    app_db.commit()
```

### 6f. New Endpoints (additions to router)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/dw/{dw_id}/reports/summary` | All 25 counts (quality live + analytics from cache or live on first call) |
| `GET` | `/dw/{dw_id}/reports/{slug}` | Paginated JSON; `?format=` for download |
| `POST` | `/dw/{dw_id}/reports/analytics/{slug}/refresh` | Force re-computation via bg job; returns 202 |

---

## 7. Generic Export Engine

### 7a. Architecture

A single `export_report()` function converts `(column_defs, rows, format)` to a `BytesIO` stream. Adding a new output format requires only a new private renderer — no router or schema changes needed.

```
ExportFormat (enum: csv | xlsx | pdf | docx)
    │
    └─► export_report(column_defs, rows, format, title, filename_prefix, db_display_name, language_code)
            │
            ├─► _export_csv()   → BytesIO  (built-in csv module, UTF-8 BOM)
            ├─► _export_xlsx()  → BytesIO  (openpyxl via build_generic_export_xlsx)
            ├─► _export_pdf()   → BytesIO  (reportlab SimpleDocTemplate + Table)
            └─► _export_docx()  → BytesIO  (python-docx Document + table)
```

### 7b. Report Registry

Each report is a `ReportDefinition` dataclass registered by slug. The generic endpoint resolves the slug, calls the query function, and dispatches to the export engine.

```
REPORT_REGISTRY: dict[slug → ReportDefinition]
    │
    └─► ReportDefinition
            slug:         str        # "quality/indicators/no-ius"
            title:        str        # "Indicators with No Subgroup Assigned"
            category:     str        # "quality" | "analytics"
            description:  str
            column_defs:  list[str]  # field names → translated header labels
            query_fn:     Callable   # (dw_db, locale?, page, page_size, **kwargs) → (rows, total)
            needs_locale: bool       # True for locale-table queries
```

### 7c. New Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `reportlab` | `>= 4.0` | PDF generation |
| `python-docx` | `>= 1.1` | DOCX generation |
| `openpyxl` | `3.1.2` (existing) | XLSX generation |
| `csv` | built-in | CSV generation |

---

## 8. Files

### New Files

| File | Purpose |
|------|---------|
| `apps/datawarehouse/schemas/dw_reports.py` | Pydantic response models for each report row type and the summary |
| `apps/datawarehouse/services/dw_report_queries.py` | 25 query functions — one per report |
| `apps/datawarehouse/services/dw_report_export.py` | Generic export engine (CSV / XLSX / PDF / DOCX) |
| `apps/datawarehouse/services/dw_report_registry.py` | `ReportDefinition` dataclass + `REPORT_REGISTRY` dict |
| `apps/datawarehouse/router/dw_reports.py` | `/summary` + `/{report_slug:path}` endpoints |
| `docs/DW_QUALITY_REPORTS.md` | This document |

### Modified Files

| File | Change |
|------|--------|
| `apps/datawarehouse/router/api.py` | Register `dw_reports.router` |
| `requirements.txt` | Add `reportlab>=4.0` and `python-docx>=1.1` |

---

## 9. Adding New Reports

To add a report:

1. Write a query function in `apps/datawarehouse/services/dw_report_queries.py`:
   ```python
   def get_my_new_report(
       dw_db: Session,
       locale: str,
       page: int,
       page_size: Optional[int],
   ) -> tuple[list[dict], int]:
       ...
       return rows, total
   ```

2. Add a `ReportDefinition` entry to `REPORT_REGISTRY` in `apps/datawarehouse/services/dw_report_registry.py`:
   ```python
   "analytics/my-group/my-report": ReportDefinition(
       slug="analytics/my-group/my-report",
       title="My New Report",
       category="analytics",
       description="Describes what this report covers.",
       column_defs=["field_a", "field_b", "field_c"],
       query_fn=get_my_new_report,
       needs_locale=True,
   ),
   ```

3. The report is immediately available at:
   - `GET /dw/{dw_id}/reports/analytics/my-group/my-report` (JSON)
   - `GET /dw/{dw_id}/reports/analytics/my-group/my-report?format=xlsx` (download)
   - `GET /dw/{dw_id}/reports/summary` (count included automatically)

No router, schema, or endpoint changes are required.

---

## 10. Verification

```bash
# Install new dependencies
pip install reportlab python-docx

# Start dev server
uvicorn main:app --reload --port 8000

# Summary
curl -H "Accept-Language: en" http://localhost:8000/dw/{dw_id}/reports/summary

# Quality report — paginated JSON
curl -H "Accept-Language: en" \
  "http://localhost:8000/dw/{dw_id}/reports/quality/indicators/no-ius?page=1&page_size=20"

# Analytics report — paginated JSON
curl -H "Accept-Language: en" \
  "http://localhost:8000/dw/{dw_id}/reports/analytics/coverage/indicator-by-area?page=1&page_size=20"

# File downloads
curl -O -J "http://localhost:8000/dw/{dw_id}/reports/quality/indicators/no-ius?format=xlsx"
curl -O -J "http://localhost:8000/dw/{dw_id}/reports/analytics/volume/top-indicators?format=csv&top_n=50"
curl -O -J "http://localhost:8000/dw/{dw_id}/reports/analytics/coverage/indicator-by-area?format=pdf"

# Cross-check quality/indicators/no-ius count directly in MySQL
SELECT COUNT(*) FROM ut_indicator_en i
LEFT JOIN ut_indicator_unit_subgroup ius ON ius.indicator_nid = i.indicator_nid
WHERE ius.iusnid IS NULL;

# Run tests
pytest apps/datawarehouse/tests/
```
