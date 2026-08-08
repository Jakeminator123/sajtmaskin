from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.ai_workloads import WORKLOAD_DOSSIER_CURATION, resolve_model_choices
from backoffice.shared import (
    backup_file,
    backup_tree,
    confirm_by_typing,
    danger_zone,
    field_label,
    render_building_blocks_nav,
    render_save_scope,
    run_repo_command,
    tech_details,
    validate_json_against_schema,
)


def _facade():
    from backoffice.pages import dossiers as page
    return page


from .constants import (
    PAGE_NAME,
    REPO_ROOT,
    DOSSIER_ROOT,
    HARD_ROOT,
    SOFT_ROOT,
    INDEX_ROOT,
    CAPABILITY_MAP_PATH,
    STRICT_SCHEMA_PATH,
    TEMPLATE_REFS_ROOT,
    CAPABILITY_TIERS_PATH,
    REQUIRED_FIELDS,
    VALIDATE_MANIFEST_TS_PATH,
    _KEBAB_RE,
    CLASS_LABELS,
    MOCK_LABELS,
    _MOCKLESS_FALLBACK,
    _COMPLEXITY_FALLBACK,
    _MOCK_FALLBACK,
    _ALLOWED_ENFORCEMENT,
    _NORMALIZE_MODELS,
    _INSTRUCTIONS_STUB,
)



def class_label(klass: str) -> str:
    """Svensk etikett för dossier-klassen, tekniskt värde i parentes:
    ``class_label("hard")`` → ``Kopplad (hard)``. Okänt värde renderas rått
    (hellre ärligt tekniskt än en påhittad översättning)."""
    label = _facade().CLASS_LABELS.get(klass, "").strip()
    return f"{label} ({klass})" if label else str(klass)




def mock_label(mock: str | None) -> str:
    """Svensk etikett för demoläget (`mock`), tekniskt värde i parentes.
    Utelämnat fält räknas som `none`, precis som i runtime."""
    value = (mock or "none").strip() or "none"
    label = _facade().MOCK_LABELS.get(value, "").strip()
    return f"{label} ({value})" if label else str(value)




def requires_f3(manifest: dict[str, Any]) -> bool:
    """Kräver byggblocket ett eget F3-steg ("Bygg integrationer")?

    Spegling av ``dossierRequiresF3()`` i ``src/lib/gen/dossiers/types.ts``,
    som är den kanoniska källan. Två regler, båda måste vara falska för att
    byggblocket ska vara klart redan i designläget:

    1. en ``envVars``-post med ``enforcement: "build"`` (default när fältet
       utelämnas), eller
    2. en ``files``-post med ``role: "server"``.

    Regeln bor i två skrivvägar (TS + Python) därför att listvyn inte ska
    behöva ett Node-anrop per rendering; pariteten mot TS-källan grindas i
    ``backoffice/test_dossiers_page.py``. Ändra alltid TS först.

    **Obs:** detta är en egen axel — den följer varken av Kopplad/Fristående
    eller av demoläget.
    """
    for env in manifest.get("envVars") or []:
        if isinstance(env, dict) and (env.get("enforcement") or "build") == "build":
            return True
    for file_entry in manifest.get("files") or []:
        if isinstance(file_entry, dict) and file_entry.get("role") == "server":
            return True
    return False




def is_default_for_capability(manifest: dict[str, Any] | None) -> bool:
    """Strikt ``defaultForCapability is True`` — samma regel som valideraren.

    ``scripts/dossiers/validate-all.ts:117`` räknar bara ``=== true``, och
    rå-JSON-vägens medvetet lättare kedja kan lägga en sträng i fältet.
    ``"false"`` är truthy i Python, så en falsy-koll gör UI:t och grindarna
    osanna åt olika håll: listan visar en bock som CI inte ser, och kryssrutan
    renderas ikryssad så nästa sparning skriver ett äkta ``true``. Läs fältet
    genom denna hjälpare, aldrig med en rå truthiness-koll.
    """
    return (manifest or {}).get("defaultForCapability") is True
