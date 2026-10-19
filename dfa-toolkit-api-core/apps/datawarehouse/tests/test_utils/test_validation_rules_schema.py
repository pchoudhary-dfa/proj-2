"""Pydantic validation for indicator validation-rules PATCH payload."""
import pytest
from pydantic import ValidationError

from apps.datawarehouse.schemas.validation_rules import ValidationRuleUpsertSchema


def test_enum_option_accepts_labels_map_with_null_entries():
    m = ValidationRuleUpsertSchema(
        unit_gids=["u1"],
        validation_type="ENUM",
        options=[
            {
                "option_code": "code_a",
                "labels": {"en": "Yes", "fr": None, "ar": None},
                "score": 1,
            }
        ],
    )
    assert m.options[0].labels["en"] == "Yes"
    assert m.options[0].labels["fr"] is None


def test_enum_option_rejects_labels_map_with_no_non_empty_value():
    with pytest.raises(ValidationError):
        ValidationRuleUpsertSchema(
            unit_gids=["u1"],
            validation_type="ENUM",
            options=[
                {
                    "option_code": "code_a",
                    "labels": {"en": None, "fr": None},
                }
            ],
        )


def test_enum_option_legacy_label_when_labels_omitted():
    m = ValidationRuleUpsertSchema(
        unit_gids=["u1"],
        validation_type="ENUM",
        options=[{"option_code": "x", "label": "only en"}],
    )
    assert m.options[0].label == "only en"
    assert m.options[0].labels is None
