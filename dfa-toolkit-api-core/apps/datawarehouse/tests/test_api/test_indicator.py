"""
Tests for Indicator CRUD API endpoints.

Tests use internal keys (indicator_name, etc.) and force ADAPTATION=internal so
request validation and response assertions use internal format.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock, ANY

from apps.shared.config.config import settings
from apps.app_db.schemas.core import DatabaseSource, DatabaseConnectionSchema
from apps.datawarehouse.schemas.indicator import IndicatorCreateSchema, IndicatorUpdateSchema

# Test warehouse ID used in URL
TEST_WAREHOUSE_ID = "test_warehouse"


@pytest.fixture(autouse=True)
def force_internal_adaptation():
    """Force ADAPTATION=internal so schema accepts internal keys and responses use internal format."""
    with patch.object(settings, "ADAPTATION", "internal"):
        yield


# Use client_no_db fixture for all tests (they use mocks, no real DB needed)
@pytest.fixture(autouse=True)
def client(client_no_db):
    """Auto-use client_no_db fixture for all tests in this module"""
    return client_no_db

# Internal keys (when ADAPTATION=internal)
MOCK_INDICATOR_CREATE_INTERNAL = {
    "indicator_name": "Test Indicator",
    "indicator_gid": "TEST_IND_001",
    "indicator_info": "This is a test indicator",
    "indicator_global": True,
    "short_name": "Test",
    "keywords": "test, sample",
    "indicator_order": 1.0,
    "data_exist": True,
    "highisgood": True
}

# External keys (when ADAPTATION is not "internal") - from db_tbl_cols_mapping.json
MOCK_INDICATOR_CREATE_EXTERNAL = {
    "i_name": "Test Indicator",
    "i_gid": "TEST_IND_001",
    "i_description": "This is a test indicator",
    "i_is_global": True,
    "i_short_name": "Test",
    "i_keywords": "test, sample",
    "i_order": 1.0,
    "i_has_data": True,
    "i_high_is_good": True,
}

# Tests always use internal payload (force_internal_adaptation fixture sets ADAPTATION=internal)
MOCK_INDICATOR_CREATE = MOCK_INDICATOR_CREATE_INTERNAL

MOCK_INDICATOR_RESPONSE = {
    "indicator_nid": 1,
    "indicator_name": "Test Indicator",
    "indicator_gid": "TEST_IND_001",
    "indicator_info": "This is a test indicator",
    "indicator_global": 1,
    "short_name": "Test",
    "keywords": "test, sample",
    "indicator_order": 1.0,
    "data_exist": 1,
    "highisgood": 1
}


class TestIndicatorCreate:
    """Tests for creating indicators (batch API: body is array of indicator objects)"""

    @patch('apps.datawarehouse.services.indicator.IndicatorService.create_indicators_batch')
    def test_create_indicator_success(self, mock_batch, client):
        """Test successful single indicator creation (array body with one item)"""
        mock_batch.return_value = {"created": [MOCK_INDICATOR_RESPONSE], "errors": []}

        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/indicators", json=[MOCK_INDICATOR_CREATE])

        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 1
        assert data.get("meta", {}).get("count") == 1
        assert mock_batch.called
        call_args = mock_batch.call_args
        assert call_args[0][0] == TEST_WAREHOUSE_ID
        assert isinstance(call_args[0][1], list)
        assert len(call_args[0][1]) == 1
        assert isinstance(call_args[0][1][0], IndicatorCreateSchema)
        expected_name = (
            MOCK_INDICATOR_CREATE.get("i_name")
            or MOCK_INDICATOR_CREATE.get("name")
            or MOCK_INDICATOR_CREATE.get("indicator_name")
        )
        assert call_args[0][1][0].indicator_name == expected_name

    @patch('apps.datawarehouse.services.indicator.IndicatorService.create_indicators_batch')
    def test_create_indicators_batch_success(self, mock_batch, client):
        """Test batch create with multiple indicators"""
        mock_batch.return_value = {
            "created": [MOCK_INDICATOR_RESPONSE, {**MOCK_INDICATOR_RESPONSE, "indicator_nid": 2}],
            "errors": [],
        }

        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators",
            json=[MOCK_INDICATOR_CREATE, {**MOCK_INDICATOR_CREATE, "indicator_name": "Second", "indicator_gid": "TEST_IND_002"}],
        )

        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 2
        assert data["meta"]["count"] == 2

    def test_create_indicator_empty_array_rejected(self, client):
        """Test that empty array returns 400"""
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/indicators", json=[])

        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False

    def test_create_indicator_missing_indicator_data(self, client):
        """Test creating indicator without indicator data (body not array or invalid item)"""
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/indicators", json={})

        assert response.status_code == 422  # Validation error (body must be array)

    @patch('apps.datawarehouse.services.indicator.IndicatorService.create_indicators_batch')
    def test_create_indicator_with_gids_success(self, mock_batch, client):
        """Test create with unit_gid, subgroup_val_gid, ic_gid (lists of GIDs; internal keys)"""
        mock_batch.return_value = {"created": [MOCK_INDICATOR_RESPONSE], "errors": []}
        payload = [
            {
                "indicator_name": "GID Test",
                "indicator_gid": "GIDTEST001",
                "unit_gid": ["UNIT_GID_1"],
                "subgroup_val_gid": ["TOTAL"],
                "ic_gid": ["IC_GID_1"],
            }
        ]

        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/indicators", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        call_args = mock_batch.call_args
        schema = call_args[0][1][0]
        assert schema.unit_gid == ["UNIT_GID_1"]
        assert schema.subgroup_val_gid == ["TOTAL"]
        assert schema.ic_gid == ["IC_GID_1"]

    @patch('apps.datawarehouse.services.indicator.IndicatorService.create_indicators_batch')
    def test_create_indicator_single_gid_normalized_to_list(self, mock_batch, client):
        """Test that single string for unit_gid is normalized to one-element list"""
        mock_batch.return_value = {"created": [MOCK_INDICATOR_RESPONSE], "errors": []}
        payload = [
            {
                "indicator_name": "Single GID",
                "indicator_gid": "SINGLE001",
                "unit_gid": "UNIT_GID_1",
                "subgroup_val_gid": "TOTAL",
            }
        ]
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/indicators", json=payload)
        assert response.status_code == 201
        schema = mock_batch.call_args[0][1][0]
        assert schema.unit_gid == ["UNIT_GID_1"]
        assert schema.subgroup_val_gid == ["TOTAL"]

    @patch('apps.datawarehouse.services.indicator.IndicatorService.create_indicators_batch')
    def test_create_indicator_service_error(self, mock_batch, client):
        """Test indicator creation with service error"""
        mock_batch.side_effect = Exception("Database connection failed")

        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/indicators", json=[MOCK_INDICATOR_CREATE])

        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False

    @patch('apps.datawarehouse.services.indicator.IndicatorService.create_indicators_batch')
    def test_create_indicator_warehouse_not_found(self, mock_batch, client):
        """Test creating indicator with invalid dw_id"""
        mock_batch.side_effect = ValueError(f"Warehouse ID '{TEST_WAREHOUSE_ID}' not found")

        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/indicators", json=[MOCK_INDICATOR_CREATE])

        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False


class TestIndicatorGet:
    """Tests for getting indicators"""
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_all_indicators')
    def test_get_all_indicators_success(self, mock_get_all, client):
        """Test getting all indicators"""
        mock_get_all.return_value = ([MOCK_INDICATOR_RESPONSE], 1, None)
        
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators?page=1&page_size=10"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert "meta" in data
        assert data["meta"]["total_count"] == 1
        assert data["meta"]["count"] == 1
        assert data["meta"]["page"] == 1
        assert data["meta"]["page_size"] == 10
        mock_get_all.assert_called_once()
        call_kw = mock_get_all.call_args[1]
        assert call_kw["page"] == 1
        assert call_kw["page_size"] == 10
        assert call_kw.get("include_ius_nids_in_s_gid") is False

    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_all_indicators')
    def test_get_all_indicators_ius_query_passes_include_flag(self, mock_get_all, client):
        """GET /indicators?ius=true passes include_ius_nids_in_s_gid to the service."""
        mock_get_all.return_value = ([MOCK_INDICATOR_RESPONSE], 1, None)

        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators?page=1&page_size=10&ius=true"
        )

        assert response.status_code == 200
        mock_get_all.assert_called_once()
        assert mock_get_all.call_args[1].get("include_ius_nids_in_s_gid") is True

    @patch("apps.datawarehouse.router.indicator.ius_service.get_ic_nids_for_ic_mapping_filter")
    @patch("apps.datawarehouse.router.indicator.ius_service.get_iusnids_for_ic_mapping_filter")
    @patch("apps.datawarehouse.router.indicator.ius_service.get_indicator_nids_by_filters")
    @patch("apps.datawarehouse.services.indicator.IndicatorService.get_all_indicators")
    def test_get_all_indicators_ic_type_passes_iusnid_allowlist(
        self,
        mock_get_all,
        mock_indicator_nids_by_filters,
        mock_iusnids_for_ic,
        mock_ic_nids_for_ic,
        client,
    ):
        """ic_type alone restricts IUS/IC expansion to mappings for that IC type."""
        mock_indicator_nids_by_filters.return_value = [1]
        mock_iusnids_for_ic.return_value = {65}
        mock_ic_nids_for_ic.return_value = {10, 11}
        mock_get_all.return_value = ([MOCK_INDICATOR_RESPONSE], 1, None)

        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators?ic_type=SC&ius=true&metadata=true"
        )

        assert response.status_code == 200
        mock_iusnids_for_ic.assert_called_once_with(
            TEST_WAREHOUSE_ID, "en", [], [], "SC"
        )
        mock_ic_nids_for_ic.assert_called_once_with(
            TEST_WAREHOUSE_ID, "en", [], [], "SC"
        )
        mock_get_all.assert_called_once()
        assert mock_get_all.call_args[1].get("iusnid_allowlist") == {65}
        assert mock_get_all.call_args[1].get("ic_nid_allowlist") == {10, 11}

    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_by_id')
    def test_get_indicator_by_nid_success(self, mock_get, client):
        """Test getting indicator by NID (numeric identifier)"""
        mock_get.return_value = (MOCK_INDICATOR_RESPONSE, None)

        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators/1")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Internal: indicator_nid; external: i_nid
        assert data["data"].get("indicator_nid") == 1 or data["data"].get("i_nid") == 1
        mock_get.assert_called_once()
        assert mock_get.call_args[0] == (TEST_WAREHOUSE_ID, 1, 'en')
        assert mock_get.call_args[1].get('give_ius') is False
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_by_id')
    def test_get_indicator_by_nid_not_found(self, mock_get, client):
        """Test getting non-existent indicator by NID (numeric identifier)"""
        mock_get.return_value = (None, None)

        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators/999")
        
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_by_id')
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_nid_by_gid')
    def test_get_indicator_by_gid_success(self, mock_nid_by_gid, mock_get_by_id, client):
        """Test getting indicator by GID (alphanumeric identifier)"""
        mock_nid_by_gid.return_value = 123
        mock_get_by_id.return_value = (MOCK_INDICATOR_RESPONSE, None)

        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators/TEST_IND_001")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Internal: indicator_gid; external: i_gid
        assert data["data"].get("indicator_gid") == "TEST_IND_001" or data["data"].get("i_gid") == "TEST_IND_001"
        mock_nid_by_gid.assert_called_once_with(TEST_WAREHOUSE_ID, "TEST_IND_001")
        mock_get_by_id.assert_called_once()
        assert mock_get_by_id.call_args[0] == (TEST_WAREHOUSE_ID, 123, "en")

    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_nid_by_gid')
    def test_get_indicator_by_gid_not_found(self, mock_nid_by_gid, client):
        """Test getting non-existent indicator by GID (alphanumeric identifier)"""
        mock_nid_by_gid.return_value = None

        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators/NONEXISTENT_GID")

        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        if mock_nid_by_gid.called:
            mock_nid_by_gid.assert_called_once_with(TEST_WAREHOUSE_ID, "NONEXISTENT_GID")

    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_by_id')
    def test_get_indicator_multiple_nids_success(self, mock_get, client):
        """Test getting multiple indicators by comma-separated NIDs"""
        ind1 = {**MOCK_INDICATOR_RESPONSE, "indicator_nid": 1}
        ind2 = {**MOCK_INDICATOR_RESPONSE, "indicator_nid": 2, "indicator_name": "Second", "indicator_gid": "TEST_IND_002"}
        mock_get.side_effect = [(ind1, None), (ind2, None)]

        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators/1,2")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Indicators retrieved successfully"
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 2
        assert data["data"][0].get("indicator_nid") == 1 or data["data"][0].get("i_nid") == 1
        assert data["data"][1].get("indicator_nid") == 2 or data["data"][1].get("i_nid") == 2
        assert mock_get.call_count == 2
        assert mock_get.call_args_list[0][0] == (TEST_WAREHOUSE_ID, 1, "en")
        assert mock_get.call_args_list[1][0] == (TEST_WAREHOUSE_ID, 2, "en")

    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_by_id')
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_nid_by_gid')
    def test_get_indicator_multiple_mixed_nid_gid_success(self, mock_nid_by_gid, mock_get, client):
        """Test getting multiple indicators by comma-separated NID and GID"""
        mock_nid_by_gid.return_value = 123
        ind1 = {**MOCK_INDICATOR_RESPONSE, "indicator_nid": 1}
        ind2 = {**MOCK_INDICATOR_RESPONSE, "indicator_nid": 123, "indicator_gid": "TEST_IND_001"}
        mock_get.side_effect = [(ind1, None), (ind2, None)]

        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators/1,TEST_IND_001")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 2
        mock_nid_by_gid.assert_called_once_with(TEST_WAREHOUSE_ID, "TEST_IND_001")
        assert mock_get.call_count == 2

    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_by_id')
    def test_get_indicator_multiple_all_not_found_returns_404(self, mock_get, client):
        """Test multiple identifiers when none resolve to an indicator returns 404"""
        # 999 and 998 are numeric so resolve to NIDs; get_indicator_by_id returns (None, None) for both
        mock_get.return_value = (None, None)

        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators/999,998")

        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_by_id')
    def test_get_indicator_multiple_partial_found_returns_200_with_list(self, mock_get, client):
        """Test multiple identifiers when only some exist returns 200 with list of found ones"""
        ind1 = {**MOCK_INDICATOR_RESPONSE, "indicator_nid": 1}
        mock_get.side_effect = [(ind1, None), (None, None)]  # second (2) not found

        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators/1,2")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 1
        assert data["data"][0].get("indicator_nid") == 1 or data["data"][0].get("i_nid") == 1

    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_nid_by_gid')
    def test_get_indicator_multiple_all_invalid_identifiers_returns_404(self, mock_nid_by_gid, client):
        """Test multiple identifiers when none resolve (e.g. all invalid GIDs) returns 404"""
        mock_nid_by_gid.return_value = None

        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators/BAD_GID,ANOTHER_BAD")

        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_all_indicators')
    def test_get_all_indicators_service_error(self, mock_get_all, client):
        """Test getting indicators with service error"""
        mock_get_all.side_effect = Exception("Database error")
        
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators")
        
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_all_indicators')
    def test_get_all_indicators_empty_list(self, mock_get_all, client):
        """Test getting indicators when none exist"""
        mock_get_all.return_value = ([], 0, None)
        
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/indicators")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == []
        assert data["meta"]["total_count"] == 0


# Update payloads use internal keys (force_internal_adaptation fixture)
UPDATE_NAME_PAYLOAD = {"indicator_name": "Updated Name"}
UPDATE_KEYWORDS_PAYLOAD = {"keywords": "updated, keywords"}


class TestIndicatorUpdate:
    """Tests for updating indicators"""
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.update_indicator')
    def test_update_indicator_by_nid_success(self, mock_update, client):
        """Test successful indicator update by NID (numeric identifier)"""
        updated_indicator = {**MOCK_INDICATOR_RESPONSE, "indicator_name": "Updated Name"}
        mock_update.return_value = updated_indicator
        
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/1",
            json=UPDATE_NAME_PAYLOAD
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Response uses internal or external keys depending on ADAPTATION
        display_name = (
            data["data"].get("indicator_name") or data["data"].get("name") or data["data"].get("i_name")
        )
        assert display_name == "Updated Name"
        assert mock_update.called
        call_args = mock_update.call_args
        assert call_args[0][0] == TEST_WAREHOUSE_ID
        assert call_args[0][1] == 1
        assert isinstance(call_args[0][2], IndicatorUpdateSchema)
        # Service always receives internal schema (i_name -> indicator_name when external)
        assert call_args[0][2].indicator_name == "Updated Name"
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.update_indicator')
    def test_update_indicator_by_nid_not_found(self, mock_update, client):
        """Test updating non-existent indicator by NID (numeric identifier)"""
        mock_update.return_value = None
        
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/999",
            json=UPDATE_NAME_PAYLOAD
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_nid_by_gid')
    @patch('apps.datawarehouse.services.indicator.IndicatorService.update_indicator')
    def test_update_indicator_by_gid_success(self, mock_update, mock_get_nid, client):
        """Test successful indicator update by GID (alphanumeric identifier)"""
        mock_get_nid.return_value = 1
        updated_indicator = {**MOCK_INDICATOR_RESPONSE, "indicator_name": "Updated Name"}
        mock_update.return_value = updated_indicator
        
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/TEST_IND_001",
            json=UPDATE_NAME_PAYLOAD
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_get_nid.assert_called_once_with(TEST_WAREHOUSE_ID, "TEST_IND_001")
        mock_update.assert_called_once_with(TEST_WAREHOUSE_ID, 1, ANY, 'en')
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_nid_by_gid')
    def test_update_indicator_by_gid_not_found(self, mock_get_nid, client):
        """Test updating non-existent indicator by GID (alphanumeric identifier)"""
        mock_get_nid.return_value = None
        
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/NONEXISTENT",
            json=UPDATE_NAME_PAYLOAD
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.update_indicator')
    def test_update_indicator_partial(self, mock_update, client):
        """Test partial indicator update by NID (numeric identifier)"""
        updated_indicator = {**MOCK_INDICATOR_RESPONSE, "keywords": "updated, keywords"}
        mock_update.return_value = updated_indicator
        
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/1",
            json=UPDATE_KEYWORDS_PAYLOAD
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert mock_update.called
        call_args = mock_update.call_args
        assert call_args[0][0] == TEST_WAREHOUSE_ID
        assert call_args[0][1] == 1
        assert isinstance(call_args[0][2], IndicatorUpdateSchema)
        assert call_args[0][2].keywords == "updated, keywords"


class TestIndicatorDelete:
    """Tests for deleting indicators"""
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.delete_indicator')
    def test_delete_indicator_by_nid_success(self, mock_delete, client):
        """Test successful indicator deletion by NID (numeric identifier)"""
        mock_delete.return_value = True
        
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/indicators/1")
        
        assert response.status_code == 204
        mock_delete.assert_called_once_with(TEST_WAREHOUSE_ID, 1, 'en')
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.delete_indicator')
    def test_delete_indicator_by_nid_not_found(self, mock_delete, client):
        """Test deleting non-existent indicator by NID (numeric identifier)"""
        mock_delete.return_value = False
        
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/indicators/999")
        
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_nid_by_gid')
    @patch('apps.datawarehouse.services.indicator.IndicatorService.delete_indicator')
    def test_delete_indicator_by_gid_success(self, mock_delete, mock_get_nid, client):
        """Test successful indicator deletion by GID (alphanumeric identifier)"""
        mock_get_nid.return_value = 1
        mock_delete.return_value = True
        
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/indicators/TEST_IND_001")
        
        assert response.status_code == 204
        mock_get_nid.assert_called_once_with(TEST_WAREHOUSE_ID, "TEST_IND_001")
        mock_delete.assert_called_once_with(TEST_WAREHOUSE_ID, 1, 'en')
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_indicator_nid_by_gid')
    def test_delete_indicator_by_gid_not_found(self, mock_get_nid, client):
        """Test deleting non-existent indicator by GID (alphanumeric identifier)"""
        mock_get_nid.return_value = None
        
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/indicators/NONEXISTENT")
        
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.delete_indicator')
    def test_delete_indicator_service_error(self, mock_delete, client):
        """Test deleting indicator with service error"""
        mock_delete.side_effect = Exception("Database error")
        
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/indicators/1")
        
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestIndicatorMultipleDelete:
    """Tests for POST /dw/{dw_id}/indicators/multiple-delete"""

    @pytest.fixture(autouse=True)
    def _bypass_iam(self, monkeypatch):
        monkeypatch.setattr(
            "apps.shared.middleware.auth_middleware._matches_for_path",
            lambda _method, _path: [("DFA_DM", "PUBLIC", -1)],
        )

    @patch("apps.datawarehouse.services.db_metadata.notify_dbmetadata_counts_changed")
    @patch(
        "apps.datawarehouse.services.indicator.IndicatorService.multiple_delete_indicators"
    )
    def test_multiple_delete_indicators_success(self, mock_multi, _mock_notify, client):
        mock_multi.return_value = {"deleted": [1, 2], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/multiple-delete",
            json={"indicator_nid": [1, 2]},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["deleted"] == [1, 2]
        mock_multi.assert_called_once()

    @patch("apps.datawarehouse.services.db_metadata.notify_dbmetadata_counts_changed")
    @patch(
        "apps.datawarehouse.services.indicator.IndicatorService.multiple_delete_indicators"
    )
    def test_multiple_delete_indicators_empty_list_skips_service(
        self, mock_multi, _mock_notify, client
    ):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/multiple-delete",
            json={"indicator_nid": []},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["deleted"] == []
        mock_multi.assert_not_called()


class TestIndicatorPagination:
    """Tests for pagination"""
    
    @patch('apps.datawarehouse.services.indicator.IndicatorService.get_all_indicators')
    def test_get_indicators_with_pagination(self, mock_get_all, client):
        """Test getting indicators with pagination parameters"""
        mock_get_all.return_value = ([MOCK_INDICATOR_RESPONSE], 10, None)
        
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators?page=2&page_size=5"
        )

        assert response.status_code == 200
        data = response.json()
        assert "meta" in data
        assert data["meta"]["page"] == 2
        assert data["meta"]["page_size"] == 5
        assert data["meta"]["total_count"] == 10
        assert data["meta"]["total_pages"] == 2
        mock_get_all.assert_called_once()
        call_kw = mock_get_all.call_args[1]
        assert call_kw["page"] == 2
        assert call_kw["page_size"] == 5


class TestIndicatorValidation:
    """Tests for input validation"""
    
    def test_create_indicator_invalid_name(self, client):
        """Test creating indicator with invalid name (too long)"""
        invalid_indicator = {"indicator_name": "x" * 300, "indicator_gid": "TEST_001"}
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/indicators", json=[invalid_indicator])

        assert response.status_code == 422  # Validation error (max length)

    def test_create_indicator_missing_required_field(self, client):
        """Test creating indicator without required field (indicator_name)"""
        invalid_indicator = {"indicator_gid": "TEST_001"}  # missing "indicator_name"
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/indicators", json=[invalid_indicator])

        assert response.status_code == 422  # Validation error

    @patch('apps.datawarehouse.services.indicator.IndicatorService.create_indicators_batch')
    def test_invalid_dw_id(self, mock_batch, client):
        """Test with invalid dw_id"""
        mock_batch.side_effect = ValueError("Warehouse ID 'invalid' not found")

        response = client.post("/dw/invalid/indicators", json=[MOCK_INDICATOR_CREATE])

        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False


MOCK_INDICATOR_ASSOCIATION_COUNTS = {"data_count": 50, "ius_count": 3}


class TestIndicatorAssociationCount:
    """Tests for GET /dw/{dw_id}/indicators/association-count"""

    @patch("apps.datawarehouse.services.indicator.IndicatorService.get_association_counts")
    def test_association_count_success(self, mock_counts, client):
        mock_counts.return_value = MOCK_INDICATOR_ASSOCIATION_COUNTS
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/association-count",
            params={"identifier": "1,2"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Association counts retrieved successfully"
        assert data["data"]["data_count"] == 50
        assert data["data"]["ius_count"] == 3
        mock_counts.assert_called_once()
        call_args = mock_counts.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == [1, 2]

    @patch("apps.datawarehouse.services.indicator.IndicatorService.get_association_counts")
    def test_association_count_with_gid(self, mock_counts, client):
        mock_counts.return_value = MOCK_INDICATOR_ASSOCIATION_COUNTS
        with patch(
            "apps.datawarehouse.services.indicator.IndicatorService.get_indicator_nid_by_gid",
            return_value=5,
        ):
            response = client.get(
                f"/dw/{TEST_WAREHOUSE_ID}/indicators/association-count",
                params={"identifier": "TEST_IND_001"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_count"] == 50
        mock_counts.assert_called_once()
        call_args = mock_counts.call_args[0]
        assert call_args[1] == [5]

    @patch("apps.datawarehouse.services.indicator.IndicatorService.get_association_counts")
    def test_association_count_empty_list(self, mock_counts, client):
        mock_counts.return_value = {"data_count": 0, "ius_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_count"] == 0
        assert data["data"]["ius_count"] == 0
        mock_counts.assert_called_once()

    @patch("apps.datawarehouse.services.indicator.IndicatorService.get_association_counts")
    def test_association_count_no_identifier_returns_zeros(self, mock_counts, client):
        mock_counts.return_value = {"data_count": 0, "ius_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_count"] == 0
        assert data["data"]["ius_count"] == 0

    @patch("apps.datawarehouse.services.indicator.IndicatorService.get_association_counts")
    def test_association_count_indicator_not_found(self, mock_counts, client):
        mock_counts.side_effect = ValueError("Indicator(s) not found: 999")
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/association-count",
            params={"identifier": "999"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.indicator.IndicatorService.get_indicator_nid_by_gid")
    def test_association_count_gid_not_found(self, mock_get_nid, client):
        mock_get_nid.return_value = None
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/association-count",
            params={"identifier": "NONEXISTENT_GID"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.indicator.IndicatorService.get_association_counts")
    def test_association_count_service_error(self, mock_counts, client):
        mock_counts.side_effect = Exception("Database error")
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/indicators/association-count",
            params={"identifier": "1"},
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False

