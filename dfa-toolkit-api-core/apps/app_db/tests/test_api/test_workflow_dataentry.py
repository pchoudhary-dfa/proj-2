"""Schema validation tests for workflow data-entry API models."""
import pytest
from pydantic import ValidationError

from apps.app_db.schemas.workflow import WorkflowDataentryUpsertRequest


class TestWorkflowDataentryUpsertRequest:
    def test_valid_frequency_all_uppercase_normalized(self):
        m = WorkflowDataentryUpsertRequest(
            area_level=1,
            role_id=1,
            timeperiod_frequency="all",
        )
        assert m.timeperiod_frequency == "ALL"

    def test_invalid_frequency_rejected(self):
        with pytest.raises(ValidationError) as exc:
            WorkflowDataentryUpsertRequest(
                area_level=1,
                role_id=1,
                timeperiod_frequency="WEEKLY",
            )
        assert "timeperiod_frequency" in str(exc.value)

    def test_empty_string_frequency_becomes_none(self):
        m = WorkflowDataentryUpsertRequest(
            area_level=1,
            role_id=1,
            timeperiod_frequency="   ",
        )
        assert m.timeperiod_frequency is None

    def test_role_id_optional_omitted(self):
        m = WorkflowDataentryUpsertRequest(area_level=1)
        assert m.role_id is None
