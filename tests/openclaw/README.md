# OpenClaw tests

Isolerad testyta for OpenClaw-relaterade API-smoketester.

Scope:
- `health`-route: statuskod baserat pa gateway-halsa
- `chat`-route: surface-gating och proxy mot gateway-SSE
- `tips`-route: surface-gating, credits-guard och tip-normalisering
- `did/chat`-route: avatar-bridge mellan D-ID-klient och OpenClaw
- scoped Playwright-E2E for `/avatar?mode=bridge&mock=1`

Kor bara denna svit:

```bash
npx vitest run tests/openclaw
```

Kor den scoped E2E-kedjan:

```bash
npx playwright test -c playwright.openclaw.config.ts
```

Avsikt:
- Hall testytan separat fran builderns huvudtester
- Ge en trygg plats att prova OpenClaw-integrationen innan djupare koppling
- Kunna bygga pa vidare med fler avatar-specifika tester utan att paverka buildern
