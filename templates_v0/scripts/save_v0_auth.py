#!/usr/bin/env python3
"""
Öppnar Chromium (synligt), går till v0-mallar. Logga in som vanligt i webbläsaren.
När du är klar, tryck Enter i terminalen — då sparas cookies till auth.json.

Sedan:
  set PLAYWRIGHT_STORAGE_STATE=auth.json
  python scripts/v0_download_zips.py --limit=3
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
AUTH = ROOT / "auth.json"


def main() -> None:
    print("Öppnar webbläsare mot https://v0.app/templates …", flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()
        page.goto("https://v0.app/templates", wait_until="domcontentloaded", timeout=60_000)
        input(
            "\n1) Logga in i fönstret (Vercel/v0) om du behöver.\n"
            "2) Kontrollera att du ser mall-sidan som inloggad.\n"
            "3) Tryck Enter här för att spara session …\n> "
        )
        context.storage_state(path=str(AUTH))
        browser.close()
    print(f"Sparat: {AUTH}", flush=True)
    print(f"Sätt miljövariabel: PLAYWRIGHT_STORAGE_STATE={AUTH}", flush=True)


if __name__ == "__main__":
    main()
