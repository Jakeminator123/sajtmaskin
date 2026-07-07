---
status: active
owner: unassigned
created: 2026-07-07
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

## Kvarvarande ägarbeslut (dina — systemet funkar som det är)

Inget av detta är en bugg. Det är halvbyggda funktioner eller möjliga externa
kontrakt där radering är ett *produktval*, inte städning.

| ID | Yta | Läge | Rekommendation |
|---|---|---|---|
| C1 | `POST /api/auth/github/disconnect` | Route finns, 0 callers (ingen "Koppla från"-knapp) | **Antingen** koppla en disconnect-knapp i `VersionHistory`/inställningar, **eller** radera routen. Låg risk endera vägen. |
| C2 | `GET /api/templates` (singular route-fil `templates/route.ts`) | 0 callers — UI läser `@/lib/templates/client` direkt. Oautentiserad read-only-dubblett av katalogen | Säker att radera **efter** en prod-loggkoll (extern konsument?). Behåll `templates/search/route.ts`. |
| C3 | `GET /api/audits` + `GET/DELETE /api/audits/[id]` | 0 callers. `POST /api/audits` (spara) används av `audit-modal.tsx`. "Spara audit" finns men ingen vy för sparade | Produktval: **bygg** "Mina audits"-vy (wire list/hämta/radera) **eller** trimma bort dessa handlers och behåll bara `POST`. |

### Så här slutför du ett beslut (mall)

```powershell
# Exempel C1 — radera disconnect-routen
Remove-Item -Recurse -Force "src/app/api/auth/github/disconnect"
npm run typecheck ; if ($?) { npm run lint }
# grep-kontroll att inget refererar routen:
# (Grep-verktyget i Cursor, mönster: /api/auth/github/disconnect)
```

Vid route-radering: kör en prod-loggkoll först (`/logg` eller
`vercel logs`) om routen kan nås av externa klienter (gäller särskilt C2).

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
(se `npm run clean:scratch`). `_parkering/` och `test_förslag_templates_blob/` är
medvetna/load-bearing → behåll. `kontrollflödesmapp/` flyttades 2026-07-07 till
`docs/plans/avklarat/kontrollflode/underlag/`.
