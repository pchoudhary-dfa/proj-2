# User Permissions & IAM Authorization API

## 1. Overview

The User Permissions module provides APIs for frontend (FED) authorization and for administering role–resource and user–role assignments. It enables:

- **Current-user permissions**: A single endpoint that returns the authenticated user’s roles and the **union** of resource-level CRUD permissions across all assigned roles, for use by the FED to drive menus, buttons, and route guards.
- **Role permissions (admin)**: Saving which resources (and which CRUD operations) a role is allowed to access; persisted as rows in `iam_role_resource_api` (CRUD is expanded to HTTP methods and mapped to `iam_resource_api`).
- **User–role assignment (admin)**: Assigning roles to a user for a given application key and optional data warehouse scope; persisted in `iam_user_role`. Optionally, **content-level authorization** can be attached per role (e.g. Data Entry limited to specific areas or indicators), persisted in `iam_user_role_content`.

**Super-admin exception:** If the user has **any** role with `is_super_admin=1`, the permissions response treats that user as having **all resources** for the requested `app_key` with full CRUD (`["C","R","U","D"]`). No lookup against `iam_role_resource_api` is performed in that case; the response includes `is_super_admin: true` and a full resource list so the FED can grant access without further checks.

This document reflects the current API contract, including query/body shapes, response structure, and the super-admin behavior.

---

## 2. API Endpoints

### 2.1 Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /auth/me/permissions | Current user’s permissions (roles + union of resources with CRUD). |
| PUT | /iam/roles/{role_id}/permissions | Save role permissions (resource_code + CRUD → persisted as role–resource-api mappings). |
| PUT | /iam/users/{user_id}/roles | Assign roles to a user for an app_key (and optional dw_id). |

### 2.2 Related Endpoints (Existing)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /iam/roles | List IAM roles (optional filter by app_key). |
| POST | /auth/login | Authenticate and obtain JWT (used before calling /auth/me/permissions). Response includes `workflows` and `resources` (distinct codes) plus `meta.workflow` / `meta.resources` from workflow-scoped `iam_user_role_content` for the user. |

---

## 3. Data Model — Permissions Contract

### 3.1 GET /auth/me/permissions — Response Data Shape

| Field | Type | Description |
|-------|------|-------------|
| user_id | integer | Authenticated user id. |
| app_key | string | Application key used for the query (resolved or provided). |
| is_super_admin | boolean | If true, user has full access to all resources for this app_key (super-admin exception). |
| roles | array | List of role assignments for this user (role_id, role_code, role_name, dw_id). |
| resources | array | Union of resource permissions across roles; each item has resource_code, name, permissions (CRUD). |

### 3.2 Role Assignment Info (roles[] item)

| Field | Type | Description |
|-------|------|-------------|
| role_id | integer | IAM role id. |
| role_code | string | Role code (e.g. ADMIN, VIEWER). |
| role_name | string | Display name (from i18n when available). |
| dw_id | integer \| null | Data warehouse scope; null = all warehouses. |

### 3.3 Resource Permissions Info (resources[] item)

| Field | Type | Description |
|-------|------|-------------|
| resource_code | string | Resource code (e.g. dm_dw_indicator, dm_dw_area). |
| name | string \| null | Display name. |
| permissions | string[] | Subset of ["C", "R", "U", "D"] — Create, Read, Update, Delete. |

### 3.4 CRUD Mapping (Backend)

- **C** → POST  
- **R** → GET  
- **U** → PUT, PATCH  
- **D** → DELETE  

Permissions are derived from allowed `iam_resource_api` rows per role via `iam_role_resource_api`.

### 3.5 Content-Level Authorization (iam_user_role_content)

When assigning a user to a role, the request may optionally include **content_restrictions** per role. These restrict that role assignment to specific content items (e.g. a Data Entry user may access only certain areas or indicators). Rows are stored in `iam_user_role_content`.

| Field | Type | Description |
|-------|------|-------------|
| resource_code | string | Same as `iam_resource.resource_code` (e.g. `dm_dw_area`, `dm_dw_indicator`, `dm_dw_unit`). Identifies the content type from the Area/Indicator perspective. |
| content_ids | integer[] | Primary keys of the allowed items for that resource (e.g. ar_nid for areas, indicator nid for indicators). |

- **resource_code** values must match `iam_resource.resource_code` for the app (e.g. `dm_dw_area`, `dm_dw_indicator`, `dm_dw_unit`, `dm_dw_indicator_classification`). The server resolves this to the resource id when persisting to `iam_user_role_content`.
- **content_id** in the table is one entry per allowed item; the API accepts a list per resource_code and the server creates one row per (user_role_id, resource_code, content_id).

---

## 4. Authentication & Authorization (As Implemented)

### 4.1 Authentication

- **GET /auth/me/permissions** requires a valid **Bearer JWT** (e.g. from POST /auth/login). The middleware validates the token; the handler resolves the user from the token’s `sub` claim.
- **PUT /iam/roles/{role_id}/permissions** and **PUT /iam/users/{user_id}/roles** are protected by the same app-client and JWT requirements as other IAM routes (as per gateway/middleware). Callers must be authenticated.

### 4.2 Authorization / Super-Admin Exception

- **Normal users:** Permissions are computed from `iam_user_role` → `iam_role_resource_api` → `iam_resource_api` and aggregated by resource_code with CRUD letters. The response contains only resources the user is allowed to access via at least one role.
- **Super-admin users:** If the user has **any** role with `is_super_admin=1` (in `iam_role`), then:
  - The API returns **all** active resources for the requested `app_key` with **permissions `["C","R","U","D"]`**.
  - The response includes **`is_super_admin: true`**.
  - No check against `iam_role_resource_api` is performed for that user; they are treated as having full resource access as an **exception** to the normal permission rules.

The FED may use `is_super_admin` to bypass resource-level checks or to show all features when true.

---

## 5. Standard Response Structure (As Implemented)

### 5.1 Success Response

```json
{
  "success": true,
  "message": "string",
  "data": {}
}
```

### 5.2 Error Response

```json
{
  "success": false,
  "err_message": "string",
  "data": null,
  "errors": {}
}
```

There is no top-level `code` field (e.g. no RESP_SUCCESS, RESP_NOT_FOUND). HTTP status codes indicate outcome (200, 400, 401, 404, 422, 500).

---

## 6. GET — Current User Permissions

**GET** `/auth/me/permissions`

Returns the current user’s roles and the union of resource CRUD permissions for the given application scope. Used by the FED for authorization (menus, buttons, route guards). Super-admin users receive all resources with full CRUD.

**Headers**

- **Authorization:** Bearer \<JWT\> (required)

**Query Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| app_key | string | No | Application key (e.g. DFA_DM). If omitted, server uses default app key from settings. |
| dw_id | integer | No | Optional DW scope; when provided may narrow which role assignments are considered. |

**Success Response (200)**

```json
{
  "success": true,
  "message": "Permissions retrieved successfully",
  "data": {
    "user_id": 12,
    "app_key": "DFA_DM",
    "is_super_admin": false,
    "roles": [
      { "role_id": 3, "role_code": "ADMIN", "role_name": "Administrator", "dw_id": null },
      { "role_id": 5, "role_code": "VIEWER", "role_name": "Viewer", "dw_id": 1 }
    ],
    "resources": [
      { "resource_code": "dm_dw_indicator", "name": "Indicators", "permissions": ["C", "R", "U", "D"] },
      { "resource_code": "dm_dw_area", "name": "Areas", "permissions": ["R"] }
    ]
  }
}
```

**Success Response — Super-Admin (200)**

When the user has a role with `is_super_admin=1`:

```json
{
  "success": true,
  "message": "Permissions retrieved successfully",
  "data": {
    "user_id": 1,
    "app_key": "DFA_DM",
    "is_super_admin": true,
    "roles": [
      { "role_id": 1, "role_code": "SUPERADMIN", "role_name": "Super Administrator", "dw_id": null }
    ],
    "resources": [
      { "resource_code": "dm_dw_indicator", "name": "Indicators", "permissions": ["C", "R", "U", "D"] },
      { "resource_code": "dm_dw_area", "name": "Areas", "permissions": ["C", "R", "U", "D"] }
    ]
  }
}
```

All resources for the app_key are returned with `["C","R","U","D"]` as the exception for super-admin.

**Error Responses**

- **401:** Missing or invalid Bearer token.

---

## 7. PUT — Save Role Permissions

**PUT** `/iam/roles/{role_id}/permissions`

Persists role permissions by resource_code and CRUD. The server expands CRUD to HTTP methods, resolves `iam_resource` and `iam_resource_api`, and replaces `iam_role_resource_api` rows for the role within a transaction.

**Path Parameters**

| Name | Type | Description |
|------|------|-------------|
| role_id | integer | IAM role id. |

**Headers**

- **Authorization:** Bearer \<JWT\> (required)  
- **Content-Type:** application/json (required)

**Request Body**

```json
{
  "data": {
    "role": { "role_id": 3 },
    "resources": [
      { "resource_code": "dm_dw_indicator", "permissions": ["C", "R", "U", "D"] },
      { "resource_code": "dm_dw_area", "permissions": ["R"] }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| data.role.role_id | integer | Role id (should match path role_id). |
| data.resources | array | List of resource permissions. |
| data.resources[].resource_code | string | Resource code (e.g. dm_dw_indicator). |
| data.resources[].name | string | Optional; display name (not required for persistence). |
| data.resources[].permissions | string[] | Subset of ["C","R","U","D"]. |

**Success Response (200)**

```json
{
  "success": true,
  "message": "Role permissions saved successfully",
  "data": {
    "role_id": 3,
    "resources_received": 2
  }
}
```

**Error Responses**

- **400:** Invalid payload or role_id.  
- **404:** Role or resource not found.

---

## 8. PUT — Save User Roles

**PUT** `/iam/users/{user_id}/roles`

Assigns roles to a user for a given `app_key` and optional `dw_id`. Replaces existing `iam_user_role` rows for (user_id, app_key, dw_id) with the provided list in a transaction. Optionally, **content-level restrictions** per role can be sent; these are persisted in `iam_user_role_content` (e.g. Data Entry role limited to specific areas or indicators).

**Path Parameters**

| Name | Type | Description |
|------|------|-------------|
| user_id | integer | IAM user id. |

**Headers**

- **Authorization:** Bearer \<JWT\> (required)  
- **Content-Type:** application/json (required)

**Request Body (roles only)**

```json
{
  "data": {
    "app_key": "DFA_DM",
    "dw_id": 1,
    "user_id": 12,
    "roles": [
      { "role_id": 3 },
      { "role_id": 5 }
    ]
  }
}
```

**Request Body (with content-level restrictions)**

Example: assign role 5 (e.g. Data Entry) and restrict it to specific areas and indicators using `iam_resource.resource_code` values.

```json
{
  "data": {
    "app_key": "DFA_DM",
    "dw_id": 1,
    "user_id": 12,
    "roles": [
      { "role_id": 3 },
      {
        "role_id": 5,
        "content_restrictions": [
          { "resource_code": "dm_dw_area", "content_ids": [101, 102, 103] },
          { "resource_code": "dm_dw_indicator", "content_ids": [201, 202] }
        ]
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| data.app_key | string | Application key scope. |
| data.dw_id | integer \| null | Optional; DW scope. Omit or null = all warehouses. |
| data.user_id | integer | User id (should match path user_id). |
| data.roles | array | List of role assignments. |
| data.roles[].role_id | integer | IAM role id to assign. |
| data.roles[].content_restrictions | array | Optional. Content-level restrictions for this role assignment (stored in iam_user_role_content). |
| data.roles[].content_restrictions[].resource_code | string | Same as `iam_resource.resource_code` (e.g. `dm_dw_area`, `dm_dw_indicator`, `dm_dw_unit`). |
| data.roles[].content_restrictions[].content_ids | integer[] | Allowed content PKs for that resource (e.g. ar_nid for areas, indicator nid for indicators). |

**Success Response (200)**

```json
{
  "success": true,
  "message": "User roles updated successfully",
  "data": {
    "user_id": 12,
    "app_key": "DFA_DM",
    "dw_id": 1,
    "roles_received": 2,
    "roles_with_content_restrictions": 1
  }
}
```

**Error Responses**

- **400:** Invalid payload, user_id, or app_key.  
- **404:** User or role not found.

---

## 9. Error Handling (HTTP Semantics)

Common outcomes:

- **400:** Bad request (invalid app_key, validation failure).  
- **401:** Unauthorized (missing or invalid JWT).  
- **403:** Forbidden (e.g. insufficient privileges for admin endpoints).  
- **404:** Resource not found (role, user, or resource_code).  
- **422:** Validation error (e.g. invalid permissions array).  
- **500:** Internal server error.

Example error body:

```json
{
  "success": false,
  "err_message": "Role not found",
  "data": null,
  "errors": { "role_id": 999 }
}
```

---

## 10. Developer Notes

- **Super-admin:** A user with any role where `iam_role.is_super_admin=1` receives all resources with full CRUD for the requested `app_key`; `is_super_admin` is set to `true` in the response.  
- **Union:** For non–super-admin users, `resources` is the union of permissions from all of the user’s roles (for the scope); if one role grants R and another grants C,U,D for the same resource, the user gets ["C","R","U","D"].  
- **Default app_key:** If `app_key` is not passed to GET /auth/me/permissions, the server uses the configured default (e.g. `DEFAULT_APP_KEY`).  
- **Persistence:** Role permissions are stored in `iam_role_resource_api` (role_id, resource_id, resource_api_id). User–role assignments are stored in `iam_user_role` (user_id, app_key, dw_id, role_id). Content-level restrictions are stored in `iam_user_role_content` (user_role_id, resource_code, content_id).  
- **Content-level authorization:** When a role entry in PUT /iam/users/{user_id}/roles includes `content_restrictions`, the server creates rows in `iam_user_role_content` for each (user_role_id, resource_code, content_id). Use `resource_code` values that match `iam_resource.resource_code` (e.g. `dm_dw_area`, `dm_dw_indicator`, `dm_dw_unit`). The backend resolves the string to the resource id when persisting. Downstream enforcement (e.g. filtering areas/indicators by allowed content_ids) is done in the services that read data.  
- **CRUD expansion:** When saving role permissions, C→POST, R→GET, U→PUT/PATCH, D→DELETE; only active `iam_resource_api` rows for the resource and app_key are used.

---

## 11. Non-Functional Notes

- GET /auth/me/permissions is intended to be called once per session or after login and the result cached by the FED.  
- Admin endpoints (PUT role permissions, PUT user roles) should be restricted to authorized operators in production (enforced by middleware or gateway).
