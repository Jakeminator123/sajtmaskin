# -*- coding: utf-8 -*-
"""Externa loggkällor. Varje modul returnerar ett dict med `status`:

* `ok` — allt hämtat
* `partial` — något delsvar saknas (redovisas i `warnings`)
* `unavailable` — källan kunde inte nås alls (`reason` säger varför)

Ingen källa får avbryta insamlingen. Fel blir data, inte exceptions.
"""

from __future__ import annotations

STATUS_OK = "ok"
STATUS_PARTIAL = "partial"
STATUS_UNAVAILABLE = "unavailable"

__all__ = ["STATUS_OK", "STATUS_PARTIAL", "STATUS_UNAVAILABLE"]
