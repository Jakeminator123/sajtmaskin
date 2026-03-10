# EGEN_MOTOR_V2 — Master Roadmap

> Startdatum: 2026-03-06
> Mål: Bygga ut sajtmaskins egna kodgenereringsmotor till ~90% av v0:s kapabilitet

## Övergripande arkitektur

```
Användarens prompt
       │
       ▼
┌──────────────────────────┐
│  PRE-GENERATION          │
│  - Prompt-orkestrering   │
│  - URL-komprimering      │
│  - Dynamisk kontext (05) │
│  - File context (04)     │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  GENERATION              │
│  GPT 5.2 via AI SDK      │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  POST-GENERATION         │
│  - Suspense-regler (02)  │
│  - Autofix pipeline (03) │
│  - Retry-loop (01)       │
│  - Fixer-modell (08)     │
│  - Eval gate (06)        │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  PREVIEW & DELIVERY      │
│  - Bildhantering (07)    │
│  - Preview render        │
│  - Sandbox verify (08)   │
└──────────────────────────┘
```

## Byggordning

| # | Plan | Fil | Beroenden | Insats |
|---|------|-----|-----------|--------|
| 01 | Retry-loop vid trasig generation | `01-retry-loop.md` | Ingen | 3-5 dagar |
| 02 | Fler suspense-regler | `02-suspense-regler.md` | Ingen | 3-5 dagar |
| 03 | Autofix med esbuild | `03-autofix-esbuild.md` | 01 (retry använder autofix) | 5-7 dagar |
| 04 | Multi-file uppföljning | `04-multi-file.md` | 03 (behöver stabil enfilsgenerering) | 5-7 dagar |
| 05 | Dynamisk kontextinjektion | `05-dynamisk-kontext.md` | Ingen | 5-7 dagar |
| 06 | Eval-loop och kvalitets-scoring | `06-eval-loop.md` | 01-05 (testar hela pipelinen) | 5-7 dagar |
| 07 | Bildhantering och placeholder-fix | `07-bildhantering.md` | Ingen | 3-5 dagar |
| 08 | Fixer-modell och sandbox-verifiering | `08-fixer-sandbox.md` | 01, 03 (bygger på retry) | 5-7 dagar |

## Nuvarande buggar som åtgärdas

| Problem | Åtgärdas av |
|---------|------------|
| "Vita sidan" (kod som ej kompilerar) | 01, 02, 03 |
| "Likadana sidor" (ingen variation) | 04, 07 |
| "Bilder laddas inte" | 07 |
| Ingen kvalitetsmätning | 06 |
| Ingen retry vid fel | 01, 08 |

## Valideringsprocess

Efter varje plan:
1. `npx tsc --noEmit` — TypeScript-kompilering
2. `npx eslint src/lib/gen/` — Lintning
3. Manuell verifiering av ny funktionalitet
4. Resultat loggas i `validation-log.md`

## Filer att referera

- `src/lib/gen/` — Hela motorns källkod
- `src/lib/gen/engine.ts` — Genereringsmotor (GPT 5.2)
- `src/lib/gen/fallback.ts` — Pipeline-entrypoint + v0-fallback
- `src/lib/gen/system-prompt.ts` — Systemprompt (statisk + dynamisk)
- `src/lib/gen/suspense/` — Streaming-regler
- `src/lib/gen/autofix/` — Post-generation autofix
- `src/lib/gen/preview.ts` — Preview-rendering
- `src/app/api/v0/chats/stream/route.ts` — Skapa-chat stream route
- `src/app/api/v0/chats/[chatId]/stream/route.ts` — Skicka-meddelande stream route
