# P29 — `/api/v0/*` ↔ `/api/engine/*` consolidation

Status: Active (planning) — investigation complete 2026-04-20, implementation deferred
Skapad: 2026-04-20
Prioritet: Hög (audit ROI 8 + sluter 4 av 7 P28-failures som bonus)
Referens: [`docs/reports/audit-2026-04-20-komplexitet-vs-varde/03-konsolidering-pipeline.md`](../../reports/audit-2026-04-20-komplexitet-vs-varde/03-konsolidering-pipeline.md) §3.4

## Bakgrund

Sajtmaskin har två parallella API-ytor:

- `src/app/api/v0/**` — 45 filer (legacy "compat")
- `src/app/api/engine/**` — 40 filer (kanonisk runtime-yta)

Audit-rapporten beskriver `/api/v0/*` som "compat-routes som finns kvar där det behövs" — men "där det behövs" är aldrig definierat. Subagent-inventering 2026-04-20 visar att den verkliga bilden är klarare än audit antydde.

## Faktisk klassning (subagent-inventering 2026-04-20)

### Class A — rena re-exports (27 routes, säkra att radera)

Varje route under `src/app/api/v0/chats/**/route.ts` är en `export { ... } from "@/app/api/engine/..."` (eller motsvarande tunn HTTP-wrapper med bara compat-loggning som extra). De delar handlare med engine-versionen, så det finns **noll risk för shape-divergens**.

Exempel:

- `src/app/api/v0/chats/[chatId]/route.ts` → re-exports `GET` från `engine/chats/[chatId]/route.ts`
- `src/app/api/v0/chats/[chatId]/preview-status/route.ts` → re-exports från engine
- `src/app/api/v0/chats/[chatId]/files/route.ts` → re-exports
- ... 24 till samma mönster

**Klient-callsites för dessa 27:** 0 (UI använder `ENGINE_CHATS_API_PREFIX` / `engineChatBaseUrl` direkt).

### Class B — divergerade par (0 routes)

Inga hittades. Alla v0/engine-par delar implementation.

### Class C — v0-only legacy (7 routes, behåll eller flytta till `/api/legacy/v0/`)

Dessa har **inga engine-motsvarigheter** och **klienter använder dem aktivt**:

| Route | Klient |
|---|---|
| `src/app/api/v0/chats/init-registry/route.ts` | (registry-helper, intern) |
| `src/app/api/v0/integrations/vercel/projects/route.ts` | builder integrations panel |
| `src/app/api/v0/projects/instructions/route.ts` | (legacy stub) |
| `src/app/api/v0/projects/[projectId]/env-vars/route.ts` | `src/components/builder/ProjectEnvVarsPanel.tsx:266,456,508` |
| `src/app/api/v0/deployments/route.ts` | `src/app/builder/useBuilderDeployActions.ts:175` |
| `src/app/api/v0/deployments/[deploymentId]/route.ts` | (deploy status) |
| `src/app/api/v0/deployments/[deploymentId]/events/route.ts` | `src/lib/hooks/useDeploymentStatus.ts:31` |

### Class D — engine-only (2 routes)

- `src/app/api/engine/chats/[chatId]/accept-repair/route.ts`
- `src/app/api/engine/chats/[chatId]/finalize-design/route.ts`

Ingen åtgärd.

## Föreslagen leverans i två faser

### Fas 1 — Class A removal (~1–2 dagar)

**Scope:** Ta bort alla 27 v0-chat-route-filer + deras testfiler. Ingen klient-callsite-uppdatering behövs.

**Steg:**

1. Lista alla 27 Class A-filer (subagent-rapporten har full listan).
2. För varje route:
   - Kontrollera att engine-motsvarigheten har minst lika fullständig test-coverage. Om en v0-test täcker något unikt (t.ex. compat-logging), flytta det testet till engine-sidan först.
   - Radera v0-filen + dess `*.test.ts`.
3. Ta bort eventuell compat-loggnings-modul (`logLegacyV0ChatsHit`) om den blir oanvänd.
4. Sök efter `/api/v0/chats/` i `src/` och `docs/` — inga klient-fetcher förväntas hittas; uppdatera dokumentation.
5. Kör vitest + tsc + eslint.

**Bonus:** Subagent-rapporten + audit §3.4 antyder att 4 av 7 ursprungliga P28-failures (preview-URL och preview-status v0-tester) försvinner som bieffekt — men eftersom alla 7 ursprungliga P28-fails redan är gröna sedan 2026-04-20-fixarna är detta nu en bonus i form av **mindre dubblerad testkörningstid**, inte fixar.

**Estimerad tid:** 8–16 timmar (mest tid på att granska att inga unika tester går förlorade).

**Risk:** Låg — re-exports betyder att handler-logik bevaras.

### Fas 2 — Class C rename eller behåll (~½–1 dag)

**Scope:** Antingen byt namn på de 7 Class C-routerna till `/api/legacy/v0/*` (för att signalera status), eller behåll på `/api/v0/*` och dokumentera explicit att de är legitima legacy-routes.

**Beslut behövs:** Vill vi pinka ut "legacy" via URL eller via dokumentation? Rename kostar 3 klient-callsite-uppdateringar (`ProjectEnvVarsPanel`, `useBuilderDeployActions`, `useDeploymentStatus`).

**Estimerad tid:** 4–8 timmar inkl klient-uppdateringar.

**Risk:** Låg-medel — klient-callsites behöver synkroniserade deploys (rename kan inte göras utan client-change).

## Vad denna plan **inte** omfattar

- Konsolidering av `server-verify` + `quality-gate` + `accept-repair` (`docs/reports/audit-2026-04-20-komplexitet-vs-varde/03-konsolidering-pipeline.md` §3.2) — separat spår.
- Verifier-asynk eller borttagning (§3.1) — kräver A/B-data först.
- WebContainers-migration — separat strategiskt spår.

## Acceptanskriterier

**Fas 1 klart när:**

- 27 v0-chat-route-filer + testfiler borta från `src/app/api/v0/chats/`
- Inga `/api/v0/chats/` referenser kvar i `src/` (utanför kommentarer)
- `npx vitest run` grön
- `npm run typecheck` clean
- `npm run lint` clean
- Audit §3.4 markerad partiell DONE i `01-buggar.md` / `03-konsolidering-pipeline.md`

**Fas 2 klart när:**

- Class C-routerna har en stabil URL-policy (rename eller dokumenterat keep)
- 3 klient-callsites uppdaterade vid rename
- `useDeploymentStatus` "naming debt" i `Kvarvarande-uppgifter.md` punkt under "Noterat" stängd

## Hur du kör

Subagent-driven readonly-investigation är redan gjord (rapport 2026-04-20). Implementationen är mekanisk: skapa en ny session, plocka 5–10 routes per commit, push, upprepa. Använd `git mv` om någon test ska flyttas till engine-sidan.
