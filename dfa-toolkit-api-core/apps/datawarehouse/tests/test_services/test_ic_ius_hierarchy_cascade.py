"""Unit tests for v5-aligned IC–IUS association (associateIcWithIUS scope) in IndicatorClassificationService."""
from unittest.mock import MagicMock, patch

import pytest

from apps.datawarehouse.models.datawarehouse import IcIus
from apps.datawarehouse.services.indicator_classification import IndicatorClassificationService


@pytest.fixture
def svc() -> IndicatorClassificationService:
    return IndicatorClassificationService()


def test_v5_ic_ius_scope_orders_and_dedupes(svc: IndicatorClassificationService) -> None:
    dw_db = MagicMock()
    with patch.object(svc, "_ic_ancestor_nids_ordered", return_value=[10, 20]):
        with patch.object(svc, "_first_child_chain_nids", return_value=[30]):
            with patch.object(svc, "_v5_ancestor_nids_when_parent_param") as parent_anc:
                scope = svc._v5_ic_ius_scope_ic_nids(dw_db, ic_nid=5, parent_ic_nid=None)
                parent_anc.assert_not_called()

    assert scope == [10, 20, 30, 5]

    with patch.object(svc, "_v5_ancestor_nids_when_parent_param", return_value=[2, 7]):
        with patch.object(svc, "_ic_ancestor_nids_ordered") as from_ic:
            with patch.object(svc, "_first_child_chain_nids", return_value=[]):
                scope_p = svc._v5_ic_ius_scope_ic_nids(dw_db, ic_nid=5, parent_ic_nid=99)
                from_ic.assert_not_called()
    assert scope_p == [2, 7, 5]


def test_v5_ic_ius_scope_deduplicates_overlapping_ids(svc: IndicatorClassificationService) -> None:
    dw_db = MagicMock()
    with patch.object(svc, "_ic_ancestor_nids_ordered", return_value=[5]):
        with patch.object(svc, "_first_child_chain_nids", return_value=[]):
            scope = svc._v5_ic_ius_scope_ic_nids(dw_db, ic_nid=5, parent_ic_nid=None)
    assert scope == [5]


def test_associate_ic_with_ius_v5_deletes_removed_ius_across_scope(svc: IndicatorClassificationService) -> None:
    dw_db = MagicMock()
    with patch.object(svc, "_v5_ic_ius_scope_ic_nids", return_value=[7, 8]):
        # existing IUS on edited ic_nid 100: {900}
        col_q = MagicMock()
        col_f = MagicMock()
        col_q.filter.return_value = col_f
        col_f.all.return_value = [MagicMock(iusnid=900)]

        del_f = MagicMock()
        del_q = MagicMock()
        del_q.filter.return_value = del_f
        del_f.delete = MagicMock(return_value=0)

        def query_side_effect(*args):
            if args and args[0] is IcIus:
                return del_q
            return col_q

        dw_db.query.side_effect = query_side_effect

        out = svc._associate_ic_with_ius_v5(dw_db, ic_nid=100, target_ius_nids=[], parent_ic_nid=None)

        assert out["removed"] == 1
        assert out["added"] == 0
        del_f.delete.assert_called_once_with(synchronize_session=False)


def test_associate_ic_with_ius_v5_inserts_new_pairs_on_scope(svc: IndicatorClassificationService) -> None:
    dw_db = MagicMock()
    with patch.object(svc, "_v5_ic_ius_scope_ic_nids", return_value=[7]):
        col_q = MagicMock()
        col_f = MagicMock()
        col_q.filter.return_value = col_f
        col_f.all.return_value = []  # no existing on edited IC

        pair_q = MagicMock()
        pair_f = MagicMock()
        pair_q.filter.return_value = pair_f
        pair_f.all.return_value = []  # no existing pairs

        def query_side_effect(*args):
            if len(args) >= 2:
                return pair_q
            return col_q

        dw_db.query.side_effect = query_side_effect

        out = svc._associate_ic_with_ius_v5(dw_db, ic_nid=100, target_ius_nids=[555], parent_ic_nid=None)

        assert out["added"] == 1
        assert out["removed"] == 0
        assert dw_db.add.call_count == 1
        added = dw_db.add.call_args[0][0]
        assert isinstance(added, IcIus)
        assert added.ic_nid == 7
        assert added.iusnid == 555
