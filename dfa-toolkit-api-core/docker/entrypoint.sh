#!/bin/bash
set -e

# Build database URL for migrations at runtime
export DATAWAREHOUSE_MIGRATION_URL="mysql+pymysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Debug: Print environment variables
echo "=== Environment Variables ==="
echo "DB_HOST: ${DB_HOST}"
echo "DB_PORT: ${DB_PORT}"
echo "DB_NAME: ${DB_NAME}"
echo "DB_USER: ${DB_USER}"
echo "DB_PASSWORD: ${DB_PASSWORD:+***SET***}"
echo "DATAWAREHOUSE_MIGRATION_URL: ${DATAWAREHOUSE_MIGRATION_URL}"
echo "============================"

# Run database migrations for each app
echo "Running app_db migrations..."
alembic -c apps/app_db/alembic.ini upgrade head

echo "Seeding app_db..."
python apps/app_db/scripts/seed_all.py || {
    echo "WARNING: App database seeding failed. Continuing anyway..."
}

echo "Seeding IAM Forced..."
python apps/app_db/scripts/app_db/seed_iam.py --force || {
    echo "WARNING: IAM seeding failed. Continuing anyway..."
}

echo "Seeding DM IAM roles Forced..."
python apps/app_db/scripts/app_db/seed_dm_iam_roles.py --force || {
    echo "WARNING: DM IAM roles seeding failed. Continuing anyway..."
}

echo "Seeding monitoring API Forced..."
python apps/app_db/scripts/app_db/seed_monitoring_api.py --force || {
    echo "WARNING: Monitoring API seeding failed. Continuing anyway..."
}

echo "Seeding CMS API Forced..."
python apps/app_db/scripts/app_db/seed_cms_api.py --force || {
    echo "WARNING: CMS API seeding failed. Continuing anyway..."
}

echo "Seeding Dashboard IAM Forced..."
python apps/app_db/scripts/app_dashboard/seed_dash_iam.py --force || {
    echo "WARNING: Dashboard IAM seeding failed. Continuing anyway..."
}

echo "Seeding Dashboard IAM roles Forced..."
python apps/app_db/scripts/app_dashboard/seed_dash_iam_roles.py --force || {
    echo "WARNING: Dashboard IAM roles seeding failed. Continuing anyway..."
}

echo "Starting application..."
exec "$@"