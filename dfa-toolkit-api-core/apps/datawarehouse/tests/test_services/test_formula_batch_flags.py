"""Tests for batch compute-formula subgroup lists (mocked session)."""

from unittest.mock import MagicMock

import pytest

from apps.datawarehouse.services.formula_service import FormulaService


@pytest.fixture
def formula_service() -> FormulaService:
    return FormulaService()


def test_batch_returns_empty_lists_when_no_indicator_gid(
    formula_service: FormulaService,
) -> None:
    db = MagicMock()
    out = formula_service.batch_subgroup_gids_with_compute_formula(
        db, "7", "", {"U1": ["S1", "S2"]}
    )
    assert out == {"U1": []}
    db.query.assert_not_called()


def test_batch_queries_four_target_tables(formula_service: FormulaService) -> None:
    db = MagicMock()
    chain = MagicMock()
    db.query.return_value = chain
    chain.filter.return_value = chain
    chain.distinct.return_value = chain
    chain.all.return_value = []

    formula_service.batch_subgroup_gids_with_compute_formula(
        db,
        "7",
        "IND1",
        {"U_A": ["S1"]},
    )
    assert db.query.call_count == 4
