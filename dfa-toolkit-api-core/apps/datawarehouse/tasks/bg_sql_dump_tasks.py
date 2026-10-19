"""Background task: export a MySQL warehouse to a gzip-compressed SQL dump."""
import gzip
import logging
import os
import shutil
import subprocess
import tempfile
from typing import Any

from apps.datawarehouse.db.datawarehouse import get_warehouse_credentials
from apps.datawarehouse.services.sql_dump_service import get_sql_dump_paths

logger = logging.getLogger(__name__)
_SOURCE = "apps.datawarehouse.tasks.bg_sql_dump_tasks"


def _mysqldump_ssl_defaults_lines(mysqldump_bin: str) -> list[str]:
    """
    TLS options for managed MySQL hosts (e.g. OCI) that use a private CA chain.

    Uses encryption but skips server certificate verification so mysqldump can
    connect when the platform CA is not installed in the container image.
    """
    try:
        proc = subprocess.run(
            [mysqldump_bin, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        version_text = f"{proc.stdout or ''}{proc.stderr or ''}".lower()
    except (OSError, subprocess.SubprocessError):
        version_text = ""

    if "mariadb" in version_text:
        return ["ssl", "ssl-verify-server-cert=0"]
    # Oracle MySQL 8+ client: encrypted connection without CA verification.
    return ["ssl-mode=REQUIRED"]


def _write_mysql_defaults_file(conn: dict[str, Any], *, mysqldump_bin: str) -> str:
    """Write a short-lived MySQL client defaults file (0600) for mysqldump."""
    fd, path = tempfile.mkstemp(prefix="dfa_mysqldump_", suffix=".cnf")
    os.close(fd)
    try:
        port = int(conn.get("db_port") or 3306)
    except (TypeError, ValueError):
        port = 3306
    lines = [
        "[client]",
        f"host={conn.get('db_host_address', '')}",
        f"port={port}",
        f"user={conn.get('db_user', '')}",
        f"password={conn.get('db_password', '')}",
        *_mysqldump_ssl_defaults_lines(mysqldump_bin),
    ]
    content = "\n".join(lines) + "\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(path, 0o600)
    return path


def _run_build_sql_dump(payload: dict) -> dict:
    """
    Export warehouse database to files/sql_dump/dw_{name}.sql.gz.

    Writes to dw_{name}.sql.gz.tmp first, then atomically replaces dw_{name}.sql.gz
    on success so the previous dump remains available until the new export completes.
    """
    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")

    creds = get_warehouse_credentials(str(dw_id))
    db_type = (creds.get("db_source_type") or "").strip().lower()
    if db_type not in ("mysql", "mariadb"):
        raise ValueError(
            f"SQL dump export is only supported for MySQL warehouses (got {db_type!r})"
        )

    db_name = (creds.get("db_database") or "").strip()
    if not db_name:
        raise ValueError("Warehouse database name is missing")

    mysqldump_bin = shutil.which("mysqldump")
    if not mysqldump_bin:
        raise RuntimeError("mysqldump not found on PATH")

    paths = get_sql_dump_paths(creds, dw_id=str(dw_id))
    os.makedirs(paths["dir"], exist_ok=True)

    defaults_file: str | None = None
    tmp_path = paths["tmp"]
    final_path = paths["final"]

    try:
        defaults_file = _write_mysql_defaults_file(creds, mysqldump_bin=mysqldump_bin)
        dump_cmd = [
            mysqldump_bin,
            f"--defaults-extra-file={defaults_file}",
            "--single-transaction",
            "--routines",
            "--triggers",
            "--events",
            "--default-character-set=utf8mb4",
            db_name,
        ]

        with gzip.open(tmp_path, "wb") as gz_file:
            dump_proc = subprocess.Popen(
                dump_cmd,
                stdout=gz_file,
                stderr=subprocess.PIPE,
            )
            dump_stderr = dump_proc.communicate()[1]

        if dump_proc.returncode != 0:
            err = (dump_stderr or b"").decode(errors="replace").strip()
            raise RuntimeError(f"mysqldump failed (exit {dump_proc.returncode}): {err}")

        os.replace(tmp_path, final_path)
        logger.info("SQL dump created: dw_id=%s path=%s", dw_id, final_path)
        return {"success": True, "dw_id": str(dw_id), "path": final_path}
    except Exception as exc:
        logger.error("SQL dump failed: dw_id=%s error=%s", dw_id, exc)
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise
    finally:
        if defaults_file and os.path.exists(defaults_file):
            try:
                os.remove(defaults_file)
            except OSError:
                pass
