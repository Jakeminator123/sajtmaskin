#!/usr/bin/env python3
"""Patch .env.local / .env.production with Vercel + Redis documentation comments."""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

LOCAL_HEADER = """# =============================================================================
# Local development env for sajtmaskin
# =============================================================================
# NODE_ENV sätts automatiskt av Next.js (dev/build/start) — skriv inte över.
#
# Vercel CLI: `vercel link` uppdaterar `.vercel/project.json` (projekt-/teambindning).
# `vercel env pull` skriver en env-fil och kan skriva över `.env.local` om du pekar
# dit — säkerhetskopiera handskötta värden utanför repot. Se docs/ENV.md.
#
# Redis: Samma Upstash-instans som i `.env.production` / Vercel går bra; appen
# separerar cache/rate-limit-nycklar med prefix dev:/preview:/prod:/ (REDIS_KEY_PREFIX
# i src/lib/config.ts). Kunders projektnycklar lagras separat (projectEnvVars).
# =============================================================================

"""

OLD_LOCAL_START = """# Local development env for sajtmaskin
# NODE_ENV is set automatically by Next.js (dev/build/start) - do not override

"""

REDIS_BLOCK = """# =============================================================================
# REDIS / CACHE / RATE LIMITING
# =============================================================================
"""

REDIS_BLOCK_WITH_NOTE = """# =============================================================================
# REDIS / CACHE / RATE LIMITING
# =============================================================================
# Same physical Upstash as prod is OK — runtime key prefix prevents collisions.
"""

PROD_INSERT = """

# -----------------------------------------------------------------------------
# Vercel CLI: `vercel link` uppdaterar `.vercel/project.json`; `vercel env pull`
# kan skriva över en målfil du anger — säkerhetskopiera denna fil vid hand-underhåll.
# Se docs/ENV.md.
#
# Redis: Du kan återanvända samma Upstash som lokalt; nycklar prefixas dev:/preview:/prod:/
# (REDIS_KEY_PREFIX i src/lib/config.ts). Kunders deploy-nycklar kommer från projectEnvVars.
# -----------------------------------------------------------------------------
"""


def patch_local(path: pathlib.Path) -> None:
    text = path.read_text(encoding="utf-8")
    # Normalize newlines for matching only
    nl = "\r\n" if "\r\n" in text[:200] else "\n"
    old_start = OLD_LOCAL_START.replace("\n", nl)

    if old_start in text:
        text = text.replace(old_start, LOCAL_HEADER.replace("\n", nl), 1)
    elif "Vercel CLI:" in text and "REDIS_KEY_PREFIX" in text:
        print(f"{path}: header already present, skip header replace")
    else:
        print(f"{path}: WARN unexpected start — manual check", file=sys.stderr)

    rb = REDIS_BLOCK.replace("\n", nl)
    rbn = REDIS_BLOCK_WITH_NOTE.replace("\n", nl)
    if rb in text and "Same physical Upstash" not in text:
        text = text.replace(rb, rbn, 1)

    # #AI_GATEWAY_API_KEY=... + AI_GATEWAY=...  ->  AI_GATEWAY_API_KEY=...
    m = re.search(
        r"^#AI_GATEWAY_API_KEY=([^\r\n]+)\r?\nAI_GATEWAY=([^\r\n]+)",
        text,
        re.MULTILINE,
    )
    if m:
        val = m.group(2).strip()
        text = re.sub(
            r"^#AI_GATEWAY_API_KEY=[^\r\n]+\r?\nAI_GATEWAY=[^\r\n]+",
            f"AI_GATEWAY_API_KEY={val}",
            text,
            count=1,
            flags=re.MULTILINE,
        )

    path.write_text(text, encoding="utf-8")
    print(f"OK: {path}")


def patch_production(path: pathlib.Path) -> None:
    if not path.is_file():
        print(f"skip: {path} missing")
        return
    text = path.read_text(encoding="utf-8")
    if "vercel env pull" in text and "REDIS_KEY_PREFIX" in text:
        print(f"{path}: production notes already present, skip")
        return
    nl = "\r\n" if "\r\n" in text[:400] else "\n"
    marker = (
        "##############################################################################" + nl
        + "# NODE_ENV is set automatically by Next.js (dev/build/start) - do not override"
    )
    insert = PROD_INSERT.replace("\n", nl)
    if marker in text:
        text = text.replace(
            marker,
            "##############################################################################" + insert + "# NODE_ENV is set automatically by Next.js (dev/build/start) - do not override",
            1,
        )
        path.write_text(text, encoding="utf-8")
        print(f"OK: {path}")
    else:
        print(f"{path}: WARN marker not found", file=sys.stderr)


def main() -> None:
    patch_local(ROOT / ".env.local")
    patch_production(ROOT / ".env.production")


if __name__ == "__main__":
    main()
