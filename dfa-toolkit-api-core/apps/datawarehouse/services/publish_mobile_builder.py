"""
Mobile app package builder.

Generates JSON files matching the exact v5 CakePHP PublishForMobile output format,
then bundles everything into a versioned ZIP archive.

Field-name casing notes (verified from real v5 packages):
  - master_source.json:  IC_GId  (uppercase G)
  - master_ic.json:      IC_Gid  (lowercase g) — intentional v5 difference
  - master_ic_ius.json:  IC_Gid  (lowercase g), DS_Order/D_IUS_NID/IUS_NID are STRINGS
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import zipfile
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import (
    Area,
    AreaLevel,
    Data,
    Indicator,
    IndicatorClassification,
    IndicatorUnitSubgroup,
    IcIus,
    MetadataCategory,
    MetadataReport,
    SubgroupVal,
    TimePeriod,
    Unit,
)
from apps.shared.config.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_json(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------------------
# Per-file generators
# ---------------------------------------------------------------------------

def _build_master_source(dw_db, locale: str) -> List[dict]:
    """IC nodes where ic_type='SR' — used as master_source.json."""
    IC = IndicatorClassification(locale)
    rows = dw_db.query(IC).filter(IC.ic_type == "SR").order_by(IC.ic_order).all()
    result = []
    for r in rows:
        result.append({
            "IC_NId": r.ic_nid,
            "IC_Parent_NId": r.ic_parent_nid if r.ic_parent_nid and r.ic_parent_nid != 0 else -1,
            "IC_GId": r.ic_gid,          # uppercase G — matches v5 master_source.json
            "IC_Name": r.ic_name,
            "IC_Order": r.ic_order or 0,
        })
    return result


def _build_master_area(dw_db, locale: str) -> List[dict]:
    """All areas — master_area.json."""
    AreaM = Area(locale)
    rows = dw_db.query(AreaM).order_by(AreaM.area_nid).all()
    result = []
    for r in rows:
        result.append({
            "A_NId": r.area_nid,
            "A_Id": r.area_id or "",
            "A_Name": r.area_name or "",
            "A_Level": r.area_level or 0,
            "P_NId": r.area_parent_nid if (r.area_parent_nid and r.area_parent_nid != 0) else -1,
            "A_LayerName": r.area_map or "",   # always from area_map column, never hardcoded empty
        })
    return result


def _build_master_arealevel(dw_db, locale: str) -> dict:
    """Area levels + root area code — master_arealevel.json."""
    AL = AreaLevel(locale)
    AreaM = Area(locale)

    levels = dw_db.query(AL).order_by(AL.area_level).all()
    root_area = (
        dw_db.query(AreaM)
        .filter(AreaM.area_level == 1)
        .first()
    )
    default_code = root_area.area_id if root_area and root_area.area_id else ""

    area_levels = [{"A_Level": lv.area_level, "A_LName": lv.area_level_name or ""} for lv in levels]
    return {"defaultAreaCode": default_code, "areaLevels": area_levels}


def _build_master_ic(dw_db, locale: str, ic_types: List[str]) -> List[dict]:
    """IC tree filtered by selected types — master_ic.json.
    Uses IC_Gid (lowercase g) — intentional v5 difference from master_source.json.
    """
    IC = IndicatorClassification(locale)
    query = dw_db.query(IC)
    if ic_types:
        query = query.filter(IC.ic_type.in_(ic_types))
    rows = query.order_by(IC.ic_order).all()
    result = []
    for r in rows:
        result.append({
            "IC_NId": r.ic_nid,
            "IC_Gid": r.ic_gid,          # lowercase g — intentional
            "IC_Name": r.ic_name,
            "IC_Type": r.ic_type,
            "IC_Parent_NId": r.ic_parent_nid if (r.ic_parent_nid and r.ic_parent_nid != 0) else -1,
        })
    return result


def _build_master_ic_ius(dw_db, locale: str, ic_types: List[str], exclude_no_data: bool) -> List[dict]:
    """IUS rows grouped by IC — master_ic_ius.json.
    DS_Order, D_IUS_NID, S_Order, IUS_NID are STRINGS (verified from real v5 package).
    """
    IC = IndicatorClassification(locale)
    IndM = Indicator(locale)
    UnitM = Unit(locale)
    SgVal = SubgroupVal(locale)

    ic_query = dw_db.query(IC)
    if ic_types:
        ic_query = ic_query.filter(IC.ic_type.in_(ic_types))
    ics = {r.ic_nid: r for r in ic_query.all()}

    ic_ius_rows = (
        dw_db.query(IcIus)
        .filter(IcIus.ic_nid.in_(list(ics.keys())))
        .order_by(IcIus.ic_ius_order)
        .all()
    )

    iusnids = list({r.iusnid for r in ic_ius_rows})
    if not iusnids:
        return []

    ius_objs = {
        r.iusnid: r
        for r in dw_db.query(IndicatorUnitSubgroup).filter(IndicatorUnitSubgroup.iusnid.in_(iusnids)).all()
    }
    if exclude_no_data:
        ius_objs = {nid: ius for nid, ius in ius_objs.items() if ius.data_exist}

    ind_nids = list({ius.indicator_nid for ius in ius_objs.values() if ius.indicator_nid})
    unit_nids = list({ius.unit_nid for ius in ius_objs.values() if ius.unit_nid})
    sg_val_nids = list({ius.subgroup_val_nid for ius in ius_objs.values() if ius.subgroup_val_nid})

    indicators = {r.indicator_nid: r for r in dw_db.query(IndM).filter(IndM.indicator_nid.in_(ind_nids)).all()} if ind_nids else {}
    units = {r.unit_nid: r for r in dw_db.query(UnitM).filter(UnitM.unit_nid.in_(unit_nids)).all()} if unit_nids else {}
    sg_vals = {r.subgroup_val_nid: r for r in dw_db.query(SgVal).filter(SgVal.subgroup_val_nid.in_(sg_val_nids)).all()} if sg_val_nids else {}

    # Group ic_ius_rows by ic_nid, keeping original order
    ic_to_ic_ius: Dict[int, List] = defaultdict(list)
    for row in ic_ius_rows:
        ic_to_ic_ius[row.ic_nid].append(row)

    # Build ic_ius entries; one dict per ic_ius row, with ICIUSDataSubgroups
    # We need to also group by I+U within each IC for ICIUSDataSubgroups (all subgroups for same IUS combo)
    result = []
    seen_iu_per_ic: Dict[tuple, List[dict]] = {}  # (ic_nid, indicator_nid, unit_nid) -> first entry

    for ic_nid, ic_ius_list in ic_to_ic_ius.items():
        ic = ics.get(ic_nid)
        if ic is None:
            continue
        for ic_ius_row in ic_ius_list:
            iusnid = ic_ius_row.iusnid
            ius = ius_objs.get(iusnid)
            if ius is None:
                continue

            ind = indicators.get(ius.indicator_nid)
            unit = units.get(ius.unit_nid)
            sg_val = sg_vals.get(ius.subgroup_val_nid)

            if ind is None or unit is None or sg_val is None:
                continue

            key = (ic_nid, ius.indicator_nid, ius.unit_nid)
            sg_entry = {
                "S_Name": sg_val.subgroup_val or "",
                "S_Gid": sg_val.subgroup_val_gid or "",
                "S_Order": str(sg_val.subgroup_val_order or 0),   # STRING
                "IUS_NID": str(iusnid),                           # STRING
            }

            if key in seen_iu_per_ic:
                seen_iu_per_ic[key]["ICIUSDataSubgroups"].append(sg_entry)
            else:
                entry = {
                    "IC_Type": ic.ic_type,
                    "IC_Name": ic.ic_name,
                    "IC_Gid": ic.ic_gid,                          # lowercase g
                    "IC_Nid": ic.ic_nid,
                    "IC_Parent_Nid": ic.ic_parent_nid if (ic.ic_parent_nid and ic.ic_parent_nid != 0) else -1,
                    "I_Gid": ind.indicator_gid or "",
                    "I_HighIsGood": bool(ind.highisgood),
                    "I_Name": ind.indicator_name or "",
                    "I_MetaExists": False,                         # filled in later after metadata check
                    "U_Gid": unit.unit_gid or "",
                    "U_Name": unit.unit_name or "",
                    "DS_Name": sg_val.subgroup_val or "",
                    "DS_Gid": sg_val.subgroup_val_gid or "",
                    "DS_Order": str(sg_val.subgroup_val_order or 0),  # STRING
                    "D_IUS_NID": str(iusnid),                     # STRING
                    "ICIUSDataSubgroups": [sg_entry],
                }
                seen_iu_per_ic[key] = entry
                result.append(entry)

    return result


def _build_metadata_files(dw_db, locale: str, ic_ius_data: List[dict], metadata_dir: str) -> None:
    """Write metadata/{indicator_gid}.json files and back-fill I_MetaExists in ic_ius_data."""
    IndM = Indicator(locale)
    MetaCat = MetadataCategory(locale)
    MetaRep = MetadataReport(locale)

    # Gather unique indicator GIDs from ic_ius_data
    ind_gids: Set[str] = {row["I_Gid"] for row in ic_ius_data if row.get("I_Gid")}
    if not ind_gids:
        return

    ind_rows = {
        r.indicator_gid: r
        for r in dw_db.query(IndM).filter(IndM.indicator_gid.in_(list(ind_gids))).all()
    }

    # Load all categories once
    cats = {
        r.categorynid: r
        for r in dw_db.query(MetaCat).all()
    }

    inds_with_meta: Set[str] = set()
    for gid, ind in ind_rows.items():
        meta_rows = (
            dw_db.query(MetaRep)
            .filter(MetaRep.target_nid == ind.indicator_nid)
            .all()
        )
        if not meta_rows:
            continue

        meta_list = []
        for m in meta_rows:
            cat = cats.get(m.category_nid)
            meta_list.append({
                "catId": m.category_nid,
                "catName": cat.categoryname if cat else "",
                "metadataId": m.metadatareport_nid,
                "metadata": m.metadata_text or "",
            })

        filepath = os.path.join(metadata_dir, f"{gid}.json")
        _write_json(filepath, meta_list)
        inds_with_meta.add(gid)

    # Back-fill I_MetaExists
    for row in ic_ius_data:
        if row.get("I_Gid") in inds_with_meta:
            row["I_MetaExists"] = True


def _build_data_folders(
    dw_db,
    locale: str,
    ic_types: List[str],
    exclude_no_data: bool,
    exclude_tp_nids: Set[int],
    data_dir: str,
) -> None:
    """Build {ius_nid}/l{level}.json data files in JSON-stat format."""
    IndM = Indicator(locale)
    UnitM = Unit(locale)
    SgVal = SubgroupVal(locale)
    AreaM = Area(locale)

    # Collect IUS NID to (indicator, unit, subgroup_val) mapping
    ic_filter = []
    if ic_types:
        IC = IndicatorClassification(locale)
        ic_nids = [r.ic_nid for r in dw_db.query(IC).filter(IC.ic_type.in_(ic_types)).all()]
        ic_ius_rows = dw_db.query(IcIus).filter(IcIus.ic_nid.in_(ic_nids)).all()
        ic_filter = [r.iusnid for r in ic_ius_rows]

    ius_query = dw_db.query(IndicatorUnitSubgroup)
    if ic_filter:
        ius_query = ius_query.filter(IndicatorUnitSubgroup.iusnid.in_(ic_filter))
    if exclude_no_data:
        ius_query = ius_query.filter(IndicatorUnitSubgroup.data_exist == True)

    all_ius = ius_query.all()
    if not all_ius:
        return

    iusnids = [r.iusnid for r in all_ius]

    # Load indicators, units, sg_vals for labels
    ind_nids = list({r.indicator_nid for r in all_ius if r.indicator_nid})
    unit_nids = list({r.unit_nid for r in all_ius if r.unit_nid})
    sg_val_nids = list({r.subgroup_val_nid for r in all_ius if r.subgroup_val_nid})

    indicators = {r.indicator_nid: r for r in dw_db.query(IndM).filter(IndM.indicator_nid.in_(ind_nids)).all()} if ind_nids else {}
    units = {r.unit_nid: r for r in dw_db.query(UnitM).filter(UnitM.unit_nid.in_(unit_nids)).all()} if unit_nids else {}
    sg_vals = {r.subgroup_val_nid: r for r in dw_db.query(SgVal).filter(SgVal.subgroup_val_nid.in_(sg_val_nids)).all()} if sg_val_nids else {}

    # Load all areas for this locale
    all_areas_list = dw_db.query(AreaM).all()
    areas_by_nid = {r.area_nid: r for r in all_areas_list}

    # Load time periods
    tps_by_nid = {r.timeperiod_nid: r for r in dw_db.query(TimePeriod).all()}

    # Process each IUS
    for ius in all_ius:
        ind = indicators.get(ius.indicator_nid)
        unit = units.get(ius.unit_nid)
        sg_val = sg_vals.get(ius.subgroup_val_nid)

        if not (ind and unit and sg_val):
            continue

        # Query all data rows for this IUS
        data_query = dw_db.query(Data).filter(Data.iusnid == ius.iusnid)
        if exclude_tp_nids:
            data_query = data_query.filter(Data.timeperiod_nid.notin_(exclude_tp_nids))

        data_rows = data_query.all()
        if not data_rows:
            continue

        # Group by area_level
        level_data: Dict[int, List] = defaultdict(list)
        for d in data_rows:
            area = areas_by_nid.get(d.area_nid)
            if area is None:
                continue
            level_data[area.area_level].append(d)

        for level, rows in level_data.items():
            _write_ius_level_json(
                ius=ius,
                ind=ind,
                unit=unit,
                sg_val=sg_val,
                rows=rows,
                areas_by_nid=areas_by_nid,
                tps_by_nid=tps_by_nid,
                level=level,
                data_dir=data_dir,
            )


def _write_ius_level_json(
    ius,
    ind,
    unit,
    sg_val,
    rows: List,
    areas_by_nid: dict,
    tps_by_nid: dict,
    level: int,
    data_dir: str,
) -> None:
    """Write one {ius_nid}/l{level}.json in JSON-stat format."""
    # Collect unique areas and TPs appearing in these rows (preserve insertion order)
    area_nids_ordered: List[int] = []
    area_nids_seen: Set[int] = set()
    tp_nids_ordered: List[int] = []
    tp_nids_seen: Set[int] = set()

    for d in rows:
        if d.area_nid not in area_nids_seen:
            area_nids_ordered.append(d.area_nid)
            area_nids_seen.add(d.area_nid)
        if d.timeperiod_nid not in tp_nids_seen:
            tp_nids_ordered.append(d.timeperiod_nid)
            tp_nids_seen.add(d.timeperiod_nid)

    n_areas = len(area_nids_ordered)
    n_tps = len(tp_nids_ordered)

    area_index = {nid: i for i, nid in enumerate(area_nids_ordered)}
    tp_index = {nid: i for i, nid in enumerate(tp_nids_ordered)}

    # Build MRD (Most Recent Data): latest time period per area
    mrd_per_area: Dict[int, Optional[str]] = {}
    for d in rows:
        tp = tps_by_nid.get(d.timeperiod_nid)
        if tp is None:
            continue
        if d.area_nid not in mrd_per_area or d.ismrd:
            if d.ismrd:
                mrd_per_area[d.area_nid] = tp.timeperiod

    # Build value + status arrays (size = n_areas * n_tps, area varies slowest)
    values: List = [None] * (n_areas * n_tps)
    statuses: List = [None] * (n_areas * n_tps)

    for d in rows:
        ai = area_index.get(d.area_nid)
        ti = tp_index.get(d.timeperiod_nid)
        if ai is None or ti is None:
            continue
        idx = ai * n_tps + ti
        values[idx] = d.data_value
        statuses[idx] = d.source_nid

    # JSON-stat structure
    ind_gid = ind.indicator_gid or ""
    ind_name = ind.indicator_name or ""
    unit_gid = unit.unit_gid or ""
    unit_name = unit.unit_name or ""
    sg_gid = sg_val.subgroup_val_gid or ""
    sg_name = sg_val.subgroup_val or ""

    area_index_obj = {areas_by_nid[nid].area_id: i for i, nid in enumerate(area_nids_ordered) if areas_by_nid.get(nid)}
    area_label_obj = {areas_by_nid[nid].area_id: areas_by_nid[nid].area_name for nid in area_nids_ordered if areas_by_nid.get(nid)}
    area_note_obj = {
        areas_by_nid[nid].area_id: ([mrd_per_area[nid]] if mrd_per_area.get(nid) else [])
        for nid in area_nids_ordered
        if areas_by_nid.get(nid)
    }

    tp_index_obj = {}
    tp_label_obj = {}
    for i, nid in enumerate(tp_nids_ordered):
        tp = tps_by_nid.get(nid)
        if tp:
            tp_index_obj[tp.timeperiod] = i
            tp_label_obj[tp.timeperiod] = tp.timeperiod

    unit_decimal = 2  # default; v5 uses 2

    dataset: Dict[str, Any] = {
        "label": str(ius.iusnid),   # STRING — verified from real package
        "dimension": {
            "id": ["A", "I", "U", "S", "TP"],
            "size": [n_areas, 1, 1, 1, n_tps],
            "role": {"time": ["TP"], "geo": ["A"], "metric": ["U"]},
            "I": {
                "label": "Indicator",
                "category": {
                    "index": {ind_gid: 0},
                    "label": {ind_gid: ind_name},
                },
            },
            "U": {
                "label": "Unit",
                "category": {
                    "index": {unit_gid: 0},
                    "label": {unit_gid: unit_name},
                    "unit": {unit_gid: {"decimal": unit_decimal, "label": ""}},
                },
            },
            "A": {
                "label": "Area",
                "category": {
                    "index": area_index_obj,
                    "label": area_label_obj,
                    "note": area_note_obj,
                },
            },
            "S": {
                "label": "Subgroup",
                "category": {
                    "index": [sg_gid],       # ARRAY — verified from real package
                    "label": {sg_gid: sg_name},
                },
            },
            "TP": {
                "label": "Time Period",
                "category": {
                    "index": tp_index_obj,
                    "label": tp_label_obj,
                },
            },
        },
        "value": values,
        "status": statuses,
    }

    folder = os.path.join(data_dir, str(ius.iusnid))
    os.makedirs(folder, exist_ok=True)
    filepath = os.path.join(folder, f"l{level}.json")
    _write_json(filepath, {"DatasetId": dataset})


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def build_package(
    dw_id: str,
    package_id: int,
    update_version: int,
    data_files: str,
    languages: str,
    ic_types: Optional[str],
    exclude_no_data: bool,
    exclude_time_periods: Optional[str],
) -> str:
    """
    Build the mobile app ZIP package.

    Returns the final ZIP file path on success.
    Raises on any error (caller should mark package as 'failed').
    """
    base_dir = os.path.join(
        settings.PUBLISH_MOBILE_FILES_DIR,
        str(dw_id),
        "data",
    )
    staging_dir = os.path.join(base_dir, "applicationPackage")
    zip_path = os.path.join(base_dir, f"{update_version}.zip")

    # Cleanup any previous staging folder for this version
    if os.path.exists(staging_dir):
        shutil.rmtree(staging_dir)

    files_selected = [f.strip() for f in (data_files or "").split(",") if f.strip()]
    langs_selected = [lg.strip() for lg in (languages or "").split(",") if lg.strip()]
    ic_types_list = [t.strip() for t in (ic_types or "").split(",") if t.strip()]
    exclude_tp_set: Set[int] = set()
    if exclude_time_periods:
        for v in exclude_time_periods.split(","):
            v = v.strip()
            if v.isdigit():
                exclude_tp_set.add(int(v))

    want_source = "source" in files_selected
    want_area = "area" in files_selected
    want_indicator = "indicator" in files_selected
    want_ic = "ic" in files_selected
    want_data_folders = "data_folders" in files_selected

    with get_warehouse_session_from_id(dw_id) as dw_db:
        for lang in langs_selected:
            lang_base = os.path.join(staging_dir, "default", "database", lang)
            template_dir = os.path.join(lang_base, "template")
            os.makedirs(template_dir, exist_ok=True)

            if want_source:
                logger.info("Building master_source.json [%s] lang=%s", dw_id, lang)
                data = _build_master_source(dw_db, lang)
                _write_json(os.path.join(template_dir, "master_source.json"), data)

            if want_area:
                logger.info("Building master_area.json [%s] lang=%s", dw_id, lang)
                _write_json(os.path.join(template_dir, "master_area.json"), _build_master_area(dw_db, lang))
                _write_json(os.path.join(template_dir, "master_arealevel.json"), _build_master_arealevel(dw_db, lang))

            if want_ic:
                logger.info("Building master_ic.json [%s] lang=%s", dw_id, lang)
                ic_data = _build_master_ic(dw_db, lang, ic_types_list)
                _write_json(os.path.join(template_dir, "master_ic.json"), ic_data)

            ic_ius_data: List[dict] = []
            if want_indicator:
                logger.info("Building master_ic_ius.json [%s] lang=%s", dw_id, lang)
                ic_ius_data = _build_master_ic_ius(dw_db, lang, ic_types_list, exclude_no_data)
                _write_json(os.path.join(template_dir, "master_ic_ius.json"), ic_ius_data)

                metadata_dir = os.path.join(template_dir, "metadata")
                os.makedirs(metadata_dir, exist_ok=True)
                logger.info("Building metadata files [%s] lang=%s", dw_id, lang)
                _build_metadata_files(dw_db, lang, ic_ius_data, metadata_dir)

            if want_data_folders:
                logger.info("Building data folders [%s] lang=%s", dw_id, lang)
                data_dir = os.path.join(lang_base, "data")
                os.makedirs(data_dir, exist_ok=True)
                _build_data_folders(
                    dw_db=dw_db,
                    locale=lang,
                    ic_types=ic_types_list,
                    exclude_no_data=exclude_no_data,
                    exclude_tp_nids=exclude_tp_set,
                    data_dir=data_dir,
                )

    # ZIP the staging folder
    logger.info("Creating ZIP [%s] version=%s at %s", dw_id, update_version, zip_path)
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)
    _zip_directory(staging_dir, zip_path)
    logger.info("Package ready: %s", zip_path)
    return zip_path


def _zip_directory(source_dir: str, zip_path: str) -> None:
    """Zip the entire source_dir; entries inside the ZIP are relative to source_dir's parent."""
    parent = os.path.dirname(source_dir)
    folder_name = os.path.basename(source_dir)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(source_dir):
            for fname in files:
                abs_path = os.path.join(root, fname)
                arc_name = os.path.join(folder_name, os.path.relpath(abs_path, source_dir))
                zf.write(abs_path, arc_name)


def get_zip_path(dw_id: str, version: int) -> str:
    return os.path.join(settings.PUBLISH_MOBILE_FILES_DIR, str(dw_id), "data", f"{version}.zip")
