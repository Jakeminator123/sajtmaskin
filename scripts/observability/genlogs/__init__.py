# -*- coding: utf-8 -*-
"""genlogs — insamlingslager för `last-generated-usersite.py`.

Paketet är en **konsument** av repots befintliga ägare:

* tabellnamn och kolumner kommer från `src/lib/db/schema.ts` (introspekteras i
  runtime så nya kolumner följer med utan kodändring här),
* priser kommer från `config/ai_models/pricing.json`,
* preview-host-kontraktet ägs av `preview-host/src/server.js`.

Allt är read-only: bara `SELECT` och `GET`. Ingen modul här skriver till någon
extern tjänst.
"""

from __future__ import annotations

SCHEMA_VERSION = 1
"""Versionsnummer för `index.json`/`tokens.json`-formatet i en körningsmapp."""

__all__ = ["SCHEMA_VERSION"]
