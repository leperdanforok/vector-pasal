"""Shared Supabase client for all Python scripts.

This is the SINGLE canonical Supabase client factory. Every script that needs
a Supabase connection should import ``get_sb()`` from here — do NOT create
``create_client()`` calls elsewhere.

The MCP server is an intentional exception: it uses SUPABASE_ANON_KEY (read‑only
via RLS) and runs in a separate process.
"""
import os
from pathlib import Path

from supabase import Client, create_client

# Always load .env from the project root — the single source of truth.
# Railway sets env vars directly, so a missing .env is fine in production.
try:
    from dotenv import load_dotenv
    _project_root = Path(__file__).resolve().parent.parent.parent
    load_dotenv(_project_root / ".env")
except Exception:
    pass

_sb: Client | None = None


def get_sb() -> Client:
    """Return a lazily-initialized Supabase client singleton.

    Tries ``SUPABASE_KEY`` first (scripts convention), then falls back to
    ``SUPABASE_SERVICE_ROLE_KEY`` for environments that use that name instead.
    """
    global _sb
    if _sb is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ.get("SUPABASE_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _sb = create_client(url, key)
    return _sb
