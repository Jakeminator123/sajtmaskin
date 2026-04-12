# Persona E2E — Klippstugan Nord

Playwright-flöde som simulerar ett **fiktivt företag** genom intakewizard, hoppar över bilduppladdning, väntar på generering och sparar **skärmdumpar** (wizard + preview iframe + sidor via route-menyn).

## Persona

| Fält | Värde |
|------|--------|
| Namn | Klippstugan Nord AB |
| Bransch | Salong (väljer *Salong / Skönhet* i wizarden) |
| Stad | Umeå |
| Mål | Boka tid / lokala kunder (kort verksamhetsbeskrivning → wizarden inkluderar mål- och målgruppssteg) |

## Krav

1. App igång: `npm run dev` (eller sätt `SAJTMASKIN_E2E_BASE_URL`).
2. Miljö där **own-engine** och **preview** fungerar (API-nycklar, ev. preview-host).
3. Chromium: `npx playwright install chromium`

## Köra

```bash
# Standard: http://127.0.0.1:3000
npm run test:persona:e2e

# Annan bas-URL
SAJTMASKIN_E2E_BASE_URL=https://din-preview.vercel.app npm run test:persona:e2e
```

## Output

PNG-filer hamnar under `e2e/persona/artifacts/persona-klippstugan/` (mappen är gitignorerad).

- `wizard-*.png` — steg i intakewizarden
- `post-image-skip.png` — builder efter bild-popup
- `preview-route-*.png` — synlig yta i preview-iframen per vald route (`/` normaliserad till `root`)

## Timeout

Första generationen kan ta flera minuter. Timeout i config är **12 minuter** per test.
