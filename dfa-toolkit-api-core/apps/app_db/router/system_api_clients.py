"""
System API Clients routes — CRUD for registered API client applications.
Access: PERMISSION (super-admin only, enforced by AccessControlMiddleware).
"""
import hashlib
import logging
import secrets
from datetime import datetime, timezone
from typing import List, Literal, Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from fastapi import APIRouter, Body, Depends, Path, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.app_db.dependencies import get_current_user_id
from apps.shared.config.config import settings
from apps.app_db.models.core import SystemApplicationClient
from apps.shared.config.dependencies import get_db
from apps.shared.exceptions import BadRequest, NotFound
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.response import success_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/system-api-clients", tags=["System API Clients"])


# ---------------------------------------------------------------------------
# Key-generation helpers
# ---------------------------------------------------------------------------

def _generate_rsa_keypair() -> tuple[str, str]:
    """Generate RSA-2048 key pair. Returns (public_key_pem, private_key_pem)."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return public_pem, private_pem


def _generate_secret() -> tuple[str, str]:
    """Generate a random secret. Returns (plain_secret, sha256_hash)."""
    plain = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(plain.encode()).hexdigest()
    return plain, hashed


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ApiClientResponse(BaseModel):
    id: int
    app_name: str
    app_key: str
    app_type: str
    api_key: str
    auth_method: str
    origin_url: Optional[str] = None
    description: Optional[str] = None
    owner_user_id: Optional[int] = None
    status: Optional[str] = None
    allowed_ips: Optional[str] = None
    requires_user_auth: int = 1
    created: Optional[datetime] = None
    modified: Optional[datetime] = None

    class Config:
        from_attributes = True


class ApiClientCreateRequest(BaseModel):
    app_name: str
    app_key: str
    app_type: Literal["FED", "EXTERNAL", "MOBILE"] = "FED"
    auth_method: Literal["SECRET", "SIGNATURE"] = "SIGNATURE"
    origin_url: Optional[str] = None
    description: Optional[str] = None
    owner_user_id: Optional[int] = None
    allowed_ips: Optional[str] = None
    requires_user_auth: int = 1


class ApiClientUpdateRequest(BaseModel):
    app_name: Optional[str] = None
    app_type: Optional[Literal["FED", "EXTERNAL", "MOBILE"]] = None
    origin_url: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["ACTIVE", "INACTIVE", "SUSPENDED"]] = None
    allowed_ips: Optional[str] = None
    requires_user_auth: Optional[int] = None


class ApiClientBulkUpdateItem(ApiClientUpdateRequest):
    app_client_id: int = Field(..., description="API client primary key (system_application_client.id)")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=SuccessResponse,
    responses={200: {"model": SuccessResponse}, 500: {"model": ErrorResponse}},
    summary="List system API clients",
    description=(
        "Return registered API client applications. "
        "Results are limited to ACTIVE clients by default unless `status` is set. "
        "Use `status=ALL` to return clients of every status. "
        "Optional `app_type` further narrows the list."
    ),
)
def list_api_clients(
    _: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    status_filter: Optional[Literal["ACTIVE", "INACTIVE", "SUSPENDED", "ALL"]] = Query(
        None,
        alias="status",
        description=(
            "Filter by client status; when omitted, only ACTIVE clients are returned. "
            "Use ALL to return clients of every status."
        ),
    ),
    app_type: Optional[Literal["FED", "EXTERNAL", "MOBILE"]] = Query(
        None,
        description="Filter by app type (omit for all types).",
    ),
):
    q = db.query(SystemApplicationClient)
    if status_filter != "ALL":
        effective_status = "ACTIVE" if status_filter is None else status_filter
        q = q.filter(SystemApplicationClient.status == effective_status)
    if app_type is not None:
        q = q.filter(SystemApplicationClient.app_type == app_type)
    clients = q.order_by(SystemApplicationClient.id).all()
    data = [ApiClientResponse.model_validate(c).model_dump(mode="json") for c in clients]
    return success_response(message="API clients retrieved successfully", data=data)


@router.post(
    "",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={201: {"model": SuccessResponse}, 500: {"model": ErrorResponse}},
    summary="Register new API client",
    description="Create a new registered API client. `api_key` is auto-generated.",
)
def create_api_client(
    payload: ApiClientCreateRequest,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Generate credentials based on auth_method
    client_public_key = None
    api_secret_hash = None
    response_credentials: dict = {}

    if payload.auth_method == "SIGNATURE":
        public_pem, private_pem = _generate_rsa_keypair()
        client_public_key = public_pem
        response_credentials = {"private_key": private_pem}
    else:  # SECRET
        plain_secret, hashed = _generate_secret()
        api_secret_hash = hashed
        response_credentials = {"api_secret": plain_secret}

    client = SystemApplicationClient(
        app_name=payload.app_name,
        app_key=payload.app_key,
        app_type=payload.app_type,
        api_key=secrets.token_urlsafe(32),
        auth_method=payload.auth_method,
        api_secret_hash=api_secret_hash,
        client_public_key=client_public_key,
        origin_url=payload.origin_url,
        description=payload.description,
        owner_user_id=current_user_id or settings.SYSTEM_USER_ID,
        status="ACTIVE",
        allowed_ips=payload.allowed_ips,
        requires_user_auth=payload.requires_user_auth,
        created=now,
        modified=now,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return success_response(
        message="API client registered successfully",
        data={"id": client.id, "api_key": client.api_key, **response_credentials},
    )


@router.patch(
    "",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse},
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Bulk update API clients",
    description=(
        "Partially update one or more API clients in a single request. "
        "Body is a JSON array; each item must include `app_client_id` and at least one "
        "other field. The request fails without committing if any ID is missing or duplicated."
    ),
)
def bulk_update_api_clients(
    payload: List[ApiClientBulkUpdateItem] = Body(..., min_length=1),
    _: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    client_ids = [item.app_client_id for item in payload]
    if len(client_ids) != len(set(client_ids)):
        raise BadRequest(
            "Duplicate app_client_id values in request",
            error_code="DUPLICATE_APP_CLIENT_ID",
        )

    item_updates: list[tuple[int, dict]] = []
    for item in payload:
        updates = item.model_dump(exclude_none=True, exclude={"app_client_id"})
        if not updates:
            raise BadRequest(
                f"No updatable fields provided for app_client_id {item.app_client_id}",
                error_code="EMPTY_UPDATE_ITEM",
            )
        item_updates.append((item.app_client_id, updates))

    unique_ids = list(dict.fromkeys(client_ids))
    clients = (
        db.query(SystemApplicationClient)
        .filter(SystemApplicationClient.id.in_(unique_ids))
        .all()
    )
    client_by_id = {c.id: c for c in clients}
    missing = [cid for cid in unique_ids if cid not in client_by_id]
    if missing:
        raise NotFound(
            f"API client(s) not found: {', '.join(str(i) for i in missing)}",
            identifier=",".join(str(i) for i in missing),
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    response_data: list[dict] = []
    for client_id, updates in item_updates:
        client = client_by_id[client_id]
        for field, value in updates.items():
            setattr(client, field, value)
        client.modified = now
        response_data.append({"app_client_id": client_id, **updates})

    db.commit()
    return success_response(
        message="API clients updated successfully",
        data=response_data,
    )


@router.get(
    "/{id}",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Get API client by ID",
)
def get_api_client(
    id: int = Path(..., description="API client ID"),
    _: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    client = db.query(SystemApplicationClient).filter(SystemApplicationClient.id == id).first()
    if not client:
        raise NotFound(f"API client {id} not found", identifier=str(id))
    return success_response(
        message="API client retrieved successfully",
        data=ApiClientResponse.model_validate(client).model_dump(mode="json"),
    )


@router.delete(
    "/{id}",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Delete API client",
)
def delete_api_client(
    id: int = Path(..., description="API client ID"),
    _: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    client = db.query(SystemApplicationClient).filter(SystemApplicationClient.id == id).first()
    if not client:
        raise NotFound(f"API client {id} not found", identifier=str(id))
    db.delete(client)
    db.commit()
    return success_response(message=f"API client {id} deleted successfully", data=None)


@router.post(
    "/{id}/rotate-api-key",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Rotate API client key",
    description="Generate a new `api_key` for the client and invalidate the old one immediately.",
)
def rotate_api_key(
    id: int = Path(..., description="API client ID"),
    _: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    client = db.query(SystemApplicationClient).filter(SystemApplicationClient.id == id).first()
    if not client:
        raise NotFound(f"API client {id} not found", identifier=str(id))

    client.api_key = secrets.token_urlsafe(32)
    client.modified = datetime.now(timezone.utc).replace(tzinfo=None)

    # Rotate credentials based on auth_method
    response_credentials: dict = {}
    if client.auth_method == "SIGNATURE":
        public_pem, private_pem = _generate_rsa_keypair()
        client.client_public_key = public_pem
        response_credentials = {"private_key": private_pem}
    else:  # SECRET
        plain_secret, hashed = _generate_secret()
        client.api_secret_hash = hashed
        response_credentials = {"api_secret": plain_secret}

    db.commit()
    db.refresh(client)
    return success_response(
        message="API key rotated successfully",
        data={"id": client.id, "api_key": client.api_key, **response_credentials},
    )
