"""Tests for in-session formula replacement before save."""
from unittest.mock import MagicMock

from apps.datawarehouse.models.datawarehouse import (
    CeIusComputeAddSource,
    CeIusComputeAddTarget,
)
from apps.datawarehouse.services.formula_service import FormulaService


def test_delete_any_formula_for_ius_session_removes_total_and_sources():
    svc = FormulaService()
    dw_db = MagicMock()
    target = MagicMock()
    target.id = 42

    q_target = MagicMock()
    q_target.filter.return_value.first.return_value = target
    q_sources = MagicMock()

    def query_side_effect(model):
        if model is CeIusComputeAddTarget:
            return q_target
        if model is CeIusComputeAddSource:
            return q_sources
        q = MagicMock()
        q.filter.return_value.first.return_value = None
        return q

    dw_db.query.side_effect = query_side_effect

    svc._delete_any_formula_for_ius_session(dw_db, "1", "i1", "u1", "s1")

    q_sources.filter.assert_called()
    q_sources.filter.return_value.delete.assert_called_once()
    dw_db.delete.assert_called_once_with(target)
