"""Unit tests for indicator IUS / s_gid helpers (no HTTP client)."""

from apps.datawarehouse.services.indicator import _finalize_s_gid_unit_config


def test_finalize_s_gid_sorts_ius_nid_in_lockstep_with_sg_gid():
    cfg = {
        "sg_gid": ["zebra", "apple"],
        "ius_nid": [200, 100],
        "default_sg_gids": ["apple"],
    }
    _finalize_s_gid_unit_config(cfg)
    assert cfg["sg_gid"] == ["apple", "zebra"]
    assert cfg["ius_nid"] == [100, 200]


def test_finalize_s_gid_drops_mismatched_ius_nid_length():
    cfg = {"sg_gid": ["a", "b"], "ius_nid": [1], "default_sg_gids": []}
    _finalize_s_gid_unit_config(cfg)
    assert cfg["sg_gid"] == ["a", "b"]
    assert "ius_nid" not in cfg
