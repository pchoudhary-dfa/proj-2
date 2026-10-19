"""
Service for listing and exporting server error logs and transaction logs.
"""
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import asc, desc
from sqlalchemy.orm import Session

from apps.app_db.models.core import LogsServerErrors, LogsTransactions
from apps.app_db.constants.logs_list import (
    LOG_SERVER_ERROR_SEARCH_BY_FIELDS,
    LOG_SERVER_ERROR_SORT_FIELDS,
    LOG_TRANSACTION_SEARCH_BY_FIELDS,
    LOG_TRANSACTION_SORT_FIELDS,
)
from apps.datawarehouse.utils.export_utils import (
    LOG_SERVER_ERROR_COLUMN_DEFS,
    LOG_TRANSACTION_COLUMN_DEFS,
    build_generic_export_xlsx,
)

logger = logging.getLogger(__name__)

_VALID_LSE_LEVELS = {"ERROR", "CRITICAL", "WARNING"}
_VALID_TXN_ACTIONS = {"CREATE", "UPDATE", "DELETE"}


def server_errors_has_list_filters(
    *,
    level: Optional[str] = None,
    user_id: Optional[int] = None,
    dw_id: Optional[int] = None,
    method: Optional[str] = None,
    status_code: Optional[int] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    search: Optional[str] = None,
    search_by: Optional[str] = None,
) -> bool:
    """True when any list filter is active (drives total_count_unfiltered meta)."""
    return bool(
        level
        or user_id is not None
        or dw_id is not None
        or method
        or status_code is not None
        or from_date
        or to_date
        or (search and search_by)
    )


def transactions_has_list_filters(
    *,
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    dw_id: Optional[int] = None,
    module: Optional[str] = None,
    status: Optional[str] = None,
    dashboard_id: Optional[int] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    search: Optional[str] = None,
    search_by: Optional[str] = None,
) -> bool:
    """True when any optional list filter is active (drives total_count_unfiltered meta)."""
    return bool(
        action
        or user_id is not None
        or dw_id is not None
        or module
        or status
        or dashboard_id is not None
        or from_date
        or to_date
        or (search and search_by)
    )


def _json_str(value: Any) -> Optional[str]:
    """Serialize a value to a compact JSON string; return None if value is None."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    except Exception:
        return str(value)


class LogService:

    # ------------------------------------------------------------------
    # Server errors
    # ------------------------------------------------------------------

    def list_server_errors(
        self,
        db: Session,
        *,
        level: Optional[str] = None,
        user_id: Optional[int] = None,
        dw_id: Optional[int] = None,
        method: Optional[str] = None,
        status_code: Optional[int] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        search: Optional[str] = None,
        search_by: Optional[str] = None,
        sort_field: str = "id",
        sort_order: str = "desc",
        page: int = 1,
        page_size: Optional[int] = None,
    ) -> Tuple[List[Dict[str, Any]], int, Optional[int]]:
        """
        Return (items, filtered total_count, total_count_unfiltered or None) for logs_server_error.
        Pass page_size=None to retrieve all rows (used for XLSX export).
        """
        has_list_filters = server_errors_has_list_filters(
            level=level,
            user_id=user_id,
            dw_id=dw_id,
            method=method,
            status_code=status_code,
            from_date=from_date,
            to_date=to_date,
            search=search,
            search_by=search_by,
        )
        total_count_unfiltered: Optional[int] = (
            db.query(LogsServerErrors).count() if has_list_filters else None
        )
        q = db.query(LogsServerErrors)

        if level:
            q = q.filter(LogsServerErrors.level == level.upper())
        if user_id is not None:
            q = q.filter(LogsServerErrors.user_id == user_id)
        if dw_id is not None:
            q = q.filter(LogsServerErrors.dw_id == dw_id)
        if method:
            q = q.filter(LogsServerErrors.method == method.upper())
        if status_code is not None:
            q = q.filter(LogsServerErrors.status_code == status_code)
        if from_date:
            q = q.filter(LogsServerErrors.created >= from_date)
        if to_date:
            q = q.filter(LogsServerErrors.created <= to_date)
        if search and search_by:
            pattern = f"%{search.strip()}%"
            col = getattr(LogsServerErrors, search_by, None)
            if col is not None:
                q = q.filter(col.ilike(pattern))

        total_count: int = q.count()

        sort_col = getattr(LogsServerErrors, sort_field, LogsServerErrors.id)
        q = q.order_by(asc(sort_col) if sort_order == "asc" else desc(sort_col))

        if page_size is not None:
            q = q.offset((page - 1) * page_size).limit(page_size)

        rows = q.all()
        items = [self._serialize_server_error(r) for r in rows]
        return items, total_count, total_count_unfiltered

    def _serialize_server_error(self, row: LogsServerErrors) -> Dict[str, Any]:
        return {
            "id": row.id,
            "user_id": row.user_id,
            "dw_id": row.dw_id,
            "method": row.method,
            "path": row.path,
            "status_code": row.status_code,
            "level": row.level,
            "error_message": row.error_message,
            "stack_trace": row.stack_trace,
            "request_body": row.request_body,
            "request_headers": row.request_headers,
            "created": row.created.isoformat() if row.created else None,
        }

    def export_server_errors_xlsx(
        self,
        db: Session,
        language_code: str,
        db_name: str = "system",
        **filters,
    ) -> Tuple[Any, str]:
        """Build and return (BytesIO, filename) for server error logs XLSX export."""
        items, _, _ = self.list_server_errors(db, page_size=None, **filters)
        rows = [
            [
                item.get("id"),
                item.get("user_id"),
                item.get("dw_id"),
                item.get("method"),
                item.get("path"),
                item.get("status_code"),
                item.get("level"),
                item.get("error_message"),
                item.get("stack_trace"),
                item.get("request_body"),
                item.get("request_headers"),
                item.get("created"),
            ]
            for item in items
        ]
        return build_generic_export_xlsx(
            sheet_title="Server Errors",
            column_defs=LOG_SERVER_ERROR_COLUMN_DEFS,
            rows=rows,
            language_code=language_code,
            db_connection_display_name=db_name,
            filename_prefix="server_errors",
        )

    # ------------------------------------------------------------------
    # Transactions
    # ------------------------------------------------------------------

    def list_transactions(
        self,
        db: Session,
        *,
        app_key: str,
        action: Optional[str] = None,
        user_id: Optional[int] = None,
        dw_id: Optional[int] = None,
        module: Optional[str] = None,
        status: Optional[str] = None,
        dashboard_id: Optional[int] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        search: Optional[str] = None,
        search_by: Optional[str] = None,
        sort_field: str = "id",
        sort_order: str = "desc",
        page: int = 1,
        page_size: Optional[int] = None,
    ) -> Tuple[List[Dict[str, Any]], int, Optional[int]]:
        """
        Return (items, filtered total_count, total_count_unfiltered or None) for logs_transaction.
        Results are always scoped to *app_key* (current application from X-Api-Key).
        Pass page_size=None to retrieve all rows (used for XLSX export).
        """
        has_list_filters = transactions_has_list_filters(
            action=action,
            user_id=user_id,
            dw_id=dw_id,
            module=module,
            status=status,
            dashboard_id=dashboard_id,
            from_date=from_date,
            to_date=to_date,
            search=search,
            search_by=search_by,
        )
        app_scope = db.query(LogsTransactions).filter(LogsTransactions.app_key == app_key)
        total_count_unfiltered: Optional[int] = (
            app_scope.count() if has_list_filters else None
        )
        q = app_scope

        if action:
            q = q.filter(LogsTransactions.action == action.upper())
        if user_id is not None:
            q = q.filter(LogsTransactions.user_id == user_id)
        if dw_id is not None:
            q = q.filter(LogsTransactions.dw_id == dw_id)
        if module:
            q = q.filter(LogsTransactions.module == module)
        if status:
            q = q.filter(LogsTransactions.status == status.upper())
        if dashboard_id is not None:
            q = q.filter(LogsTransactions.dashboard_id == dashboard_id)
        if from_date:
            q = q.filter(LogsTransactions.created >= from_date)
        if to_date:
            q = q.filter(LogsTransactions.created <= to_date)
        if search and search_by:
            pattern = f"%{search.strip()}%"
            col = getattr(LogsTransactions, search_by, None)
            if col is not None:
                q = q.filter(col.ilike(pattern))

        total_count: int = q.count()

        sort_col = getattr(LogsTransactions, sort_field, LogsTransactions.id)
        q = q.order_by(asc(sort_col) if sort_order == "asc" else desc(sort_col))

        if page_size is not None:
            q = q.offset((page - 1) * page_size).limit(page_size)

        rows = q.all()
        items = [self._serialize_transaction(r) for r in rows]
        return items, total_count, total_count_unfiltered

    def _serialize_transaction(self, row: LogsTransactions) -> Dict[str, Any]:
        return {
            "id": row.id,
            "user_id": row.user_id,
            "dw_id": row.dw_id,
            "app_key": row.app_key,
            "dashboard_id": row.dashboard_id,
            "path": row.path,
            "action": row.action,
            "module": row.module,
            "identifier": row.identifier,
            "previous_value": row.previous_value,
            "new_value": row.new_value,
            "status": row.status,
            "description": row.description,
            "created": row.created.isoformat() if row.created else None,
        }

    def export_transactions_xlsx(
        self,
        db: Session,
        language_code: str,
        db_name: str = "system",
        **filters,
    ) -> Tuple[Any, str]:
        """Build and return (BytesIO, filename) for transaction logs XLSX export."""
        items, _, _ = self.list_transactions(db, page_size=None, **filters)
        rows = [
            [
                item.get("id"),
                item.get("path"),
                item.get("module"),
                item.get("identifier"),
                item.get("action"),
                item.get("status"),
                item.get("user_id"),
                item.get("dw_id"),
                item.get("app_key"),
                item.get("dashboard_id"),
                item.get("description"),
                _json_str(item.get("previous_value")),
                _json_str(item.get("new_value")),
                item.get("created"),
            ]
            for item in items
        ]
        return build_generic_export_xlsx(
            sheet_title="Transactions",
            column_defs=LOG_TRANSACTION_COLUMN_DEFS,
            rows=rows,
            language_code=language_code,
            db_connection_display_name=db_name,
            filename_prefix="transactions",
        )
