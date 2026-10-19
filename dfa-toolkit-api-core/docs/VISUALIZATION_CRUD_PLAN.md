# Visualization CRUD API — Implementation

## 1. Overview

CRUD APIs for dashboard visualizations. Visualizations are scoped per-dashboard — a visualization created inside a dashboard is only available for that dashboard's canvas/report.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dash/{dashboard_id}/vis` | List visualizations (paginated, filterable) |
| GET | `/dash/{dashboard_id}/vis/{viz_id}` | Get full visualization detail |
| POST | `/dash/{dashboard_id}/vis` | Create visualization (name + type required) |
| PATCH | `/dash/{dashboard_id}/vis/{viz_id}` | Partial update |
| DELETE | `/dash/{dashboard_id}/vis/{viz_id}` | Hard delete |

---

## 2. Database Schema

### Migration: `124_viz_crud_refactor`

Changes applied to `dash_visualization`:

| Change | Before | After |
|--------|--------|-------|
| `visualization_name` | `LONGBLOB NULL` | `VARCHAR(255) NOT NULL` |
| `provider` | `VARCHAR(255) NULL` | **Dropped** |
| `type_category` | `VARCHAR(255) NULL` | Renamed to `category` |
| New: `chart_variant` | — | `VARCHAR(100) NULL` |
| New: `is_used_in_layout` | — | `SMALLINT NOT NULL DEFAULT 0` |
| New: `created_user_id` | — | `INT NULL` |

**Dropped table:** `dash_dashboard_visualization` (redundant — `dashboard_id` FK already on `dash_visualization`; `is_used_in_layout` moved directly to `dash_visualization`).

### Final `dash_visualization` columns:

```
id                  INT AUTO_INCREMENT PRIMARY KEY
layout_id           INT NULL
visualization_name  VARCHAR(255) NOT NULL
category            VARCHAR(255) NULL        -- "chart" | "custom"
type                VARCHAR(255) NULL        -- "bar"|"line"|"pie"|"html"|"text"| etc.
chart_variant       VARCHAR(100) NULL        -- "vertical"|"stacked"|"donut"| etc.
system_dw_id        INT NULL (FK → system_datawarehouse.id, ON DELETE SET NULL)
dashboard_id        INT NULL (FK → dash_dashboards.id, ON DELETE CASCADE)
properties          LONGTEXT NULL            -- JSON: chart config
data_cube_info      LONGTEXT NULL            -- JSON: data dimensions
explore_enabled     SMALLINT DEFAULT 1
explore_da_enabled  SMALLINT DEFAULT 1
explore_qa_enabled  SMALLINT DEFAULT 1
explore_md_enabled  SMALLINT DEFAULT 1
mode                VARCHAR(255) NULL        -- "edit" | "publish"
source_viz_id       INT NULL
is_deleted          SMALLINT DEFAULT 0
is_used_in_layout   SMALLINT DEFAULT 0
created             DATETIME NULL
created_user_id     INT NULL
modified            DATETIME NULL
modified_user_id    INT NULL
```

---

## 3. API Contracts

### POST `/dash/{dashboard_id}/vis` — Create

**Request:**
```json
{
  "name": "Population by Region",
  "type": "bar",
  "chart_variant": "vertical",
  "properties": { ... },
  "data_cube_info": { ... }
}
```

Required: `name`, `type`. Everything else optional.

**Response (201):**
```json
{
  "success": true,
  "message": "Visualization created successfully",
  "data": {
    "id": 42,
    "name": "Population by Region",
    "type": "bar",
    "chart_variant": "vertical",
    "category": "chart",
    "is_used_in_layout": false,
    "properties": { ... },
    "data_cube_info": { ... },
    "created": "2026-07-02T12:00:00",
    "modified": "2026-07-02T12:00:00",
    "created_user_id": 1,
    "modified_user_id": 1
  }
}
```

### GET `/dash/{dashboard_id}/vis` — List

**Query params:** `page`, `page_size`, `type`, `category`

**Response (200):** List items (no `properties` / `data_cube_info` blobs) with pagination meta.

### GET `/dash/{dashboard_id}/vis/{viz_id}` — Detail

**Response (200):** Full object with `properties` and `data_cube_info` JSON.

### PATCH `/dash/{dashboard_id}/vis/{viz_id}` — Update

**Request:** Any subset of `name`, `type`, `chart_variant`, `properties`, `data_cube_info`, `is_used_in_layout`.

`properties` and `data_cube_info` are **full replacement** when provided.

### DELETE `/dash/{dashboard_id}/vis/{viz_id}`

**Response (204):** No content. FK cascades remove related `dash_analyses` rows.

---

## 4. JSON Storage

### `properties` — Chart Configuration

Stores everything from the frontend `VisualizationSettings` except `charts` (denormalized to `type`/`chart_variant` columns) and `data` (separate column):

```json
{
  "general": { "chartArea": {...}, "legend": {...}, "axisHorizontal": {...}, ... },
  "series": { "sortByList": "" },
  "categories": { "sortByList": "" },
  "theme": { "enableTheme": false, ... },
  "advance": { "datawarehouseId": 1, "contextMenu": {...} },
  "customHtml": null,
  "customText": null,
  "customImage": null,
  "customVideo": null
}
```

### `data_cube_info` — Data Dimensions

Stores indicator/subgroup/area/time selections and axis mapping:

```json
{
  "indicators": [{ "id": "IND001_UNIT01", "label": "Population", "nid": 5, "unitGid": "UNIT01" }],
  "subgroups": [{ "id": "SG001", "label": "Total", "nid": 1 }],
  "areas": [{ "id": "KEN", "label": "Kenya", "nid": 10 }],
  "timePeriods": [{ "id": "2023", "label": "2023", "nid": 100 }],
  "mapping": { "xDimension": "time", "seriesDimension": "area", "seriesDimension2": null }
}
```

---

## 5. Visualization Types

### Chart types (`category = "chart"`)

| type | Variants |
|------|----------|
| bar | vertical, stacked-vertical, stacked_percent, horizontal, stacked-horizontal, stacked_percent_bar |
| area | basic, stacked, stacked_percent |
| line | line, spline, polar_line, spider_web |
| map | basic_map, marker_map |
| pie | pie, pieDonut, pieSemi |
| table | (none) |
| tree | sunburst, tree_map_square, tree_map_slice_and_dice, tree_map_stripe |
| percent | dfa_dot_matrix, hundered_minus |

### Custom types (`category = "custom"`)

| type | Description |
|------|-------------|
| html | Custom HTML widget |
| text | Static text block |
| tile | Tile/card widget |
| image | Image embed |
| video | Video embed |

---

## 6. Files

| Path | Purpose |
|------|---------|
| `apps/app_db/migrations/versions/124_viz_crud_refactor.py` | Schema migration |
| `apps/app_dashboard/models/dashboard.py` | Updated `DashVisualization` model |
| `apps/app_dashboard/constants.py` | Type/category constants |
| `apps/app_dashboard/schemas/visualization.py` | Pydantic request/response schemas |
| `apps/app_dashboard/services/visualization_service.py` | CRUD business logic |
| `apps/app_dashboard/router/visualizations.py` | API endpoints |
