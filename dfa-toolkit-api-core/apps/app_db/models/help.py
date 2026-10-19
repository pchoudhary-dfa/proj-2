"""
SQLAlchemy models for DFA Help Service tables.
Stores help content adaptations, keys (hierarchical), and per-locale translations.
"""
from datetime import datetime
from sqlalchemy import (
    Column, DateTime, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint,
)
from apps.app_db.db.core import Base


class DfaHelpAdaptation(Base):
    """Top-level help namespace (e.g. 'DM' for DataManager, 'VZ' for Visualizer)."""

    __tablename__ = "dfahelp_adaptation"
    __table_args__ = (
        UniqueConstraint("code", name="uq_dfahelp_adaptation_code"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), nullable=False, comment="Short unique adaptation code")
    name = Column(String(255), nullable=False, comment="Human-readable adaptation name")
    desc = Column(Text, nullable=True, comment="Adaptation description")
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, comment="Soft-delete timestamp")


class DfaHelpAdaptationKey(Base):
    """
    Hierarchical help key node. Each key belongs to an adaptation and optionally
    has a parent key (tree structure). The `key` column stores the human-readable
    identifier used by the frontend (e.g. 'DM-DATAWAREHOUSE-INDICATORS').
    """

    __tablename__ = "dfahelp_adaptation_key"
    __table_args__ = (
        Index("ix_dfahelp_key_adaptation", "adaptation_id"),
        Index("ix_dfahelp_key_parent", "parent_id"),
        Index("ix_dfahelp_key_key", "key"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    adaptation_id = Column(
        Integer,
        ForeignKey("dfahelp_adaptation.id", ondelete="CASCADE"),
        nullable=False,
    )
    key = Column(String(255), nullable=True, comment="Unique string key used by frontend to fetch help")
    code = Column(String(255), nullable=True, comment="Short code for tree display")
    related_keys = Column(Text, nullable=True, comment="JSON array of related key strings")
    parent_id = Column(
        Integer,
        ForeignKey("dfahelp_adaptation_key.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, comment="Soft-delete timestamp")


class DfaHelpAdaptationKeyI18n(Base):
    """Per-locale title, description, and purpose for a help key."""

    __tablename__ = "dfahelp_adaptation_key_i18n"
    __table_args__ = (
        UniqueConstraint("adaptation_key_id", "locale", name="uq_dfahelp_i18n_key_locale"),
        Index("ix_dfahelp_i18n_key", "adaptation_key_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    adaptation_key_id = Column(
        Integer,
        ForeignKey("dfahelp_adaptation_key.id", ondelete="CASCADE"),
        nullable=False,
    )
    locale = Column(String(3), nullable=False, comment="Language code: en, fr, es, ar, pt, ru")
    title = Column(String(255), nullable=True)
    desc = Column(Text, nullable=True, comment="Rich HTML description")
    purpose = Column(Text, nullable=True, comment="Rich HTML purpose/usage guidance")
