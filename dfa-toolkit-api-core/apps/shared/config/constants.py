"""
Shared constants for API (e.g. base paths).
Warehouse credentials are resolved from the application database (system_datawarehouse)
via apps.datawarehouse.db.datawarehouse.get_warehouse_credentials(dw_id).
"""
from apps.shared.config.config import settings

# Datawarehouses base path for API endpoints
DATAWAREHOUSES_BASE_PATH = settings.DATAWAREHOUSES_BASE_PATH
