# Live-review #1052 — blockers före merge och aktivering

Status: **Blockerad**

PR: [#1052](https://github.com/Jakeminator123/sajtmaskin/pull/1052)

Flaggan `SAJTMASKIN_LIVE_REVIEW` ska vara av tills den här uppgiften är klar.
Gröna Actions räcker inte: nuvarande risker ligger i kontrakt, dataägarskap och
observability som testerna inte bevisar.

## P1 — måste rättas före merge

1. **Knyt LLM-usage till generationen.** Product-postcheck kör i en separat
   request utan `runWithLlmUsageContext`/motsvarande explicita id:n.
   `live_review`-rader får därför null i chat/version/user/session/run och kan
   varken kostnadsfördelas eller settlement-kopplas.
2. **Logga misslyckanden sanningsenligt.** Alla kast, invalid model output och
   usage-bearing failures ska få `ok: false` + stabil `errorCode`. Ett fel får
   inte försvinna när usage saknas eller registreras som lyckat när usage finns.
3. **Kräv en faktiskt bifogad bild.** Relativ fallback-URL kan göra
   `hasCurrentScreenshots` sann samtidigt som multimodal-payloaden filtrerar bort
   bilden. Review ska skip/faila closed om inga giltiga http(s)-bilddelar finns.

## P2 — beslut och kontrakt före aktivering

1. **Retention och ägarskap:** JPEG:er läggs publikt i Blob under syntetiskt
   användar-id, utan media-rad, delete-hook eller retention. Bestäm ägare,
   lagringstid och raderingsväg; implementera dem innan flaggan slås på.
2. **Idempotens och kostnadstak:** samma version kan köras om. Använd unik eller
   overwrite-säker blobnyckel, cachea/claim:a en review per version+revision och
   sätt ett försvarbart per-generationstak.
3. **Ärlig kontroll:** den synliga OpenClaw-befogenheten `live_review` måste
   faktiskt gatera körningen. Toggle av får inte köra review; toggle på får inte
   låtsas fungera när env-flaggan är av. Alternativt dölj kontrollen tills steg 2.
4. **Dokumentation:** PR-bodyn säger `maxDuration = 180`, medan nuvarande kod
   använder 300. Synka body/runbook med den kod som faktiskt granskas.

## Ägda ytor

- product-postcheck-routen och live-review-anropet
- `llm_usage`-context/errorsemantik
- screenshot-persistens och Blob-cleanup
- OpenClaw power-gating
- riktade route-, usage-, bild- och idempotens-tester

Rör inte verifierarens blocker-severity eller användarsajtens filer i samma PR.
Kritikern ska förbli advisory och får inte bli en ny repair-agent i detta steg.

## Acceptans

- usage-rad för success och failure bär chat/version/user/session och rätt `ok`
- inga bilddelar betyder skip/fail-closed, aldrig modell-pass utan bild
- upprepad request för samma revision är idempotent och skapar inte orphan Blob
- toggle/env-matrisen har tester för alla fyra kombinationer
- retention/delete-vägen är dokumenterad och testad
- ny oberoende review på slutlig head, därefter live-smoke i preview
- `merge:ready` sätts först efter sign-off; prodflaggan aktiveras i ett separat
  driftbeslut
