"""Merge helper for indicator default subgroup GIDs (no datawarehouse test conftest)."""

from apps.datawarehouse.services.indicator import _normalize_default_sg_gids_from_payload


class _Obj:
    pass


def test_merges_list_and_single_preserves_order() -> None:
    o = _Obj()
    o.default_sg_gids = ["A", "B"]
    o.default_sg_gid = "C"
    assert _normalize_default_sg_gids_from_payload(o) == ["A", "B", "C"]


def test_deduplicates_when_single_duplicates_list() -> None:
    o = _Obj()
    o.default_sg_gids = ["A"]
    o.default_sg_gid = "A"
    assert _normalize_default_sg_gids_from_payload(o) == ["A"]
