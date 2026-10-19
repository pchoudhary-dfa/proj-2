"""Subgroup category value update triggers subgroup-val name regeneration when label changes."""

from dataclasses import dataclass
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

from apps.datawarehouse.services.sg_category_values import SgCategoryValuesService


@dataclass
class _FakeCategoryValueUpdate:
    """Minimal stand-in for SgCategoryValueUpdateSchema (avoids adaptation key-validator in unit tests)."""

    subgroup_name: Optional[str] = None
    subgroup_gid: Optional[str] = None
    subgroup_order: Optional[int] = None
    subgroup_global: Optional[bool] = None


def _fake_locale_model():
    m = MagicMock()
    m.subgroup_type_nid = MagicMock()
    m.subgroup_type = MagicMock()
    m.subgroup_nid = MagicMock()
    m.subgroup_gid = MagicMock()
    m.subgroup_order = MagicMock()
    m.subgroup_global = MagicMock()
    m.is_system = MagicMock()
    return m


@pytest.fixture
def svc():
    return SgCategoryValuesService()


class TestUpdateValuePropagatesSubgroupValNames:
    @patch("apps.datawarehouse.services.sg_vals.SgValsService")
    @patch("apps.datawarehouse.services.sg_category_values.apply_locale_update")
    @patch("apps.datawarehouse.services.sg_category_values.SubgroupCategoryValueResponseSchema.from_record")
    @patch("apps.datawarehouse.services.sg_category_values.log_transaction")
    @patch("apps.datawarehouse.services.sg_category_values.get_warehouse_session_from_id")
    @patch("apps.datawarehouse.services.sg_category_values.get_default_locale", return_value="en")
    def test_calls_regenerate_when_subgroup_name_in_payload(
        self,
        _mock_def_locale,
        mock_session_cm,
        _mock_log_tx,
        mock_from_record,
        _mock_apply_locale,
        mock_sg_vals_cls,
        svc,
    ):
        row = MagicMock()
        row.subgroup_nid = 42
        row.subgroup_order = 5
        row.subgroup_gid = "gid-x"
        dw_db = MagicMock()
        q = MagicMock()
        q.filter.return_value.first.return_value = row
        dw_db.query.return_value = q
        mock_session_cm.return_value.__enter__.return_value = dw_db

        mock_from_record.return_value = {"subgroup_nid": 42, "subgroup_name": "Updated"}
        mock_instance = MagicMock()
        mock_instance.update_affected_subgroup_names.return_value = {
            "updated_count": 3,
            "affected_subgroups": [10, 11, 12],
        }
        mock_sg_vals_cls.return_value = mock_instance

        payload = _FakeCategoryValueUpdate(subgroup_name="Updated")
        with patch(
            "apps.datawarehouse.services.sg_category_values.Subgroup",
            return_value=_fake_locale_model(),
        ):
            out = svc.update_value("warehouse-1", "42", payload, language_code="en")

        assert out == {"subgroup_nid": 42, "subgroup_name": "Updated"}
        mock_instance.update_affected_subgroup_names.assert_called_once_with(
            "warehouse-1",
            42,
            "en",
        )

    @patch("apps.datawarehouse.services.sg_vals.SgValsService")
    @patch("apps.datawarehouse.services.sg_category_values.apply_locale_update")
    @patch("apps.datawarehouse.services.sg_category_values.SubgroupCategoryValueResponseSchema.from_record")
    @patch("apps.datawarehouse.services.sg_category_values.log_transaction")
    @patch("apps.datawarehouse.services.sg_category_values.get_warehouse_session_from_id")
    @patch("apps.datawarehouse.services.sg_category_values.get_default_locale", return_value="en")
    def test_no_regenerate_when_only_structural_fields(
        self,
        _mock_def_locale,
        mock_session_cm,
        _mock_log_tx,
        mock_from_record,
        _mock_apply_locale,
        mock_sg_vals_cls,
        svc,
    ):
        row = MagicMock()
        row.subgroup_nid = 42
        row.subgroup_order = 5
        row.subgroup_gid = "gid-x"
        dw_db = MagicMock()
        q = MagicMock()
        q.filter.return_value.first.return_value = row
        dw_db.query.return_value = q
        mock_session_cm.return_value.__enter__.return_value = dw_db
        mock_from_record.return_value = {"subgroup_nid": 42, "subgroup_global": True}

        mock_instance = MagicMock()
        mock_sg_vals_cls.return_value = mock_instance

        payload = _FakeCategoryValueUpdate(subgroup_global=True)
        with patch(
            "apps.datawarehouse.services.sg_category_values.Subgroup",
            return_value=_fake_locale_model(),
        ):
            svc.update_value("warehouse-1", "42", payload, language_code="en")

        mock_instance.update_affected_subgroup_names.assert_not_called()
