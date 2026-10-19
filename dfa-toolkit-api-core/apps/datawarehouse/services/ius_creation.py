"""
Shared IUS (Indicator-Unit-Subgroup) creation logic.

Used by both:
- Indicator service: when creating/updating indicators with unit/subgroup (creates multiple IUS per indicator).
- IUS service: when creating a single IUS via the IUS create API.

Single source of truth for creating one IUS row in a given session.
"""
from typing import Optional, Any, List, Union

from sqlalchemy.orm import Session
from apps.shared.exceptions import NotFound

from apps.datawarehouse.models.datawarehouse import (
    IndicatorUnitSubgroup,
    SubgroupValsSubgroup,
    Subgroup,
)


def get_subgroup_nids_for_ius(dw_db: Session, subgroup_val_nid: int) -> str:
    """
    Get comma-separated subgroup NIDs for a given subgroup value NID.

    Queries the SubgroupValsSubgroup table to find all subgroup NIDs
    associated with a specific subgroup value NID.

    Args:
        dw_db: Datawarehouse database session
        subgroup_val_nid: Subgroup value NID to lookup

    Returns:
        Comma-separated string of subgroup NIDs, or empty string if none found
    """
    records = dw_db.query(SubgroupValsSubgroup).filter(
        SubgroupValsSubgroup.subgroup_val_nid == subgroup_val_nid
    ).order_by(SubgroupValsSubgroup.subgroup_nid).all()

    if not records:
        return ""

    subgroup_nids = sorted(set(record.subgroup_nid for record in records if record.subgroup_nid))
    return ",".join(str(nid) for nid in subgroup_nids)


def get_subgroup_val_nids_from_sg_catg_val_nids(
    dw_db: Session,
    language_code: str,
    sg_catg_val_ids: List[Union[int, str]],
) -> List[int]:
    """
    Get distinct subgroup_val_nids that are linked to the given subgroup category value NIDs or GIDs.

    Uses ut_subgroup_vals_subgroup: for each sg_catg_val_nid (ut_subgroup.subgroup_nid), find all
    subgroup_val_nid linked via the junction table. Subgroup GIDs are resolved via Subgroup(locale).

    Args:
        dw_db: Datawarehouse database session
        language_code: Locale for GID resolution (ut_subgroup_<locale>)
        sg_catg_val_ids: List of subgroup category value NIDs (int) or GIDs (str) from ut_subgroup

    Returns:
        Sorted list of distinct subgroup_val_nids to use for IUS upsert.

    Raises:
        ValueError: If a GID is not found in ut_subgroup.
    """
    if not sg_catg_val_ids:
        return []
    sg_catg_nids: List[int] = []
    SubgroupModel = Subgroup(language_code)
    for x in sg_catg_val_ids:
        if isinstance(x, int):
            sg_catg_nids.append(x)
        else:
            row = dw_db.query(SubgroupModel.subgroup_nid).filter(
                SubgroupModel.subgroup_gid == (x.strip() if isinstance(x, str) else x)
            ).first()
            if not row:
                raise NotFound(f"Subgroup not found for GID: {x!r}")
            sg_catg_nids.append(row[0])
    if not sg_catg_nids:
        return []
    records = (
        dw_db.query(SubgroupValsSubgroup.subgroup_val_nid)
        .filter(SubgroupValsSubgroup.subgroup_nid.in_(sg_catg_nids))
        .distinct()
        .all()
    )
    return sorted(set(r[0] for r in records if r[0] is not None))


def resolve_ius_sg_catg_val_nids(
    dw_db: Session,
    language_code: str,
    ids: List[Union[int, str]],
) -> str:
    """
    Resolve a list of subgroup category value NIDs or GIDs to comma-separated NIDs.

    Used when the API sends sg_catg_val_nids as a list of NIDs (int) or GIDs (str)
    from ut_subgroup. Resolves GIDs via Subgroup(locale) and returns a single
    comma-separated string of subgroup_nid values for storage in ut_indicator_unit_subgroup.subgroup_nids.

    Args:
        dw_db: Datawarehouse database session
        language_code: Locale for GID resolution (ut_subgroup_<locale>)
        ids: List of subgroup_nid (int) or subgroup_gid (str) from ut_subgroup

    Returns:
        Comma-separated string of subgroup NIDs.

    Raises:
        ValueError: If a GID is not found in ut_subgroup for the locale.
    """
    if not ids:
        return ""
    nids: List[int] = []
    SubgroupModel = Subgroup(language_code)
    for x in ids:
        if isinstance(x, int):
            nids.append(x)
        else:
            row = dw_db.query(SubgroupModel.subgroup_nid).filter(
                SubgroupModel.subgroup_gid == (x.strip() if isinstance(x, str) else x)
            ).first()
            if not row:
                raise NotFound(f"Subgroup not found for GID: {x!r}")
            nids.append(row[0])
    return ",".join(str(n) for n in sorted(set(nids)))


def create_ius_record(
    dw_db: Session,
    indicator_nid: int,
    unit_nid: int,
    subgroup_val_nid: int,
    *,
    subgroup_nids: Optional[str] = None,
    min_value: float = 0.0,
    max_value: float = 0.0,
    data_exist: bool = False,
    isdefaultsubgroup: bool = False,
    avlmindatavalue: Optional[float] = 0.0,
    avlmaxdatavalue: Optional[float] = 0.0,
    avlmintimeperiod: Optional[str] = None,
    avlmaxtimeperiod: Optional[str] = None,
) -> Any:
    """
    Create a single IUS (Indicator-Unit-Subgroup) row in the given session.
    Does not commit; caller is responsible for transaction.

    Used by indicator create/update (multiple IUS per indicator) and by IUS create API (single IUS).

    Args:
        dw_db: Datawarehouse database session
        indicator_nid: Indicator NID
        unit_nid: Unit NID
        subgroup_val_nid: Subgroup value NID
        subgroup_nids: Comma-separated subgroup NIDs; if None, computed from SubgroupValsSubgroup
        min_value: Minimum value (default 0)
        max_value: Maximum value (default 0)
        data_exist: Whether data exists (default False)
        isdefaultsubgroup: Whether this is the default subgroup (default False)
        avlmindatavalue: Available min data value (default 0)
        avlmaxdatavalue: Available max data value (default 0)
        avlmintimeperiod: Available min time period (default None)
        avlmaxtimeperiod: Available max time period (default None)

    Returns:
        The created IndicatorUnitSubgroup ORM instance (with iusnid set after flush).
    """
    if subgroup_nids is None:
        subgroup_nids = get_subgroup_nids_for_ius(dw_db, subgroup_val_nid)

    ius = IndicatorUnitSubgroup(
        indicator_nid=indicator_nid,
        unit_nid=unit_nid,
        subgroup_val_nid=subgroup_val_nid,
        subgroup_nids=subgroup_nids or None,
        min_value=min_value,
        max_value=max_value,
        data_exist=data_exist,
        isdefaultsubgroup=isdefaultsubgroup,
        avlmindatavalue=avlmindatavalue,
        avlmaxdatavalue=avlmaxdatavalue,
        avlmintimeperiod=avlmintimeperiod,
        avlmaxtimeperiod=avlmaxtimeperiod,
    )
    dw_db.add(ius)
    dw_db.flush()
    return ius
