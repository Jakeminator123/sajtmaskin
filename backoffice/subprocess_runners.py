"""Delade PATH-probers för Node/Python i backoffice-sidor.

Komplement till ``backoffice.shared.resolve_command`` (som faller tillbaka till
original-argv när lookup misslyckas). Här returneras ``None`` när ingen
binär hittas — samma mönster som health-sidornas tidiga felretur.

Python-probningen speglar ``scripts/dev/run-python.mjs`` (ordning +
``SAJTMASKIN_PYTHON``-override) så vi inte inför en tredje variant.
"""

from __future__ import annotations

import os
import shutil
import sys
from collections.abc import Sequence


def resolve_command_from_candidates(
    candidates: Sequence[tuple[str, ...]],
) -> tuple[str, ...] | None:
    """Returnera första kandidaten vars binär finns på PATH, annars None.

    Varje kandidat är ``(binary, *extra_args)``. Bara ``binary`` slås upp via
    ``shutil.which`` (PATHEXT på Windows); extra args (t.ex. ``("-3",)`` för
    ``py``) behålls oförändrade.
    """
    for candidate in candidates:
        if not candidate:
            continue
        path = shutil.which(candidate[0])
        if path:
            return (path, *candidate[1:])
    return None


def resolve_node_command() -> tuple[str, ...] | None:
    """Hitta ``node`` på PATH (Windows-vänligt — ``shutil.which`` hanterar .cmd/.exe)."""
    return resolve_command_from_candidates((("node",),))


def resolve_python_command() -> tuple[str, ...] | None:
    """Hitta en Python 3-interpretator — samma probningsordning som run-python.mjs."""
    forced = (os.environ.get("SAJTMASKIN_PYTHON") or "").strip()
    if forced:
        return resolve_command_from_candidates(((forced,),))

    candidates: list[tuple[str, ...]] = [("python3",), ("python",)]
    if sys.platform == "win32":
        candidates.extend([("py", "-3"), ("py",)])
    return resolve_command_from_candidates(candidates)
