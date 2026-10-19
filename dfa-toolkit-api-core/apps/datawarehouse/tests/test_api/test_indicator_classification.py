"""
Tests for Indicator Classification CRUD API endpoints.
"""
import os
import pytest
from unittest.mock import patch

from apps.shared.config.config import settings
from apps.datawarehouse.schemas.indicator_classification import (
    IndicatorClassificationCreateSchema,
    IndicatorClassificationUpdateSchema,
)

TEST_WAREHOUSE_ID = "test_warehouse"


@pytest.fixture(autouse=True)
def patch_indicator_classification_internal_adaptation():
    """Allow internal keys (ic_*) in request body: set env bypass and ADAPTATION=internal."""
    prev = os.environ.get("DFA_TEST_INTERNAL_KEYS")
    os.environ["DFA_TEST_INTERNAL_KEYS"] = "1"
    try:
        with patch.object(settings, "ADAPTATION", "internal"):
            yield
    finally:
        if prev is None:
            os.environ.pop("DFA_TEST_INTERNAL_KEYS", None)
        else:
            os.environ["DFA_TEST_INTERNAL_KEYS"] = prev

MOCK_IC_CREATE = {
    "ic_name": "Test Classification",
    "ic_gid": "TEST_IC_001",
    "ic_parent_nid": 0,
    "ic_type": "SC",
    "ic_short_name": "Test",
    "ic_info": "Test classification info",
    "ic_global": False,
    "ic_order": 1,
}

MOCK_IC_RESPONSE = {
    "ic_nid": 1,
    "ic_parent_nid": 0,
    "ic_gid": "TEST_IC_001",
    "ic_name": "Test Classification",
    "ic_short_name": "Test",
    "ic_info": "Test classification info",
    "ic_type": "SC",
    "ic_is_global": False,
    "ic_order": 1,
    "locale": "en",
}


@pytest.fixture(autouse=True)
def client(client_no_db):
    """Auto-use client_no_db fixture for all tests in this module."""
    return client_no_db


class TestGetIndicatorClassificationTypes:
    """Tests for GET /dw/{dw_id}/indicator-classifications/type."""

    def test_get_indicator_classification_types_success(self, client):
        """GET .../type returns type codes with captions from translations."""
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications/type")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        types = data["data"]
        assert isinstance(types, dict)
        for code in ("SC", "GL", "CF", "TH", "IT", "CN"):
            assert code in types
            assert isinstance(types[code], str)
            assert len(types[code]) > 0
        assert types["SC"] == "Sector"
        assert types["GL"] == "Goal"

    def test_get_indicator_classification_types_with_accept_language(self, client):
        """GET .../type with Accept-Language returns 200 and type map; caption language follows locale when override supplies it."""
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications/type",
            headers={"Accept-Language": "fr"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        types = data["data"]
        for code in ("SC", "GL", "CF", "TH", "IT", "CN"):
            assert code in types
            assert isinstance(types[code], str)
        # With test override, locale may be 'en' or 'fr' depending on client; either Sector or Secteur is valid for SC
        assert types["SC"] in ("Sector", "Secteur")


class TestIndicatorClassificationCreate:
    """Tests for creating indicator classifications (batch: array body)."""

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.create_indicator_classifications_batch")
    def test_create_indicator_classification_success(self, mock_create, client):
        """Test successful indicator classification creation (single item in array)."""
        mock_create.return_value = {"created": [MOCK_IC_RESPONSE], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications",
            json=[MOCK_IC_CREATE],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 1
        assert data.get("meta", {}).get("count") == 1
        assert mock_create.called
        call_args = mock_create.call_args
        assert call_args[0][0] == TEST_WAREHOUSE_ID
        assert isinstance(call_args[0][1], list)
        assert len(call_args[0][1]) == 1
        assert isinstance(call_args[0][1][0], IndicatorClassificationCreateSchema)
        assert call_args[0][1][0].ic_name == MOCK_IC_CREATE["ic_name"]

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.create_indicator_classifications_batch")
    def test_create_indicator_classifications_batch_multiple_success(self, mock_create, client):
        """Test creating multiple indicator classifications in one request."""
        mock_create.return_value = {
            "created": [MOCK_IC_RESPONSE, {**MOCK_IC_RESPONSE, "ic_nid": 2, "ic_name": "Second IC"}],
            "errors": [],
        }
        payload = [MOCK_IC_CREATE, {**MOCK_IC_CREATE, "ic_name": "Second IC", "ic_gid": "TEST_IC_002"}]
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications",
            json=payload,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 2
        assert data.get("meta", {}).get("count") == 2
        mock_create.assert_called_once()
        assert len(mock_create.call_args[0][1]) == 2

    def test_create_indicator_classification_empty_array(self, client):
        """Test creating with empty array returns 400."""
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications",
            json=[],
        )
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "array" in data.get("err_message", data.get("message", "")).lower()

    def test_create_indicator_classification_missing_data(self, client):
        """Test creating indicator classification without required data (body not a list)."""
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications",
            json={},
        )
        assert response.status_code == 422

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.create_indicator_classifications_batch")
    def test_create_indicator_classification_service_error(self, mock_create, client):
        """Test indicator classification creation with service error."""
        mock_create.side_effect = Exception("Database connection failed")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications",
            json=[MOCK_IC_CREATE],
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.create_indicator_classifications_batch")
    def test_create_indicator_classification_gid_exists(self, mock_create, client):
        """Test creating indicator classification with duplicate GID."""
        mock_create.side_effect = ValueError("IC_GID_EXISTS: Indicator classification GID 'TEST_IC_001' already exists")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications",
            json=[MOCK_IC_CREATE],
        )
        assert response.status_code == 409
        data = response.json()
        assert data["success"] is False


class TestIndicatorClassificationGet:
    """Tests for getting indicator classifications."""

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.get_all_indicator_classifications")
    def test_get_all_indicator_classifications_success(self, mock_get_all, client):
        """Test get all indicator classifications."""
        mock_get_all.return_value = ([MOCK_IC_RESPONSE], 1)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications?page=1&page_size=10"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert "meta" in data
        assert data["meta"]["total_count"] == 1

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.get_all_indicator_classifications")
    def test_get_all_indicator_classifications_ic_type_cf_accepted(self, mock_get_all, client):
        """ic_type=CF is accepted (same family as GET .../type codes); service receives ic_type='CF'."""
        mock_get_all.return_value = ([{**MOCK_IC_RESPONSE, "ic_type": "CF"}], 1)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications?ic_type=CF&page=1&page_size=10"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_get_all.assert_called_once()
        call_kw = mock_get_all.call_args.kwargs
        assert call_kw.get("ic_type") == "CF"

    @patch(
        "apps.datawarehouse.router.indicator_classification.app_config_service.get_config_by_keyword",
        return_value={"ENABLED_IC_TYPES": {"value": '["SC", "TH"]'}},
    )
    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.get_all_indicator_classifications")
    def test_get_all_indicator_classifications_filters_by_enabled_ic_types(
        self, mock_get_all, _mock_config, client
    ):
        """List endpoint passes active_ic_types from ENABLED_IC_TYPES to the service."""
        mock_get_all.return_value = ([MOCK_IC_RESPONSE], 1)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications?page=1&page_size=10"
        )
        assert response.status_code == 200
        mock_get_all.assert_called_once()
        assert mock_get_all.call_args.kwargs.get("active_ic_types") == ("SC", "TH")

    @patch(
        "apps.datawarehouse.router.indicator_classification.app_config_service.get_config_by_keyword",
        return_value={"ENABLED_IC_TYPES": {"value": '["SC"]'}},
    )
    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.get_all_indicator_classifications")
    def test_get_all_indicator_classifications_rejects_disabled_ic_type_query(
        self, mock_get_all, _mock_config, client
    ):
        """ic_type query for a type not in ENABLED_IC_TYPES returns 400."""
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications?ic_type=CF&page=1&page_size=10"
        )
        assert response.status_code == 400
        assert mock_get_all.called is False

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.get_indicator_classification_by_identifier")
    def test_get_indicator_classification_by_nid_success(self, mock_get, client):
        """Test get indicator classification by ic_nid."""
        mock_get.return_value = MOCK_IC_RESPONSE
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications/1"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["ic_nid"] == 1

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.get_indicator_classification_by_identifier")
    def test_get_indicator_classification_not_found(self, mock_get, client):
        """Test get indicator classification when not found."""
        mock_get.return_value = None
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications/999"
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False


class TestIndicatorClassificationUpdate:
    """Tests for updating indicator classifications."""

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.update_indicator_classification")
    def test_update_indicator_classification_success(self, mock_update, client):
        """Test successful indicator classification update."""
        mock_update.return_value = {**MOCK_IC_RESPONSE, "ic_name": "Updated Name"}
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications/1",
            json={"ic_name": "Updated Name"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert mock_update.called
        call_args = mock_update.call_args
        assert call_args[0][0] == TEST_WAREHOUSE_ID
        assert call_args[0][1] == "1"
        assert isinstance(call_args[0][2], IndicatorClassificationUpdateSchema)

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.update_indicator_classification")
    def test_update_indicator_classification_not_found(self, mock_update, client):
        """Test update when indicator classification not found."""
        mock_update.return_value = None
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications/999",
            json={"ic_name": "Updated Name"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.update_indicator_classification")
    def test_update_indicator_classification_gid_exists(self, mock_update, client):
        """Test update with duplicate GID."""
        mock_update.side_effect = ValueError("IC_GID_EXISTS: Indicator classification GID already exists")
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications/1",
            json={"ic_gid": "EXISTING_GID"},
        )
        assert response.status_code == 409
        data = response.json()
        assert data["success"] is False


class TestIndicatorClassificationDelete:
    """Tests for deleting indicator classifications."""

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.delete_indicator_classification")
    def test_delete_indicator_classification_success(self, mock_delete, client):
        """Test successful indicator classification deletion."""
        mock_delete.return_value = True
        response = client.delete(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications/1"
        )
        assert response.status_code == 204
        assert mock_delete.called
        call_args = mock_delete.call_args
        assert call_args[0][0] == TEST_WAREHOUSE_ID
        assert call_args[0][1] == "1"

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.delete_indicator_classification")
    def test_delete_indicator_classification_not_found(self, mock_delete, client):
        """Test delete when indicator classification not found."""
        mock_delete.return_value = False
        response = client.delete(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications/999"
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.indicator_classification.IndicatorClassificationService.delete_indicator_classification")
    def test_delete_indicator_classification_clears_ius_associations(self, mock_delete, client):
        """Delete succeeds when service removes ut_ic_ius mappings then deletes the IC."""
        mock_delete.return_value = True
        response = client.delete(
            f"/dw/{TEST_WAREHOUSE_ID}/indicator-classifications/201"
        )
        assert response.status_code == 204
        assert mock_delete.called
        assert mock_delete.call_args[0][1] == "201"


class TestGetIndicatorsForIc:
    """Tests for GET /dw/{dw_id}/ic/{ic_identifier}/indicators."""

    MOCK_INDICATOR = {
        "indicator_nid": 1,
        "indicator_gid": "ind-gid-1",
        "indicator_name": "Test Indicator",
        "indicator_order": 1.0,
        "locale": "en",
    }

    @patch("apps.datawarehouse.router.indicator_classification.indicator_service.get_indicators_for_ic")
    def test_get_indicators_for_ic_success(self, mock_get_indicators, client):
        """Test 200 with list of indicators for valid ic_identifier."""
        mock_get_indicators.return_value = ([self.MOCK_INDICATOR], 1)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/ic/5/indicators?page=1&page_size=10"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 1
        # Response keys follow ADAPTATION (internal=indicator_nid, external=i_nid)
        first = data["data"][0]
        assert first.get("indicator_nid") == 1 or first.get("i_nid") == 1
        assert data["meta"]["total_count"] == 1
        assert data["meta"]["page"] == 1
        assert data["meta"]["page_size"] == 10
        mock_get_indicators.assert_called_once()
        call_kwargs = mock_get_indicators.call_args[1]
        assert call_kwargs["ic_identifier"] == "5"
        assert call_kwargs["page"] == 1
        assert call_kwargs["page_size"] == 10

    @patch("apps.datawarehouse.router.indicator_classification.indicator_service.get_indicators_for_ic")
    def test_get_indicators_for_ic_by_gid(self, mock_get_indicators, client):
        """Test 200 when ic_identifier is ic_gid (alphanumeric)."""
        mock_get_indicators.return_value = ([self.MOCK_INDICATOR], 1)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/ic/sector-gid-5/indicators?page=1&page_size=10"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 1
        call_kwargs = mock_get_indicators.call_args[1]
        assert call_kwargs["ic_identifier"] == "sector-gid-5"

    @patch("apps.datawarehouse.router.indicator_classification.indicator_service.get_indicators_for_ic")
    def test_get_indicators_for_ic_not_found(self, mock_get_indicators, client):
        """Test 404 when indicator classification does not exist."""
        mock_get_indicators.return_value = (None, 0)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/ic/99999/indicators?page=1&page_size=10"
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        err_msg = data.get("err_message", "") or data.get("message", "")
        assert "indicator classification" in err_msg.lower() or "not found" in err_msg.lower()

    @patch("apps.datawarehouse.router.indicator_classification.indicator_service.get_indicators_for_ic")
    def test_get_indicators_for_ic_pagination(self, mock_get_indicators, client):
        """Test pagination params are passed and meta reflects page 2."""
        mock_get_indicators.return_value = ([self.MOCK_INDICATOR, self.MOCK_INDICATOR], 5)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/ic/5/indicators?page=2&page_size=2"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["meta"]["page"] == 2
        assert data["meta"]["page_size"] == 2
        assert data["meta"]["total_count"] == 5
        call_kwargs = mock_get_indicators.call_args[1]
        assert call_kwargs["page"] == 2
        assert call_kwargs["page_size"] == 2

    @patch("apps.datawarehouse.router.indicator_classification.indicator_service.get_indicators_for_ic")
    def test_get_indicators_for_ic_empty_list(self, mock_get_indicators, client):
        """Test 200 with empty data when IC has no linked indicators."""
        mock_get_indicators.return_value = ([], 0)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/ic/5/indicators?page=1&page_size=10"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == []
        assert data["meta"]["total_count"] == 0
        assert data["meta"]["count"] == 0
