"""Unit tests for user_service.create_user (invite_only path)."""
import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from apps.shared.exceptions import BadRequest

from apps.app_db.services import user_service


def test_create_user_invite_only_with_password_raises_value_error():
    with pytest.raises(BadRequest, match="invite_only cannot be combined"):
        user_service.create_user(
            db=None,  # not consulted: invite_only + password raises first
            first_name="A",
            username="n",
            email="a@a.com",
            password="secret",
            invite_only=True,
        )


@patch("apps.app_db.services.user_service.IamUser")
def test_create_user_invite_only_passes_null_password_to_model(mock_iam_cls: MagicMock) -> None:
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    inst = MagicMock()
    inst.id = 1
    inst.password = None
    inst.first_name = "Inv"
    inst.username = "u"
    inst.email = "e@e.com"
    inst.created = datetime(2020, 1, 1)
    inst.last_name = None
    inst.location = None
    inst.phone = None
    inst.organisation = None
    mock_iam_cls.return_value = inst

    user, auto_gen, plain = user_service.create_user(
        db=db,
        first_name="Inv",
        last_name=None,
        username="u1_test",
        email="e1@example.com",
        password=None,
        status=1,
        created_user_id=1,
        invite_only=True,
    )

    assert mock_iam_cls.called
    call_kwargs = mock_iam_cls.call_args[1]
    assert call_kwargs["password"] is None
    assert user is inst
    assert auto_gen is False
    assert plain is None
    db.add.assert_called_once()
    db.commit.assert_called_once()
    db.refresh.assert_called_once()


@patch("apps.app_db.services.user_service.IamUser")
def test_create_user_default_omitted_password_still_hashes(mock_iam_cls: MagicMock) -> None:
    """Registration path: password None + invite_only False => hashed random password stored."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    u = str(uuid.uuid4())[:8]
    inst = MagicMock()
    inst.id = 2
    inst.first_name = "R"
    inst.username = f"r_{u}"
    inst.email = f"r_{u}@example.com"
    inst.last_name = None
    inst.location = None
    inst.phone = None
    inst.organisation = None
    inst.created = datetime(2020, 1, 1)
    mock_iam_cls.return_value = inst

    user, auto_gen, plain = user_service.create_user(
        db=db,
        first_name="R",
        last_name=None,
        username=f"r_{u}",
        email=f"r_{u}@example.com",
        password=None,
        status=1,
        created_user_id=1,
    )

    call_kwargs = mock_iam_cls.call_args[1]
    assert call_kwargs["password"] is not None
    assert auto_gen is True
    assert plain is not None
    assert user is inst
