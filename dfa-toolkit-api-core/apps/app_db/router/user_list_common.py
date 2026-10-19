"""
Shared validation and response assembly for user list endpoints.
"""
from typing import Any, Callable, Dict, List, Optional, Tuple

from apps.app_db.schemas.users import RoleMasterItem, UserListItem
from apps.app_db.services import user_service
from apps.shared.exceptions import BadRequest
from apps.shared.schemas.response import SuccessResponse
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import success_response

VALID_SORT_FIELDS = frozenset(
    {"id", "username", "first_name", "email", "status", "created", "last_loggedin_on"}
)


def normalize_role_codes(role_code: Optional[List[str]]) -> Optional[List[str]]:
    if not role_code:
        return None
    normalized: List[str] = []
    for item in role_code:
        for token in item.split(","):
            t = token.strip()
            if t:
                normalized.append(t)
    return sorted(set(normalized)) or None


def validate_user_list_params(
    *,
    sort_field: Optional[str],
    sort_order: Optional[str],
    view: str,
    search: Optional[str],
    search_by: Optional[str],
) -> Tuple[str, str, bool, Optional[int]]:
    """Validate list query params. Returns (search_trim, search_by_trim, is_grouped, effective_page_size placeholder)."""
    if sort_order not in ("asc", "desc"):
        raise BadRequest("sort_order must be 'asc' or 'desc'")
    if sort_field and sort_field not in VALID_SORT_FIELDS:
        raise BadRequest(f"sort_field must be one of: {', '.join(sorted(VALID_SORT_FIELDS))}")
    if view not in ("flat", "group_by"):
        raise BadRequest("view must be 'flat' or 'group_by'")

    search_trim = search.strip() if search else ""
    search_by_trim = search_by.strip() if search_by else ""
    if search_by_trim and not search_trim:
        raise BadRequest("search is required when search_by is set")
    if search_trim and search_by_trim:
        sk = search_by_trim.lower()
        if sk not in user_service.USER_LIST_SEARCH_BY_FIELDS:
            raise BadRequest(
                "search_by must be one of: "
                f"{', '.join(sorted(user_service.USER_LIST_SEARCH_BY_FIELDS))}",
            )

    is_grouped = view == "group_by"
    return search_trim, search_by_trim, is_grouped, None


def resolve_effective_page_size(is_grouped: bool, page_size: Optional[int]) -> Optional[int]:
    """group_by always fetches all records so pagination is ignored."""
    return None if is_grouped else page_size


def build_user_list_response(
    *,
    items: List[UserListItem],
    total_count: int,
    roles_meta: Dict[str, RoleMasterItem],
    total_count_unfiltered_raw: Optional[int],
    page: int,
    page_size: Optional[int],
    search_trim: str,
    role_codes: Optional[List[str]],
    view: str,
    is_grouped: bool,
    effective_page_size: Optional[int],
    success_message: str = "Users retrieved successfully",
) -> SuccessResponse:
    use_pagination = effective_page_size is not None

    if is_grouped:
        meta_page, meta_page_size = 1, total_count
        total_pages = 1 if total_count else 0
    elif use_pagination:
        meta_page = page
        meta_page_size = effective_page_size
        total_pages = (
            (total_count + effective_page_size - 1) // effective_page_size if total_count else 0
        )
    else:
        meta_page, meta_page_size = 1, total_count
        total_pages = 1 if total_count else 0

    has_list_filters = bool(search_trim) or bool(role_codes)
    pagination_meta = build_list_pagination_meta(
        total_count=total_count,
        count=total_count if is_grouped else len(items),
        page=meta_page,
        page_size=meta_page_size,
        total_pages=total_pages,
        total_count_unfiltered=resolve_unfiltered_total(
            total_count,
            total_count_unfiltered_raw,
            has_list_filters=has_list_filters,
        ),
    )

    pagination_meta["roles"] = {
        rc: role.model_dump(mode="json")
        for rc, role in roles_meta.items()
    }

    if is_grouped:
        groups = user_service.group_users_by_role(items, roles_meta)
        data: Any = [
            {g.role_code: {"users": [u.model_dump(mode="json") for u in g.users]}}
            for g in groups
        ]
        pagination_meta["count"] = sum(len(g.users) for g in groups)
    else:
        data = [item.model_dump(mode="json") for item in items]

    return success_response(
        message=success_message,
        data=data,
        meta=pagination_meta,
    )


def fetch_and_build_user_list_response(
    *,
    list_fn: Callable[..., Tuple[List[UserListItem], int, Dict[str, RoleMasterItem], Optional[int]]],
    list_kwargs: Dict[str, Any],
    page: int,
    page_size: Optional[int],
    sort_field: Optional[str],
    sort_order: Optional[str],
    search: Optional[str],
    search_by: Optional[str],
    role_code: Optional[List[str]],
    view: str,
    success_message: str = "Users retrieved successfully",
) -> SuccessResponse:
    search_trim, search_by_trim, is_grouped, _ = validate_user_list_params(
        sort_field=sort_field,
        sort_order=sort_order,
        view=view,
        search=search,
        search_by=search_by,
    )
    effective_page_size = resolve_effective_page_size(is_grouped, page_size)
    role_codes = normalize_role_codes(role_code)

    items, total_count, roles_meta, total_count_unfiltered_raw = list_fn(
        page=page,
        page_size=effective_page_size,
        sort_field=sort_field or "id",
        sort_order=sort_order or "asc",
        search=search,
        search_by=search_by if search_by_trim else None,
        role_codes=role_codes,
        **list_kwargs,
    )

    return build_user_list_response(
        items=items,
        total_count=total_count,
        roles_meta=roles_meta,
        total_count_unfiltered_raw=total_count_unfiltered_raw,
        page=page,
        page_size=page_size,
        search_trim=search_trim,
        role_codes=role_codes,
        view=view,
        is_grouped=is_grouped,
        effective_page_size=effective_page_size,
        success_message=success_message,
    )
