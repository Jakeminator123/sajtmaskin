from __future__ import annotations

import re
from pathlib import Path

# Svenska förkortningar som INTE avslutar en mening — annars kapas glossary-rader
# mitt i ("… instruktioner och ev." i stället för "… ev. filer").
_ABBREVIATIONS = (
    "t.ex",
    "d.v.s",
    "dvs",
    "ev",
    "bl.a",
    "m.m",
    "m.fl",
    "osv",
    "etc",
    "ca",
    "resp",
    "jfr",
)


def first_sentence(text: str, *, max_chars: int = 260) -> str:
    """First sentence of a glossary/doc snippet, truncated on a word boundary.

    Hoppar över svenska förkortningar (``ev.``, ``t.ex.``, ``m.m.`` …) så en
    definition inte kapas mitt i meningen.
    """
    cleaned = " ".join((text or "").split())
    if not cleaned:
        return ""
    sentence = cleaned
    for match in re.finditer(r"\.\s", cleaned):
        prefix = cleaned[: match.start()]
        last_word = re.split(r"[\s(]", prefix)[-1].lower()
        if last_word in _ABBREVIATIONS:
            continue
        sentence = cleaned[: match.start() + 1]
        break
    if len(sentence) <= max_chars:
        return sentence
    cut = sentence[:max_chars].rsplit(" ", 1)[0]
    return f"{cut} …"


def read_markdown_table_cell(path: Path, first_cell: str) -> str | None:
    """Read the second column of a markdown table row whose first cell matches.

    Used to render canonical definitions straight out of
    ``docs/architecture/glossary.md`` instead of duplicating the prose in
    Python. Returns ``None`` when the file or the row is missing, so callers can
    show an honest "saknas i docs"-notice rather than a stale copy.
    """
    path = Path(path)
    if not path.is_file():
        return None
    needle = first_cell.strip().lower()
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 2:
            continue
        label = cells[0].replace("**", "").replace("`", "").strip().lower()
        if label == needle:
            return cells[1].strip() or None
    return None


def read_doc_section(path: Path, needle: str, *, max_chars: int = 2400) -> str | None:
    """Return one markdown section (heading + body) from a docs file.

    ``needle`` is matched case-insensitively against the heading text, so a
    stable fragment ("TL;DR", "STEG 3") survives heading edits better than the
    full string. The section ends at the next heading of the same or higher
    level. Truncated at ``max_chars`` with an ellipsis so a hub page never
    dumps a 350-line contract doc. Returns ``None`` when the file or heading is
    missing — callers must then link to the doc instead of inlining a copy.
    """
    path = Path(path)
    if not path.is_file():
        return None
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    needle_lower = needle.strip().lower()
    start: int | None = None
    level = 0
    for index, line in enumerate(lines):
        heading = re.match(r"^(#{1,6})\s+(.*)$", line)
        if not heading:
            continue
        if start is None:
            if needle_lower in heading.group(2).lower():
                start = index
                level = len(heading.group(1))
            continue
        if len(heading.group(1)) <= level:
            body = "\n".join(lines[start:index]).strip()
            return body[:max_chars].rstrip() + " …" if len(body) > max_chars else body
    if start is None:
        return None
    body = "\n".join(lines[start:]).strip()
    return body[:max_chars].rstrip() + " …" if len(body) > max_chars else body
