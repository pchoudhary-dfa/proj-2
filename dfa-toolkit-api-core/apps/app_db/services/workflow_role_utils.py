"""
Utility functions for deriving workflow role type (DATA_ENTRY / DATA_REVIEW)
by inspecting iam_role_resource_api → iam_resource linkage.

Also provides the canonical mapping between assignment scope_type values and
the resource_code stored in iam_user_role_content.

Usage:
    from apps.app_db.services.workflow_role_utils import (
        get_role_type, get_roles_by_type, scope_type_to_resource_code,
    )

    role_type = get_role_type(role_id=5, app_key="dfa_dm", db=db)
    # Returns "DATA_ENTRY", "DATA_REVIEW", or None

    de_roles = get_roles_by_type("DATA_ENTRY", app_key="dfa_dm", db=db)
    # Returns list of (IamRole, resource_code) tuples

    rc = scope_type_to_resource_code("AREA")
    # Returns "dm_dw_area"
"""
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from apps.app_db.models.core import IamResource, IamRole, IamRoleResourceApi

# Resource codes that identify role type
_DATA_ENTRY_CODE = "dm_dw_data_entry"
_DATA_REVIEW_CODE = "dm_dw_data_review"

_ROLE_TYPE_MAP = {
    _DATA_ENTRY_CODE: "DATA_ENTRY",
    _DATA_REVIEW_CODE: "DATA_REVIEW",
}

# Mapping: workflow assignment scope_type → iam_user_role_content.resource_code
# Kept here so it can be imported by both the schema and the router,
# and extended when new scope types are introduced.
SCOPE_TYPE_RESOURCE_CODE_MAP: Dict[str, str] = {
    "AREA": "dm_dw_area",
    "INDICATOR": "dm_dw_indicator",
    "INDICATOR_CLASSIFICATION": "dm_dw_indicator_classification",
    "CLASSIFICATION": "dm_dw_indicator_classification",
    "TIMEPERIOD": "dm_dw_timeperiod",
}

# Reverse map: resource_code → scope_type (canonical form, first match wins)
_RESOURCE_CODE_SCOPE_TYPE_MAP: Dict[str, str] = {
    "dm_dw_area": "AREA",
    "dm_dw_indicator": "INDICATOR",
    "dm_dw_indicator_classification": "INDICATOR_CLASSIFICATION",
    "dm_dw_timeperiod": "TIMEPERIOD",
}


def scope_type_to_resource_code(scope_type: str) -> Optional[str]:
    """Return the resource_code for a given scope_type, or None if unknown."""
    return SCOPE_TYPE_RESOURCE_CODE_MAP.get(scope_type)


def resource_code_to_scope_type(resource_code: str) -> Optional[str]:
    """Return the canonical scope_type for a given resource_code, or None if unknown."""
    return _RESOURCE_CODE_SCOPE_TYPE_MAP.get(resource_code)


def get_role_type(role_id: int, app_key: str, db: Session) -> Optional[str]:
    """
    Return 'DATA_ENTRY', 'DATA_REVIEW', or None for the given role.

    Derives type by checking whether the role has iam_role_resource_api access
    to dm_dw_data_entry or dm_dw_data_review.
    """
    row = (
        db.query(IamResource.resource_code)
        .join(IamRoleResourceApi, IamRoleResourceApi.resource_id == IamResource.id)
        .filter(
            IamRoleResourceApi.role_id == role_id,
            IamResource.resource_code.in_([_DATA_ENTRY_CODE, _DATA_REVIEW_CODE]),
            IamResource.app_key == app_key,
        )
        .first()
    )
    if not row:
        return None
    return _ROLE_TYPE_MAP.get(row.resource_code)


def get_roles_by_type(
    role_type: str,
    app_key: str,
    db: Session,
) -> List[Tuple[IamRole, str]]:
    """
    Return all active roles of the given type ('DATA_ENTRY' or 'DATA_REVIEW').

    Returns a list of (IamRole, resource_code) tuples.
    """
    resource_code = _DATA_ENTRY_CODE if role_type == "DATA_ENTRY" else _DATA_REVIEW_CODE
    rows = (
        db.query(IamRole, IamResource.resource_code)
        .join(IamRoleResourceApi, IamRoleResourceApi.role_id == IamRole.id)
        .join(IamResource, IamResource.id == IamRoleResourceApi.resource_id)
        .filter(
            IamResource.resource_code == resource_code,
            IamResource.app_key == app_key,
            IamRole.app_key == app_key,
        )
        .all()
    )
    return [(role, rc) for role, rc in rows]
