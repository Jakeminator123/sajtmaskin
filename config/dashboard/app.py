# -*- coding: utf-8 -*-
"""
Legacy config-dashboard entrypoint.

This now forwards to the consolidated Streamlit backoffice app.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backoffice.app_main import run_backoffice_app
from backoffice.shared import launch_streamlit_if_needed


def main() -> None:
    app_path = Path(__file__).resolve()
    launch_streamlit_if_needed(app_path, sys.argv[1:])
    run_backoffice_app(
        title="Sajtmaskin Backoffice",
        legacy_source="config/dashboard/app.py",
        initial_page="Översikt",
    )


if __name__ == "__main__":
    main()
