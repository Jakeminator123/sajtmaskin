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

## Föreslagen leverans i tre faser

### Fas 1A — Trivial removal (KLAR 2026-04-20)

**Scope:** 18 v0-chat-routes som **saknar test-fil** (ingen unique coverage att tappa). Pure re-exports; deletion är mekanisk.

**Status:** **KLAR**. Borttagna i commit nedan + uppdaterad kommentar i `src/lib/utils/image-validator.ts`. Verifierat: 1176/1176 tester gröna, tsc clean, eslint clean.

**Borttagna filer:**

- `src/app/api/v0/chats/init-registry/route.ts`
- `src/app/api/v0/chats/[chatId]/normalize-text/route.ts`
- `src/app/api/v0/chats/[chatId]/preview-session/route.ts`
- `src/app/api/v0/chats/[chatId]/validate-css/route.ts`
- `src/app/api/v0/chats/[chatId]/quality-gate/route.ts`
- `src/app/api/v0/chats/[chatId]/preview-destroy/route.ts`
- `src/app/api/v0/chats/[chatId]/messages/[messageId]/route.ts`
- `src/app/api/v0/chats/[chatId]/repair/route.ts`
- `src/app/api/v0/chats/[chatId]/preview-hibernate/route.ts`
- `src/app/api/v0/chats/[chatId]/readiness/route.ts`
- `src/app/api/v0/chats/[chatId]/validate-images/route.ts`
- `src/app/api/v0/chats/[chatId]/versions/collaboration-summaries/route.ts`
- `src/app/api/v0/chats/[chatId]/versions/[versionId]/{approval,comments,download,error-log,export,feedback}/route.ts`

### Fas 1B — Routes med UNIQUE test-coverage (~1 dag)

**Scope:** 10 v0-chat-routes vars test-fil innehåller assertions engine-sidan saknar. Subagent-inventering 2026-04-20 visade att 5 routes saknar engine-test helt (`init`, `[chatId]/route`, `[chatId]/files`, `[chatId]/preview-heartbeat`, `[chatId]/versions`), och 5 har engine-test som bara delegerar (real coverage ligger på v0-sidan).

**Steg:**

1. För varje av de 10 v0-test-filerna:
   - Skapa eller utöka motsvarande `src/app/api/engine/.../route.test.ts` med samma `it(...)`-block. Eftersom v0-routerna är re-exports kan testerna pekas direkt mot `engine/`-handlern utan att ändra mock-setup.
   - Verifiera att de nya engine-testerna passerar.
   - Radera v0-routen + dess test-fil.
2. När alla 10 är borta, radera `src/lib/api/engine/chats/v0-chats-compat.ts` (`logLegacyV0ChatsHit` har då inga callers).

**Berörda v0-test-filer:**

- `src/app/api/v0/chats/route.test.ts` (POST/GET, stream-handler-pass-through)
- `src/app/api/v0/chats/init/route.test.ts` (ZIP import scenario)
- `src/app/api/v0/chats/stream/route.test.ts` (own-engine finalize, awaiting-input)
- `src/app/api/v0/chats/[chatId]/route.test.ts` (preview-URL exposure for failed/incomplete versions)
- `src/app/api/v0/chats/[chatId]/messages/route.test.ts` (sync fallback payload)
- `src/app/api/v0/chats/[chatId]/files/route.test.ts` (PATCH/DELETE per-file)
- `src/app/api/v0/chats/[chatId]/stream/route.test.ts` (follow-up clarification, scoped edits)
- `src/app/api/v0/chats/[chatId]/preview-status/route.test.ts` (400 missing versionId)
- `src/app/api/v0/chats/[chatId]/preview-heartbeat/route.test.ts` (session ownership)
- `src/app/api/v0/chats/[chatId]/versions/route.test.ts` (failed version preview-URL handling)

### Fas 2 — Class C rename eller behåll (~½–1 dag)

**Scope:** Antingen byt namn på de 7 Class C-routerna till `/api/legacy/v0/*` (för att signalera status), eller behåll på `/api/v0/*` och dokumentera explicit att de är legitima legacy-routes.

**Beslut behövs:** Vill vi pinka ut "legacy" via URL eller via dokumentation? Rename kostar 3 klient-callsite-uppdateringar (`ProjectEnvVarsPanel`, `useBuilderDeployActions`, `useDeploymentStatus`).

**Estimerad tid:** 4–8 timmar inkl klient-uppdateringar.

**Risk:** Låg-medel — klient-callsites behöver synkroniserade deploys (rename kan inte göras utan client-change).

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

**Fas 1A klart när:** ✅ **Klart 2026-04-20**

- 18 testfria v0-chat-routes borta från `src/app/api/v0/chats/`
- Inga tekniska referenser till de borttagna paths (kommentarer i docs/schemas accepterade som historik)
- `npx vitest run` grön (1176/1176)
- `npm run typecheck` clean
- `npm run lint` clean

**Fas 1B klart när:**

- 10 v0-chat-routes med UNIQUE test-coverage borta efter att tester migrerats till engine-sidan
- `src/lib/api/engine/chats/v0-chats-compat.ts` (`logLegacyV0ChatsHit`) borta — inga v0-chat-callers kvar
- Audit §3.4 markerad **DONE** i `01-buggar.md` / `03-konsolidering-pipeline.md`

**Fas 2 klart när:**

- Class C-routerna har en stabil URL-policy (rename eller dokumenterat keep)
- 3 klient-callsites uppdaterade vid rename
- `useDeploymentStatus` "naming debt" i `Kvarvarande-uppgifter.md` punkt under "Noterat" stängd

## Hur du kör

Subagent-driven readonly-investigation är redan gjord (rapport 2026-04-20). Implementationen är mekanisk: skapa en ny session, plocka 5–10 routes per commit, push, upprepa. Använd `git mv` om någon test ska flyttas till engine-sidan.
