"""
Thin wrapper around apps.datawarehouse.scripts.build_search_index (full build).
Use: python test_scripts/run_dw_search_index.py --url <SQLAlchemy URL> [--batch-size N] [--no-commit]
Or:  python -m apps.datawarehouse.scripts.build_search_index --url <URL> [--dw-id <id>]
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def main() -> int:
    argv = [sys.executable, "-m", "apps.datawarehouse.scripts.build_search_index"] + sys.argv[1:]
    return subprocess.run(argv).returncode


if __name__ == "__main__":
    raise SystemExit(main())
