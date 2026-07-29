"""PATH-lookup för ``node`` när sidan vill ge ett eget tidigt felmeddelande.

Två PATH-probare finns i backoffice — olika semantik medvetet:

* ``backoffice.shared.resolve_command(command) -> list[str]`` — resolvar
  första argumentet via PATH, annars **faller tillbaka** till original-argv
  så ``subprocess`` fortfarande rapporterar FileNotFoundError. Används när
  knappen kör npm/node och UI:t visar exit/stderr.
* ``resolve_node_command() -> tuple[str, ...] | None`` — returnerar
  ``None`` när ``node`` saknas, så sidan kan returnera ett tydligt
  felmeddelande utan att starta subprocess.
"""

from __future__ import annotations

import shutil


def resolve_node_command() -> tuple[str, ...] | None:
    """Hitta ``node`` på PATH (Windows-vänligt — ``shutil.which`` hanterar .cmd/.exe)."""
    path = shutil.which("node")
    return (path,) if path else None
