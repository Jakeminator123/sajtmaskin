from __future__ import annotations

import re
from typing import Any

from .constants import THEME_TOKEN_KEYS



def _normalize_lines(value: str) -> list[str]:
    return [line.strip() for line in value.splitlines() if line.strip()]




def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return slug.strip("-")




def _format_string_list(values: Any) -> str:
    if not isinstance(values, list):
        return ""
    return "\n".join(str(value).strip() for value in values if str(value).strip())




def _format_font_pairings(values: Any) -> str:
    if not isinstance(values, list):
        return ""
    lines: list[str] = []
    for entry in values:
        if not isinstance(entry, dict):
            continue
        heading = str(entry.get("heading", "")).strip()
        body = str(entry.get("body", "")).strip()
        if heading and body:
            lines.append(f"{heading} | {body}")
    return "\n".join(lines)




def _parse_font_pairings(value: str) -> list[dict[str, str]]:
    pairings: list[dict[str, str]] = []
    for idx, line in enumerate(_normalize_lines(value), start=1):
        if "|" not in line:
            raise ValueError(f"Font pairings row {idx} must use `Heading | Body`.")
        heading, body = [part.strip() for part in line.split("|", 1)]
        if not heading or not body:
            raise ValueError(f"Font pairings row {idx} needs both heading and body.")
        pairings.append({"heading": heading, "body": body})
    return pairings




def _format_theme_tokens(tokens: Any) -> str:
    if not isinstance(tokens, dict):
        return ""
    lines: list[str] = []
    for key in THEME_TOKEN_KEYS:
        value = str(tokens.get(key, "")).strip()
        if value:
            lines.append(f"{key} = {value}")
    for key, raw_value in tokens.items():
        if key in THEME_TOKEN_KEYS:
            continue
        value = str(raw_value).strip()
        if value:
            lines.append(f"{key} = {value}")
    return "\n".join(lines)




def _parse_theme_tokens(value: str) -> dict[str, str]:
    tokens: dict[str, str] = {}
    for idx, line in enumerate(_normalize_lines(value), start=1):
        if "=" in line:
            key, raw_value = [part.strip() for part in line.split("=", 1)]
        elif ":" in line:
            key, raw_value = [part.strip() for part in line.split(":", 1)]
        else:
            raise ValueError(f"Theme token row {idx} must use `token = value`.")
        if not key or not raw_value:
            raise ValueError(f"Theme token row {idx} must have both key and value.")
        tokens[key] = raw_value
    return tokens


def _unique_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw_value in values:
        value = raw_value.strip()
        if not value:
            continue
        lower = value.lower()
        if lower in seen:
            continue
        seen.add(lower)
        result.append(value)
    return result
