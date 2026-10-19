"""Create iam_captcha table for Proof-of-Work CAPTCHA challenges.

Revision ID: 115_add_iam_captcha
Revises: 114_wf_ds_tp_nid
"""

from alembic import op
from sqlalchemy import BigInteger, Boolean, Column, DateTime, Index, Integer, String, inspect
from sqlalchemy.sql import text

revision = "115_add_iam_captcha"
down_revision = "114_wf_ds_tp_nid"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _table_exists("iam_captcha"):
        op.create_table(
            "iam_captcha",
            Column("id", BigInteger, primary_key=True, autoincrement=True),
            Column("challenge_id", String(64), nullable=False, unique=True, comment="UUID4 challenge identifier"),
            Column("nonce", String(128), nullable=False, comment="Random hex nonce for PoW hash input"),
            Column("difficulty", Integer, nullable=False, comment="Required leading zero bits in SHA256 hash"),
            Column("expires", DateTime, nullable=False, comment="Challenge expiry timestamp"),
            Column("used", Boolean, nullable=False, server_default=text("0"), comment="True after challenge is consumed"),
            Column("used_at", DateTime, nullable=True, comment="Timestamp when challenge was consumed"),
            Column(
                "created",
                DateTime,
                nullable=False,
                server_default=text("CURRENT_TIMESTAMP"),
                comment="Record creation timestamp",
            ),
        )
        op.create_index("idx_captcha_expiry", "iam_captcha", ["expires"])
        op.create_index("idx_captcha_used", "iam_captcha", ["used"])


def downgrade() -> None:
    if _table_exists("iam_captcha"):
        op.drop_index("idx_captcha_used", table_name="iam_captcha")
        op.drop_index("idx_captcha_expiry", table_name="iam_captcha")
        op.drop_table("iam_captcha")
