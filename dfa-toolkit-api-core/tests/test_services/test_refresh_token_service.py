"""Tests for persisted refresh JWT rotation (iam_user_refresh_token)."""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from apps.app_db.models.core import IamUser, IamUserRefreshToken
from apps.app_db.services.refresh_token_service import (
    persist_refresh_token_for_user,
    revoke_all_refresh_tokens_for_user,
    rotate_stored_refresh_token,
)
from apps.shared.config.security import create_refresh_token


def _sqlite_session():
    engine = create_engine("sqlite:///:memory:", future=True)

    @event.listens_for(engine, "connect")
    def _fk(dbapi_connection, connection_record):
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    IamUser.__table__.create(engine)
    IamUserRefreshToken.__table__.create(engine)
    Session = sessionmaker(bind=engine, future=True)
    return Session()


def test_rotate_invalidates_previous_refresh():
    db = _sqlite_session()
    db.add(
        IamUser(
            first_name="T",
            username="tu",
            email="tu@example.com",
            created_user_id=0,
            modified_user_id=0,
            status=1,
        )
    )
    db.commit()
    user = db.query(IamUser).filter(IamUser.username == "tu").one()

    first = create_refresh_token(user.id)
    persist_refresh_token_for_user(db, user.id, first)
    db.commit()

    second = rotate_stored_refresh_token(db, user.id, first)
    assert second is not None
    assert second != first
    db.commit()

    assert rotate_stored_refresh_token(db, user.id, first) is None

    third = rotate_stored_refresh_token(db, user.id, second)
    assert third is not None
    db.commit()
    assert rotate_stored_refresh_token(db, user.id, second) is None


def test_login_replaces_prior_session_simulation():
    db = _sqlite_session()
    db.add(
        IamUser(
            first_name="T",
            username="tu2",
            email="tu2@example.com",
            created_user_id=0,
            modified_user_id=0,
            status=1,
        )
    )
    db.commit()
    user = db.query(IamUser).filter(IamUser.username == "tu2").one()

    old = create_refresh_token(user.id)
    persist_refresh_token_for_user(db, user.id, old)
    db.commit()

    new = create_refresh_token(user.id)
    persist_refresh_token_for_user(db, user.id, new)
    db.commit()

    assert rotate_stored_refresh_token(db, user.id, old) is None
    assert rotate_stored_refresh_token(db, user.id, new) is not None


def test_revoke_all_clears_rows():
    db = _sqlite_session()
    db.add(
        IamUser(
            first_name="T",
            username="tu3",
            email="tu3@example.com",
            created_user_id=0,
            modified_user_id=0,
            status=1,
        )
    )
    db.commit()
    user = db.query(IamUser).filter(IamUser.username == "tu3").one()
    persist_refresh_token_for_user(db, user.id, create_refresh_token(user.id))
    db.commit()
    revoke_all_refresh_tokens_for_user(db, user.id)
    db.commit()
    assert db.query(IamUserRefreshToken).filter_by(user_id=user.id).count() == 0
