"""
SQLAlchemy models for data warehouse tables.
These models map to EXISTING database tables in data warehouses and are used for ORM queries only.
They do NOT create tables or trigger migrations - tables are created via SQL scripts.

Locale entities (Indicator, Area, Unit, etc.): each class has __table_prefix__ and is callable.
Call with locale to get the ORM model for that table, e.g. Indicator("en") -> ut_indicator_en.
"""
import threading
from sqlalchemy import Column, Integer, SmallInteger, String, Text, Boolean, Float, ForeignKey, Index, DateTime, Numeric, UniqueConstraint
from sqlalchemy.orm import Session
from apps.app_db.db.core import Base
from typing import Type, Dict, Tuple

# Registry: (base_name, locale) -> cached built model class.
_LOCALE_REGISTRY: Dict[Tuple[str, str], Type[Base]] = {}
# Lazy name->mixin map (populated on first Mixin(locale) call) for get_locale_model(base_name, locale).
_MIXIN_BY_NAME: Dict[str, type] = {}
# Lock for get-or-build of locale model classes (avoids duplicate build under concurrency).
_LOCALE_REGISTRY_LOCK = threading.Lock()


def _get_mixin_mapper_attrs(mixin_class: type) -> dict:
    """Copy mapper-relevant attributes (cloning Column objects) for building a Base-only model."""
    from sqlalchemy import Column
    skip = {"__table_prefix__", "__module__", "__doc__", "__qualname__"}
    result = {}
    for k, v in mixin_class.__dict__.items():
        if k in skip or (k.startswith("__") and k.endswith("__")):
            continue
        # Clone Column objects to avoid "already assigned" errors
        if isinstance(v, Column):
            result[k] = v._copy()  # Create a new Column instance
        else:
            result[k] = v
    return result


def _build_locale_model_class(mixin_class: type, locale: str) -> Type[Base]:
    """
    Build (and cache) the locale-specific model class. Table prefix from mixin __table_prefix__;
    full table name = __table_prefix__ + "_" + locale.
    Inherits only from Base and copies mixin attributes to avoid metaclass conflict.
    Locale validation is intentionally omitted here; it is enforced at the dependency layer
    (get_dw_language_code) against the DW's ut_language table.
    """
    base_name = mixin_class.__name__
    table_prefix = getattr(mixin_class, "__table_prefix__", None)
    if not table_prefix:
        raise ValueError(f"Locale class {base_name} has no __table_prefix__")
    cache_key = (base_name, locale)
    if cache_key in _LOCALE_REGISTRY:
        return _LOCALE_REGISTRY[cache_key]
    class_name = f"{base_name}{locale.capitalize()}"
    tablename = f"{table_prefix}_{locale}"
    attrs = {
        **_get_mixin_mapper_attrs(mixin_class),
        "__tablename__": tablename,
        "__table_args__": {"extend_existing": True},
    }
    model_class = type(class_name, (Base,), attrs)
    _LOCALE_REGISTRY[cache_key] = model_class
    return model_class


class _LocaleModelMeta(type):
    """Metaclass for locale mixins: calling the class with a locale returns the ORM model. Plain type (not type(Base)) so mixins are not treated as declarative base."""

    def __call__(cls, *args, **kwargs):
        if (
            len(args) == 1
            and not kwargs
            and isinstance(args[0], str)
            and args[0]
            and hasattr(cls, "__table_prefix__")
        ):
            _MIXIN_BY_NAME[cls.__name__] = cls
            return _build_locale_model_class(cls, args[0])
        return super().__call__(*args, **kwargs)


# --- Locale entities: class name = entity, __table_prefix__ in class, callable: Indicator("en") ---
class Indicator(metaclass=_LocaleModelMeta):
    """Locale-specific indicator tables (ut_indicator_<locale>). Call: Indicator("en")."""
    __table_prefix__ = "ut_indicator"
    __locale_fields__ = frozenset({"indicator_name", "indicator_info", "short_name", "keywords"})
    _audit_enabled = True
    _audit_module = "indicator"
    _audit_nid_field = "indicator_nid"
    _audit_gid_field = "indicator_gid"
    indicator_nid = Column(Integer, primary_key=True, nullable=False)
    indicator_name = Column(String(255), nullable=False)
    indicator_gid = Column(String(60), nullable=True, index=True)
    indicator_info = Column(Text, nullable=True)
    indicator_global = Column(Boolean, default=False, nullable=False)
    short_name = Column(String(50), nullable=True)
    keywords = Column(String(255), nullable=True)
    indicator_order = Column(Float, nullable=True)
    data_exist = Column(Boolean, default=False)
    highisgood = Column(Boolean, default=False)


class SubgroupVal(metaclass=_LocaleModelMeta):
    """Locale-specific subgroup_vals tables (ut_subgroup_vals_<locale>). Call: SubgroupVal("en")."""
    __table_prefix__ = "ut_subgroup_vals"
    __locale_fields__ = frozenset({"subgroup_val"})
    _audit_enabled = True
    _audit_module = "subgroup_val"
    _audit_nid_field = "subgroup_val_nid"
    _audit_gid_field = "subgroup_val_gid"
    subgroup_val_nid = Column(Integer, primary_key=True, nullable=False)
    subgroup_val = Column(String(255), nullable=True)
    subgroup_val_gid = Column(String(50), nullable=True, index=True)
    subgroup_val_global = Column(Boolean, default=False, nullable=True)
    subgroup_val_order = Column(Integer, nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)


class IndicatorClassification(metaclass=_LocaleModelMeta):
    """Locale-specific indicator_classifications tables (ut_indicator_classifications_<locale>). Call: IndicatorClassification("en")."""
    __table_prefix__ = "ut_indicator_classifications"
    __locale_fields__ = frozenset({"ic_name", "ic_short_name", "ic_info"})
    _audit_enabled = True
    _audit_module = "indicator_classification"
    _audit_nid_field = "ic_nid"
    _audit_gid_field = "ic_gid"
    ic_nid = Column(Integer, primary_key=True, nullable=False)
    ic_parent_nid = Column(Integer, nullable=False, default=0)
    ic_gid = Column(String(60), nullable=False, index=True)
    ic_name = Column(Text, nullable=False)
    ic_global = Column(Boolean, default=False, nullable=False)
    ic_info = Column(Text, nullable=True)
    ic_type = Column(String(2), nullable=False)
    ic_short_name = Column(String(50), nullable=True)
    publisher = Column(String(100), nullable=True)
    title = Column(Text, nullable=True)
    diyear = Column(String(10), nullable=True)
    sourcelink1 = Column(String(255), nullable=True)
    sourcelink2 = Column(String(255), nullable=True)
    ic_order = Column(Integer, nullable=True)
    isbn = Column(String(255), nullable=True)
    nature = Column(String(255), nullable=True)


class MetadataReport(metaclass=_LocaleModelMeta):
    """Locale-specific metadatareport tables (ut_metadatareport_<locale>). Call: MetadataReport("en")."""
    __table_prefix__ = "ut_metadatareport"
    __locale_fields__ = frozenset({"metadata_text"})
    _audit_enabled = True
    _audit_module = "indicator_metadata"
    _audit_nid_field = "metadatareport_nid"
    _audit_gid_field = None  # no GID; identified by target_nid + category_nid
    metadatareport_nid = Column(Integer, primary_key=True, nullable=False)
    target_nid = Column(Integer, nullable=True, index=True)
    category_nid = Column(Integer, nullable=True, index=True)
    metadata_text = Column("metadata", Text, nullable=True)


class Unit(metaclass=_LocaleModelMeta):
    """Locale-specific unit tables (ut_unit_<locale>). Call: Unit("en")."""
    __table_prefix__ = "ut_unit"
    __locale_fields__ = frozenset({"unit_name"})
    _audit_enabled = True
    _audit_module = "unit"
    _audit_nid_field = "unit_nid"
    _audit_gid_field = "unit_gid"
    unit_nid = Column(Integer, primary_key=True, nullable=False)
    unit_name = Column(String(128), nullable=False)
    unit_gid = Column(String(60), nullable=True, index=True)
    unit_global = Column(Boolean, default=False, nullable=False)
    unit_format = Column(String(255), nullable=True)


class MetadataCategory(metaclass=_LocaleModelMeta):
    """Locale-specific metadata category tables (ut_metadata_category_<locale>). Call: MetadataCategory("en")."""
    __table_prefix__ = "ut_metadata_category"
    __locale_fields__ = frozenset({"categoryname", "categorydescription"})
    _audit_enabled = True
    _audit_module = "metadata_category"
    _audit_nid_field = "categorynid"
    _audit_gid_field = "categorygid"
    categorynid = Column(Integer, primary_key=True, autoincrement=True)
    categoryname = Column(String(255), nullable=True)
    categorytype = Column(String(2), nullable=True)
    categoryorder = Column(Integer, nullable=True)
    parentcategorynid = Column(Float, nullable=True)
    categorygid = Column(Text, nullable=True)
    categorydescription = Column(Text, nullable=True)
    ispresentational = Column(Boolean, nullable=True, default=False)
    ismandatory = Column(Boolean, nullable=True, default=False)


class Area(metaclass=_LocaleModelMeta):
    """Locale-specific area tables (ut_area_<locale>). Call: Area("en")."""
    __table_prefix__ = "ut_area"
    __locale_fields__ = frozenset({"area_name", "areashortname"})
    _audit_enabled = True
    _audit_module = "area"
    _audit_nid_field = "area_nid"
    _audit_gid_field = "area_gid"
    area_nid = Column(Integer, primary_key=True, autoincrement=True)
    area_parent_nid = Column(Integer, default=0, nullable=True)
    area_id = Column(String(255), nullable=True, unique=True, index=True)
    area_name = Column(String(60), nullable=False)
    area_gid = Column(String(60), nullable=False, index=True)
    area_level = Column(Integer, default=0, nullable=True)
    area_map = Column(String(60), nullable=True)
    area_block = Column(Text, nullable=True)
    area_global = Column(Boolean, default=False, nullable=False)
    data_exist = Column(Boolean, default=False, nullable=True)
    areashortname = Column(String(255), nullable=True)


class DbMetadata(metaclass=_LocaleModelMeta):
    """Locale-specific DB metadata tables (ut_dbmetadata_<locale>). Call: DbMetadata("en")."""
    __table_prefix__ = "ut_dbmetadata"
    __locale_fields__ = frozenset({"description"})  # maps to dbmtd_desc
    dbmtd_nid = Column(Integer, primary_key=True, autoincrement=True)
    description = Column("dbmtd_desc", Text, nullable=True)
    dbmtd_pubname = Column(String(50), nullable=True)
    publication_date = Column("dbmtd_pubdate", DateTime, nullable=True)
    dbmtd_pubcountry = Column(String(50), nullable=True)
    dbmtd_pubregion = Column(String(50), nullable=True)
    dbmtd_puboffice = Column(String(50), nullable=True)
    dbmtd_areacnt = Column(Float, nullable=True)
    dbmtd_indcnt = Column(Float, nullable=True)
    dbmtd_iuscnt = Column(Float, nullable=True)
    dbmtd_timecnt = Column(Float, nullable=True)
    dbmtd_srccnt = Column(Float, nullable=True)
    dbmtd_datacnt = Column(Float, nullable=True)


class AreaLevel(metaclass=_LocaleModelMeta):
    """Locale-specific area level tables (ut_area_level_<locale>). Call: AreaLevel("en")."""
    __table_prefix__ = "ut_area_level"
    __locale_fields__ = frozenset({"area_level_name"})
    _audit_enabled = True
    _audit_module = "area_level"
    _audit_nid_field = "level_nid"
    _audit_gid_field = None  # no GID; area_level integer is used as identifier
    level_nid = Column(Integer, primary_key=True, autoincrement=True)
    area_level = Column(Integer, nullable=False, default=0)
    area_level_name = Column(String(255), nullable=True)


class SubgroupCategory(metaclass=_LocaleModelMeta):
    """Locale-specific subgroup category tables (ut_subgroup_category_<locale>). Call: SubgroupCategory("en")."""
    __table_prefix__ = "ut_subgroup_type"
    __locale_fields__ = frozenset({"subgroup_type_name"})
    _audit_enabled = True
    _audit_module = "subgroup_category"
    _audit_nid_field = "subgroup_type_nid"
    _audit_gid_field = "subgroup_type_gid"
    subgroup_type_nid = Column(Integer, primary_key=True, autoincrement=True)
    subgroup_type_name = Column(String(128), nullable=True)
    subgroup_type_gid = Column(String(60), nullable=True, unique=True, index=True)
    subgroup_type_order = Column(Float, nullable=True)
    subgroup_type_global = Column(Boolean, default=False, nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)


class Subgroup(metaclass=_LocaleModelMeta):
    """Locale-specific subgroup tables (ut_subgroup_<locale>). Call: Subgroup("en")."""
    __table_prefix__ = "ut_subgroup"
    __locale_fields__ = frozenset({"subgroup_name"})
    _audit_enabled = True
    _audit_module = "subgroup_category_value"
    _audit_nid_field = "subgroup_nid"
    _audit_gid_field = "subgroup_gid"
    subgroup_nid = Column(Integer, primary_key=True, autoincrement=True)
    subgroup_name = Column(String(128), nullable=False)
    subgroup_gid = Column(String(255), nullable=True, unique=True, index=True)
    subgroup_global = Column(Boolean, default=False, nullable=False)
    subgroup_type = Column(Integer, nullable=False, default=0)
    subgroup_order = Column(Integer, nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)


class IndicatorUnitSubgroup(Base):
    """
    IUS (Indicator-Unit-Subgroup) table. No FK to ut_indicator/ut_unit (locale-only schema).
    """
    __tablename__ = "ut_indicator_unit_subgroup"
    __table_args__ = (
        Index('dmuniq_ius_nid', 'indicator_nid', 'unit_nid', 'subgroup_val_nid', unique=True),
        {'extend_existing': True},
    )
    _audit_enabled = True
    _audit_module = "indicator_unit_subgroup"
    _audit_nid_field = "iusnid"
    _audit_gid_field = None  # no GID; iusnid integer is used as identifier
    iusnid = Column(Integer, primary_key=True, autoincrement=True)
    indicator_nid = Column(Integer, nullable=True)
    unit_nid = Column(Integer, nullable=True)
    subgroup_val_nid = Column(Integer, nullable=True)
    min_value = Column(Float, default=0)
    max_value = Column(Float, default=0)
    subgroup_nids = Column(String(50), nullable=True)
    data_exist = Column(Boolean, default=False)
    isdefaultsubgroup = Column(Boolean, default=False)
    avlmindatavalue = Column(Float, nullable=True)
    avlmaxdatavalue = Column(Float, nullable=True)
    avlmintimeperiod = Column(String(60), nullable=True)
    avlmaxtimeperiod = Column(String(60), nullable=True)


class IcIus(Base):
    """
    IC-IUS (Indicator Classification - IUS) relationship table.
    Maps to existing table - does not create or modify schema.
    """
    __tablename__ = "ut_ic_ius"
    __table_args__ = (
        Index('dmuniq_ic_iusnid', 'ic_nid', 'iusnid', unique=True),
        {'extend_existing': True},  # Use existing table, don't create
    )
    
    ic_iusnid = Column(Integer, primary_key=True, autoincrement=True)
    ic_nid = Column(Integer, nullable=True)
    iusnid = Column(Integer, ForeignKey("ut_indicator_unit_subgroup.iusnid", ondelete="CASCADE"), nullable=True)
    recommendedsource = Column(Boolean, default=False)
    ic_ius_order = Column(Float, nullable=True)
    ic_ius_label = Column(String(255), nullable=True)


class Data(Base):
    """
    Data base table (not language-specific).
    Maps to existing table - does not create or modify schema.
    Note: textual_data_value is stored directly in this table, not in separate translation tables.
    """
    __tablename__ = "ut_data"
    __table_args__ = {'extend_existing': True}
    
    data_nid = Column(Integer, primary_key=True, autoincrement=True)
    iusnid = Column(Integer, nullable=True, default=0)
    timeperiod_nid = Column(Integer, nullable=True, default=0)
    area_nid = Column(Integer, nullable=True, default=0)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    data_denominator = Column(Integer, nullable=True, default=0)
    footnote_nid = Column(Integer, nullable=True, default=0)
    source_nid = Column(Integer, nullable=True, default=0)
    indicator_nid = Column(Float, nullable=True)
    unit_nid = Column(Float, nullable=True)
    subgroup_val_nid = Column(Float, nullable=True)
    ic_ius_order = Column(Float, nullable=True)
    textual_data_value = Column(Text, nullable=True)
    istextualdata = Column(Boolean, nullable=True, default=False)
    ismrd = Column(Boolean, nullable=True, default=False)
    isplannedvalue = Column(Boolean, nullable=True, default=False)
    iunid = Column(String(255), nullable=True)
    confidenceintervalupper = Column(Float, nullable=True)
    confidenceintervallower = Column(Float, nullable=True)
    multiplesource = Column(Boolean, nullable=True, default=False)
    data_value = Column(Float, nullable=True)


class Footnote(metaclass=_LocaleModelMeta):
    """Locale-specific footnote tables (ut_footnote_<locale>). Call: Footnote("en")."""
    __table_prefix__ = "ut_footnote"
    footnote_nid = Column(Integer, primary_key=True, autoincrement=True)
    footnote = Column(Text, nullable=True)
    footnote_gid = Column(String(60), nullable=True, index=True)


class TimePeriod(Base):
    """
    Time period table - ut_timeperiod (global, not locale-specific).
    API exposes as id (timeperiod_nid), timeperiod, startdate, enddate, periodicity.
    """
    __tablename__ = "ut_timeperiod"
    __table_args__ = {'extend_existing': True}
    _audit_enabled = True
    _audit_module = "time_period"
    _audit_nid_field = "timeperiod_nid"
    _audit_gid_field = "timeperiod"  # unique string value used as stable identifier
    timeperiod_nid = Column(Integer, primary_key=True, autoincrement=True)
    timeperiod = Column(String(30), nullable=True, unique=True, index=True)
    startdate = Column(DateTime, nullable=True)
    enddate = Column(DateTime, nullable=True)
    periodicity = Column(String(50), nullable=True)


class SubgroupValsSubgroup(Base):
    """
    Subgroup values to subgroup junction table (not language-specific).
    Maps to existing table - does not create or modify schema.
    """
    __tablename__ = "ut_subgroup_vals_subgroup"
    __table_args__ = {'extend_existing': True}
    
    subgroup_val_subgroup_nid = Column(Integer, primary_key=True, autoincrement=True)
    subgroup_val_nid = Column(Integer, nullable=True)
    subgroup_nid = Column(Integer, nullable=True)



class Language(Base):
    """
    Language master table for a data warehouse (not locale-specific).
    Stores configured languages and default/global-lock flags.
    """

    __tablename__ = "ut_language"
    __table_args__ = {"extend_existing": True}

    _audit_enabled = True
    _audit_module = "language"
    _audit_nid_field = "language_nid"
    _audit_gid_field = "language_code"

    language_nid = Column(Integer, primary_key=True, autoincrement=True)
    language_name = Column(String(50), nullable=True)
    language_code = Column(String(50), nullable=True, index=True)
    language_default = Column(Boolean, default=False, nullable=True)
    language_globallock = Column(Boolean, default=False, nullable=True)


class IndicatorUnitValidation(Base):
    """
    Validation rules for indicator+unit combinations (iu_validation).
    unit_gid is nullable — a NULL unit_gid means the rule applies to the indicator regardless of unit.
    Maps to existing table — does not create or modify schema.
    """
    __tablename__ = "iu_validation"
    __table_args__ = (
        UniqueConstraint("indicator_gid", "unit_gid", name="uq_iuv_indicator_unit"),
        Index("idx_iuv_unit_gid", "unit_gid"),
        {"extend_existing": True},
    )

    _audit_enabled = True
    _audit_module = "validation_rule"
    _audit_nid_field = "id"
    _audit_gid_field = "indicator_gid"

    id = Column(Integer, primary_key=True, autoincrement=True)
    indicator_gid = Column(String(60), nullable=False)
    unit_gid = Column(String(60), nullable=True)
    validation_type = Column(String(10), nullable=False)  # NUM | TEXT | ENUM
    min_value = Column(Numeric(20, 6), nullable=True)
    max_value = Column(Numeric(20, 6), nullable=True)
    min_length = Column(Integer, nullable=True)
    max_length = Column(Integer, nullable=True)
    created = Column(DateTime, nullable=True)
    created_user_id = Column(Integer, nullable=True)
    modified = Column(DateTime, nullable=True)
    modified_user_id = Column(Integer, nullable=True)


class IndicatorUnitValidationEnum(Base):
    """
    Enum option rows for a validation rule (iu_validation_enum).
    Each row is one allowed option for an ENUM-type validation rule.
    Maps to existing table — does not create or modify schema.
    """
    __tablename__ = "iu_validation_enum"
    __table_args__ = (
        UniqueConstraint("validation_id", "option_code", name="uq_iuve_validation_option"),
        {"extend_existing": True},
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    validation_id = Column(Integer, nullable=False)
    option_code = Column(String(50), nullable=False)
    score = Column(Numeric(10, 4), nullable=True)
    display_order = Column(Integer, nullable=True, default=0)
    is_active = Column(Boolean, nullable=True, default=True)
    created = Column(DateTime, nullable=True)
    created_user_id = Column(Integer, nullable=False)
    modified = Column(DateTime, nullable=True)
    modified_user_id = Column(Integer, nullable=False)


class IndicatorUnitValidationEnumI18n(Base):
    """
    Locale-specific labels for validation enum options (iu_validation_enum_i18n).
    Uses a locale column (not a locale-suffix table) — one row per (master_id, locale).
    Maps to existing table — does not create or modify schema.
    """
    __tablename__ = "iu_validation_enum_i18n"
    __table_args__ = (
        UniqueConstraint("master_id", "locale", name="uq_iuvei_master_locale"),
        {"extend_existing": True},
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    master_id = Column(Integer, nullable=False)
    locale = Column(String(3), nullable=False)
    label = Column(String(255), nullable=False)


def get_locale_model(base_name: str, locale: str) -> Type[Base]:
    """
    Get the locale-specific model class for a given base model name and locale.
    Uses _LOCALE_REGISTRY for cache; mixin is resolved via _MIXIN_BY_NAME (populated on first Mixin(locale) call).
    Thread-safe: lock protects get-or-build so only one thread builds per (base_name, locale).
    """
    mixin_class = _MIXIN_BY_NAME.get(base_name)
    if mixin_class is None:
        raise ValueError(
            f"Unknown base model name: {base_name}. Use {base_name}(locale) at least once first."
        )
    cache_key = (base_name, locale)
    # Fast path: already cached (no lock needed for read-after-cache).
    if cache_key in _LOCALE_REGISTRY:
        return _LOCALE_REGISTRY[cache_key]
    with _LOCALE_REGISTRY_LOCK:
        if cache_key in _LOCALE_REGISTRY:
            return _LOCALE_REGISTRY[cache_key]
        return _build_locale_model_class(mixin_class, locale)


def get_default_locale_model(base_name: str, dw_db: Session) -> Type[Base]:
    """
    Get the locale model for the default language of this data warehouse.
    Queries ut_language for the row with language_default=True; falls back to the first
    registered language, then 'en'. Result is cached in session.info for the request lifetime.
    """
    return get_locale_model(base_name, get_default_locale(dw_db))


def get_default_locale(dw_db: Session) -> str:
    """
    Return the default language code for this data warehouse.
    Queries ut_language WHERE language_default=True; falls back to the first registered language,
    then 'en'. Result is cached in dw_db.info so the DB is hit at most once per session/request.
    """
    _CACHE_KEY = "_dw_default_locale"
    cached = dw_db.info.get(_CACHE_KEY)
    if cached:
        return cached

    row = dw_db.query(Language).filter(Language.language_default.is_(True)).first()
    if row and row.language_code:
        dw_db.info[_CACHE_KEY] = row.language_code
        return row.language_code

    first = dw_db.query(Language).order_by(Language.language_nid.asc()).first()
    result = (first.language_code if first and first.language_code else "en")
    dw_db.info[_CACHE_KEY] = result
    return result


# ===== COMPUTE ENGINE MODELS =====
# These models map to compute engine tables that exist in each data warehouse database


class CeIusComputeAddTarget(Base):
    """
    Target formulas for TOTAL operations.
    Maps to existing ce_ius_compute_add_targets table in data warehouse.
    """
    __tablename__ = "ce_ius_compute_add_targets"
    __table_args__ = (
        Index('idx_ce_add_targets_dw_ius_order', 'dw_id', 'i_gid', 'u_gid', 's_gid', 'order'),
        {'extend_existing': True}
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_id = Column(Integer, nullable=False)
    i_gid = Column(String(60), nullable=False)  # Indicator GID
    u_gid = Column(String(60), nullable=False)  # Unit GID
    s_gid = Column(String(60), nullable=False)  # Subgroup GID
    ius_name = Column(String(500), nullable=False)  # Display name
    target_decimal = Column(Integer, nullable=True)  # Decimal precision
    order = Column(Integer, nullable=False)  # Order for processing


class CeIusComputeAddSource(Base):
    """
    Source formulas for TOTAL operations.
    Maps to existing ce_ius_compute_add_sources table in data warehouse.
    """
    __tablename__ = "ce_ius_compute_add_sources"
    __table_args__ = (
        Index('idx_ce_add_sources_dw_id', 'dw_id'),
        Index('idx_ce_add_sources_target_id', 'target_id'),
        {'extend_existing': True}
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_id = Column(Integer, nullable=False)
    target_id = Column(Integer, ForeignKey('ce_ius_compute_add_targets.id', ondelete='CASCADE'), nullable=False)
    i_gid = Column(String(60), nullable=False)
    u_gid = Column(String(60), nullable=False)
    s_gid = Column(String(60), nullable=False)
    ius_name = Column(String(500), nullable=False)


class CeIusComputeDiv(Base):
    """
    PERCENT operation formulas (division/ratio calculations).
    Maps to existing ce_ius_compute_divs table in data warehouse.
    """
    __tablename__ = "ce_ius_compute_divs"
    __table_args__ = (
        Index('idx_ce_divs_dw_ius', 'dw_id', 'i_gid', 'u_gid', 's_gid'),
        {'extend_existing': True}
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_id = Column(Integer, nullable=False)
    # Target IUS
    i_gid = Column(String(60), nullable=False)
    u_gid = Column(String(60), nullable=False)
    s_gid = Column(String(60), nullable=False)
    ius_name = Column(String(500), nullable=False)
    # Numerator IUS
    num_i_gid = Column(String(60), nullable=False)
    num_u_gid = Column(String(60), nullable=False)
    num_s_gid = Column(String(60), nullable=False)
    num_ius_name = Column(String(500), nullable=False)
    # Denominator IUS
    den_i_gid = Column(String(60), nullable=False)
    den_u_gid = Column(String(60), nullable=False)
    den_s_gid = Column(String(60), nullable=False)
    den_ius_name = Column(String(500), nullable=False)
    # Configuration
    target_decimal = Column(Integer, nullable=True)
    den_area_specific = Column(Boolean, default=False, nullable=False)
    den_area_id = Column(String(100), nullable=True)
    den_area_name = Column(String(100), nullable=True)
    den_multiplier = Column(Numeric(5, 2), nullable=True)
    is_most_recent = Column(Boolean, default=False, nullable=False)


class CeIusComputeMinus(Base):
    """
    MINUS operation formulas (subtraction calculations).
    Maps to existing ce_ius_compute_minus table in data warehouse.
    """
    __tablename__ = "ce_ius_compute_minus"
    __table_args__ = (
        Index('idx_ce_minus_dw_ius', 'dw_id', 'i_gid', 'u_gid', 's_gid'),
        {'extend_existing': True}
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_id = Column(Integer, nullable=False)
    # Target IUS
    i_gid = Column(String(60), nullable=False)
    u_gid = Column(String(60), nullable=False)
    s_gid = Column(String(60), nullable=False)
    ius_name = Column(String(500), nullable=False)
    # Minuend IUS (number being subtracted from)
    min_i_gid = Column(String(60), nullable=False)
    min_u_gid = Column(String(60), nullable=False)
    min_s_gid = Column(String(60), nullable=False)
    min_ius_name = Column(String(500), nullable=False)
    # Subtrahend IUS (number being subtracted)
    sub_i_gid = Column(String(60), nullable=False)
    sub_u_gid = Column(String(60), nullable=False)
    sub_s_gid = Column(String(60), nullable=False)
    sub_ius_name = Column(String(500), nullable=False)
    # Configuration
    target_decimal = Column(Integer, nullable=True)


class CeIusComputeTime(Base):
    """
    TIME aggregation formulas (temporal aggregation).
    Maps to existing ce_ius_compute_times table in data warehouse.
    """
    __tablename__ = "ce_ius_compute_times"
    __table_args__ = (
        Index('idx_ce_times_dw_ius', 'dw_id', 'i_gid', 'u_gid', 's_gid'),
        {'extend_existing': True}
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_id = Column(Integer, nullable=False)
    i_gid = Column(String(60), nullable=False)
    u_gid = Column(String(60), nullable=False)
    s_gid = Column(String(60), nullable=False)
    ius_name = Column(String(500), nullable=False)
    target_decimal = Column(Integer, nullable=True)
    target_tp_freq = Column(String(3), nullable=False)  # A/Q/M/D/H/F
    source_tp_freq = Column(String(3), nullable=False)  # A/Q/M/D/H/F
    aggregation_type = Column(String(5), nullable=False)  # sum/avg


class CeIusComputeArea(Base):
    """
    AREA aggregation formulas (spatial aggregation across area levels).
    Maps to ce_ius_compute_areas table in data warehouse.
    """
    __tablename__ = "ce_ius_compute_areas"
    __table_args__ = (
        Index('idx_ce_areas_dw_ius', 'dw_id', 'i_gid', 'u_gid', 's_gid'),
        {'extend_existing': True}
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_id = Column(Integer, nullable=False)
    i_gid = Column(String(60), nullable=False)
    u_gid = Column(String(60), nullable=False)
    s_gid = Column(String(60), nullable=False)
    ius_name = Column(String(500), nullable=False)
    target_decimal = Column(Integer, nullable=True)
    target_area_level = Column(Integer, nullable=False)
    source_area_level = Column(Integer, nullable=False)
    aggregation_type = Column(String(10), nullable=False)  # sum/avg
    populate_mid_levels = Column(SmallInteger, nullable=False, default=0)


class CeProcessMaster(Base):
    """
    Process definitions (without time periods).
    Maps to existing ce_process_master table in data warehouse.
    """
    __tablename__ = "ce_process_master"
    __table_args__ = (
        Index('idx_ce_process_master_dw_type', 'dw_id', 'process_type'),
        {'extend_existing': True}
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_id = Column(Integer, nullable=False)
    process_type = Column(String(10), nullable=False)  # TOTAL/PERCENT/TIME/MINUS
    filter_object = Column(Text, nullable=False)  # JSON: areas, IUS selection, source info
    created_at = Column(DateTime, nullable=False)
    deleted_at = Column(DateTime, nullable=True)


class CeProcessTime(Base):
    """
    Process executions (with time periods).
    Maps to existing ce_process_time table in data warehouse.
    """
    __tablename__ = "ce_process_time"
    __table_args__ = (
        Index('idx_ce_process_time_dw_process', 'dw_id', 'process_id'),
        {'extend_existing': True}
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_id = Column(Integer, nullable=False)
    process_id = Column(Integer, ForeignKey('ce_process_master.id'), nullable=False)
    filter_object = Column(Text, nullable=False)  # JSON: time periods
    created_at = Column(DateTime, nullable=False)
    deleted_at = Column(DateTime, nullable=True)


class CeProcessTimeLog(Base):
    """
    Execution runs and progress tracking.
    Maps to existing ce_process_time_logs table in data warehouse.
    """
    __tablename__ = "ce_process_time_logs"
    __table_args__ = (
        Index('idx_ce_process_time_logs_dw_process_time', 'dw_id', 'process_time_id'),
        {'extend_existing': True}
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_id = Column(Integer, nullable=False)
    process_time_id = Column(Integer, ForeignKey('ce_process_time.id'), nullable=False)
    name = Column(String(255), nullable=False)
    filter_object = Column(Text, nullable=False)  # JSON: complete merged payload
    status = Column(String(20), nullable=True)  # PENDING/IN-PROGRESS/DONE/CANCELLED/DELETED
    total_jobs = Column(Integer, nullable=True)
    total_executed = Column(Integer, nullable=True)
    total_pending = Column(Integer, nullable=True)
    total_failed = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    remarks = Column(Text, nullable=True)


class DbVersion(Base):
    """
    Database version table (db_version).
    Stores version history rows for this datawarehouse.
    Maps to existing table — does not create or modify schema.
    """
    __tablename__ = "db_version"
    __table_args__ = {"extend_existing": True}

    version_nid = Column(Integer, primary_key=True, autoincrement=True)
    version_number = Column(String(50), nullable=True)
    version_change_date = Column(String(50), nullable=True)
    version_comments = Column(String(255), nullable=True)
