"""
Mobile app publish router.

Admin endpoints (PERMISSION) — manage package lifecycle.
Public endpoints — used by mobile clients to get download URL.
"""
import logging
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, Path, Query, Request, status
from fastapi.responses import FileResponse, JSONResponse

from apps.app_db.db.core import SessionLocal
from apps.app_db.dependencies import get_current_user_id
from apps.datawarehouse.schemas.publish_mobile import (
    CreateMobilePackageRequest,
    MobilePackageSchema,
    MobilePackageDetailSchema,
    MobilePackageStatusSchema,
    MobileUpdateResponseData,
)
from apps.datawarehouse.services.publish_mobile_service import PublishMobileService
from apps.datawarehouse.services.publish_mobile_builder import get_zip_path
from apps.shared.exceptions import NotFound
from apps.shared.services.bg_job_dispatch import (
    dispatch_bg_job,
    JOB_TYPE_BUILD_MOBILE_PACKAGE,
)
from apps.shared.utils.response import success_response, created_response, no_content_response

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Publish Mobile App"])
_service = PublishMobileService()

DW_ID_PATH = Path(..., description="Data warehouse identifier")
PKG_ID_PATH = Path(..., alias="package_id", description="Package ID")


def _get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _pkg_to_schema(pkg, detail=None) -> dict:
    detail_data = None
    if detail:
        detail_data = MobilePackageDetailSchema.model_validate(detail).model_dump(exclude_none=True)
    return MobilePackageSchema(
        id=pkg.id,
        update_version=pkg.update_version,
        package_status=pkg.package_status,
        comments=pkg.comments,
        map_level_id=pkg.map_level_id,
        is_deleted=bool(pkg.is_deleted),
        created_on=pkg.created,
        published_on=pkg.published,
        deleted_on=pkg.deleted,
        detail=MobilePackageDetailSchema.model_validate(detail) if detail else None,
    ).model_dump(exclude_none=True)


# ---------------------------------------------------------------------------
# POST /dw/{dw_id}/publish-mobile/packages
# ---------------------------------------------------------------------------
@router.post(
    "/dw/{dw_id}/publish-mobile/packages",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new mobile data package",
)
def create_package(
    dw_id: str = DW_ID_PATH,
    body: CreateMobilePackageRequest = ...,
    db=Depends(_get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    pkg = _service.create_package(db, dw_id=dw_id, req=body, user_id=current_user_id)

    detail = _service.get_package_detail(db, pkg.id)
    dc = body.database_content

    job_payload = {
        "dw_id": dw_id,
        "package_id": pkg.id,
        "update_version": pkg.update_version,
        "data_files": detail.data_files if detail else "",
        "languages": detail.languages if detail else "",
        "ic_types": detail.ic_types if detail else None,
        "exclude_no_data": bool(dc.exclude_no_data),
        "exclude_time_periods": detail.exclude_time_periods if detail else None,
    }

    result = dispatch_bg_job(
        db=db,
        job_type=JOB_TYPE_BUILD_MOBILE_PACKAGE,
        payload=job_payload,
        dw_id=str(dw_id),
    )

    job_id = result.db_job_id or None
    if job_id:
        _service.set_bg_job_id(db, pkg.id, int(job_id))

    return created_response(
        message="Package queued for building",
        data=_pkg_to_schema(pkg, detail),
    )


# ---------------------------------------------------------------------------
# GET /dw/{dw_id}/publish-mobile/packages
# ---------------------------------------------------------------------------
@router.get(
    "/dw/{dw_id}/publish-mobile/packages",
    summary="List mobile package history",
)
def list_packages(
    dw_id: str = DW_ID_PATH,
    db=Depends(_get_db),
    _current_user_id: int = Depends(get_current_user_id),
):
    pkgs = _service.list_packages(db, dw_id=dw_id)
    result = []
    for pkg in pkgs:
        detail = _service.get_package_detail(db, pkg.id)
        result.append(_pkg_to_schema(pkg, detail))
    return success_response("OK", data=result)


# ---------------------------------------------------------------------------
# GET /dw/{dw_id}/publish-mobile/packages/{package_id}/status
# ---------------------------------------------------------------------------
@router.get(
    "/dw/{dw_id}/publish-mobile/packages/{package_id}/status",
    summary="Poll build status of a package",
)
def get_package_status(
    dw_id: str = DW_ID_PATH,
    package_id: int = PKG_ID_PATH,
    db=Depends(_get_db),
    _current_user_id: int = Depends(get_current_user_id),
):
    pkg = _service.get_package(db, dw_id=dw_id, package_id=package_id)
    return success_response(
        "OK", data=MobilePackageStatusSchema.model_validate(pkg).model_dump()
    )


# ---------------------------------------------------------------------------
# POST /dw/{dw_id}/publish-mobile/packages/{package_id}/publish
# ---------------------------------------------------------------------------
@router.post(
    "/dw/{dw_id}/publish-mobile/packages/{package_id}/publish",
    summary="Publish a built package (makes it visible to mobile clients)",
)
def publish_package(
    dw_id: str = DW_ID_PATH,
    package_id: int = PKG_ID_PATH,
    db=Depends(_get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    pkg = _service.publish_package(db, dw_id=dw_id, package_id=package_id, user_id=current_user_id)
    return success_response(message="Package published", data=_pkg_to_schema(pkg))


# ---------------------------------------------------------------------------
# DELETE /dw/{dw_id}/publish-mobile/packages/{package_id}
# ---------------------------------------------------------------------------
@router.delete(
    "/dw/{dw_id}/publish-mobile/packages/{package_id}",
    summary="Soft-delete an unpublished package",
)
def delete_package(
    dw_id: str = DW_ID_PATH,
    package_id: int = PKG_ID_PATH,
    db=Depends(_get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    _service.delete_package(db, dw_id=dw_id, package_id=package_id, user_id=current_user_id)
    return no_content_response()


# ---------------------------------------------------------------------------
# GET /publish_for_mobile/publish/getUpdate?dbid=  (PUBLIC — mobile client)
# ---------------------------------------------------------------------------
@router.get(
    "/publish_for_mobile/publish/getUpdate",
    summary="Get latest published version URL (for mobile clients)",
)
def get_update(
    request: Request,
    dbid: str = Query(..., description="Data warehouse identifier"),
    maplvlid: Optional[str] = Query(None, description="Map level ID for DML map URL"),
    db=Depends(_get_db),
):
    pkg = _service.get_latest_published(db, dw_id=dbid)
    api_base_url = str(request.base_url).rstrip("/")
    data = _service.build_update_response(
        dw_id=dbid,
        pkg=pkg,
        maplvlid=maplvlid,
        api_base_url=api_base_url,
    )
    # Return raw mobile-client structure — no success_response wrapper
    return JSONResponse(content=data)


# ---------------------------------------------------------------------------
# GET /publish_for_mobile/files/{dbid}/data/{version}.zip  (PUBLIC — download)
# ---------------------------------------------------------------------------
@router.get(
    "/publish_for_mobile/files/{dbid}/data/{version}.zip",
    summary="Download a published ZIP package",
)
def download_package(
    dbid: str = Path(..., description="Data warehouse identifier"),
    version: int = Path(..., description="Package version number"),
    db=Depends(_get_db),
):
    zip_path = get_zip_path(dbid, version)
    if not os.path.exists(zip_path):
        raise NotFound(f"Package file for version {version} not found")

    filename = f"{version}.zip"
    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=filename,
    )
