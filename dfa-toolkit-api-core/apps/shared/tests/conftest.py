"""
Pytest configuration for apps/shared/tests.

Root ``tests/conftest.py`` is not inherited here (different package tree),
so we mirror its sys.path + .env bootstrap.
"""
import sys
from pathlib import Path

# apps/shared/tests → project root is four levels up
project_root = Path(__file__).resolve().parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

env_file = project_root / ".env"
if env_file.exists():
    from dotenv import load_dotenv

    load_dotenv(env_file)
