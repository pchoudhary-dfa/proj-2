"""
Tests for search sync background job endpoints.
"""
from unittest.mock import MagicMock, patch

import pytest

from apps.shared.services.bg_job_dispatch import BgJobDispatchResult


@pytest.fixture
def mock_dispatch_result():
    """Mock dispatch_bg_job result."""
    return BgJobDispatchResult(db_job_id=42, celery_task_id=None)


@pytest.fixture
def mock_celery_dispatch_result():
    """Mock dispatch_bg_job result for Celery mode."""
    return BgJobDispatchResult(db_job_id=None, celery_task_id="test-task-uuid")


def test_sync_search_index_post_returns_job_ref(client, mock_dispatch_result):
    """POST /search/sync returns db_job_id or celery_task_id."""
    with patch("apps.datawarehouse.router.search.dispatch_bg_job", return_value=mock_dispatch_result):
        with patch("apps.datawarehouse.router.search.settings") as mock_settings:
            mock_settings.BG_JOB_MQ_TYPE = "DB"
            with patch("apps.datawarehouse.router.search.find_active_sync_search_job", return_value=None):
                response = client.post("/dw/test_dw/search/sync")

    assert response.status_code == 202
    data = response.json()
    assert data["success"] is True
    assert data["data"]["dw_id"] == "test_dw"
    assert data["data"]["job_type"] == "sync_search_index"
    assert data["data"]["db_job_id"] == 42
    assert data["data"]["celery_task_id"] is None


def test_sync_search_index_post_celery_mode(client, mock_celery_dispatch_result):
    """POST /search/sync returns celery_task_id in Celery mode."""
    with patch("apps.datawarehouse.router.search.dispatch_bg_job", return_value=mock_celery_dispatch_result):
        with patch("apps.datawarehouse.router.search.settings") as mock_settings:
            mock_settings.BG_JOB_MQ_TYPE = "CELERY"
            response = client.post("/dw/test_dw/search/sync")

    assert response.status_code == 202
    data = response.json()
    assert data["data"]["celery_task_id"] == "test-task-uuid"
    assert data["data"]["db_job_id"] is None


def test_sync_search_index_conflict_on_duplicate_job(client):
    """POST /search/sync returns 409 if a job is already running (DB mode)."""
    active_job = {
        "db_job_id": 123,
        "job_status": "processing",
        "job_type": "sync_search_index",
    }
    with patch("apps.datawarehouse.router.search.find_active_sync_search_job", return_value=active_job):
        with patch("apps.datawarehouse.router.search.settings") as mock_settings:
            mock_settings.BG_JOB_MQ_TYPE = "DB"
            response = client.post("/dw/test_dw/search/sync")

    assert response.status_code == 409
    data = response.json()
    assert data["success"] is False
    assert "already in progress" in data["err_message"]


def test_get_sync_status_db_mode(client):
    """GET /search/sync/status?db_job_id=1 returns job status."""
    status_data = {
        "job_status": "processing",
        "job_type": "sync_search_index",
        "db_job_id": 1,
        "celery_task_id": None,
        "result": None,
        "last_error": None,
        "completed_at": None,
    }
    with patch("apps.datawarehouse.router.search.get_db_job_status", return_value=status_data):
        response = client.get("/dw/test_dw/search/sync/status?db_job_id=1")

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["job_status"] == "processing"
    assert data["data"]["db_job_id"] == 1


def test_get_sync_status_celery_mode(client):
    """GET /search/sync/status?celery_task_id=uuid returns Celery task status."""
    status_data = {
        "job_status": "completed",
        "job_type": None,
        "db_job_id": None,
        "celery_task_id": "test-uuid",
        "result": {"success": True},
        "last_error": None,
        "completed_at": None,
    }
    with patch("apps.datawarehouse.router.search.get_celery_task_status", return_value=status_data):
        response = client.get("/dw/test_dw/search/sync/status?celery_task_id=test-uuid")

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["job_status"] == "completed"
    assert data["data"]["celery_task_id"] == "test-uuid"


def test_get_sync_status_missing_both_params(client):
    """GET /search/sync/status with no params returns 400."""
    response = client.get("/dw/test_dw/search/sync/status")

    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert "required" in data["err_message"].lower()


def test_get_sync_status_both_params_provided(client):
    """GET /search/sync/status with both params returns 400."""
    response = client.get("/dw/test_dw/search/sync/status?db_job_id=1&celery_task_id=uuid")

    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert "only one" in data["err_message"].lower()


def test_get_active_sync_job_db_mode(client):
    """GET /search/sync/active returns active job in DB mode."""
    active_job = {
        "job_status": "pending",
        "job_type": "sync_search_index",
        "db_job_id": 99,
        "celery_task_id": None,
    }
    with patch("apps.datawarehouse.router.search.find_active_sync_search_job", return_value=active_job):
        with patch("apps.datawarehouse.router.search.settings") as mock_settings:
            mock_settings.BG_JOB_MQ_TYPE = "DB"
            response = client.get("/dw/test_dw/search/sync/active")

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["db_job_id"] == 99


def test_get_active_sync_job_no_active(client):
    """GET /search/sync/active returns null when no active job."""
    with patch("apps.datawarehouse.router.search.find_active_sync_search_job", return_value=None):
        with patch("apps.datawarehouse.router.search.settings") as mock_settings:
            mock_settings.BG_JOB_MQ_TYPE = "DB"
            response = client.get("/dw/test_dw/search/sync/active")

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"] is None


def test_get_active_sync_job_celery_mode(client):
    """GET /search/sync/active returns null in Celery mode."""
    with patch("apps.datawarehouse.router.search.settings") as mock_settings:
        mock_settings.BG_JOB_MQ_TYPE = "CELERY"
        response = client.get("/dw/test_dw/search/sync/active")

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"] is None
