# Live-review #1052 — blockers före merge och aktivering

Status: **P1 gjorda — P2 blockerar bara flaggan, inte merge**

PR: [#1052](https://github.com/Jakeminator123/sajtmaskin/pull/1052)

Flaggan `SAJTMASKIN_LIVE_REVIEW` ska vara av tills P2 är klar.
P1-kontrakten nedan är implementerade på branchen (efter master-inmerge 20 aug).

## P1 — måste rättas före merge

1. **Knyt LLM-usage till generationen.** [x] Product-postcheck wrappar
   `runWithLlmUsageContext` och sätter chat/version/user/session innan review.
2. **Logga misslyckanden sanningsenligt.** [x] Kast, `invalid_model_output` och
   `model_unavailable` skriver `ok: false` + stabil `errorCode`. Tom usage
   försvinner inte längre på felvägen.
3. **Kräv en faktiskt bifogad bild.** [x] `hasCurrentScreenshots` och
   `reviewWithModel` kräver http(s). Relativ fallback → `no_screenshots`,
   aldrig modell-pass utan bilddel.

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
4. **Dokumentation:** PR-bodyn sa `maxDuration = 180`, koden använder 300.
   Synka body/runbook med den kod som faktiskt granskas.

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
