"""Notification module: iam_user badge counter + system_notification* tables.

Revision ID: 115_notification_module
Revises: 114_wf_ds_tp_nid
"""

from alembic import op
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    inspect,
)
from sqlalchemy.sql import text

revision = "116_notification_module"
down_revision = "115_add_iam_captcha"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(
        text(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
        ),
        {"t": table, "c": column},
    ).scalar()
    return bool(row)


def upgrade() -> None:
    conn = op.get_bind()

    if not _column_exists(conn, "iam_user", "notification_unread_cnt"):
        conn.execute(
            text(
                "ALTER TABLE iam_user "
                "ADD COLUMN notification_unread_cnt INT NOT NULL DEFAULT 0 "
                "COMMENT 'Denormalized unread in-app notification count' "
                "AFTER last_loggedin_on"
            )
        )

    if not _table_exists("system_notification_template"):
        op.create_table(
            "system_notification_template",
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("event_code", String(80), nullable=False),
            Column(
                "recipient_type",
                Enum(
                    "DATASET_REVIEWERS",
                    "DATASET_OWNER",
                    "EVENT_ACTOR",
                    "DW_ALL_USERS",
                    name="notification_recipient_type",
                ),
                nullable=False,
            ),
            Column(
                "channels",
                Enum("INAPP", "EMAIL", "BOTH", "NONE", name="notification_channels"),
                nullable=False,
                server_default=text("'BOTH'"),
            ),
            Column("email_template_key", String(80), nullable=True),
            Column("is_active", Boolean, nullable=False, server_default=text("1")),
            Column(
                "created",
                DateTime,
                nullable=False,
                server_default=text("CURRENT_TIMESTAMP"),
            ),
        )
        op.create_index(
            "uq_notif_tpl",
            "system_notification_template",
            ["event_code", "recipient_type"],
            unique=True,
        )

    if not _table_exists("system_notification_template_i18n"):
        op.create_table(
            "system_notification_template_i18n",
            Column(
                "master_id",
                Integer,
                ForeignKey("system_notification_template.id", ondelete="CASCADE"),
                primary_key=True,
                nullable=False,
            ),
            Column("locale", String(10), primary_key=True, nullable=False),
            Column("inapp_title", String(255), nullable=False),
            Column("inapp_body", Text, nullable=False),
        )

    if not _table_exists("system_notification"):
        op.create_table(
            "system_notification",
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("user_id", Integer, nullable=False),
            Column("event_code", String(80), nullable=False),
            Column("locale", String(10), nullable=False, server_default=text("'en'")),
            Column("title", String(255), nullable=False),
            Column("body", Text, nullable=False),
            Column("context_data", JSON, nullable=True),
            Column("ref_entity_type", String(50), nullable=True),
            Column("ref_entity_id", Integer, nullable=True),
            Column("action_url", String(500), nullable=True),
            Column("dw_id", Integer, nullable=True),
            Column("is_read", Boolean, nullable=False, server_default=text("0")),
            Column("read_at", DateTime, nullable=True),
            Column(
                "created",
                DateTime,
                nullable=False,
                server_default=text("CURRENT_TIMESTAMP"),
            ),
        )
        op.create_index("idx_notif_user_read", "system_notification", ["user_id", "is_read"])
        op.create_index("idx_notif_user_created", "system_notification", ["user_id", "created"])
        op.create_index("idx_notif_event", "system_notification", ["event_code"])
        op.create_index("idx_notif_dw", "system_notification", ["dw_id"])


def downgrade() -> None:
    conn = op.get_bind()

    if _table_exists("system_notification"):
        op.drop_index("idx_notif_dw", table_name="system_notification")
        op.drop_index("idx_notif_event", table_name="system_notification")
        op.drop_index("idx_notif_user_created", table_name="system_notification")
        op.drop_index("idx_notif_user_read", table_name="system_notification")
        op.drop_table("system_notification")

    if _table_exists("system_notification_template_i18n"):
        op.drop_table("system_notification_template_i18n")

    if _table_exists("system_notification_template"):
        op.drop_index("uq_notif_tpl", table_name="system_notification_template")
        op.drop_table("system_notification_template")

    if _column_exists(conn, "iam_user", "notification_unread_cnt"):
        op.drop_column("iam_user", "notification_unread_cnt")
