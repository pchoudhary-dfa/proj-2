"""
IAM routes — roles and permissions master data.
"""
from typing import List, Optional, Union

from fastapi import APIRouter, Body, Depends, Path, Query, status
from sqlalchemy import asc, desc
from sqlalchemy.orm import Session

from apps.app_db.dependencies import get_app_key, get_core_locale, get_current_user_id
from apps.app_db.models.core import IamResource, IamResourceApi, IamResourceI18n, IamRole, IamRoleI18n, IamRoleResourceApi
from apps.app_db.schemas.iam import (
    ResourceGroupedResponse,
    ResourceResponse,
    RoleCreateItem,
    RoleCreateRequest,
    RolePatchRequest,
    RoleResponse,
    SaveRolePermissionsRequest,
    SaveUserRolesRequest,
)
from apps.app_db.services.iam_role_service import IamRoleService
from apps.datawarehouse.constants import QUERY_IS_DW_SPEC
from apps.shared.config.dependencies import get_db
from apps.shared.exceptions import BadRequest, Forbidden, NotFound
from apps.shared.schemas.response import ErrorResponse, ListPaginationMetaSchema, SuccessResponse
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import success_response

router = APIRouter(prefix="/iam", tags=["IAM"])
_role_service = IamRoleService()


_ROLE_SORT_FIELDS = {
    "id": IamRole.id,
    "display_order": IamRole.display_order,
    "role_code": IamRole.role_code,
}

_ROLE_SEARCH_FIELDS = {
    "name": IamRoleI18n.name,
    "role_code": IamRole.role_code,
}

_RESOURCE_SORT_FIELDS = {
    "id": IamResource.id,
    "resource_code": IamResource.resource_code,
    "parent_id": IamResource.parent_id,
    "display_order": IamResource.display_order,
}

_RESOURCE_SEARCH_FIELDS = {
    "name": IamResourceI18n.name,
    "resource_code": IamResource.resource_code,
}


@router.get("/roles", response_model=SuccessResponse[List[RoleResponse]])
def list_roles(
    locale: str = Depends(get_core_locale),
    app_key: str = Depends(get_app_key),
    db: Session = Depends(get_db),
    resource_code: Optional[str] = Query(
        None,
        description="Optional resource filter (e.g. dm_dw_data_entry or dm_dw_data_review). Returns only roles associated with this resource.",
    ),
    http_method: Optional[str] = Query(
        None,
        description="Optional HTTP method filter (GET, POST, PUT, PATCH, DELETE). Works only when resource_code is provided.",
    ),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page; omit to return all"),
    sort_field: Optional[str] = Query("display_order", description="Sort field: id, display_order, role_code"),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc"),
    search_by: Optional[str] = Query(
        None,
        description=f"Field to search in: {', '.join(_ROLE_SEARCH_FIELDS)}",
    ),
    search: Optional[str] = Query(
        None,
        description="Search term (case-insensitive partial match); applied to role display name (`name` i18n) by default",
    ),
    is_super: bool = Query(
        False,
        description="When true, include super-admin roles (is_super_admin=1); when false, exclude them (default).",
    ),
):
    """
    Return the master list of IAM roles scoped to the calling client's app_key.

    - `is_super`: when false (default), super-admin roles are omitted; when true, they are included.
    - Omit `page_size` to return all roles without pagination.
    - `sort_field` supports: id, display_order, role_code; defaults to `display_order`.
    - `sort_order` defaults to `asc`.
    - Results include `display_order` for UI positioning.
    - Optional `search` filters with a case-insensitive partial match. Omit `search_by` to search the
      translated display `name` for the request locale; set `search_by` to `name` or `role_code` to
      target that column explicitly.
    """
    if sort_order is not None and sort_order not in ("asc", "desc"):
        raise BadRequest("sort_order must be 'asc' or 'desc'")
    if http_method and not resource_code:
        raise BadRequest("http_method filter requires resource_code")
    method = http_method.strip().upper() if http_method else None
    if method and method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
        raise BadRequest("http_method must be one of: GET, POST, PUT, PATCH, DELETE")

    sort_col = _ROLE_SORT_FIELDS.get(sort_field or "display_order", IamRole.display_order)
    sort_dir = desc if sort_order == "desc" else asc

    base_query = (
        db.query(IamRole, IamRoleI18n)
        .outerjoin(
            IamRoleI18n,
            (IamRoleI18n.master_id == IamRole.id) & (IamRoleI18n.locale == locale),
        )
        .filter(IamRole.app_key == app_key)
    )
    if not is_super:
        base_query = base_query.filter(IamRole.is_super_admin != 1)
    if resource_code:
        rc = resource_code.strip()
        base_query = (
            base_query
            .join(IamRoleResourceApi, IamRoleResourceApi.role_id == IamRole.id)
            .join(IamResource, IamResource.id == IamRoleResourceApi.resource_id)
            .filter(IamResource.app_key == app_key, IamResource.resource_code == rc)
            .distinct()
        )
        if method:
            base_query = (
                base_query
                .join(IamResourceApi, IamResourceApi.id == IamRoleResourceApi.resource_api_id)
                .filter(IamResourceApi.http_method == method)
            )

    has_list_filters = bool(
        (search and search.strip())
        or resource_code
        or method
    )
    total_count_unfiltered_raw: Optional[int] = None
    if has_list_filters:
        unfiltered_q = (
            db.query(IamRole)
            .filter(IamRole.app_key == app_key)
        )
        if not is_super:
            unfiltered_q = unfiltered_q.filter(IamRole.is_super_admin != 1)
        total_count_unfiltered_raw = unfiltered_q.count()

    if search and search.strip():
        if search_by and search_by.strip():
            field_key = search_by.strip().lower()
            if field_key not in _ROLE_SEARCH_FIELDS:
                raise BadRequest(
                    f"Invalid search_by field. Allowed: {list(_ROLE_SEARCH_FIELDS)}",
                )
            field = _ROLE_SEARCH_FIELDS[field_key]
            base_query = base_query.filter(field.ilike(f"%{search.strip()}%"))
        else:
            base_query = base_query.filter(IamRoleI18n.name.ilike(f"%{search.strip()}%"))

    total_count = base_query.count()

    use_pagination = page_size is not None
    effective_page_size = max(1, min(page_size, 1000)) if use_pagination else None

    query = base_query.order_by(sort_dir(sort_col))
    if use_pagination:
        query = query.offset((page - 1) * effective_page_size).limit(effective_page_size)

    rows = query.all()
    data = [
        RoleResponse(
            id=role.id,
            app_key=role.app_key,
            role_code=role.role_code,
            is_super_admin=role.is_super_admin or 0,
            is_system_role=role.is_system_role or 0,
            display_order=role.display_order or 0,
            name=i18n.name if i18n else None,
            description=i18n.description if i18n else None,
        )
        for role, i18n in rows
    ]

    if use_pagination:
        meta_page = page
        meta_page_size = effective_page_size
        total_pages = (total_count + effective_page_size - 1) // effective_page_size if total_count else 0
    else:
        meta_page = 1
        meta_page_size = total_count
        total_pages = 1 if total_count else 0

    meta = build_list_pagination_meta(
        total_count=total_count,
        count=len(data),
        page=meta_page,
        page_size=meta_page_size,
        total_pages=total_pages,
        total_count_unfiltered=resolve_unfiltered_total(
            total_count,
            total_count_unfiltered_raw,
            has_list_filters=has_list_filters,
        ),
    )

    return success_response(message="Roles retrieved successfully", data=[r.model_dump() for r in data], meta=meta)


# ---------------------------------------------------------------------------
# Role CUD
# ---------------------------------------------------------------------------

@router.post(
    "/roles",
    response_model=SuccessResponse[List[RoleResponse]],
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"model": SuccessResponse, "description": "Roles created"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Create one or more roles",
    description=(
        "Create one or more IAM roles in a single atomic transaction. "
        "All roles are scoped to the calling client's app_key (resolved from X-Api-Key). "
        "If `name`/`description` are provided they are stored in `iam_role_i18n` "
        "for the locale resolved from the `Accept-Language` header."
    ),
)
def create_roles(
    payload: RoleCreateRequest = Body(...),
    locale: str = Depends(get_core_locale),
    current_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
):
    roles = _role_service.create_roles(payload, locale, current_user_id, app_key)
    return success_response(
        message=f"{len(roles)} role(s) created successfully",
        data=[r.model_dump() for r in roles],
    )


@router.patch(
    "/roles/{role_id}",
    response_model=SuccessResponse[RoleResponse],
    responses={
        200: {"model": SuccessResponse, "description": "Role updated"},
        404: {"model": ErrorResponse, "description": "Role not found"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Partially update a role",
    description=(
        "Update one or more fields of an existing IAM role. "
        "Only provided fields are changed. "
        "If `i18n` is provided it is upserted for the resolved locale."
    ),
)
def patch_role(
    payload: RolePatchRequest,
    role_id: int = Path(..., description="IAM role id"),
    locale: str = Depends(get_core_locale),
    current_user_id: int = Depends(get_current_user_id),
):
    role = _role_service.patch_role(role_id, payload, locale, current_user_id)
    if role is None:
        raise NotFound(f"Role identifier {role_id} not found", identifier=str(role_id))
    return success_response(message="Role updated successfully", data=role.model_dump())


@router.delete(
    "/roles/{role_id}",
    response_model=SuccessResponse[dict],
    responses={
        200: {"model": SuccessResponse, "description": "Role deleted"},
        404: {"model": ErrorResponse, "description": "Role not found"},
        409: {"model": ErrorResponse, "description": "Cannot delete a system role"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Delete a role",
    description="Hard-delete an IAM role and its translations. System roles (`is_system_role=1`) cannot be deleted.",
)
def delete_role(
    role_id: int = Path(..., description="IAM role id"),
    current_user_id: int = Depends(get_current_user_id),
):
    success, reason = _role_service.delete_role(role_id)
    if reason == "not_found":
        raise NotFound(f"Role identifier {role_id} not found", identifier=str(role_id))
    if reason == "system_role":
        raise Forbidden("Cannot delete a system role")
    return success_response(
        message="Role deleted successfully",
        data={"role_id": role_id},
    )


@router.get("/resources", response_model=SuccessResponse)
def list_resources(
    view: str = Query("flat", description="Response shape: 'flat' for a plain list, 'group_by' to nest children under their parent resource. Pagination is disabled for 'group_by'."),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
    app_key: str = Depends(get_app_key),
    page: int = Query(1, ge=1, description="Page number (1-based); ignored when view=group_by"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page; omit to return all. Always disabled for view=group_by."),
    sort_field: Optional[str] = Query("display_order", description="Sort field: id, resource_code, parent_id, display_order"),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc"),
    search_by: Optional[str] = Query(
        None,
        description=f"Field to search in: {', '.join(_RESOURCE_SEARCH_FIELDS)}",
    ),
    search: Optional[str] = Query(
        None,
        description="Search term (case-insensitive partial match); applied to translated display `name` by default",
    ),
    is_dw_spec: Optional[bool] = Query(
        None,
        alias=QUERY_IS_DW_SPEC,
        description="Filter resources by datawarehouse-specific flag (true for DW-specific, false for general resources)",
    ),
):
    """
    Return the master list of IAM resources with translated names.

    Visibility is driven by `iam_resource_api` for the request `app_key` (any access_level):
    a resource is included when it has at least one active API row for this app_key and
    `is_role_assignable=1`. Structural ancestor resources are auto-injected so that the
    tree is always connected — ancestors appear even when they carry no APIs for this app_key
    (e.g. a parent "Reports" node whose children all have API rows).

    - `view=flat` (default): paginated flat list ordered by `sort_field`.
    - `view=group_by`: full tree — pagination disabled; ordered by `parent_id, display_order`.
      With `search`, the tree is built only from matching rows; parents that do not match may be
      omitted so matches can appear at the top level.
    - `sort_field` supports: id, resource_code, parent_id, display_order.
    - Results include `display_order` for UI positioning.
    - Each item includes `applicable_crud` (subset of C/R/U/D) from active `iam_resource_api` rows
      for this app_key. In `group_by` only PERMISSION-level APIs produce CRUD letters (injected
      ancestors may have `applicable_crud: []`).
    - The `app_key` on the returned resource row may differ from the request app_key for shared
      resources (e.g. a `DFA_DM`-owned resource exposed to `DFA_VIZ` via its API rows).
    - Optional `search` filters with a case-insensitive partial match. Omit `search_by` to search the
      translated display `name` for the request locale; set `search_by` to `name`, `resource_code`,
      or `description` to target that column explicitly.
    """
    if sort_order is not None and sort_order not in ("asc", "desc"):
        raise BadRequest("sort_order must be 'asc' or 'desc'")

    is_grouped = view == "group_by"
    sort_col = _RESOURCE_SORT_FIELDS.get(sort_field or "display_order", IamResource.display_order)
    sort_dir = desc if sort_order == "desc" else asc

    visible_ids = _role_service.listable_resource_ids_for_app(db, app_key)

    base_query = (
        db.query(IamResource, IamResourceI18n)
        .outerjoin(
            IamResourceI18n,
            (IamResourceI18n.master_id == IamResource.id) & (IamResourceI18n.locale == locale),
        )
        .filter(IamResource.id.in_(visible_ids), IamResource.is_active == 1)
    )

    if search and search.strip():
        if search_by and search_by.strip():
            field_key = search_by.strip().lower()
            if field_key not in _RESOURCE_SEARCH_FIELDS:
                raise BadRequest(
                    f"Invalid search_by field. Allowed: {list(_RESOURCE_SEARCH_FIELDS)}",
                )
            field = _RESOURCE_SEARCH_FIELDS[field_key]
            base_query = base_query.filter(field.ilike(f"%{search.strip()}%"))
        else:
            base_query = base_query.filter(IamResourceI18n.name.ilike(f"%{search.strip()}%"))

    # Filter by datawarehouse-specific flag if provided
    if is_dw_spec is not None:
        base_query = base_query.filter(IamResource.is_dw_spec == (1 if is_dw_spec else 0))

    total_count = base_query.count()

    # group_by always fetches all records; flat view respects page_size
    use_pagination = (not is_grouped) and (page_size is not None)
    effective_page_size = max(1, min(page_size, 1000)) if use_pagination else None

    if is_grouped:
        # Tree view: sort by parent first, then by display_order within siblings
        if sort_field == "display_order":
            query = base_query.order_by(asc(IamResource.parent_id), sort_dir(IamResource.display_order))
        else:
            query = base_query.order_by(asc(IamResource.parent_id), sort_dir(sort_col))
    else:
        query = base_query.order_by(sort_dir(sort_col))
        if use_pagination:
            query = query.offset((page - 1) * effective_page_size).limit(effective_page_size)

    rows = query.all()

    # For group_by view, only show CRUD operations that require permissions
    if is_grouped:
        applicable_map = _role_service.applicable_crud_by_resource_id(db, app_key, permission_only=True)
    else:
        applicable_map = _role_service.applicable_crud_by_resource_id(db, app_key)

    if is_grouped:
        nodes: dict[int, ResourceGroupedResponse] = {}
        for resource, i18n in rows:
            nodes[resource.id] = ResourceGroupedResponse(
                id=resource.id,
                parent_id=resource.parent_id,
                app_key=resource.app_key,
                resource_code=resource.resource_code,
                description=resource.description,
                is_active=resource.is_active,
                display_order=resource.display_order or 0,
                name=i18n.name if i18n else None,
                applicable_crud=applicable_map.get(resource.id, []),
                children=[],
            )
        data: list = []
        for node in nodes.values():
            if node.parent_id == 0 or node.parent_id not in nodes:
                data.append(node)
            else:
                nodes[node.parent_id].children.append(node)
        result_data = [r.model_dump() for r in data]
        # Pagination meta reflects the full flat count; tree is always one "page"
        meta = ListPaginationMetaSchema(
            total_count=total_count,
            count=total_count,
            page=1,
            page_size=total_count,
            total_pages=1 if total_count else 0,
        ).model_dump()
    else:
        flat = [
            ResourceResponse(
                id=resource.id,
                parent_id=resource.parent_id,
                app_key=resource.app_key,
                resource_code=resource.resource_code,
                description=resource.description,
                is_active=resource.is_active,
                display_order=resource.display_order or 0,
                name=i18n.name if i18n else None,
                applicable_crud=applicable_map.get(resource.id, []),
            )
            for resource, i18n in rows
        ]
        result_data = [r.model_dump() for r in flat]

        if use_pagination:
            meta_page = page
            meta_page_size = effective_page_size
            total_pages = (total_count + effective_page_size - 1) // effective_page_size if total_count else 0
        else:
            meta_page = 1
            meta_page_size = total_count
            total_pages = 1 if total_count else 0

        meta = ListPaginationMetaSchema(
            total_count=total_count,
            count=len(flat),
            page=meta_page,
            page_size=meta_page_size,
            total_pages=total_pages,
        ).model_dump()

    return success_response(message="Resources retrieved successfully", data=result_data, meta=meta)


@router.get(
    "/roles/{role_id}/resource-permissions",
    response_model=SuccessResponse[dict],
    responses={
        200: {"model": SuccessResponse, "description": "Role permissions returned"},
        404: {"model": ErrorResponse, "description": "Role not found"},
    },
    summary="Get role permissions (CRUD by resource)",
    description=(
        "Return resource_code + CRUD letters derived from iam_role_resource_api "
        "for the role. Super-admin roles receive all active resources with full CRUD."
    ),
)
def get_role_permissions(
    role_id: int = Path(..., description="IAM role id"),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
    app_key: str = Depends(get_app_key),
):
    error_type, _error_detail, resources = _role_service.get_role_permissions(
        role_id=role_id,
        db=db,
        app_key=app_key,
        locale=locale,
    )

    if error_type == "role_not_found":
        raise NotFound("Role not found", details={"role_id": role_id})

    return success_response(
        message="Role permissions retrieved successfully",
        data={
            "role_id": role_id,
            "resources": [r.model_dump() for r in resources],
        },
    )


@router.put(
    "/roles/{role_id}/resource-permissions",
    response_model=SuccessResponse[dict],
    responses={
        200: {"model": SuccessResponse, "description": "Role permissions saved"},
        400: {"model": ErrorResponse, "description": "Bad request"},
    },
    summary="Save role permissions (CRUD by resource)",
    description=(
        "Persist role permissions by resource_code + CRUD letters. "
        "Implementation expands CRUD to matching iam_resource_api rows and writes iam_role_resource_api."
    ),
)
def save_role_permissions(
    payload: SaveRolePermissionsRequest,
    role_id: int = Path(..., description="IAM role id"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Save permissions for a role.

    Request body format:
    - data.role.role_id: role id (should match path role_id)
    - data.resources[].resource_code: resource code
    - data.resources[].permissions: CRUD list (C/R/U/D)
    """
    error_type, error_detail, resources_received = _role_service.save_role_permissions(
        role_id=role_id,
        payload=payload,
        db=db,
        user_id=user_id,
    )

    if error_type == "role_not_found":
        raise NotFound("Role not found", details={"role_id": role_id})
    if error_type == "role_id_mismatch":
        raise BadRequest(
            "role_id in path does not match role_id in request body",
            details={"detail": error_detail},
        )
    if error_type == "resource_not_found":
        raise NotFound(
            f"Resource not found: {error_detail}",
            details={"resource_code": error_detail},
        )

    return success_response(
        message="Role permissions saved successfully",
        data={
            "role_id": role_id,
            "resources_received": resources_received,
        },
    )


@router.put(
    "/users/{user_id}/roles",
    response_model=SuccessResponse[dict],
    responses={
        200: {"model": SuccessResponse, "description": "User roles saved"},
        400: {"model": ErrorResponse, "description": "Bad request"},
        403: {"model": ErrorResponse, "description": "Forbidden (e.g. super-admin role in payload)"},
    },
    summary="Assign roles to a user",
    description=(
        "Persist user-role assignments into iam_user_role for a given app_key "
        "and optional dw_id / dashboard_id scope. "
        "When dashboard_id is set, only that dashboard's memberships are replaced "
        "(dashboard must exist and be in edit mode; "
        "use content_restrictions with resource_code=dash_user_areas for area ACL). "
        "When dashboard_id is omitted, only non-dashboard assignments are replaced."
    ),
)
def save_user_roles(
    payload: SaveUserRolesRequest,
    user_id: int = Path(..., description="IAM user id"),
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
):
    """
    Assign role(s) to a user for a specific app_key (+ optional dw_id / dashboard_id scope).

    Replace scope:
    - ``dashboard_id`` set → only ``iam_user_role`` rows for that dashboard
    - ``dashboard_id`` omitted → only rows with ``dashboard_id IS NULL``

    Request body format:
    - data.dw_id: optional DW scope (auto-filled from dashboard when dashboard_id set)
    - data.dashboard_id: optional dashboard scope; must exist and be mode=edit
    - data.user_id: user id (should match path user_id)
    - data.roles[].role_id: role id to assign (must belong to the request app_key)
    - data.roles[].content_restrictions: optional list of { resource_code, content_ids };
      for dashboards use resource_code=dash_user_areas with area_nid content_ids
    """
    error_type, error_detail, roles_received, roles_with_content = _role_service.save_user_roles(
        user_id=user_id,
        payload=payload,
        db=db,
        app_key=app_key,
        current_user_id=current_user_id,
    )

    if error_type == "user_not_found":
        raise NotFound("User not found", details={"user_id": user_id})
    if error_type == "user_id_mismatch":
        raise BadRequest(
            "user_id in path does not match user_id in request body",
            details={"detail": error_detail},
        )
    if error_type == "dashboard_not_found":
        raise NotFound(
            f"Dashboard not found: {error_detail}",
            details={"dashboard_id": error_detail},
        )
    if error_type == "dashboard_not_edit_mode":
        raise BadRequest(
            "dashboard_id must refer to an edit-mode dashboard",
            details={"detail": error_detail},
        )
    if error_type == "role_not_found":
        raise NotFound(
            f"Role not found: {error_detail}",
            details={"role_id": error_detail},
        )
    if error_type == "role_app_key_mismatch":
        raise BadRequest(
            "Role does not belong to the current application (app_key)",
            details={"detail": error_detail, "app_key": app_key},
        )
    if error_type == "resource_not_found":
        raise NotFound(
            f"Resource not found: {error_detail}",
            details={"resource_code": error_detail},
        )
    if error_type == "superadmin_forbidden":
        raise Forbidden(
            "Super-admin roles cannot be assigned through this API",
            details={"role_id": error_detail},
        )

    return success_response(
        message="User roles updated successfully",
        data={
            "user_id": user_id,
            "app_key": app_key,
            "dw_id": payload.data.dw_id,
            "dashboard_id": payload.data.dashboard_id,
            "roles_received": roles_received,
            "roles_with_content_restrictions": roles_with_content,
        },
    )
