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



PAGE_NAME = "Byggblock (dossiers)"




# dossiers_lib/constants.py → parents[3] = repo root (same as former pages/dossiers.py).
REPO_ROOT = Path(__file__).resolve().parents[3]


DOSSIER_ROOT = REPO_ROOT / "data" / "dossiers"


HARD_ROOT = DOSSIER_ROOT / "hard"


SOFT_ROOT = DOSSIER_ROOT / "soft"


INDEX_ROOT = DOSSIER_ROOT / "_index"


CAPABILITY_MAP_PATH = INDEX_ROOT / "capability-map.json"


STRICT_SCHEMA_PATH = REPO_ROOT / "docs" / "schemas" / "strict" / "dossier.schema.json"


TEMPLATE_REFS_ROOT = REPO_ROOT / "data" / "template-references" / "repos"


CAPABILITY_TIERS_PATH = (
    REPO_ROOT / "src" / "lib" / "builder" / "follow-up-capability-detection.ts"
)



REQUIRED_FIELDS = ("id", "label", "capability", "codeFidelity", "complexity", "summary", "lastVerified")



VALIDATE_MANIFEST_TS_PATH = (
    REPO_ROOT / "src" / "lib" / "gen" / "dossiers" / "validate-manifest.ts"
)



# Kebab-case + längd 2-60: samma regler som strict-schemat ställer på
# `capability`; id-mönstret i schemat saknar längdgräns men delar formen.
_KEBAB_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")



# --- Glossary-svenska (C3) -----------------------------------------------------
# UI-etiketter för manifest-/klassvärden. Kod-id, manifestfält och enum-värden
# behåller sina engelska namn — bara etiketten är svensk, med det tekniska
# värdet i parentes (samma mönster som `field_label`). Kanonisk ordkälla:
# docs/architecture/glossary.md (raden "Dossier" + "Mock mode (dossier)").

CLASS_LABELS: dict[str, str] = {
    "hard": "Kopplad",
    "soft": "Fristående",
}



MOCK_LABELS: dict[str, str] = {
    "canned": "Fabricerat demo-svar",
    "seed": "Medskickad demo-data",
    "success": "Fejkad success + demo-notis",
    "visual": "Full yta, ärlig demo-notis",
    "none": "Ingen demo-yta",
}




# Dokumenterat fallback-par (docs/contracts/dossier-system.md) om TS-filen
# inte kan tolkas. Paritet mot den kanoniska källan grindas i
# backoffice/test_dossiers_page.py.
# error-tracking lamnade undantagslistan 2026-08-06 nar sentry-error-tracking
# parkerades — TS-kallan ar MOCKLESS_CAPABILITY_EXCEPTIONS i validate-manifest.ts.
_MOCKLESS_FALLBACK = frozenset({"analytics"})




_COMPLEXITY_FALLBACK = ("simple", "medium", "advanced")


_MOCK_FALLBACK = ("canned", "seed", "success", "visual", "none")




_ALLOWED_ENFORCEMENT = {"build", "feature-runtime", "warn-only"}




# ── Legacy-import (prospect → v2-utkast) ────────────────────────────────────
# Drives scripts/dossiers/normalize-legacy-prospect.ts from the backoffice so a
# maintainer can run the strict LLM normalizer, read its verdict/concerns, and
# promote an accepted draft into the live pool — without touching the terminal.
# The prospect material lives OUTSIDE the repo (kept out of Cursor's index).

_NORMALIZE_MODELS = ("gpt-5.5", "gpt-5.4-mini")




# ── Skapa byggblock från grunden (C5) ───────────────────────────────────────
# Formulär → manifest-skelett + instructions.md-stub. Fail-closed hela vägen:
# id/capability valideras före allt annat, strict-schemat måste vara grönt
# INNAN något skrivs, och en befintlig katalog skrivs aldrig över.

# Stub med de två H1-rubriker som `dossiers:validate-all` KRÄVER ("When to
# use", "How to integrate") plus de tre rekommenderade — se
# REQUIRED_INSTRUCTIONS_HEADINGS i src/lib/gen/dossiers/validate-manifest.ts.
_INSTRUCTIONS_STUB = """# When to use

- [1-3 punkter: när detta byggblock är rätt val]

# How to integrate

1. [Numrerade steg: import, env-nycklar, monteringspunkt]

# UX rules

- [Feedback, validering, mobil, tillgänglighet]

# Avoid

- [Konkreta fällor som codegen-LLM:en annars går i]

# Verification

- [Manuella röktester som visar att byggblocket fungerar]
"""
