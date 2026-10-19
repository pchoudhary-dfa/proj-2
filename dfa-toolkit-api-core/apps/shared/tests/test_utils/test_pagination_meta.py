"""Tests for list pagination meta helpers."""
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total


def test_resolve_unfiltered_total_omits_when_no_filters():
    assert resolve_unfiltered_total(10, 100, has_list_filters=False) is None


def test_resolve_unfiltered_total_omits_when_same_count():
    assert resolve_unfiltered_total(50, 50, has_list_filters=True) is None


def test_resolve_unfiltered_total_returns_when_filtered_smaller():
    assert resolve_unfiltered_total(50, 100, has_list_filters=True) == 100


def test_build_list_pagination_meta_includes_unfiltered_when_different():
    meta = build_list_pagination_meta(
        total_count=25,
        count=10,
        page=1,
        page_size=10,
        total_pages=3,
        total_count_unfiltered=100,
    )
    assert meta["total_count"] == 25
    assert meta["total_count_unfiltered"] == 100


def test_build_list_pagination_meta_omits_unfiltered_when_none():
    meta = build_list_pagination_meta(
        total_count=25,
        count=10,
        page=1,
        page_size=10,
        total_pages=3,
        total_count_unfiltered=None,
    )
    assert "total_count_unfiltered" not in meta
