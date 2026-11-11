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
    # Line terminators must be escaped too: a raw newline (e.g. a multi-line
    # description from a text_area) inside "..." is a TypeScript syntax error.
    return (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\r", "\\r")
        .replace("\n", "\\n")
        .replace("\t", "\\t")
        .replace(chr(0x2028), "\\u2028")
        .replace(chr(0x2029), "\\u2029")
    )
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


_TS_SIMPLE_ESCAPES = {
    "n": "\n",
    "r": "\r",
    "t": "\t",
    "b": "\b",
    "f": "\f",
    "v": "\v",
    "0": "\0",
}


def unescape_ts_string(value: str) -> str:
    """Decode the body of a TS string literal (the inverse of ``_escape_ts_string``).

    Handles every escape a manifest can contain, so a read → edit → write round
    trip never changes a string's meaning: ``\\n`` stays a newline instead of
    becoming a literal backslash + ``n`` that is then re-escaped as ``\\\\n``.
    """
    out: list[str] = []
    index = 0
    length = len(value)
    while index < length:
        char = value[index]
        if char != "\\" or index + 1 >= length:
            out.append(char)
            index += 1
            continue
        nxt = value[index + 1]
        if nxt == "u" and value[index + 2 : index + 3] == "{":
            close = value.find("}", index + 3)
            if close > index + 3:
                try:
                    out.append(chr(int(value[index + 3 : close], 16)))
                    index = close + 1
                    continue
                except ValueError:
                    pass
        if nxt == "u":
            digits = value[index + 2 : index + 6]
            if len(digits) == 4 and all(c in "0123456789abcdefABCDEF" for c in digits):
                out.append(chr(int(digits, 16)))
                index += 6
                continue
        if nxt == "x":
            digits = value[index + 2 : index + 4]
            if len(digits) == 2 and all(c in "0123456789abcdefABCDEF" for c in digits):
                out.append(chr(int(digits, 16)))
                index += 4
                continue
        if nxt == "\r" and value[index + 2 : index + 3] == "\n":
            index += 3  # line continuation
            continue
        if nxt in ("\n", "\r", chr(0x2028), chr(0x2029)):
            index += 2  # line continuation
            continue
        out.append(_TS_SIMPLE_ESCAPES.get(nxt, nxt))
        index += 2
    return "".join(out)


# One complete double-quoted literal; an escaped quote never ends it.
_TS_DOUBLE_QUOTED = r'"((?:[^"\\\r\n]|\\.)*)"'


def extract_ts_string_field(text: str, field: str) -> str:
    """Read one ``field: "value"`` string literal out of a manifest.ts text."""
    match = re.search(
        rf"(?<![\w$]){re.escape(field)}:\s*\n?\s*{_TS_DOUBLE_QUOTED}", text, re.DOTALL
    )
    return unescape_ts_string(match.group(1)).strip() if match else ""


def _skip_ts_literal_or_comment(text: str, index: int) -> int | None:
    """Index just past the string/template literal or comment starting at ``index``.

    ``None`` when ``index`` does not start one. An unterminated literal or block
    comment runs to the end of the text, so callers can never treat its content
    as code.
    """
    char = text[index]
    if char in "\"'`":
        cursor = index + 1
        while cursor < len(text):
            current = text[cursor]
            if current == "\\":
                cursor += 2
                continue
            if current == char:
                return cursor + 1
            if char != "`" and current in "\r\n":
                return cursor  # unterminated single-line literal
            cursor += 1
        return len(text)
    if text.startswith("//", index):
        newline = text.find("\n", index)
        return len(text) if newline < 0 else newline
    if text.startswith("/*", index):
        close = text.find("*/", index + 2)
        return len(text) if close < 0 else close + 2
    return None


def _code_positions_before(text: str, stop: int) -> bool:
    """True when ``stop`` lies in code, not inside a literal or comment."""
    index = 0
    while index < stop:
        skipped = _skip_ts_literal_or_comment(text, index)
        if skipped is None:
            index += 1
            continue
        if skipped > stop:
            return False
        index = skipped
    return True


def find_ts_string_array_span(text: str, field: str) -> tuple[int, int] | None:
    """``(start, end)`` of the ``[...]`` that belongs to ``field:`` in ``text``.

    String-aware: a ``]`` inside a literal such as ``"Replace [Butiksnamn]"``
    does not close the array (the earlier ``\\[.*?\\]`` regex stopped there,
    read the array as empty and turned every save into broken TypeScript).
    ``field`` must be a whole key, so ``tags`` never matches ``metaTags``, and a
    match inside a literal or comment is skipped. ``end`` is exclusive.
    """
    pattern = re.compile(rf"(?<![\w$]){re.escape(field)}\s*:\s*\[")
    for match in pattern.finditer(text):
        if not _code_positions_before(text, match.start()):
            continue
        start = match.end() - 1
        depth = 0
        index = start
        while index < len(text):
            skipped = _skip_ts_literal_or_comment(text, index)
            if skipped is not None:
                index = skipped
                continue
            char = text[index]
            if char == "[":
                depth += 1
            elif char == "]":
                depth -= 1
                if depth == 0:
                    return start, index + 1
            index += 1
        return None
    return None


def parse_ts_string_array_literal(array_text: str) -> list[str] | None:
    """Values of a ``[...]`` made only of double-quoted strings, commas and comments.

    ``None`` when the array holds anything else (spreads, identifiers, template
    literals). Writers must then refuse instead of silently dropping entries.
    """
    if not (array_text.startswith("[") and array_text.endswith("]")):
        return None
    inner = array_text[1:-1]
    values: list[str] = []
    index = 0
    while index < len(inner):
        char = inner[index]
        if char.isspace() or char == ",":
            index += 1
            continue
        if char == '"':
            end = _skip_ts_literal_or_comment(inner, index)
            if end is None or end > len(inner) or inner[end - 1] != '"' or end == index + 1:
                return None
            values.append(unescape_ts_string(inner[index + 1 : end - 1]))
            index = end
            continue
        if inner.startswith("//", index) or inner.startswith("/*", index):
            index = _skip_ts_literal_or_comment(inner, index) or len(inner)
            continue
        return None
    return values


def extract_ts_string_array_field(text: str, field: str) -> list[str]:
    """Read one ``field: ["a", "b"]`` string array out of a manifest.ts text."""
    span = find_ts_string_array_span(text, field)
    if span is None:
        return []
    array_text = text[span[0] : span[1]]
    values = parse_ts_string_array_literal(array_text)
    if values is None:
        # Mixed content: keep the old best-effort read of the plain literals.
        values = [
            unescape_ts_string(value)
            for value in re.findall(_TS_DOUBLE_QUOTED, array_text)
        ]
    return [value for value in values if value.strip()]


def extract_ts_union_values(text: str, type_name: str) -> list[str] | None:
    pattern = rf'(?:export\s+)?type\s+{re.escape(type_name)}\s*=\s*([\s\S]*?);'
    m = re.search(pattern, text)
    if not m:
        return None
    return re.findall(r'"([^"]+)"', m.group(1))
