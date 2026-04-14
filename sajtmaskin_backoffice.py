# -*- coding: utf-8 -*-
"""
Sajtmaskin Backoffice - consolidated Streamlit entrypoint.

Run from repo root:
  pip install -r requirements.backoffice.txt
  python sajtmaskin_backoffice.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from backoffice.app_main import run_backoffice_app
from backoffice.shared import launch_streamlit_if_needed


def main() -> None:
    app_path = Path(__file__).resolve()
    launch_streamlit_if_needed(app_path, sys.argv[1:])
    run_backoffice_app(title="Sajtmaskin Backoffice")


if __name__ == "__main__":
    main()
