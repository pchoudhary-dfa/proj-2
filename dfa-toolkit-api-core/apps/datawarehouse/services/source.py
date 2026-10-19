"""
Source service – CRUD for Sources (IC rows with ic_type=SR, ic_parent_nid != -1).
Publisher parent rows (ic_parent_nid=-1) are system-managed and not returned by list/get.
Uses ut_indicator_classifications_<locale>, ut_ic_ius, ut_data.source_nid.
"""
import logging
from typing import List, Optional, Dict, Any, Tuple, Union

from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from apps.shared.exceptions import Conflict
from apps.shared.utils.validators import generate_guid, validate_guid
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import (
    IndicatorClassification,
    get_default_locale,
    IcIus,
    Data,
)
from apps.datawarehouse.schemas.source import (
    SourceCreateSchema,
    SourceUpdateSchema,
    SourceResponseSchema,
)
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix, value_for_locale
from apps.datawarehouse.utils.audit_events import (
    buffer_delete_step,
    buffer_manual_audit,
    deleted_ids_preview,
    snapshot_entity_for_audit,
)
from apps.datawarehouse.constants import (
    IC_TYPE_SR,
    SOURCE_PUBLISHER_PARENT_NID,
    ASSOC_DATA_ROWS,
    ASSOC_IUS_ROWS,
)
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed

logger = logging.getLogger(__name__)

# Chunk size for bulk delete of ut_data / ut_ic_ius to avoid parameter limits
_DELETE_CHUNK_SIZE = 500

# Source-specific locale handling: IC table is shared with other IC types; for sources only
# these fields are written to the requested language table. All other fields (ic_gid,
# ic_short_name, ic_parent_nid, sourcelink1, etc.) are structural and written to every locale table.
SOURCE_LOCALE_FIELDS = frozenset({"publisher", "title", "diyear", "ic_name"})


def _build_ic_name(publisher: str, title: str, year: Optional[str]) -> str:
    """Build ic_name: publisher + '_' + title + '_' + year, or publisher + '_' + title if year empty."""
    pub = (publisher or "").strip() or "GLOBAL"
    tit = (title or "").strip()
    if not tit:
        return pub
    if (year or "").strip():
        return f"{pub}_{tit}_{(year or '').strip()}"
    return f"{pub}_{tit}"


class SourceService:
    """Service for Source CRUD (ic_type=SR, ic_parent_nid != -1)."""

    def _source_record_to_dict(self, record: Any, language_code: str) -> Dict[str, Any]:
        """Build response dict from a locale IC record (Source row)."""
        return SourceResponseSchema.from_record(record, locale=language_code)

    def _resolve_identifier_to_source_nid(
        self, dw_db: Session, identifier: str
    ) -> Optional[int]:
        """Resolve identifier (ic_nid or ic_gid) to ic_nid. Returns None if not found or not a valid Source child."""
        if not identifier or not str(identifier).strip():
            return None
        identifier = str(identifier).strip()
        ICModel = IndicatorClassification(get_default_locale(dw_db))
        if identifier.isdigit():
            row = dw_db.query(ICModel).filter(ICModel.ic_nid == int(identifier)).first()
        else:
            row = dw_db.query(ICModel).filter(ICModel.ic_gid == identifier).first()
        if not row:
            return None
        if (getattr(row, "ic_type", None) or "").strip().upper() != IC_TYPE_SR:
            return None
        if getattr(row, "ic_parent_nid", None) == SOURCE_PUBLISHER_PARENT_NID:
            return None  # Publisher row, not a Source child
        return row.ic_nid

    def _get_or_create_publisher(
        self, dw_db: Session, dw_id: str, publisher_name: str, language_code: Optional[str] = None
    ) -> int:
        """Get or create publisher parent row (ic_type=SR, ic_parent_nid=-1, ic_name=publisher). Returns ic_nid.
        If a publisher with the same name already exists, that row is reused (no duplicate, no error).
        """
        pub = (publisher_name or "").strip() or "GLOBAL"
        default_locale = get_default_locale(dw_db)
        language_code = language_code or default_locale
        ICModel = IndicatorClassification(default_locale)
        row = (
            dw_db.query(ICModel)
            .filter(
                ICModel.ic_type == IC_TYPE_SR,
                ICModel.ic_parent_nid == SOURCE_PUBLISHER_PARENT_NID,
                ICModel.ic_name == apply_lang_prefix(pub),
            )
            .first()
        )
        if row:
            return row.ic_nid
        max_nid = dw_db.query(func.max(ICModel.ic_nid)).scalar()
        ic_nid = (max_nid or 0) + 1
        pub_gid = generate_guid()
        for locale in get_dw_language_codes(dw_id):
            ICModel = IndicatorClassification(locale)
            r = ICModel(
                ic_nid=ic_nid,
                ic_parent_nid=SOURCE_PUBLISHER_PARENT_NID,
                ic_gid=pub_gid,
                ic_name=value_for_locale(pub, locale, language_code),
                ic_global=False,
                ic_type=IC_TYPE_SR,
                ic_short_name=None,
                publisher=None,  # Parent row: publisher column null per reference (only ic_name holds name)
                title=None,
                diyear=None,
                sourcelink1=None,
                sourcelink2=None,
                ic_order=None,
                isbn=None,
                nature=None,
            )
            dw_db.add(r)
        dw_db.flush()  # Ensure publisher rows are visible so create_source's max(ic_nid) gets next id for the source
        logger.info("Created publisher parent ic_nid=%s ic_name=%s", ic_nid, pub)
        return ic_nid

    def _count_other_sources_under_publisher(
        self, dw_db: Session, publisher_ic_nid: int, exclude_source_ic_nid: int
    ) -> int:
        """Count source rows (ic_type=SR, ic_parent_nid=publisher_ic_nid) excluding exclude_source_ic_nid."""
        ICModel = IndicatorClassification(get_default_locale(dw_db))
        return (
            dw_db.query(ICModel)
            .filter(
                ICModel.ic_type == IC_TYPE_SR,
                ICModel.ic_parent_nid == publisher_ic_nid,
                ICModel.ic_nid != exclude_source_ic_nid,
            )
            .count()
        )

    def _update_publisher_name_in_place(
        self, dw_db: Session, dw_id: str, publisher_ic_nid: int, new_name: str
    ) -> None:
        """Update the publisher row's ic_name and publisher to new_name in all locale tables."""
        for locale in get_dw_language_codes(dw_id):
            ICModel = IndicatorClassification(locale)
            pub_row = dw_db.query(ICModel).filter(ICModel.ic_nid == publisher_ic_nid).first()
            if pub_row:
                pub_row.ic_name = apply_lang_prefix(new_name)
                pub_row.publisher = apply_lang_prefix(new_name)
        logger.info("Updated publisher ic_nid=%s name to %s", publisher_ic_nid, new_name)

    def list_sources(
        self,
        dw_id: str,
        page: int = 1,
        page_size: Optional[int] = None,
        language_code: Optional[str] = None,
        sort_order: str = "asc",
        sort_field: str = "ic_nid",
        search: Optional[str] = None,
        search_by: Optional[str] = None,
        scope: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], int, Optional[int]]:
        """List Source child rows only (ic_type=SR, ic_parent_nid != -1). Paginated. scope=NO_DATA: only sources with no ut_data.source_nid."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            lang = language_code or get_default_locale(dw_db)
            ICModel = IndicatorClassification(lang)
            query = (
                dw_db.query(ICModel)
                .filter(ICModel.ic_type == IC_TYPE_SR)
                .filter(ICModel.ic_parent_nid != SOURCE_PUBLISHER_PARENT_NID)
            )
            has_list_filters = bool((search and search.strip()) or scope == "NO_DATA")
            total_count_unfiltered: Optional[int] = (
                query.count() if has_list_filters else None
            )
            if search and search.strip():
                pattern = f"%{search.strip()}%"
                if search_by:
                    # Search specific field using external key mapping
                    from apps.datawarehouse.constants import get_source_field_mapping
                    field_map = get_source_field_mapping(ICModel)
                    if search_by in field_map:
                        query = query.filter(field_map[search_by].ilike(pattern))
                else:
                    # Current behavior: search all fields
                    query = query.filter(
                        or_(
                            ICModel.ic_name.ilike(pattern),
                            ICModel.ic_short_name.ilike(pattern),
                            ICModel.publisher.ilike(pattern),
                            ICModel.title.ilike(pattern),
                        )
                    )
            if scope == "NO_DATA":
                used_nids = [
                    r[0]
                    for r in dw_db.query(Data.source_nid)
                    .filter(Data.source_nid.isnot(None), Data.source_nid != 0)
                    .distinct()
                    .all()
                ]
                if used_nids:
                    query = query.filter(ICModel.ic_nid.notin_(used_nids))
                else:
                    pass  # all sources have no data
            total_count = query.count()
            order_col = getattr(
                ICModel,
                sort_field
                if sort_field
                in ("ic_nid", "ic_name", "publisher", "title", "diyear", "ic_short_name")
                else "ic_nid",
                ICModel.ic_nid,
            )
            if sort_order and sort_order.lower() == "desc":
                query = query.order_by(order_col.desc())
            else:
                query = query.order_by(order_col.asc())
            if page_size is not None:
                page_size = max(1, min(page_size, 1000))
                skip = (page - 1) * page_size
                rows = query.offset(skip).limit(page_size).all()
            else:
                rows = query.all()
            result = [self._source_record_to_dict(r, lang) for r in rows]
            return result, total_count, total_count_unfiltered

    def get_source_by_identifier(
        self,
        dw_id: str,
        identifier: str,
        language_code: Optional[str] = None,
        include_ius: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Get one Source by ic_nid or ic_gid. Returns None if not found or not a Source child. Optionally include IUS nids."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            lang = language_code or get_default_locale(dw_db)
            ic_nid = self._resolve_identifier_to_source_nid(dw_db, identifier)
            if ic_nid is None:
                return None
            ICModel = IndicatorClassification(lang)
            row = dw_db.query(ICModel).filter(ICModel.ic_nid == ic_nid).first()
            if not row:
                return None
            out = self._source_record_to_dict(row, lang)
            if include_ius:
                ius_rows = (
                    dw_db.query(IcIus.iusnid)
                    .filter(IcIus.ic_nid == ic_nid, IcIus.iusnid.isnot(None))
                    .all()
                )
                out["ius"] = [r[0] for r in ius_rows if r[0] is not None]
            return out

    def create_source(
        self,
        dw_id: str,
        data: SourceCreateSchema,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a Source: get-or-create publisher (parent) row, then create source (child) rows in all locales."""
        publisher = (data.publisher or "").strip() or "GLOBAL"
        title = (data.title or "").strip()
        if not title:
            raise ValueError("SOURCE_TITLE_REQUIRED: title is required")
        year = (data.year or "").strip() or None
        ic_name = _build_ic_name(publisher, title, year)
        short_name = (data.short_name or "").strip() or None
        ic_gid = (data.ic_gid or "").strip() or None
        if ic_gid:
            if len(ic_gid) > 60:
                raise ValueError("IC_GID_TOO_LONG: ic_gid must be 60 characters or less")
            if not validate_guid(ic_gid):
                raise ValueError(
                    "IC_GID_INVALID: ic_gid must be valid GUID format (letters, numbers, $ @ _ - { })"
                )
        else:
            ic_gid = generate_guid()

        with get_warehouse_session_from_id(dw_id) as dw_db:
            lang = language_code or get_default_locale(dw_db)
            ICModel = IndicatorClassification(get_default_locale(dw_db))
            existing_gid = (
                dw_db.query(ICModel).filter(ICModel.ic_gid == ic_gid).first()
            )
            if existing_gid:
                raise Conflict(f"Source ic_gid '{ic_gid}' already exists", error_code="IC_GID_EXISTS")
            existing_name = (
                dw_db.query(ICModel)
                .filter(
                    ICModel.ic_type == IC_TYPE_SR,
                    ICModel.ic_parent_nid != SOURCE_PUBLISHER_PARENT_NID,
                    ICModel.ic_name == apply_lang_prefix(ic_name),
                )
                .first()
            )
            if existing_name:
                raise ValueError(
                    f"SOURCE_EXISTS: A source with publisher+title+year already exists (ic_name={ic_name!r})"
                )
            if short_name:
                existing_short = (
                    dw_db.query(ICModel)
                    .filter(
                        ICModel.ic_type == IC_TYPE_SR,
                        ICModel.ic_short_name == apply_lang_prefix(short_name),
                    )
                    .first()
                )
                if existing_short:
                    raise ValueError(
                        f"SOURCE_SHORT_NAME_EXISTS: ic_short_name '{short_name}' already exists for another Source"
                    )
            parent_nid = self._get_or_create_publisher(dw_db, dw_id, publisher, language_code=lang)
            max_nid = dw_db.query(func.max(ICModel.ic_nid)).scalar()
            ic_nid = (max_nid or 0) + 1
            max_order = dw_db.query(func.max(ICModel.ic_order)).scalar()
            ic_order = (max_order or 0) + 1
            for locale in get_dw_language_codes(dw_id):
                ICModel = IndicatorClassification(locale)
                row = ICModel(
                    ic_nid=ic_nid,
                    ic_parent_nid=parent_nid,
                    ic_gid=ic_gid,
                    ic_name=value_for_locale(ic_name, locale, lang),
                    ic_global=False,
                    ic_type=IC_TYPE_SR,
                    ic_short_name=value_for_locale(short_name, locale, lang) if short_name else None,
                    publisher=value_for_locale(publisher, locale, lang) if publisher else None,
                    title=value_for_locale(title, locale, lang) if title else None,
                    diyear=value_for_locale(year, locale, lang) if year else None,
                    sourcelink1=None,
                    sourcelink2=None,
                    ic_order=ic_order,
                    isbn=None,
                    nature=None,
                )
                dw_db.add(row)
            dw_db.commit()

        notify_dbmetadata_counts_changed(dw_id)
        return self.get_source_by_identifier(dw_id, str(ic_nid), language_code) or {
            "ic_nid": ic_nid,
            "ic_gid": ic_gid,
            "locale": language_code or "en",
        }

    def _sync_ius_for_source(
        self, dw_db: Session, dw_id: str, ic_nid: int, ius_nids: List[int]
    ) -> None:
        """Sync ut_ic_ius: insert new (ic_nid, iusnid), remove existing not in list."""
        existing = (
            dw_db.query(IcIus.iusnid)
            .filter(IcIus.ic_nid == ic_nid, IcIus.iusnid.isnot(None))
            .all()
        )
        existing_set = {r[0] for r in existing}
        target_set = set(ius_nids)
        to_add = target_set - existing_set
        to_remove = existing_set - target_set

        added_list = sorted({int(x) for x in to_add if x is not None})
        removed_list = sorted({int(x) for x in to_remove if x is not None})
        if added_list or removed_list:
            from apps.datawarehouse.utils.audit_events import (
                buffer_manual_audit,
                deleted_ids_preview,
            )

            buffer_manual_audit(
                dw_db,
                action="UPDATE",
                module="ic_ius",
                identifier=str(ic_nid),
                previous_value={
                    "removed_count": len(removed_list),
                    "preview_iusnids": deleted_ids_preview(removed_list)["preview_ids"],
                },
                new_value={
                    "added_count": len(added_list),
                    "preview_iusnids": deleted_ids_preview(added_list)["preview_ids"],
                },
                description=f"source IUS sync ic_nid={ic_nid}",
            )

        if to_remove:
            dw_db.query(IcIus).filter(
                IcIus.ic_nid == ic_nid, IcIus.iusnid.in_(list(to_remove))
            ).delete(synchronize_session=False)
        for iusnid in to_add:
            row = IcIus(ic_nid=ic_nid, iusnid=iusnid)
            dw_db.add(row)

    def update_source(
        self,
        dw_id: str,
        identifier: str,
        data: SourceUpdateSchema,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update a Source. If publisher changes: reparent to new publisher if others exist under current one; else update publisher row in place."""
        raw = data.model_dump(exclude_none=True)
        with get_warehouse_session_from_id(dw_id) as dw_db:
            lang = language_code or get_default_locale(dw_db)
            ic_nid = self._resolve_identifier_to_source_nid(dw_db, identifier)
            if ic_nid is None:
                return None
            ICModel = IndicatorClassification(get_default_locale(dw_db))
            row = dw_db.query(ICModel).filter(ICModel.ic_nid == ic_nid).first()
            if not row:
                return None
            current_publisher = (getattr(row, "publisher", None) or "").strip() or "GLOBAL"
            publisher = (raw.get("publisher") or getattr(row, "publisher", None) or "").strip() or "GLOBAL"
            title = (raw.get("title") or getattr(row, "title", None) or "").strip()
            year = (raw.get("year") or getattr(row, "diyear", None) or "").strip() or None
            payload = {}
            for k, v in raw.items():
                if k == "year":
                    payload["diyear"] = v
                elif k == "short_name":
                    payload["ic_short_name"] = v
                else:
                    payload[k] = v
            payload["publisher"] = publisher
            payload["title"] = title
            payload["diyear"] = year
            new_ic_name = _build_ic_name(publisher, title, year)
            payload["ic_name"] = new_ic_name

            # When publisher changes: always reparent to new publisher; then delete old publisher if it has no other sources.
            old_parent_nid_after_reparent: Optional[int] = None
            if publisher != current_publisher:
                current_parent_nid = getattr(row, "ic_parent_nid", None)
                parent_nid = self._get_or_create_publisher(dw_db, dw_id, publisher)
                payload["ic_parent_nid"] = parent_nid
                old_parent_nid_after_reparent = current_parent_nid

            if "ic_gid" in payload:
                other = (
                    dw_db.query(ICModel)
                    .filter(ICModel.ic_gid == payload["ic_gid"], ICModel.ic_nid != ic_nid)
                    .first()
                )
                if other:
                    raise Conflict(f"ic_gid '{payload['ic_gid']}' already exists", error_code="IC_GID_EXISTS")
            # Source-specific locale: publisher, title, diyear, ic_name → requested lang table only.
            # All other fields (ic_gid, ic_short_name, ic_parent_nid, ...) → every locale table.
            apply_locale_update(
                dw_db,
                dw_id,
                IndicatorClassification,
                "ic_nid",
                ic_nid,
                payload,
                lang,
                locale_fields_override=SOURCE_LOCALE_FIELDS,
            )
            # If we reparented, old publisher may have no children left → delete it
            if old_parent_nid_after_reparent is not None:
                remaining = (
                    dw_db.query(ICModel)
                    .filter(
                        ICModel.ic_type == IC_TYPE_SR,
                        ICModel.ic_parent_nid == old_parent_nid_after_reparent,
                    )
                    .count()
                )
                if remaining == 0:
                    pub_snap = (
                        dw_db.query(ICModel)
                        .filter(ICModel.ic_nid == old_parent_nid_after_reparent)
                        .first()
                    )
                    for locale in get_dw_language_codes(dw_id):
                        ICModelLocale = IndicatorClassification(locale)
                        dw_db.query(ICModelLocale).filter(
                            ICModelLocale.ic_nid == old_parent_nid_after_reparent
                        ).delete(synchronize_session=False)
                    logger.info(
                        "Deleted orphaned publisher ic_nid=%s (no sources after reparent)",
                        old_parent_nid_after_reparent,
                    )
                    pub_prev = (
                        snapshot_entity_for_audit(pub_snap)
                        if pub_snap
                        else {"ic_nid": old_parent_nid_after_reparent}
                    )
                    buffer_manual_audit(
                        dw_db,
                        action="DELETE",
                        module="source",
                        identifier=str(old_parent_nid_after_reparent),
                        description=f"Deleted orphaned publisher ic_nid={old_parent_nid_after_reparent} after source reparent",
                        previous_value=pub_prev,
                    )
            dw_db.commit()
        return self.get_source_by_identifier(dw_id, str(ic_nid), language_code)

    def delete_source(self, dw_id: str, identifier: str) -> bool:
        """Delete Source: ut_data, ut_ic_ius, then Source locale rows. If the parent publisher has no other child sources, delete the publisher from all locale tables."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            ic_nid = self._resolve_identifier_to_source_nid(dw_db, identifier)
            if ic_nid is None:
                return False
            ICModelDefault = IndicatorClassification(get_default_locale(dw_db))
            source_row = dw_db.query(ICModelDefault).filter(ICModelDefault.ic_nid == ic_nid).first()
            publisher_ic_nid = getattr(source_row, "ic_parent_nid", None) if source_row else None

            ic_iusnids = [
                r[0]
                for r in dw_db.query(IcIus.ic_iusnid)
                .filter(IcIus.ic_nid == ic_nid)
                .all()
            ]
            data_nids = [
                r[0]
                for r in dw_db.query(Data.data_nid)
                .filter(Data.source_nid == ic_nid)
                .all()
            ]
            for i in range(0, len(data_nids), _DELETE_CHUNK_SIZE):
                chunk = data_nids[i : i + _DELETE_CHUNK_SIZE]
                dw_db.query(Data).filter(Data.data_nid.in_(chunk)).delete(synchronize_session=False)
            deleted_data = len(data_nids)
            if data_nids or deleted_data:
                buffer_delete_step(
                    dw_db,
                    module="data",
                    description=f"Cascade delete ut_data for source_ic_nid={ic_nid}",
                    previous_value={
                        "source_ic_nid": ic_nid,
                        **deleted_ids_preview(data_nids),
                    },
                )
            dw_db.query(IcIus).filter(IcIus.ic_nid == ic_nid).delete(synchronize_session=False)
            if ic_iusnids:
                buffer_delete_step(
                    dw_db,
                    module="ic_ius",
                    description=f"Cascade delete ut_ic_ius for source_ic_nid={ic_nid}",
                    previous_value={
                        "source_ic_nid": ic_nid,
                        **deleted_ids_preview(ic_iusnids),
                    },
                )
            for locale in get_dw_language_codes(dw_id):
                ICModel = IndicatorClassification(locale)
                dw_db.query(ICModel).filter(ICModel.ic_nid == ic_nid).delete(synchronize_session=False)
            src_prev = (
                snapshot_entity_for_audit(source_row)
                if source_row
                else {"ic_nid": ic_nid}
            )
            buffer_manual_audit(
                dw_db,
                action="DELETE",
                module="source",
                identifier=str(ic_nid),
                description=f"Deleted source ic_nid={ic_nid} with {deleted_data} data row(s)",
                previous_value=src_prev,
            )

            if publisher_ic_nid is not None:
                other_children = (
                    dw_db.query(ICModelDefault)
                    .filter(
                        ICModelDefault.ic_type == IC_TYPE_SR,
                        ICModelDefault.ic_parent_nid == publisher_ic_nid,
                    )
                    .count()
                )
                if other_children == 0:
                    pub_row = (
                        dw_db.query(ICModelDefault)
                        .filter(ICModelDefault.ic_nid == publisher_ic_nid)
                        .first()
                    )
                    for locale in get_dw_language_codes(dw_id):
                        ICModel = IndicatorClassification(locale)
                        dw_db.query(ICModel).filter(ICModel.ic_nid == publisher_ic_nid).delete(
                            synchronize_session=False
                        )
                    logger.info("Deleted orphaned publisher ic_nid=%s (no remaining sources)", publisher_ic_nid)
                    pub_prev = (
                        snapshot_entity_for_audit(pub_row)
                        if pub_row
                        else {"ic_nid": publisher_ic_nid}
                    )
                    buffer_manual_audit(
                        dw_db,
                        action="DELETE",
                        module="source",
                        identifier=str(publisher_ic_nid),
                        description=f"Deleted orphaned publisher ic_nid={publisher_ic_nid} (no remaining sources)",
                        previous_value=pub_prev,
                    )

            dw_db.commit()
            logger.info("Deleted source ic_nid=%s (data rows=%s)", ic_nid, deleted_data)
        notify_dbmetadata_counts_changed(dw_id)
        return True

    def get_breakup(
        self, dw_id: str, language_code: Optional[str] = None
    ) -> Dict[str, List[str]]:
        """Get distinct publishers, titles, years from Source child rows only (for dropdowns)."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            lang = language_code or get_default_locale(dw_db)
            ICModel = IndicatorClassification(lang)
            q = (
                dw_db.query(ICModel)
                .filter(ICModel.ic_type == IC_TYPE_SR)
                .filter(ICModel.ic_parent_nid != SOURCE_PUBLISHER_PARENT_NID)
            )
            rows = q.all()
            publishers = sorted(
                {str(getattr(r, "publisher", "") or "").strip() or "GLOBAL" for r in rows}
            )
            titles = sorted(
                {str(getattr(r, "title", "") or "").strip() for r in rows if (getattr(r, "title", "") or "").strip()}
            )
            years = sorted(
                {
                    str(getattr(r, "diyear", "") or "").strip()
                    for r in rows
                    if (getattr(r, "diyear", "") or "").strip()
                }
            )
            return {"publishers": publishers, "titles": titles, "years": years}

    def get_association_counts(
        self,
        dw_id: str,
        identifiers: List[Union[int, str]],
        language_code: Optional[str] = None,
    ) -> Dict[str, int]:
        """
        Return association counts for the given sources (for delete confirmation).
        Counts data rows (ut_data.source_nid) and IUS links (ut_ic_ius.ic_nid) for those sources.
        Raises ValueError if any identifier does not resolve to a valid Source child.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            if not identifiers:
                data_count = dw_db.query(func.count(Data.data_nid)).scalar() or 0
                ius_count = dw_db.query(func.count(IcIus.ic_nid)).scalar() or 0
                return {ASSOC_DATA_ROWS: data_count, ASSOC_IUS_ROWS: ius_count}
            source_nids: List[int] = []
            for ident in identifiers:
                nid = self._resolve_identifier_to_source_nid(
                    dw_db, str(ident).strip()
                )
                if nid is None:
                    raise ValueError(
                        f"Source(s) not found: '{ident}' is not a valid source identifier"
                    )
                source_nids.append(nid)
            data_count = (
                dw_db.query(func.count(Data.data_nid))
                .filter(Data.source_nid.in_(source_nids))
                .scalar()
                or 0
            )
            ius_count = (
                dw_db.query(func.count(IcIus.ic_nid))
                .filter(IcIus.ic_nid.in_(source_nids))
                .scalar()
                or 0
            )
            return {ASSOC_DATA_ROWS: data_count, ASSOC_IUS_ROWS: ius_count}

    def multiple_delete(
        self,
        dw_id: str,
        identifiers: List[str],
    ) -> None:
        """
        Delete multiple sources by identifier (src_nid or src_gid) in one transaction.
        Same cascade as delete_source. If a parent publisher has no remaining child sources, it is deleted.
        """
        if not identifiers:
            return
        with get_warehouse_session_from_id(dw_id) as dw_db:
            to_delete: List[int] = []
            for ident in identifiers:
                if not (ident is None or (isinstance(ident, str) and not ident.strip())):
                    nid = self._resolve_identifier_to_source_nid(
                        dw_db, str(ident).strip()
                    )
                    if nid is not None:
                        to_delete.append(nid)
            ICModelDefault = IndicatorClassification(get_default_locale(dw_db))
            publisher_nids: set = set()  # parent ic_nids to check for orphan after deletes
            for ic_nid in to_delete:
                row = dw_db.query(ICModelDefault).filter(ICModelDefault.ic_nid == ic_nid).first()
                if row:
                    pn = getattr(row, "ic_parent_nid", None)
                    if pn is not None:
                        publisher_nids.add(pn)
                ic_iusnids = [
                    r[0]
                    for r in dw_db.query(IcIus.ic_iusnid)
                    .filter(IcIus.ic_nid == ic_nid)
                    .all()
                ]
                data_nids = [
                    r[0]
                    for r in dw_db.query(Data.data_nid)
                    .filter(Data.source_nid == ic_nid)
                    .all()
                ]
                for i in range(0, len(data_nids), _DELETE_CHUNK_SIZE):
                    chunk = data_nids[i : i + _DELETE_CHUNK_SIZE]
                    dw_db.query(Data).filter(
                        Data.data_nid.in_(chunk)
                    ).delete(synchronize_session=False)
                deleted_data = len(data_nids)
                if data_nids or deleted_data:
                    buffer_delete_step(
                        dw_db,
                        module="data",
                        description=f"Cascade delete ut_data for source_ic_nid={ic_nid} (bulk delete)",
                        previous_value={
                            "source_ic_nid": ic_nid,
                            **deleted_ids_preview(data_nids),
                        },
                    )
                dw_db.query(IcIus).filter(IcIus.ic_nid == ic_nid).delete(
                    synchronize_session=False
                )
                if ic_iusnids:
                    buffer_delete_step(
                        dw_db,
                        module="ic_ius",
                        description=f"Cascade delete ut_ic_ius for source_ic_nid={ic_nid} (bulk delete)",
                        previous_value={
                            "source_ic_nid": ic_nid,
                            **deleted_ids_preview(ic_iusnids),
                        },
                    )
                for locale in get_dw_language_codes(dw_id):
                    ICModel = IndicatorClassification(locale)
                    dw_db.query(ICModel).filter(
                        ICModel.ic_nid == ic_nid
                    ).delete(synchronize_session=False)
                src_prev = (
                    snapshot_entity_for_audit(row)
                    if row
                    else {"ic_nid": ic_nid}
                )
                buffer_manual_audit(
                    dw_db,
                    action="DELETE",
                    module="source",
                    identifier=str(ic_nid),
                    description=f"Deleted source ic_nid={ic_nid} (bulk delete)",
                    previous_value=src_prev,
                )
            for pub_nid in publisher_nids:
                remaining = (
                    dw_db.query(ICModelDefault)
                    .filter(
                        ICModelDefault.ic_type == IC_TYPE_SR,
                        ICModelDefault.ic_parent_nid == pub_nid,
                    )
                    .count()
                )
                if remaining == 0:
                    pub_row = (
                        dw_db.query(ICModelDefault)
                        .filter(ICModelDefault.ic_nid == pub_nid)
                        .first()
                    )
                    for locale in get_dw_language_codes(dw_id):
                        ICModel = IndicatorClassification(locale)
                        dw_db.query(ICModel).filter(ICModel.ic_nid == pub_nid).delete(
                            synchronize_session=False
                        )
                    logger.info("Deleted orphaned publisher ic_nid=%s (no remaining sources)", pub_nid)
                    pub_prev = (
                        snapshot_entity_for_audit(pub_row)
                        if pub_row
                        else {"ic_nid": pub_nid}
                    )
                    buffer_manual_audit(
                        dw_db,
                        action="DELETE",
                        module="source",
                        identifier=str(pub_nid),
                        description=f"Deleted orphaned publisher ic_nid={pub_nid} (no remaining sources)",
                        previous_value=pub_prev,
                    )
            if to_delete:
                dw_db.commit()
                logger.info(
                    "Multiple delete sources: ic_nids=%s",
                    to_delete,
                )
        if to_delete:
            notify_dbmetadata_counts_changed(dw_id)
