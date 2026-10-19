"""SQLAlchemy models for mobile app publish tables (Admin DB)."""
from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.mysql import TINYINT

from apps.app_db.db.core import Base


class MobileAppPackage(Base):
    """Tracks versioned mobile data packages per warehouse."""

    __tablename__ = "mobile_app_package"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_id = Column(Integer, nullable=False)
    update_type = Column(String(10), nullable=False, default="data")
    update_version = Column(Integer, nullable=False)
    package_status = Column(
        Enum("building", "created", "published", "failed"),
        nullable=False,
        default="building",
    )
    comments = Column(String(500), nullable=True)
    map_level_id = Column(String(100), nullable=True)
    bg_job_id = Column(Integer, nullable=True)
    created_user_id = Column(Integer, nullable=True)
    published_user_id = Column(Integer, nullable=True)
    deleted_user_id = Column(Integer, nullable=True)
    is_deleted = Column(TINYINT(1), nullable=False, default=0)
    created = Column(DateTime, nullable=False, default=datetime.utcnow)
    published = Column(DateTime, nullable=True)
    deleted = Column(DateTime, nullable=True)


class MobileAppPackageDetail(Base):
    """Stores the user's form selections for each package."""

    __tablename__ = "mobile_app_package_detail"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    package_id = Column(Integer, ForeignKey("mobile_app_package.id", name="fk_mapd_package"), nullable=False)
    data_files = Column(Text, nullable=False)
    languages = Column(Text, nullable=False)
    ic_types = Column(Text, nullable=True)
    exclude_no_data = Column(TINYINT(1), nullable=False, default=0)
    exclude_time_periods = Column(Text, nullable=True)
