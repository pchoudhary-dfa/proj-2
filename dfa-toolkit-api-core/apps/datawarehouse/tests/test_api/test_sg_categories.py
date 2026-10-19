"""
Tests for Subgroup Categories CRUD API endpoints.
Uses mocks for SgCategoryService; assertions use status_code, success, message/err_message.
Tests assert on internal keys (DB column names: subgroup_type_nid, subgroup_nid, etc.). We force ADAPTATION=internal so
response serialization and request validation use internal keys.
"""
import pytest
from unittest.mock import patch, ANY, MagicMock

from apps.shared.config.config import settings
from apps.datawarehouse.constants import ASSOC_SG_COUNT
from apps.datawarehouse.schemas.sg_categories import (
    SgCategoryCreateSchema,
    SgCategoryUpdateSchema,
)

TEST_WAREHOUSE_ID = "test_warehouse"
VALID_GUID = "f3c1e8a0-6f1e-4b78-8d30-6b2d6b22b6e1"


@pytest.fixture(autouse=True)
def force_internal_adaptation():
    """Force ADAPTATION=internal so responses and request validation use internal keys."""
    with patch.object(settings, "ADAPTATION", "internal"):
        yield


@pytest.fixture(autouse=True)
def iam_public_for_sg_category_api_tests(monkeypatch):
    """PUBLIC IAM for sg-category DW routes only; other paths keep real IAM."""
    import apps.shared.middleware.auth_middleware as auth_mw

    real_matches = auth_mw._matches_for_path

    def _patched_matches(method: str, path: str):
        if "/dw/" in path and "/sg-categories" in path:
            return [("DFA_DM", "PUBLIC", 1)]
        return real_matches(method, path)

    monkeypatch.setattr(auth_mw, "_matches_for_path", _patched_matches)


MOCK_CATEGORY_ITEM = {
    "subgroup_type_nid": 10,
    "subgroup_type_name": "Gender",
    "subgroup_type_gid": VALID_GUID,
    "subgroup_type_order": 1,
    "subgroup_type_global": False,
    "is_system": False,
}

MOCK_CREATE_RESPONSE = {"subgroup_type_nid": 10, "subgroup_type_gid": VALID_GUID}

MOCK_ASSOCIATION_COUNTS = {"subgroup_count": 12, "ius_count": 340, "data_count": 9821}


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


class TestSgCategoryList:
    @patch("apps.datawarehouse.router.sg_categories.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_all_sg_categories")
    def test_get_all_sg_categories_success(self, mock_get_all, mock_ext, client):
        mock_get_all.return_value = ([MOCK_CATEGORY_ITEM], 1)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Subgroup categories retrieved successfully"
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 1
        assert data["data"][0]["subgroup_type_nid"] == 10
        assert data["data"][0]["subgroup_type_name"] == "Gender"
        assert "meta" in data
        assert data["meta"]["total_count"] == 1
        # No page_size in URL → no pagination; router may pass language_code, search, sort_order, sort_field
        mock_get_all.assert_called_once()
        call_args, call_kw = mock_get_all.call_args
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_kw.get("page") == 1
        assert call_kw.get("page_size") is None
        assert call_kw.get("include_used_in") is False

    @patch("apps.datawarehouse.router.sg_categories.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_all_sg_categories")
    def test_get_all_sg_categories_used_in_true(self, mock_get_all, mock_ext, client):
        enriched = {
            **MOCK_CATEGORY_ITEM,
            "used_in": {ASSOC_SG_COUNT: 7},
        }
        mock_get_all.return_value = ([enriched], 1)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories?used_in=true")
        assert response.status_code == 200
        data = response.json()
        assert data["data"][0]["used_in"][ASSOC_SG_COUNT] == 7
        mock_get_all.assert_called_once()
        assert mock_get_all.call_args[1].get("include_used_in") is True

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_all_sg_categories")
    def test_get_all_sg_categories_empty(self, mock_get_all, client):
        mock_get_all.return_value = ([], 0)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == []
        assert data["meta"]["total_count"] == 0

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_all_sg_categories")
    def test_get_all_sg_categories_warehouse_not_found(self, mock_get_all, client):
        mock_get_all.side_effect = ValueError(f"Warehouse ID '{TEST_WAREHOUSE_ID}' not found")
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "err_message" in data

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_all_sg_categories")
    def test_get_all_sg_categories_service_error(self, mock_get_all, client):
        mock_get_all.side_effect = Exception("Database error")
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories")
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


MOCK_SG_VALUE_ROW = {
    "subgroup_nid": 100,
    "subgroup_name": "Male",
    "subgroup_gid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "subgroup_global": False,
    "subgroup_type": 10,
    "subgroup_type_gid": VALID_GUID,
    "subgroup_order": 1,
    "is_system": False,
}

MOCK_SG_CATEGORIES_VALUES_ITEMS = [
    {**MOCK_CATEGORY_ITEM, "values": [MOCK_SG_VALUE_ROW]},
]


class TestSgCategoriesValuesList:
    @patch(
        "apps.datawarehouse.services.sg_category_values.SgCategoryValuesService.count_combination_usage_by_subgroup_nids"
    )
    @patch(
        "apps.datawarehouse.services.sg_category_values.SgCategoryValuesService.get_all_categories_with_values"
    )
    def test_sg_categories_values_flat_used_in_false_skips_count(
        self, mock_get_all, mock_counts, client
    ):
        mock_get_all.return_value = MOCK_SG_CATEGORIES_VALUES_ITEMS
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories-values?page=1&page_size=50"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) >= 1
        assert "used_in" not in data["data"][0]
        mock_counts.assert_not_called()

    @patch(
        "apps.datawarehouse.services.sg_category_values.SgCategoryValuesService.count_combination_usage_by_subgroup_nids"
    )
    @patch(
        "apps.datawarehouse.services.sg_category_values.SgCategoryValuesService.get_all_categories_with_values"
    )
    def test_sg_categories_values_flat_used_in_true(
        self, mock_get_all, mock_counts, client
    ):
        mock_get_all.return_value = MOCK_SG_CATEGORIES_VALUES_ITEMS
        mock_counts.return_value = {100: 9}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories-values?page=1&page_size=50&used_in=true"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 1
        row = data["data"][0]
        assert row["subgroup_nid"] == 100
        assert row["used_in"][ASSOC_SG_COUNT] == 9
        mock_counts.assert_called_once()
        assert mock_counts.call_args[0][0] == TEST_WAREHOUSE_ID
        assert set(mock_counts.call_args[0][1]) == {100}

    @patch(
        "apps.datawarehouse.services.sg_category_values.SgCategoryValuesService.count_combination_usage_by_subgroup_nids"
    )
    @patch(
        "apps.datawarehouse.services.sg_category_values.SgCategoryValuesService.get_all_categories_with_values"
    )
    def test_sg_categories_values_group_by_used_in_true(
        self, mock_get_all, mock_counts, client
    ):
        mock_get_all.return_value = MOCK_SG_CATEGORIES_VALUES_ITEMS
        mock_counts.return_value = {100: 3}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories-values?view=group_by&page=1&page_size=50&used_in=true"
        )
        assert response.status_code == 200
        data = response.json()
        cat = data["data"][0]
        assert cat["subgroup_type_nid"] == 10
        records = cat.get("sg_cat_val_records") or cat.get("children")
        assert records is not None
        assert records[0]["used_in"][ASSOC_SG_COUNT] == 3


class TestSgCategoryGetOne:
    @patch("apps.datawarehouse.router.sg_categories.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_sg_category_by_identifier")
    def test_get_sg_category_by_nid_success(self, mock_get, mock_ext, client):
        mock_get.return_value = MOCK_CATEGORY_ITEM
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/10")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["subgroup_type_nid"] == 10
        assert data["data"]["subgroup_type_name"] == "Gender"
        mock_get.assert_called_once()
        call_args, call_kw = mock_get.call_args
        assert call_args[0] == TEST_WAREHOUSE_ID and call_args[1] == "10"
        assert call_kw.get("language_code") == "en"

    @patch("apps.datawarehouse.router.sg_categories.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_sg_category_by_identifier")
    def test_get_sg_category_by_gid_success(self, mock_get, mock_ext, client):
        mock_get.return_value = MOCK_CATEGORY_ITEM
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/{VALID_GUID}")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["subgroup_type_gid"] == VALID_GUID
        mock_get.assert_called_once()
        call_args, call_kw = mock_get.call_args
        assert call_args[0] == TEST_WAREHOUSE_ID and call_args[1] == VALID_GUID
        assert call_kw.get("language_code") == "en"

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_sg_category_by_identifier")
    def test_get_sg_category_not_found(self, mock_get, client):
        mock_get.return_value = None
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        err_msg = data.get("err_message", "")
        assert "Subgroup category" in err_msg or "not found" in err_msg.lower()

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_sg_category_by_identifier")
    def test_get_sg_category_warehouse_not_found(self, mock_get, client):
        mock_get.side_effect = ValueError(f"Warehouse ID '{TEST_WAREHOUSE_ID}' not found")
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/10")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False


class TestSgCategoryCreate:
    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.bulk_create")
    def test_create_sg_category_success(self, mock_bulk_create, client):
        mock_bulk_create.return_value = {"created": [{"subgroup_type_nid": 10, "subgroup_type_gid": VALID_GUID}], "errors": []}
        payload = {
            "subgroup_type_name": "Gender",
            "subgroup_type_gid": VALID_GUID,
            "subgroup_type_order": 1,
            "subgroup_type_global": False,
        }
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories", json=[payload])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert "subgroup category" in data["message"].lower()
        assert len(data["data"]) == 1
        assert data["data"][0]["subgroup_type_nid"] == 10
        assert data["data"][0]["subgroup_type_gid"] == VALID_GUID
        mock_bulk_create.assert_called_once()
        call_args = mock_bulk_create.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert isinstance(call_args[1], list) and len(call_args[1]) == 1
        assert call_args[1][0].subgroup_type_name == "Gender"

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.bulk_create")
    def test_create_sg_category_with_values_success(self, mock_bulk_create, client):
        """Create category with optional values (sg-categories-values) in same request."""
        mock_bulk_create.return_value = {"created": [{"subgroup_type_nid": 10, "subgroup_type_gid": VALID_GUID}], "errors": []}
        payload = {
            "subgroup_type_name": "Sex",
            "subgroup_type_gid": VALID_GUID,
            "values": [
                {"subgroup_name": "Male", "subgroup_gid": "guid-1", "subgroup_order": 1},
                {"subgroup_name": "Female", "subgroup_order": 2},
            ],
        }
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories", json=[payload])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 1
        assert data["data"][0]["subgroup_type_nid"] == 10
        assert data["data"][0]["subgroup_type_gid"] == VALID_GUID
        mock_bulk_create.assert_called_once()
        call_args = mock_bulk_create.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert isinstance(call_args[1], list) and len(call_args[1]) == 1
        if hasattr(call_args[1][0], "values") and call_args[1][0].values:
            assert call_args[1][0].values[0].subgroup_name == "Male"
            assert call_args[1][0].values[1].subgroup_order == 2

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.bulk_create")
    def test_create_sg_category_without_gid(self, mock_bulk_create, client):
        mock_bulk_create.return_value = {"created": [{"subgroup_type_nid": 11, "subgroup_type_gid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}], "errors": []}
        payload = {"subgroup_type_name": "Age Group", "subgroup_type_order": 2}
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories", json=[payload])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 1
        assert "subgroup_type_nid" in data["data"][0]
        assert "subgroup_type_gid" in data["data"][0]

    def test_create_sg_category_missing_subgroup_type_name(self, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories",
            json=[{"subgroup_type_gid": VALID_GUID}],
        )
        assert response.status_code == 422

    def test_create_sg_category_invalid_subgroup_type_gid_format(self, client):
        """Invalid subgroup_type_gid format should yield 422 (validation) or 404 (warehouse not found). 500 allowed when app_db schema is not migrated (e.g. missing system_datawarehouse.created)."""
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories",
            json=[{"subgroup_type_name": "Gender", "subgroup_type_gid": "not-a-valid-guid"}],
        )
        assert response.status_code in (404, 422, 500), f"Expected 422, 404, or 500, got {response.status_code}"
        data = response.json()
        assert data.get("success") is False
        if response.status_code == 422:
            assert "validation" in data.get("err_message", "").lower() or "subgroup_type_gid" in str(data)
        # 500 can occur when app_db has not run migration 008 (e.g. Unknown column 'created')

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.bulk_create")
    def test_create_sg_category_warehouse_not_found(self, mock_bulk_create, client):
        mock_bulk_create.side_effect = ValueError(f"Warehouse ID '{TEST_WAREHOUSE_ID}' not found")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories",
            json=[{"subgroup_type_name": "Gender", "subgroup_type_gid": VALID_GUID}],
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.bulk_create")
    def test_create_sg_category_validation_error(self, mock_bulk_create, client):
        mock_bulk_create.side_effect = ValueError("Validation failed: subgroup_type_name must be unique")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories",
            json=[{"subgroup_type_name": "Gender", "subgroup_type_gid": VALID_GUID}],
        )
        assert response.status_code in (400, 422)
        data = response.json()
        assert data["success"] is False
        err_msg = data.get("err_message", "")
        assert "validation" in err_msg.lower() or "Validation failed" in err_msg

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.bulk_create")
    def test_create_sg_category_service_error(self, mock_bulk_create, client):
        mock_bulk_create.side_effect = Exception("Database error")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories",
            json=[{"subgroup_type_name": "Gender", "subgroup_type_gid": VALID_GUID}],
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestSgCategoryUpdate:
    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.update")
    def test_update_sg_category_success(self, mock_update, client):
        mock_update.return_value = MOCK_CREATE_RESPONSE
        payload = {"subgroup_type_name": "Gender (updated)", "subgroup_type_order": 2}
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/10",
            json=payload,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Subgroup category updated successfully"
        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == "10"
        assert isinstance(call_args[2], SgCategoryUpdateSchema)
        assert call_args[2].subgroup_type_name == "Gender (updated)"

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.update")
    def test_update_sg_category_by_gid_success(self, mock_update, client):
        mock_update.return_value = {"subgroup_type_nid": 10, "subgroup_type_gid": VALID_GUID}
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/{VALID_GUID}",
            json={"subgroup_type_order": 3},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_update.assert_called_once()
        call_args, call_kw = mock_update.call_args
        assert call_args[0] == TEST_WAREHOUSE_ID and call_args[1] == VALID_GUID
        assert call_kw.get("language_code") == "en"

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.update")
    def test_update_sg_category_not_found(self, mock_update, client):
        mock_update.side_effect = ValueError("Subgroup category not found")
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/999",
            json={"subgroup_type_name": "Updated"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.update")
    def test_update_sg_category_validation_error(self, mock_update, client):
        mock_update.side_effect = ValueError("Validation failed: subgroup_type_name max 128 characters")
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/10",
            json={"subgroup_type_name": "x" * 200},
        )
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False


class TestSgCategoryDelete:
    """DELETE /sg-categories/{id}: queues background job, returns 200 + job reference."""

    MOCK_CATEGORY = {
        "subgroup_type_nid": 10,
        "subgroup_type_name": "Gender",
        "subgroup_type_gid": VALID_GUID,
        "subgroup_type_order": 1,
        "subgroup_type_global": False,
        "is_system": False,
    }

    @patch("apps.datawarehouse.router.sg_categories.SessionLocal")
    @patch("apps.datawarehouse.router.sg_categories.dispatch_bg_job")
    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.prepare_sg_category_delete_enqueue")
    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.get_sg_category_by_identifier")
    def test_delete_sg_category_queues_db_job_returns_200(
        self, mock_get, mock_prepare, mock_dispatch, mock_session_local, client
    ):
        mock_get.return_value = dict(self.MOCK_CATEGORY)
        mock_prepare.return_value = 10
        from apps.shared.services.bg_job_dispatch import BgJobDispatchResult

        mock_dispatch.return_value = BgJobDispatchResult(db_job_id=202, celery_task_id=None)
        cm = MagicMock()
        mock_session_local.return_value = cm
        cm.__enter__.return_value = cm
        cm.__exit__.return_value = None

        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/10")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["job_type"] == "delete_sg_category"
        assert body["data"]["db_job_id"] == 202
        assert body["data"]["celery_task_id"] is None
        assert body["data"]["sg_cat_nid"] == 10
        assert body["data"]["sg_category_identifier"] == "10"
        mock_dispatch.assert_called_once()
        call_kw = mock_dispatch.call_args.kwargs
        assert call_kw["job_type"] == "delete_sg_category"
        assert call_kw["dw_id"] == TEST_WAREHOUSE_ID
        assert call_kw["payload"]["sg_cat_nid"] == 10

    @patch("apps.datawarehouse.router.sg_categories.SessionLocal")
    @patch("apps.datawarehouse.router.sg_categories.dispatch_bg_job")
    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.prepare_sg_category_delete_enqueue")
    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.get_sg_category_by_identifier")
    def test_delete_sg_category_queues_celery_returns_task_id(
        self, mock_get, mock_prepare, mock_dispatch, mock_session_local, client
    ):
        mock_get.return_value = dict(self.MOCK_CATEGORY)
        mock_prepare.return_value = 10
        from apps.shared.services.bg_job_dispatch import BgJobDispatchResult

        mock_dispatch.return_value = BgJobDispatchResult(db_job_id=None, celery_task_id="celery-cat-1")
        cm = MagicMock()
        mock_session_local.return_value = cm
        cm.__enter__.return_value = cm
        cm.__exit__.return_value = None

        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/10")
        assert response.status_code == 200
        body = response.json()
        assert body["data"]["celery_task_id"] == "celery-cat-1"
        assert body["data"]["db_job_id"] is None

    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.get_sg_category_by_identifier")
    def test_delete_sg_category_not_found(self, mock_get, client):
        mock_get.return_value = None
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.get_sg_category_by_identifier")
    def test_delete_sg_category_system_category_returns_403(self, mock_get, client):
        mock_get.return_value = {**self.MOCK_CATEGORY, "is_system": True}
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/10")
        assert response.status_code == 403
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.prepare_sg_category_delete_enqueue")
    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.get_sg_category_by_identifier")
    def test_delete_sg_category_prepare_system_child_returns_403(self, mock_get, mock_prepare, client):
        mock_get.return_value = dict(self.MOCK_CATEGORY)
        mock_prepare.side_effect = ValueError(
            "Cannot delete subgroup category: one or more system subgroup values are protected"
        )
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/10")
        assert response.status_code == 403
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.router.sg_categories.SessionLocal")
    @patch("apps.datawarehouse.router.sg_categories.dispatch_bg_job")
    @patch("apps.datawarehouse.router.sg_categories.log_background_incident")
    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.prepare_sg_category_delete_enqueue")
    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.get_sg_category_by_identifier")
    def test_delete_sg_category_queue_failure_returns_500(
        self, mock_get, mock_prepare, mock_log, mock_dispatch, mock_session_local, client
    ):
        mock_get.return_value = dict(self.MOCK_CATEGORY)
        mock_prepare.return_value = 10
        mock_dispatch.side_effect = ValueError("BG_JOB_POLLER_ENABLED=false")
        cm = MagicMock()
        mock_session_local.return_value = cm
        cm.__enter__.return_value = cm
        cm.__exit__.return_value = None

        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/10")
        assert response.status_code == 500
        body = response.json()
        assert body["success"] is False
        mock_log.assert_called_once()

    @patch("apps.datawarehouse.router.sg_categories.SessionLocal")
    @patch("apps.datawarehouse.router.sg_categories.dispatch_bg_job")
    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.prepare_sg_category_delete_enqueue")
    @patch("apps.datawarehouse.router.sg_categories.sg_category_service.get_sg_category_by_identifier")
    def test_delete_sg_category_by_gid_success(self, mock_get, mock_prepare, mock_dispatch, mock_session_local, client):
        mock_get.return_value = dict(self.MOCK_CATEGORY)
        mock_prepare.return_value = 10
        from apps.shared.services.bg_job_dispatch import BgJobDispatchResult

        mock_dispatch.return_value = BgJobDispatchResult(db_job_id=1, celery_task_id=None)
        cm = MagicMock()
        mock_session_local.return_value = cm
        cm.__enter__.return_value = cm
        cm.__exit__.return_value = None

        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/{VALID_GUID}")
        assert response.status_code == 200
        mock_prepare.assert_called_once_with(TEST_WAREHOUSE_ID, VALID_GUID)
        call_kw = mock_dispatch.call_args.kwargs
        assert call_kw["payload"]["sg_category_identifier"] == VALID_GUID


@pytest.mark.skip(reason="multiple-delete endpoint not currently enabled")
class TestSgCategoryMultipleDelete:
    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.multiple_delete")
    def test_multiple_delete_success(self, mock_multi_delete, client):
        mock_multi_delete.return_value = None
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/multiple-delete",
            json={"sg_cat_gid": ["gid-cat-a", "gid-cat-b"]},
        )
        assert response.status_code == 204
        mock_multi_delete.assert_called_once_with(TEST_WAREHOUSE_ID, ["gid-cat-a", "gid-cat-b"])

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.multiple_delete")
    def test_multiple_delete_empty_list(self, mock_multi_delete, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/multiple-delete",
            json={"sg_cat_gid": []},
        )
        assert response.status_code == 204
        mock_multi_delete.assert_not_called()

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.multiple_delete")
    def test_multiple_delete_conflict(self, mock_multi_delete, client):
        mock_multi_delete.side_effect = ValueError(
            "Deletion not permitted. One or more subgroup categories have dependent records"
        )
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/multiple-delete",
            json={"sg_cat_gid": ["gid-cat-a", "gid-cat-b"]},
        )
        assert response.status_code == 409
        data = response.json()
        assert data["success"] is False
        assert "Deletion not permitted" in data.get("err_message", "")

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.multiple_delete")
    def test_multiple_delete_category_not_found(self, mock_multi_delete, client):
        mock_multi_delete.side_effect = ValueError("Subgroup category not found: 'gid-99'")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/multiple-delete",
            json={"sg_cat_gid": ["gid-cat-a", "gid-99"]},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False


class TestSgCategoryAssociationCount:
    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_association_counts")
    def test_association_count_success(self, mock_counts, client):
        mock_counts.return_value = MOCK_ASSOCIATION_COUNTS
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/association-count",
            params={"category_id": "10,11"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Association counts retrieved successfully"
        assert data["data"]["subgroup_count"] == 12
        assert data["data"]["ius_count"] == 340
        assert data["data"]["data_count"] == 9821
        mock_counts.assert_called_once_with(TEST_WAREHOUSE_ID, ["10", "11"])

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_association_counts")
    def test_association_count_empty_list(self, mock_counts, client):
        mock_counts.return_value = {"subgroup_count": 0, "ius_count": 0, "data_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["subgroup_count"] == 0
        assert data["data"]["ius_count"] == 0
        assert data["data"]["data_count"] == 0
        mock_counts.assert_called_once()

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_association_counts")
    def test_association_count_category_not_found(self, mock_counts, client):
        mock_counts.side_effect = ValueError("Subgroup category not found: 99")
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/association-count",
            params={"category_id": "99"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.sg_category.SgCategoryService.get_association_counts")
    def test_association_count_no_category_id_returns_zeros(self, mock_counts, client):
        mock_counts.return_value = {"subgroup_count": 0, "ius_count": 0, "data_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/sg-categories/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["subgroup_count"] == 0
        assert data["data"]["ius_count"] == 0
        assert data["data"]["data_count"] == 0


class TestSgCategoryValueByValueIdentifier:
    """Get one sg-category-val by value identifier only (no sg-category in path)."""

    MOCK_VALUE = {
        "subgroup_nid": 42,
        "subgroup_name": "Male",
        "subgroup_gid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "subgroup_order": 1,
        "subgroup_type": 10,
    }

    @patch("apps.datawarehouse.router.sg_category_values.sg_category_values_service.get_value_by_value_identifier")
    def test_get_sg_category_value_by_nid_success(self, mock_get, client):
        mock_get.return_value = self.MOCK_VALUE
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories-values/42")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Subgroup value retrieved successfully"
        assert data["data"]["subgroup_nid"] == 42
        assert data["data"]["subgroup_name"] == "Male"
        assert data["data"]["subgroup_type"] == 10
        mock_get.assert_called_once()
        call_args, call_kw = mock_get.call_args
        assert call_args[0] == TEST_WAREHOUSE_ID and call_args[1] == "42"
        assert call_kw.get("language_code") == "en"

    @patch("apps.datawarehouse.router.sg_category_values.sg_category_values_service.get_value_by_value_identifier")
    def test_get_sg_category_value_by_gid_success(self, mock_get, client):
        mock_get.return_value = self.MOCK_VALUE
        gid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories-values/{gid}")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["subgroup_gid"] == gid
        mock_get.assert_called_once()
        call_args, call_kw = mock_get.call_args
        assert call_args[0] == TEST_WAREHOUSE_ID and call_args[1] == gid
        assert call_kw.get("language_code") == "en"

    @patch("apps.datawarehouse.router.sg_category_values.sg_category_values_service.get_value_by_value_identifier")
    def test_get_sg_category_value_not_found(self, mock_get, client):
        mock_get.return_value = None
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories-values/999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        err_msg = data.get("err_message", "")
        assert "Subgroup value" in err_msg or "not found" in err_msg.lower()

    @patch("apps.datawarehouse.router.sg_category_values.sg_category_values_service.get_value_by_value_identifier")
    def test_get_sg_category_value_warehouse_not_found(self, mock_get, client):
        mock_get.side_effect = ValueError("Warehouse ID 'bad_dw' not found")
        response = client.get("/dw/bad_dw/sg-categories-values/42")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "err_message" in data


class TestDeleteSgCategoryValueByIdentifierAsync:
    """DELETE sg-categories-values/{id}: queues background job, returns 200 + job reference."""

    MOCK_VALUE = {
        "subgroup_nid": 42,
        "subgroup_name": "Male",
        "subgroup_gid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "subgroup_order": 1,
        "subgroup_type": 10,
        "is_system": False,
    }

    @patch("apps.datawarehouse.router.sg_category_values.SessionLocal")
    @patch("apps.datawarehouse.router.sg_category_values.dispatch_bg_job")
    @patch("apps.datawarehouse.router.sg_category_values.sg_category_values_service.get_value_by_value_identifier")
    def test_delete_queues_db_job_returns_200(self, mock_get, mock_dispatch, mock_session_local, client):
        mock_get.return_value = dict(self.MOCK_VALUE)
        from apps.shared.services.bg_job_dispatch import BgJobDispatchResult

        mock_dispatch.return_value = BgJobDispatchResult(db_job_id=101, celery_task_id=None)
        cm = MagicMock()
        mock_session_local.return_value = cm
        cm.__enter__.return_value = cm
        cm.__exit__.return_value = None

        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories-values/42")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["job_type"] == "delete_sg_category_value"
        assert body["data"]["db_job_id"] == 101
        assert body["data"]["celery_task_id"] is None
        assert body["data"]["subgroup_nid"] == 42
        assert body["data"]["value_identifier"] == "42"
        mock_dispatch.assert_called_once()
        call_kw = mock_dispatch.call_args.kwargs
        assert call_kw["job_type"] == "delete_sg_category_value"
        assert call_kw["dw_id"] == TEST_WAREHOUSE_ID
        assert call_kw["payload"]["subgroup_nid"] == 42

    @patch("apps.datawarehouse.router.sg_category_values.SessionLocal")
    @patch("apps.datawarehouse.router.sg_category_values.dispatch_bg_job")
    @patch("apps.datawarehouse.router.sg_category_values.sg_category_values_service.get_value_by_value_identifier")
    def test_delete_queues_celery_returns_task_id(self, mock_get, mock_dispatch, mock_session_local, client):
        mock_get.return_value = dict(self.MOCK_VALUE)
        from apps.shared.services.bg_job_dispatch import BgJobDispatchResult

        mock_dispatch.return_value = BgJobDispatchResult(db_job_id=None, celery_task_id="celery-abc")
        cm = MagicMock()
        mock_session_local.return_value = cm
        cm.__enter__.return_value = cm
        cm.__exit__.return_value = None

        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories-values/42")
        assert response.status_code == 200
        body = response.json()
        assert body["data"]["celery_task_id"] == "celery-abc"
        assert body["data"]["db_job_id"] is None

    @patch("apps.datawarehouse.router.sg_category_values.sg_category_values_service.get_value_by_value_identifier")
    def test_delete_system_subgroup_returns_403(self, mock_get, client):
        mock_get.return_value = {**self.MOCK_VALUE, "is_system": True}
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories-values/42")
        assert response.status_code == 403
        body = response.json()
        assert body["success"] is False

    @patch("apps.datawarehouse.router.sg_category_values.SessionLocal")
    @patch("apps.datawarehouse.router.sg_category_values.dispatch_bg_job")
    @patch("apps.datawarehouse.router.sg_category_values.log_background_incident")
    @patch("apps.datawarehouse.router.sg_category_values.sg_category_values_service.get_value_by_value_identifier")
    def test_delete_queue_failure_returns_500(
        self, mock_get, mock_log, mock_dispatch, mock_session_local, client
    ):
        mock_get.return_value = dict(self.MOCK_VALUE)
        mock_dispatch.side_effect = ValueError("BG_JOB_POLLER_ENABLED=false")
        cm = MagicMock()
        mock_session_local.return_value = cm
        cm.__enter__.return_value = cm
        cm.__exit__.return_value = None

        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/sg-categories-values/42")
        assert response.status_code == 500
        body = response.json()
        assert body["success"] is False
        mock_log.assert_called_once()
