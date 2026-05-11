# -*- coding: utf-8 -*-
"""
Sajtmaskin Backoffice - consolidated Streamlit entrypoint.

Run from repo root:
  pip install -r requirements.backoffice.txt

  # Canonical (portable across Windows / macOS / Linux):
  npm run backoffice

  # Direct invocation (use whichever Python alias your OS provides):
  python3 sajtmaskin_backoffice.py   # macOS / Linux
  python  sajtmaskin_backoffice.py   # Windows / envs that alias `python`
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> None:
    app_path = Path(__file__).resolve()
    if not _running_under_streamlit():
        raise SystemExit(
            subprocess.call(
                [sys.executable, "-m", "streamlit", "run", str(app_path), *sys.argv[1:]],
            )
        )

    from dotenv import load_dotenv

    from backoffice.app_main import run_backoffice_app

    load_dotenv(".env.local", override=False)
    run_backoffice_app(title="Sajtmaskin Backoffice")


def _running_under_streamlit() -> bool:
    try:
        from streamlit.runtime.scriptrunner_utils.script_run_context import (
            get_script_run_ctx,
        )

        return get_script_run_ctx() is not None
    except Exception:
        return False


if __name__ == "__main__":
    main()
