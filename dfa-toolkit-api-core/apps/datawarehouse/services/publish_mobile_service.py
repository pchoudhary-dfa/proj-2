"""CRUD service for mobile app package management (Admin DB)."""
import logging
import os
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from apps.app_db.models.mobile_app import MobileAppPackage, MobileAppPackageDetail
from apps.datawarehouse.schemas.publish_mobile import CreateMobilePackageRequest
from apps.datawarehouse.services.publish_mobile_builder import get_zip_path
from apps.shared.config.config import settings
from apps.shared.exceptions import BadRequest, Conflict, NotFound

logger = logging.getLogger(__name__)


class PublishMobileService:
    """Handles package lifecycle: create, list, publish, delete, get_update."""

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def validate_create_request(self, req: CreateMobilePackageRequest) -> None:
        """Raise BadRequest if any of the package creation rules are not met."""
        dc = req.database_content
        any_content = any([
            dc.source_data,
            dc.area_data,
            dc.indicator_data,
            dc.indicator_classification_data,
            dc.data_folders,
        ])
        if not any_content:
            raise BadRequest("At least one database content type must be selected")

        if (dc.indicator_data or dc.indicator_classification_data) and not req.indicator_classifications:
            raise BadRequest("At least one indicator classification type must be selected")

        if not req.languages:
            raise BadRequest("At least one language must be selected")

    def check_no_active_build(self, db: Session, dw_id: str) -> None:
        """Raise Conflict if an unpublished (building/created) package exists for this dw."""
        active = (
            db.query(MobileAppPackage)
            .filter(
                MobileAppPackage.dw_id == str(dw_id),
                MobileAppPackage.package_status.in_(["building", "created"]),
                MobileAppPackage.is_deleted == 0,
            )
            .first()
        )
        if active:
            raise Conflict(
                f"A package (id={active.id}) is already in '{active.package_status}' state. "
                "Publish or delete it before creating a new one."
            )

    def _next_version(self, db: Session, dw_id: str) -> int:
        from sqlalchemy import func
        result = (
            db.query(func.max(MobileAppPackage.update_version))
            .filter(MobileAppPackage.dw_id == str(dw_id))
            .scalar()
        )
        return (result or 0) + 1

    def create_package(
        self,
        db: Session,
        dw_id: str,
        req: CreateMobilePackageRequest,
        user_id: Optional[int] = None,
    ) -> MobileAppPackage:
        self.validate_create_request(req)
        self.check_no_active_build(db, dw_id)

        dc = req.database_content
        data_files_parts = []
        if dc.source_data:
            data_files_parts.append("source")
        if dc.area_data:
            data_files_parts.append("area")
        if dc.indicator_data:
            data_files_parts.append("indicator")
        if dc.indicator_classification_data:
            data_files_parts.append("ic")
        if dc.data_folders:
            data_files_parts.append("data_folders")

        version = self._next_version(db, dw_id)

        pkg = MobileAppPackage(
            dw_id=str(dw_id),
            update_type="data",
            update_version=version,
            package_status="building",
            comments=req.comments or None,
            map_level_id=req.map_level_id or None,
            created_user_id=user_id,
        )
        db.add(pkg)
        db.flush()

        detail = MobileAppPackageDetail(
            package_id=pkg.id,
            data_files=",".join(data_files_parts),
            languages=",".join(req.languages),
            ic_types=",".join(req.indicator_classifications) or None,
            exclude_no_data=1 if dc.exclude_no_data else 0,
            exclude_time_periods=",".join(req.exclude_time_periods) or None,
        )
        db.add(detail)
        db.commit()
        db.refresh(pkg)
        return pkg

    # ------------------------------------------------------------------
    # List / history
    # ------------------------------------------------------------------

    def list_packages(self, db: Session, dw_id: str) -> List[MobileAppPackage]:
        """Return all packages for history — including soft-deleted ones."""
        return (
            db.query(MobileAppPackage)
            .filter(MobileAppPackage.dw_id == str(dw_id))
            .order_by(MobileAppPackage.update_version.desc())
            .all()
        )

    def get_package(self, db: Session, dw_id: str, package_id: int) -> MobileAppPackage:
        pkg = (
            db.query(MobileAppPackage)
            .filter(
                MobileAppPackage.id == package_id,
                MobileAppPackage.dw_id == str(dw_id),
                MobileAppPackage.is_deleted == 0,
            )
            .first()
        )
        if not pkg:
            raise NotFound(f"Package {package_id} not found")
        return pkg

    def get_package_detail(self, db: Session, package_id: int) -> Optional[MobileAppPackageDetail]:
        return db.query(MobileAppPackageDetail).filter(MobileAppPackageDetail.package_id == package_id).first()

    # ------------------------------------------------------------------
    # Publish
    # ------------------------------------------------------------------

    def publish_package(
        self,
        db: Session,
        dw_id: str,
        package_id: int,
        user_id: Optional[int] = None,
    ) -> MobileAppPackage:
        pkg = self.get_package(db, dw_id, package_id)
        if pkg.package_status != "created":
            raise BadRequest(
                f"Package {package_id} has status '{pkg.package_status}'. Only 'created' packages can be published."
            )

        # Find all previously published packages and retire their ZIPs
        prev_published = (
            db.query(MobileAppPackage)
            .filter(
                MobileAppPackage.dw_id == str(dw_id),
                MobileAppPackage.package_status == "published",
                MobileAppPackage.is_deleted == 0,
            )
            .all()
        )
        for prev in prev_published:
            prev.is_deleted = 1
            prev.deleted_user_id = user_id
            prev.deleted = datetime.utcnow()
            zip_path = get_zip_path(dw_id, prev.update_version)
            if os.path.exists(zip_path):
                try:
                    os.remove(zip_path)
                    logger.info("Retired previous ZIP: %s", zip_path)
                except OSError as e:
                    logger.warning("Could not delete previous ZIP %s: %s", zip_path, e)

        pkg.package_status = "published"
        pkg.published_user_id = user_id
        pkg.published = datetime.utcnow()
        db.commit()
        db.refresh(pkg)
        return pkg

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete_package(
        self,
        db: Session,
        dw_id: str,
        package_id: int,
        user_id: Optional[int] = None,
    ) -> MobileAppPackage:
        pkg = self.get_package(db, dw_id, package_id)
        if pkg.package_status == "published":
            raise BadRequest("Published packages cannot be deleted.")
        # Soft-delete the DB record (history row preserved, status unchanged)
        pkg.is_deleted = 1
        pkg.deleted_user_id = user_id
        pkg.deleted = datetime.utcnow()
        db.commit()
        db.refresh(pkg)
        # Remove the ZIP file from disk
        zip_path = get_zip_path(dw_id, pkg.update_version)
        if os.path.exists(zip_path):
            try:
                os.remove(zip_path)
                logger.info("Deleted ZIP file: %s", zip_path)
            except OSError as e:
                logger.warning("Could not delete ZIP file %s: %s", zip_path, e)
        return pkg

    # ------------------------------------------------------------------
    # Mark as failed / update bg_job_id
    # ------------------------------------------------------------------

    def set_bg_job_id(self, db: Session, package_id: int, job_id: int) -> None:
        pkg = db.query(MobileAppPackage).filter(MobileAppPackage.id == package_id).first()
        if pkg:
            pkg.bg_job_id = job_id
            db.commit()

    def mark_failed(self, db: Session, package_id: int) -> None:
        pkg = db.query(MobileAppPackage).filter(MobileAppPackage.id == package_id).first()
        if pkg:
            pkg.package_status = "failed"
            db.commit()

    def mark_created(self, db: Session, package_id: int) -> None:
        pkg = db.query(MobileAppPackage).filter(MobileAppPackage.id == package_id).first()
        if pkg:
            pkg.package_status = "created"
            db.commit()

    # ------------------------------------------------------------------
    # GET /update — mobile client
    # ------------------------------------------------------------------

    def get_latest_published(self, db: Session, dw_id: str) -> Optional[MobileAppPackage]:
        return (
            db.query(MobileAppPackage)
            .filter(
                MobileAppPackage.dw_id == str(dw_id),
                MobileAppPackage.package_status == "published",
                MobileAppPackage.is_deleted == 0,
            )
            .order_by(MobileAppPackage.update_version.desc())
            .first()
        )

    def build_update_response(
        self,
        dw_id: str,
        pkg: Optional[MobileAppPackage],
        maplvlid: Optional[str] = None,
        api_base_url: Optional[str] = None,
    ) -> dict:
        """
        Returns the mobile-client response structure:
        {
            "ErrorStatus": false,
            "latestVersion": { "data": <version> },
            "url": "<download_url>",
            "map_url": "<dml_url>"   # only if DML configured and maplvlid provided
        }
        """
        if not pkg:
            return {"ErrorStatus": False, "latestVersion": {}, "url": None}

        download_path = f"/publish_for_mobile/files/{dw_id}/data/{pkg.update_version}.zip"
        if api_base_url:
            url = f"{api_base_url.rstrip('/')}{download_path}"
        else:
            url = download_path

        result: dict = {
            "ErrorStatus": False,
            "latestVersion": {"data": pkg.update_version},
            "url": url,
        }

        # maplvlid from query param takes priority over the stored pkg.map_level_id
        effective_map_level = maplvlid or pkg.map_level_id
        if effective_map_level:
            dml_base = (settings.DML_API_BASE_URL or "").rstrip("/")
            if dml_base:
                result["map_url"] = f"{dml_base}/getmap/{effective_map_level}"

        return result
