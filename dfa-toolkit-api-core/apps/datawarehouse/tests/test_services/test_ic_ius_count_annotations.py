"""Unit tests for IC → IUS count annotations on classification trees."""
from __future__ import annotations

from apps.datawarehouse.services.indicator_classification import compute_ic_ius_count_annotations


def test_subtree_union_includes_internal_node_mappings() -> None:
    """Parent badge = distinct IUS on self plus all descendants (full subtree)."""
    flat = [
        {"ic_nid": 1, "ic_parent_nid": 0, "ic_name": "Root"},
        {"ic_nid": 2, "ic_parent_nid": 1, "ic_name": "Child"},
    ]
    ius_by_ic = {
        1: {101},  # internal node: included in subtree count for node 1
        2: {201, 202},
    }
    compute_ic_ius_count_annotations(flat, ius_by_ic)
    assert flat[0]["ic_ius_subtree_union_count"] == 3
    assert flat[1]["ic_ius_subtree_union_count"] == 2


def test_internal_node_only_mappings_counted_when_no_leaf_mappings() -> None:
    flat = [
        {"ic_nid": 1, "ic_parent_nid": 0},
        {"ic_nid": 2, "ic_parent_nid": 1},
    ]
    ius_by_ic = {1: {42}, 2: set()}
    compute_ic_ius_count_annotations(flat, ius_by_ic)
    assert flat[0]["ic_ius_subtree_union_count"] == 1
    assert flat[1]["ic_ius_subtree_union_count"] == 0


def test_same_ius_on_two_leaves_counted_once_in_parent_union() -> None:
    flat = [
        {"ic_nid": 1, "ic_parent_nid": 0},
        {"ic_nid": 2, "ic_parent_nid": 1},
        {"ic_nid": 3, "ic_parent_nid": 1},
    ]
    ius_by_ic = {
        2: {500},
        3: {500},
    }
    compute_ic_ius_count_annotations(flat, ius_by_ic)
    assert flat[0]["ic_ius_subtree_union_count"] == 1
