"""Create system_datawarehouses table

Revision ID: 001_create_system_datawarehouses
Revises: 
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '001_create_system_datawarehouses'
down_revision = None
branch_labels = None
depends_on = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database"""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    # Create system_datawarehouses table only if it doesn't exist
    if not table_exists('system_datawarehouses'):
        op.create_table(
            'system_datawarehouses',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('db_display_name', sa.String(length=50), nullable=False, comment='Database Connection Display name'),
            sa.Column('db_source_type', sa.String(length=10), nullable=False, comment='Database source type like mysql, mssql etc.'),
            sa.Column('db_host_address', sa.String(length=50), nullable=False, comment='Database Host Address'),
            sa.Column('db_user', sa.String(length=100), nullable=False, comment='Database user'),
            sa.Column('db_password', sa.String(length=100), nullable=False, comment='Database password'),
            sa.Column('db_port', sa.String(length=5), nullable=True, comment='Database port if any'),
            sa.Column('db_database', sa.String(length=50), nullable=False, comment='Database\'s name'),
            sa.Column('dw_default_language', sa.String(length=3), nullable=False, server_default='en', comment='Datawarehouse default language'),
            sa.Column('is_active', sa.Boolean(), nullable=True, server_default='0', comment='Active flag'),
            sa.Column('created_at', sa.DateTime(), nullable=True, comment='DW connection creation date'),
            sa.Column('created_by', sa.Integer(), nullable=True, server_default='0', comment='DW connection creation user id'),
            sa.Column('updated_at', sa.DateTime(), nullable=True, comment='DW connection updation date'),
            sa.Column('updated_by', sa.Integer(), nullable=True, server_default='0', comment='DW connection updation user id'),
            sa.Column('dw_metadata_desc', sa.Text(), nullable=True, comment='Datawarehouse Metadata if any'),
            sa.Column('dw_data_count', sa.Integer(), nullable=False, server_default='0', comment='Data Values count in the datawarehouse'),
            sa.Column('dw_area_count', sa.Integer(), nullable=False, server_default='0', comment='Area Count in the datawarehouse'),
            sa.Column('dw_ind_count', sa.Integer(), nullable=False, server_default='0', comment='Indicator Count in the database'),
            sa.Column('dw_ius_count', sa.Integer(), nullable=False, server_default='0', comment='IUS Count in the database'),
            sa.Column('dw_time_count', sa.Integer(), nullable=False, server_default='0', comment='Time Count in the database'),
            sa.PrimaryKeyConstraint('id'),
            sa.Index('createdby', 'created_by')
        )


def downgrade() -> None:
    # Drop table only if it exists
    if table_exists('system_datawarehouses'):
        op.drop_table('system_datawarehouses')

