"""
Warehouse member list — users with at least one role assigned for a data warehouse.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from apps.app_db.dependencies import get_app_key, get_core_locale, get_current_user_id
from apps.app_db.router.user_list_common import fetch_and_build_user_list_response
from apps.app_db.services import user_service
from apps.datawarehouse.constants import PATH_DW_ID
from apps.datawarehouse.db.datawarehouse import validate_dw_id
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.config.dependencies import get_db
from apps.shared.schemas.response import ErrorResponse, SuccessResponse

router = APIRouter(
    tags=["System Datawarehouses"],
    prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/users",
)


@router.get(
    "",
    summary="List warehouse members",
    description=(
        "Return users who have at least one role assigned for the given warehouse "
        "(`app_key` + `dw_id` from path), scoped to the calling client's **app_key**.\n\n"
        "Each user record includes a `roles` array listing role codes assigned for this warehouse. "
        "A `role_code`-keyed role master list is returned in `meta.roles`.\n\n"
        "Use `view=group_by` to receive users nested under their role groups instead of a "
        "flat list. A user with multiple roles appears under each role group.\n\n"
        "Use the `search` parameter for a case-insensitive partial match. Omit `search_by` to search "
        "across username, email, first_name, and role (code or display name) together; set `search_by` "
        "to one of username, email, first_name, last_name, phone, organisation, location, status "
        "(0 or 1), or role_code to restrict the search to that column only.\n\n"
        "Omit `page_size` to return all records without pagination."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse, "description": "Warehouse members retrieved"},
        400: {"model": ErrorResponse, "description": "Bad request"},
        404: {"model": ErrorResponse, "description": "Data warehouse not found"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
def list_dw_users(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    _current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page; omit to return all"),
    sort_field: Optional[str] = Query(
        "id",
        description="Sort field: id, username, first_name, email, status, created, last_loggedin_on",
    ),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc"),
    search: Optional[str] = Query(
        None,
        description="Case-insensitive partial match; without search_by, matches username, email, first_name, or role (code/name)",
    ),
    search_by: Optional[str] = Query(
        None,
        description=(
            "Column to search: username, email, first_name, last_name, phone, organisation, "
            "location, status (0 or 1), or role_code. Requires search. Omit to search default fields."
        ),
    ),
    role_code: Optional[List[str]] = Query(
        None,
        description="Filter by role_code. Supports single or multiple values (repeat query param or comma-separated values).",
    ),
    view: str = Query(
        "flat",
        description="Response shape: 'flat' for a plain list, 'group_by' to nest users under their role. Pagination is disabled for 'group_by'.",
    ),
):
    return fetch_and_build_user_list_response(
        list_fn=user_service.list_dw_members,
        list_kwargs={
            "db": db,
            "app_key": app_key,
            "locale": locale,
            "dw_id": int(dw_id),
        },
        page=page,
        page_size=page_size,
        sort_field=sort_field,
        sort_order=sort_order,
        search=search,
        search_by=search_by,
        role_code=role_code,
        view=view,
        success_message="Warehouse members retrieved successfully",
    )
