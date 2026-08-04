from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .context import BackofficeContext

def normalize_nonempty_lines(value: str) -> list[str]:
    return [line.strip() for line in value.splitlines() if line.strip()]


def parse_ts_default_model_id(catalog_path: Path) -> str | None:
    if not catalog_path.is_file():
        return None
    text = catalog_path.read_text(encoding="utf-8")
    m = re.search(
        r'export const DEFAULT_MODEL_ID(?::\s*[^\s=]+)?\s*=\s*"([^"]+)"',
        text,
    )
    return m.group(1).strip() if m else None
def _escape_ts_string(value: str) -> str:
    """Escape a Python string for safe inlining into a TypeScript string literal.

    Used by `backoffice/pages/scaffolds.py` and `backoffice/pages/scaffold_lifecycle.py`
    when rewriting `manifest.ts` files from the backoffice UI. Both files used to
    keep their own identical copy — consolidated here so the two surfaces don't
    drift apart.
    """
    return value.replace("\\", "\\\\").replace('"', '\\"')
def parse_manifest_ts(manifest_path: Path) -> dict[str, Any] | None:
    if not manifest_path.exists():
        return None
    text = manifest_path.read_text(encoding="utf-8")
    result: dict[str, Any] = {"_path": str(manifest_path)}

    m = re.search(r'id:\s*"([^"]+)"', text)
    if m:
        result["id"] = m.group(1)

    m = re.search(r'label:\s*"([^"]+)"', text)
    if m:
        result["label"] = m.group(1)

    m = re.search(r'description:\s*\n?\s*"([^"]*(?:\\.[^"]*)*)"', text)
    if not m:
        m = re.search(r'description:\s*"([^"]*)"', text)
    if m:
        result["description"] = m.group(1)[:120]

    intents_block = ""
    if "allowedBuildIntents" in text:
        m_intents = re.search(r"allowedBuildIntents:\s*\[(.*?)\]", text, re.DOTALL)
        if m_intents:
            intents_block = m_intents.group(1)
    intents = re.findall(r'"(website|app|template)"', intents_block)
    if intents:
        result["allowedBuildIntents"] = intents

    tags_block = ""
    if "tags:" in text:
        m_tags = re.search(r"tags:\s*\[(.*?)\]", text, re.DOTALL)
        if m_tags:
            tags_block = m_tags.group(1)
    tags = re.findall(r'"([^"]+)"', tags_block)
    result["tags"] = tags[:10]

    result["has_promptHints"] = text.count("promptHints") > 0
    result["has_qualityChecklist"] = text.count("qualityChecklist") > 0
    result["has_research"] = "research:" in text

    files_dir = manifest_path.parent / "files"
    file_count = sum(1 for _ in files_dir.rglob("*") if _.is_file()) if files_dir.is_dir() else 0
    result["file_count"] = file_count

    for key in ("siteKind", "complexity", "structureProfile", "contentProfile"):
        m = re.search(rf'{key}:\s*"([^"]+)"', text)
        if m:
            result[key] = m.group(1)

    if "features:" in text:
        m_feat = re.search(r"features:\s*\[(.*?)\]", text, re.DOTALL)
        if m_feat:
            result["features"] = re.findall(r'"([^"]+)"', m_feat.group(1))

    return result


def get_all_manifests(ctx: BackofficeContext) -> list[dict[str, Any]]:
    manifests = []
    for d in sorted(ctx.scaffolds_dir.iterdir()):
        mf = d / "manifest.ts"
        if mf.exists():
            parsed = parse_manifest_ts(mf)
            if parsed:
                manifests.append(parsed)
    return manifests


def unescape_ts_string(value: str) -> str:
    return value.replace('\\"', '"').replace("\\\\", "\\")


def extract_ts_string_field(text: str, field: str) -> str:
    """Read one ``field: "value"`` string literal out of a manifest.ts text."""
    match = re.search(rf'{field}:\s*\n?\s*"([^"]*(?:\\.[^"]*)*)"', text)
    return unescape_ts_string(match.group(1)).strip() if match else ""


def extract_ts_string_array_field(text: str, field: str) -> list[str]:
    """Read one ``field: ["a", "b"]`` string array out of a manifest.ts text."""
    match = re.search(rf"{field}:\s*\[(.*?)\]", text, re.DOTALL)
    if not match:
        return []
    return [
        unescape_ts_string(value)
        for value in re.findall(r'"([^"]*(?:\\.[^"]*)*)"', match.group(1))
        if unescape_ts_string(value).strip()
    ]


def extract_ts_union_values(text: str, type_name: str) -> list[str] | None:
    pattern = rf'(?:export\s+)?type\s+{re.escape(type_name)}\s*=\s*([\s\S]*?);'
    m = re.search(pattern, text)
    if not m:
        return None
    return re.findall(r'"([^"]+)"', m.group(1))

