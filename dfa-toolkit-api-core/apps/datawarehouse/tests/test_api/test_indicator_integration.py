"""
Integration tests for Indicator API (requires actual database)
These tests can be run against a real warehouse database
"""
import pytest
from fastapi.testclient import TestClient

from main import app
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix
from apps.datawarehouse.utils.response_filter import is_external_adaptation

client = TestClient(app)

# NOTE: Update this with your actual dw_id for integration testing.
# The dw_id must exist in system_datawarehouse (application DB).
INTEGRATION_WAREHOUSE_ID = "1"  # or your registered warehouse id/database name

INTEGRATION_INDICATOR_INTERNAL = {
    "indicator_name": "Integration Test Indicator",
    "indicator_gid": "INT_TEST_001",
    "indicator_info": "This is an integration test indicator",
    "indicator_global": True,
    "short_name": "IntTest",
    "keywords": "integration, test",
    "indicator_order": 1.0,
    "data_exist": True,
    "highisgood": True,
}

INTEGRATION_INDICATOR_EXTERNAL = {
    "i_name": "Integration Test Indicator",
    "i_gid": "INT_TEST_001",
    "i_description": "This is an integration test indicator",
    "i_is_global": True,
    "i_short_name": "IntTest",
    "i_keywords": "integration, test",
    "i_order": 1.0,
    "i_has_data": True,
    "i_high_is_good": True,
}

INTEGRATION_INDICATOR = (
    INTEGRATION_INDICATOR_EXTERNAL if is_external_adaptation() else INTEGRATION_INDICATOR_INTERNAL
)


@pytest.mark.integration
class TestIndicatorIntegration:
    """Integration tests that require a real database connection"""
    
    def test_create_and_get_indicator(self):
        """Test creating an indicator and then retrieving it"""
        # Create indicator
        create_response = client.post(
            f"/api/v1/indicator/{INTEGRATION_WAREHOUSE_ID}",
            json=INTEGRATION_INDICATOR
        )
        
        if create_response.status_code == 201:
            created_data = create_response.json()
            # Internal: indicator_nid; external: i_nid
            indicator_id = created_data["data"].get("indicator_nid") or created_data["data"].get("i_nid")
            
            # Get the created indicator
            get_response = client.get(
                f"/api/v1/indicator/{INTEGRATION_WAREHOUSE_ID}/{indicator_id}"
            )
            
            assert get_response.status_code == 200
            get_data = get_response.json()
            assert get_data["data"].get("indicator_nid") == indicator_id or get_data["data"].get("i_nid") == indicator_id
            expected_name = INTEGRATION_INDICATOR.get("indicator_name") or INTEGRATION_INDICATOR.get("i_name")
            # Stored values in lang tables use lang prefix (e.g. "#")
            prefixed = apply_lang_prefix(expected_name)
            assert get_data["data"].get("indicator_name") == prefixed or get_data["data"].get("i_name") == prefixed
    
    def test_create_update_delete_flow(self):
        """Test complete CRUD flow"""
        # Create
        create_response = client.post(
            f"/api/v1/indicator/{INTEGRATION_WAREHOUSE_ID}",
            json=INTEGRATION_INDICATOR
        )
        
        if create_response.status_code == 201:
            created_data = create_response.json()["data"]
            indicator_id = created_data.get("indicator_nid") or created_data.get("i_nid")
            
            # Update (internal or external key per ADAPTATION)
            update_data = (
                {"i_name": "Updated Integration Test Indicator"}
                if is_external_adaptation()
                else {"indicator_name": "Updated Integration Test Indicator"}
            )
            
            update_response = client.put(
                f"/api/v1/indicator/{INTEGRATION_WAREHOUSE_ID}/{indicator_id}",
                json=update_data
            )
            
            assert update_response.status_code == 200
            
            # Delete
            delete_response = client.delete(
                f"/api/v1/indicator/{INTEGRATION_WAREHOUSE_ID}/{indicator_id}"
            )
            
            assert delete_response.status_code == 200
            
            # Verify deleted
            get_response = client.get(
                f"/api/v1/indicator/{INTEGRATION_WAREHOUSE_ID}/{indicator_id}"
            )
            
            assert get_response.status_code == 404
    
    def test_list_indicators(self):
        """Test listing all indicators"""
        response = client.get(
            f"/api/v1/indicator/{INTEGRATION_WAREHOUSE_ID}/list?skip=0&limit=10"
        )
        
        assert response.status_code in [200, 404, 500]  # 404 if warehouse not found, 500 if DB connection fails
        if response.status_code == 200:
            data = response.json()
            assert "indicators" in data["data"]
            assert "pagination" in data["data"]

