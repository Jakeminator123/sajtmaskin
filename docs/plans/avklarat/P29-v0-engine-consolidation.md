# P29 — `/api/v0/*` ↔ `/api/engine/*` consolidation

Status: **DONE 2026-04-20** — Fas 1A + Fas 1B levererade, Fas 2 beslutad (behåll Class C på `/api/v0/`)
Skapad: 2026-04-20
Avslutad: 2026-04-20
Prioritet: Hög (audit ROI 8)
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

### Fas 1B — Routes med UNIQUE test-coverage (KLAR 2026-04-20)

**Scope:** 10 v0-chat-routes vars test-fil innehöll assertions engine-sidan saknade.

**Status:** **KLAR**. Två parallella write-subagents migrerade test-assertioner till engine-sidan (5 nya engine-test-filer, 5 utökade). Sedan borttagna alla 20 v0-filer (10 routes + 10 tester) + `src/lib/api/engine/chats/v0-chats-compat.ts` (`logLegacyV0ChatsHit`-helpern har inga callers kvar).

**Resultat:** `/api/v0/chats/**` är nu tom i runtime-trädet. 1172/1172 tester gröna (- 4 mot 1176 = duplikat-coverage som engine redan hade på samma scenarier; ingen unique coverage förlorad).

**Verifikation:**

- `npm run typecheck` → clean (efter cache-clearing av `.next/dev/types/validator.ts`)
- `npx vitest run` → 1172/1172
- Audit §3.4 chat-ytan markerad DONE i `01-buggar.md` / `03-konsolidering-pipeline.md`

### Fas 2 — Class C-routerna: BESLUT 2026-04-20: behåll på `/api/v0/`

**Beslut:** Behåll de 7 Class C-routerna på `/api/v0/`. **Ingen rename.**

**Class C-routes (permanent legacy, ej "att-städa-bort"):**

- `/api/v0/chats/init-registry` — registry-helper, intern
- `/api/v0/integrations/vercel/projects` — builder integrations panel
- `/api/v0/projects/instructions` — legacy stub
- `/api/v0/projects/[projectId]/env-vars` — `ProjectEnvVarsPanel.tsx:266,456,508`
- `/api/v0/deployments` — `useBuilderDeployActions.ts:175`
- `/api/v0/deployments/[deploymentId]` — deploy status
- `/api/v0/deployments/[deploymentId]/events` — `useDeploymentStatus.ts:31`

**Motivering:**

Audit-rapporten (`03-konsolidering-pipeline.md` §3.4) föreslog rename till `/api/legacy/v0/*` för att "signalera status". Vi avslår av tre skäl:

1. **Routerna är inte arkitektur-legacy** — de fungerar, är aktivt använda av builder-UI:t, och har ingen ersättare under `/api/engine/`. "Legacy"-tag på URL:en blir missvisande för läsare som tror att routerna är på väg bort.
2. **Rename = klient-deploy-koordinering = risk för noll mätbart värde.** Rename kräver att server och klient deployas synkat (annars 404 mellan stadier). Värdet är estetiskt/signal, inte funktionellt.
3. **Linje:** "Enkelhet utan teaterföreställning". Att byta namn på något funktionellt bara för att audit-rapporten gillar det är arkitektur-puritanism, inte förenkling.

**Vad vi gör istället:** Dokumentera tydligt i `src/lib/api/engine-chats-path.ts` JSDoc + i glossary att `/api/v0/` är **canonical permanent prefix för Class C-routes** (deployments/projects/integrations) och inte ett "compat-spår". `useDeploymentStatus`-noten i `Kvarvarande-uppgifter.md` ("naming debt") avskrivs som icke-skuld.

**Konsekvens:** P29 är stängd. Inga öppna underspår. `/api/v0/` finns kvar för 7 specifika routes och är dokumenterat som rätt URL för dem.

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

**Fas 1B klart när:** ✅ **Klart 2026-04-20**

- 10 v0-chat-routes med UNIQUE test-coverage borta efter att tester migrerats till engine-sidan
- `src/lib/api/engine/chats/v0-chats-compat.ts` (`logLegacyV0ChatsHit`) borta — inga v0-chat-callers kvar
- Audit §3.4 chat-ytan markerad **DONE** i `01-buggar.md` / `03-konsolidering-pipeline.md`

**Fas 2 klart när:** ✅ **Klart 2026-04-20**

- Class C-routerna har en stabil URL-policy: **behåll på `/api/v0/`** (beslut + motivering ovan)
- `engine-chats-path.ts` JSDoc + glossary dokumenterar `/api/v0/` som permanent prefix för deployments/projects/integrations
- `useDeploymentStatus` "naming debt" i `Kvarvarande-uppgifter.md` avskriven som icke-skuld

## Avslut

Hela P29-spåret stängt 2026-04-20. Filen flyttas till `docs/plans/avklarat/`.
