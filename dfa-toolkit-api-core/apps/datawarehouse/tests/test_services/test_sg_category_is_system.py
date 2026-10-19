"""Unit tests for is_system delete guards on subgroup categories and category values."""
from unittest.mock import MagicMock, patch

import pytest

from apps.datawarehouse.services.sg_category import SgCategoryService
from apps.datawarehouse.services.sg_category_values import SgCategoryValuesService


@pytest.fixture
def sg_cat_svc():
    return SgCategoryService()


@pytest.fixture
def sg_val_svc():
    return SgCategoryValuesService()


def _fake_locale_model():
    m = MagicMock()
    m.subgroup_type_nid = MagicMock()
    m.subgroup_type = MagicMock()
    m.subgroup_nid = MagicMock()
    m.is_system = MagicMock()
    return m


def _patch_locale_models():
    return (
        patch(
            "apps.datawarehouse.services.sg_category.SubgroupCategory",
            return_value=_fake_locale_model(),
        ),
        patch(
            "apps.datawarehouse.services.sg_category.Subgroup",
            return_value=_fake_locale_model(),
        ),
    )


class TestValidateCategoriesDeletable:
    def test_raises_when_category_is_system(self, sg_cat_svc):
        dw_db = MagicMock()
        cat = MagicMock()
        cat.is_system = True
        q_cat = MagicMock()
        q_cat.filter.return_value.first.return_value = cat

        dw_db.query.return_value = q_cat

        cat_patch, sub_patch = _patch_locale_models()
        with cat_patch, sub_patch:
            with patch(
                "apps.datawarehouse.services.sg_category.get_default_locale",
                return_value="en",
            ):
                with pytest.raises(ValueError, match="System subgroup category cannot be deleted"):
                    sg_cat_svc._validate_categories_deletable(dw_db, [1])

    def test_raises_when_child_subgroup_is_system(self, sg_cat_svc):
        dw_db = MagicMock()
        cat = MagicMock()
        cat.is_system = False
        q_cat = MagicMock()
        q_cat.filter.return_value.first.return_value = cat
        q_count = MagicMock()
        q_count.filter.return_value.scalar.return_value = 1
        call_n = [0]

        def query_side_effect(*_args, **_kwargs):
            call_n[0] += 1
            return q_cat if call_n[0] == 1 else q_count

        dw_db.query.side_effect = query_side_effect

        cat_patch, sub_patch = _patch_locale_models()
        with cat_patch, sub_patch:
            with patch(
                "apps.datawarehouse.services.sg_category.get_default_locale",
                return_value="en",
            ):
                with pytest.raises(
                    ValueError,
                    match="one or more system subgroup values are protected",
                ):
                    sg_cat_svc._validate_categories_deletable(dw_db, [1])

    def test_no_error_when_not_system(self, sg_cat_svc):
        dw_db = MagicMock()
        cat = MagicMock()
        cat.is_system = False
        q_cat = MagicMock()
        q_cat.filter.return_value.first.return_value = cat
        q_count = MagicMock()
        q_count.filter.return_value.scalar.return_value = 0
        call_n = [0]

        def query_side_effect(*_args, **_kwargs):
            call_n[0] += 1
            return q_cat if call_n[0] == 1 else q_count

        dw_db.query.side_effect = query_side_effect

        cat_patch, sub_patch = _patch_locale_models()
        with cat_patch, sub_patch:
            with patch(
                "apps.datawarehouse.services.sg_category.get_default_locale",
                return_value="en",
            ):
                sg_cat_svc._validate_categories_deletable(dw_db, [1])


class TestDeleteSgCategoryValueSystem:
    @patch("apps.datawarehouse.services.sg_category_values.get_dw_language_codes")
    @patch("apps.datawarehouse.services.sg_category_values.get_default_locale", return_value="en")
    @patch("apps.datawarehouse.services.sg_category_values.get_warehouse_session_from_id")
    def test_raises_when_subgroup_is_system(
        self,
        mock_session_cm,
        _mock_locale,
        _mock_langs,
        sg_val_svc,
    ):
        row = MagicMock()
        row.is_system = True
        dw_db = MagicMock()
        q = MagicMock()
        q.filter.return_value.first.return_value = row
        dw_db.query.return_value = q
        mock_session_cm.return_value.__enter__.return_value = dw_db

        with patch(
            "apps.datawarehouse.services.sg_category_values.Subgroup",
            return_value=_fake_locale_model(),
        ):
            with pytest.raises(ValueError, match="System subgroup cannot be deleted via API"):
                sg_val_svc.delete_sg_category_value("dw1", 42)


class TestRunDeleteSgCategoryValueJob:
    @patch("apps.shared.utils.cache.cache_delete_pattern")
    @patch.object(SgCategoryValuesService, "delete_sg_category_value", return_value=True)
    def test_success_returns_dict_and_busts_cache(self, mock_delete, mock_cache, sg_val_svc):
        out = sg_val_svc.run_delete_sg_category_value_job("dw1", 7)
        assert out == {"deleted": True, "subgroup_nid": 7, "dw_id": "dw1"}
        assert mock_cache.call_count == 3

    @patch.object(SgCategoryValuesService, "delete_sg_category_value", return_value=False)
    def test_raises_when_delete_returns_false(self, _mock_delete, sg_val_svc):
        with pytest.raises(ValueError, match="not found"):
            sg_val_svc.run_delete_sg_category_value_job("dw1", 7)
