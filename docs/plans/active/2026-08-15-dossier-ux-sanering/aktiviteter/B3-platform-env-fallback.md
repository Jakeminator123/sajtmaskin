# B3 — Ta bort plattforms-`process.env`-fallbacken för `configured`

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

`isConfigured` i `src/lib/gen/dossiers/select.ts` (~190–207) läser plattformens
`process.env` när `configuredEnvKeys` inte skickas in. Sajtmaskins egna nycklar
(t.ex. `OPENAI_API_KEY`) kan då färga ett användarprojekts `configured`-signal.
Kodkommentaren kallar själv fallbacken «deprecated» och «wrong for user
projects». `configured` är en promptsignal (inte en gate), men en falsk signal
ändå: kodgen-LLM:en kan tro att projektet är konfigurerat.

Nuläge (verifierat 2026-08-15): produktcallers (`resolve-base.ts`,
`snapshot-selection.ts`) skickar projektset; fallbacken nås via backstops
(`finalize-version/runner.ts`, som dock inte konsumerar `configured`) och
riggas aktivt i `select.test.ts` (~85–101).

## Uppgift

- Ta bort `process.env`-läsningen. Utan `configuredEnvKeys` →
  `configured: false` för hard-dossiers med required env (hellre falskt
  negativt än plattformsläcka).
- Gå igenom alla anropare av `selectDossiersForRequest` och
  `isDossierConfigured`; skicka projektset där `configured` konsumeras.
- Skriv om `select.test.ts`-fallen till `configuredEnvKeys`-set i stället för
  att mutera `process.env`.

## Vad som INTE ingår

- Ingen ny readiness-/gate-mekanik — signalens konsumenter är oförändrade.
- Env-lagringen (`project-env-vars.ts`) rörs inte.

## Verifiering

- `Select-String`/grep: `process.env` förekommer inte längre i `select.ts`.
- `npm run typecheck` + `select.test.ts` + `snapshot-selection`-tester.

## Klart när

`configured` kan aldrig bli sann utan projektsparade värden; backlograd
tillagd/avbockad i `BUG-SWARM-BACKLOG.md`.
