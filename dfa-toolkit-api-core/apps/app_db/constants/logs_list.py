"""
Allowlists for GET /logs/server-errors and GET /logs/transactions list search and sort.
"""

# GET /logs/server-errors — allowed sort_field values
LOG_SERVER_ERROR_SORT_FIELDS: tuple[str, ...] = (
    "id",
    "created",
    "level",
    "status_code",
    "user_id",
    "dw_id",
    "method",
)

# GET /logs/server-errors — allowed search_by values
LOG_SERVER_ERROR_SEARCH_BY_FIELDS: tuple[str, ...] = (
    "error_message",
    "path",
)

# GET /logs/transactions — allowed sort_field values
LOG_TRANSACTION_SORT_FIELDS: tuple[str, ...] = (
    "id",
    "created",
    "action",
    "module",
    "user_id",
    "dw_id",
    "status",
    "app_key",
    "dashboard_id",
)

# GET /logs/transactions — allowed search_by values
LOG_TRANSACTION_SEARCH_BY_FIELDS: tuple[str, ...] = (
    "identifier",
    "description",
    "path",
    "module",
    "app_key",
)
