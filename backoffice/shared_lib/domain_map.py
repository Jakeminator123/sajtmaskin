from __future__ import annotations

import json
from pathlib import Path

import streamlit as st

@st.cache_data
def load_domain_map(path_str: str) -> dict[str, Any]:
    path = Path(path_str)
    if not path.is_file():
        return {"pages": {}, "repoSiblings": {}}
    with path.open(encoding="utf-8") as f:
        return json.load(f)
