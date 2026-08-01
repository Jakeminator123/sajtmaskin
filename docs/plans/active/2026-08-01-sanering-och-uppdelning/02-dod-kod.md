---
status: active
owner: unassigned
topic: Verifierat död kod — fyra Redis-domänblock + closeRedis, fem devDependencies, vercel-binärbeslutet och den breda exportytan (267 exports / 649 typer).
created: 2026-08-01
source: Master-planens steg 2–3. Grep-verifierat per exportnamn 2026-08-01 (inga externa importer) + knip-körning på master `c3a9273d0`.
---

# Steg 2–3: död kod

## PR A — Redis-domänblocken (`src/lib/data/redis.ts`, 833 rader)

Fyra hela domänblock + `closeRedis` saknar externa användare (grep-verifierat
per exportnamn; radnummer per 2026-08-01):

| Block | Exporter som raderas |
|---|---|
| User Session Cache | `CachedUser` :112 · `cacheUserSession` :122 · `getCachedUserSession` :134 · `invalidateUserSession` :157 · `updateCachedUserDiamonds` :169 |
| Project Files Storage | `ProjectFile` :529 · `ProjectMeta` :535 · `saveProjectFiles` :549 · `getProjectFiles` :579 · `updateProjectFile` :606 · `deleteProjectFile` :647 · `saveProjectMeta` :672 · `getProjectMeta` :698 · `listUserTakenOverProjects` :727 |
| Video Job Storage | `VideoJob` :788 · `saveVideoJob` :803 · `getVideoJob` :823 · `updateVideoJob` :841 |
| Preview Cache | `CachedPreview` :867 · `cachePreview` :879 · `getCachedPreview` :900 · `invalidatePreview` :918 |
| Cleanup | `closeRedis` :931 |

**Behåll** (aktiva användare): `getRedis` (brief-cache, session-store,
health-route), `setCache`/`getCache`/`deleteCache` (projects-routes),
prompt-handoff (prompts-routes), audit-cachen (audits-routes),
`getRedisInfo`/`flushRedisCache` (admin database-route).

Följdändringar i samma PR: uppdatera
[`docs/contracts/data-layer.md`](../../../contracts/data-layer.md) (nämner
`listUserTakenOverProjects`) och tillhörande konstanter/typer/TTL:er som bara
blocken använder. Verifiering: `npm run typecheck` + `npx vitest run src/app/api`
+ grep på varje borttaget exportnamn ⇒ 0 träffar.

**Status 2026-08-01: levererad i PR #714** (−517 rader netto; redis.ts 937 → 422).
Liten uppföljning kvar: `scripts/db/redis-health-check.mjs` och
`backoffice/pages/redis_health.py` räknar fortfarande nyckel-buckets för de nu
döda prefixen (harmlöst — visar 0 när gamla nycklar TTL:at ut ≤ 7 dagar). Städa
bucket-listorna i en egen liten PR.

## PR B — devDependencies + `vercel`-beslut

Ta bort (grep-verifierat oanvända, inga config-referenser):

- `@eslint/eslintrc`, `@eslint/js` (`eslint.config.mjs` importerar dem inte)
- `@modelcontextprotocol/sdk`
- `@testing-library/jest-dom` (kommentar i `danger-action.test.tsx:11` säger
  uttryckligen att repot inte använder det)
- `globals` (`vitest.config.ts:56` `globals: true` är en Vitest-flagga, inte paketet)

**Rör inte** `nodemon` — knip flaggar den, men `lint:watch`
(`package.json:42`) kör den via `npx` (falsk positiv).

**`vercel`-binärbeslut** i samma PR: `vercel:link`, `env:pull`,
`env:pull:prod-snapshot` (`package.json:125,132–133`) förlitar sig på global
CLI. Välj: (a) pinna `vercel` som devDependency (tungt paket, men
reproducerbart) eller (b) byt scripten till `npx vercel@<major>` och
dokumentera i `docs/ENV.md`. Rekommendation: **(b)** — CLI:n används bara av
lokala engångs-scripts, inte CI.

Egen PR med uppdaterad lockfil + full CI (`quality`, `backoffice-tests`,
`schema-drift`, `build`).

**Status 2026-08-01: levererad i PR #717** (scripten kör `npx --yes vercel@58`;
knip: 0 oanvända devDeps, 0 olistade binärer). Obs: backoffice-knappen
"Hämta prod-env" (`backoffice/pages/log_export.py`) kräver fortfarande en
global `vercel` via `shutil.which` — medvetet utanför scope.

## Spår C — exportytan (267 exports / 649 typer)

Massradering är fel verktyg: knip ger falska positiva på dynamiskt laddad kod
(se [`docs/runbooks/hygiene.md`](../../../runbooks/hygiene.md)). Arbetssätt:

1. Ta ytan **domänvis** när en fil ändå röres (megafilsuppdelningen i
   [`04-megafiler.md`](04-megafiler.md) är rätt tillfälle — varje extraktion
   ska också stryka `export`-modifierare som bara fanns "för säkerhets skull").
2. Rena topp-kandidater (t.ex. `src/lib/gen/agent-tools.ts`-exporterna,
   `chat-repository-pg.ts`-re-exporterna) kan tas i små riktade PR:ar:
   ta bort `export`-nyckelordet, inte koden, när symbolen används internt.
3. Kör `npm run knip` före/efter varje batch och citera delta i PR-texten.

Mål: nettominskning varje månad, inte noll på en gång. Rapportens jämförelse:
259/633 (juli) → 267/649 (nu) — ytan växer om ingen äger den.
