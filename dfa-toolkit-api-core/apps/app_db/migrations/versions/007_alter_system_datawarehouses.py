"""Alter system_datawarehouses - replace individual connection columns with connection_name/details,
add dw_source_count, dw_updated_at, dw_updated_by, change dw_metadata_desc to LONGTEXT

Revision ID: 007_alter_system_datawarehouses
Revises: 006_create_user_visualizations
Create Date: 2026-02-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '007_alter_system_datawarehouses'
down_revision = '006_create_user_visualizations'
branch_labels = None
depends_on = None


def column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    # Add new columns
    if not column_exists('system_datawarehouses', 'dw_connection_name'):
        # Add nullable first so existing rows don't violate NOT NULL, then tighten
        op.add_column(
            'system_datawarehouses',
            sa.Column('dw_connection_name', sa.String(50), nullable=True,
                      comment='Datawarehouse Connection Display name')
        )
        op.execute("UPDATE system_datawarehouses SET dw_connection_name = '' WHERE dw_connection_name IS NULL")
        op.alter_column('system_datawarehouses', 'dw_connection_name',
                        existing_type=sa.String(50), nullable=False)

    if not column_exists('system_datawarehouses', 'dw_connection_details'):
        # TEXT columns cannot have a DEFAULT in MySQL; add nullable, backfill, then make NOT NULL
        op.add_column(
            'system_datawarehouses',
            sa.Column('dw_connection_details', sa.Text(), nullable=True,
                      comment='Datawarehouse Connection Details')
        )
        op.execute("UPDATE system_datawarehouses SET dw_connection_details = '' WHERE dw_connection_details IS NULL")
        op.alter_column('system_datawarehouses', 'dw_connection_details',
                        existing_type=sa.Text(), nullable=False)

    if not column_exists('system_datawarehouses', 'dw_source_count'):
        op.add_column(
            'system_datawarehouses',
            sa.Column('dw_source_count', sa.Integer(), nullable=False, server_default='0',
                      comment='Source Count in the database')
        )

    if not column_exists('system_datawarehouses', 'dw_updated_at'):
        op.add_column(
            'system_datawarehouses',
            sa.Column('dw_updated_at', sa.Date(), nullable=True,
                      comment='Datawarehouse updation date')
        )

    if not column_exists('system_datawarehouses', 'dw_updated_by'):
        op.add_column(
            'system_datawarehouses',
            sa.Column('dw_updated_by', sa.Integer(), nullable=False, server_default='0')
        )

    # Change dw_metadata_desc from TEXT to LONGTEXT
    op.alter_column(
        'system_datawarehouses',
        'dw_metadata_desc',
        existing_type=sa.Text(),
        type_=mysql.LONGTEXT(),
        existing_nullable=True
    )

    # Drop old individual connection credential columns
    for col in ['db_display_name', 'db_source_type', 'db_host_address',
                'db_user', 'db_password', 'db_port', 'db_database']:
        if column_exists('system_datawarehouses', col):
            op.drop_column('system_datawarehouses', col)


def downgrade() -> None:
    # Re-add old columns
    for col_name, col_def in [
        ('db_display_name', sa.Column('db_display_name', sa.String(50), nullable=False, server_default='',
                                      comment='Database Connection Display name')),
        ('db_source_type', sa.Column('db_source_type', sa.String(10), nullable=False, server_default='',
                                     comment='Database source type like mysql, mssql etc.')),
        ('db_host_address', sa.Column('db_host_address', sa.String(50), nullable=False, server_default='',
                                      comment='Database Host Address')),
        ('db_user', sa.Column('db_user', sa.String(100), nullable=False, server_default='',
                              comment='Database user')),
        ('db_password', sa.Column('db_password', sa.String(100), nullable=False, server_default='',
                                  comment='Database password')),
        ('db_port', sa.Column('db_port', sa.String(5), nullable=True,
                              comment='Database port if any')),
        ('db_database', sa.Column('db_database', sa.String(50), nullable=False, server_default='',
                                  comment="Database's name")),
    ]:
        if not column_exists('system_datawarehouses', col_name):
            op.add_column('system_datawarehouses', col_def)

    # Revert dw_metadata_desc back to TEXT
    op.alter_column(
        'system_datawarehouses',
        'dw_metadata_desc',
        existing_type=mysql.LONGTEXT(),
        type_=sa.Text(),
        existing_nullable=True
    )

    # Drop new columns
    for col in ['dw_connection_name', 'dw_connection_details',
                'dw_source_count', 'dw_updated_at', 'dw_updated_by']:
        if column_exists('system_datawarehouses', col):
            op.drop_column('system_datawarehouses', col)
