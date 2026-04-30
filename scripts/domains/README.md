# `scripts/domains/` — domänsökning + WHOIS

Fristående Python-verktyg för att slå upp en domän, se om den är upptagen,
när den går ut, och kolla GoDaddys availability API. Tänkt som
research-/backoffice-verktyg, **inte** som runtime-beroende för Next.js.

Den motsvarande runtime-logiken som webbappen använder ligger i:

- `src/lib/domains/rdap-client.ts` — TS-port av RDAP-/WHOIS-uppslagningen.
- `src/lib/domains/godaddy-client.ts` — TS-port av `godaddy_api.py`.
- `src/lib/domains/pricing.ts` — gemensam markup (5x) + USD→SEK.
- `src/app/api/domains/whois/route.ts` — HTTP-endpoint för RDAP/WHOIS.
- `src/app/api/domains/check/route.ts` — availability + pris (5x markup) +
  RDAP-berikning per resultat.
- `src/app/api/domains/link/route.ts` — länkar domän till konfigurerat Vercel-projekt.
- `src/app/api/domains/verify/route.ts` — triggar Vercel domain verification.
- `src/app/api/domains/save/route.ts` — sparar domän på ägarsäkrad deployment-rad.

## Filer här

| Fil | Vad den gör |
|-----|-------------|
| `godaddy_api.py` | Wrapper runt GoDaddys availability API (OTE + prod). |
| `domain_lookup.py` | Tk GUI: läser RDAP för en domän + kör GoDaddy om `.env` finns. |
| `svenskadomaner_playwright_gui.py` | Tk GUI som öppnar svenskadomaner.se i Playwright-browser, läser status/pris från sidan, och kombinerar med RDAP + GoDaddy. |
| `requirements.txt` | `requests`, `python-dotenv`, `playwright`. |

## Köra

```bash
cd scripts/domains
python -m venv .venv
.venv\Scripts\activate              # Windows PowerShell
pip install -r requirements.txt
python -m playwright install chromium  # endast för svenskadomaner-GUI
python domain_lookup.py
```

## .env

Lägg en `.env` här (eller ärv från projektroten) med:

```
OTE_GODADDY_API=...
OTE_GODADDY_SECRET=...
# eller production:
GODADDY_API=...
GODADDY_SECRET=...
```

Samma nycklar registreras i `config/env-policy.json` så att Next.js-runtime
kan plocka upp dem för `/api/domains/check` och `/api/domains/whois`.

## Markup

Slutkundpris för köp visas med faktor 5 ovanpå grossistpris (se
`DOMAIN_PRICE_MARKUP` i `src/lib/domains/pricing.ts`). Python-verktygen
visar grossistpris rakt av — markupen läggs på i webbappen.
