---
status: avklarad
owner: unassigned
created: 2026-07-07
archived: 2026-07-08
archived_note: "4 döda ytor raderade + C1-C3 ägarbeslut alla byggda klart (verifierat 2026-07-08, kod läst rad för rad). Enda kvarvarande punkten (R1, auth-parseAuthCookie-refaktor) flyttad till docs/plans/active/README.md's hygien-backlogtabell."
topic: Repo-cleanup — evidensbaserad radering + kvarvarande ägarbeslut
source: cleanup.txt (extern granskningsrapport, rot) + egen caller-analys via läs-agenter
---

# Repo-cleanup 2026-07-07

## TL;DR

En extern rapport (`cleanup.txt` i repo-roten) flaggade ~30 filer som "legacy".
Egen caller-analys (faktisk importgraf, inte namn-träffar) visade att **de flesta
lever**. Bara ett fåtal ytor var verkligt döda. Det som var bevisat dött är
raderat och verifierat; resten är **ägarbeslut** som spåras nedan i stället för
att ligga som osynligt skräp.

Metodnot: rapporten byggde på `HitsByName` (lexikala namn-träffar) utan
importgraf, CI eller telemetri — den var därför direktionellt vettig men
konkret fel på ~12 av 14 stickprovsfiler (figma, wizard, geo, marketplace, mcp,
kostnadsfri-UI, audit-UI, rocket-assets, intro-video, modaler, `brave-search`,
`AdminEnvironmentTab` har alla levande callers).

## Levererat 2026-07-07 (bevisat dött → raderat, verifierat)

| # | Åtgärd | Bevis | Verifiering |
|---|---|---|---|
| 1 | Tog bort död export `getAuthCookie` (`src/lib/auth/auth.ts`) | 0 callers repo-wide | typecheck ✓ lint ✓ `auth.test.ts` 5/5 ✓ |
| 2 | Slog ihop `cn`-helpern: inlinade i `src/lib/utils.ts`, raderade `src/lib/utils/utils.ts` | `@/lib/utils/utils`-alias hade 0 externa callers; `@/lib/utils` (105 callers) opåverkad | typecheck ✓ |
| 3 | Raderade död cron-stub `src/app/api/cron/templates/embeddings/route.ts` + tomma `cron/`-mappar | noop (`skipped:true`), ej i `vercel.json` crons (bara `shadcn/registry/refresh`), 0 callers | — |
| 4 | Raderade 13 oanvända `ai-elements`-referenskomponenter | 0 importers (alias + relativa + repo-wide config); generatorn läser inte filerna (skapar dem från prompt-hints, `prompt-builder.ts:544`) | typecheck ✓ efter radering |

Raderade `ai-elements`-filer: `queue, panel, confirmation, checkpoint, edge,
node, controls, context, toolbar, canvas, image, connection, open-in-chat`.
**Behållet:** de 8 levande builder-komponenterna (`conversation, message,
reasoning, sources, plan, code-block, tool, prompt-input`) och **alla**
katalog-hints i `ai-elements-catalog.ts` (de är prompt-hints för genererade
projekt, frikopplade från de lokala filerna — kan re-hämtas via shadcn-registry).

## Kvarvarande ägarbeslut — UPPDATERAT 2026-07-08: C1–C3 är alla lösta

Verifierat vid en repo-hygien-genomgång 2026-07-08 (direkt kodläsning, inte
namn-träff): alla tre byggdes klart efter att den här planen skrevs. Ingen av
dem är längre ett öppet beslut.

| ID | Yta | Läge 2026-07-07 | Verklighet 2026-07-08 |
|---|---|---|---|
| C1 | `POST /api/auth/github/disconnect` | Route fanns, 0 callers | ✅ **Löst (bygg-vägen).** `VersionHistory.tsx:409-432,643-651` har en fullt kopplad "Koppla från"-knapp (confirm-dialog, loading-state, toast) som anropar routen. |
| C2 | `GET /api/templates` (singular `templates/route.ts`) | 0 callers, dubblett | ✅ **Löst (radera-vägen).** `src/app/api/templates/route.ts` finns inte längre på disk; `templates/search/route.ts` kvar och används. |
| C3 | `GET /api/audits` + `GET/DELETE /api/audits/[id]` | 0 callers, ingen vy | ✅ **Löst (bygg-vägen).** `src/app/audits/page.tsx` är en fullt byggd "Mina audits"-vy (lista, öppna, radera med `AlertDialog`) som konsumerar `audits-client.ts` → `GET`/`DELETE /api/audits`. |

## Uppskjuten refaktor (medveten paus)

| ID | Yta | Varför uppskjuten |
|---|---|---|
| R1 | Auth: extrahera delad `parseAuthCookie` + en `isAdminEmail`-källa (dubblerad mellan `auth.ts` Node och `edge-auth.ts` Edge) | Medel risk på skyddad auth-yta. `edge-auth.ts` MÅSTE vara Edge-säker (Web Crypto) — får ej slås ihop till en fil. Gör som eget, smalt pass med paritetstest när working tree är lugn. Radera inget. |

Ägarbild för auth (3 medvetna lager) och templates-kedjan finns nu i
[`../../architecture/code-map.md`](../../architecture/code-map.md).

## Rör inte (rapportens felflaggningar med levande callers)

`figma/preview`, `wizard/*`, `geo`, `integrations/marketplace/*`,
`integrations/mcp/priorities`, `kostnadsfri`-UI + `[slug]/verify`, `audit`-UI +
`POST /api/audit`, `analyze-website/-presentation`, alla inspector-routes,
rocket-assets, `intro.mp4/.vtt`, `entry-modal`, `welcome-overlay`,
`step-visual`, `templates/preview-modal`, `help-tooltip`, `brave-search`,
`AdminEnvironmentTab`, `/new` (redirect-stub). Alla har verifierade callers.

## Städa lokalt (redan gitignored, inget git-arbete)

`.tmp/`, `logs/*`, `.env-backups/`, `.pytest_cache/` — radera på disk vid behov
(se `npm run clean:scratch`). `_parkering/` är medveten parkeringsyta → behåll.
(`test_förslag_templates_blob/` raderades senare 2026-07-08 i #458 — Blob-galleriet via
`scripts/v0-templates/upload-mallar-blob.mjs` är enda skrivvägen.) `kontrollflödesmapp/` flyttades 2026-07-07 till
`docs/plans/avklarat/kontrollflode/underlag/`.
