---
status: active
owner: unassigned
created: 2026-07-08
topic: Dossier legacy→v2 — promotion av normaliserade utkast + capability-wiring + F2-synlighet
source: Chatt-session 2026-07-08 (normalizer byggd + mergad i PR #419); coach-analys av legacy-arkivet
---

# Dossier legacy-import — handoff

## TL;DR

Verktyget är klart och mergat (PR #419): en strikt LLM-normalizer gör legacy-dossiers
(v1, 96 st i arkiv) till v2-utkast, körbar från backoffice (flik **Legacy-import**).
12 kandidater normaliserade — alla accept. **7 promoterade** (alla mergade 2026-07-08):
`dashboard-charts` (soft, PR #422), våg 1 `ably-realtime` + `fal-image-generation` +
`ai-tool-calling-chat` (PR #430), våg 2 `postgres-drizzle` + `neon-postgres` +
`mongodb-atlas` under ny capability `database` (PR #445). Live-poolen är nu
**14 hard + 18 soft (32)**. **5 utkast kvar** att promota kuraterat (en i taget),
plus två produktförbättringar (F2-synlighet delvis levererad i PR #439/#441,
nya soft-dossiers från scratch).

**Gemensam öppen punkt på ALLA 7 promoterade:** ett riktigt preview/generate-test
som väljer dossiern, sedan bumpa `lastVerified` (står kvar på legacy-källans
datum tills dess — medvetet, för att inte flagga overifierad kod som grön).

## Var materialet ligger

| Vad | Sökväg |
|---|---|
| Prospect-root (utanför repo, ej Cursor-indexerad) | `C:\Users\jakem\dev\projects\dossiers-prospect\` (default `../dossiers-prospect`, override `DOSSIER_PROSPECT_ROOT`) |
| Kurationsplan (låst targetId/class/capability per prospect) | `dossiers-prospect/prospects.json` |
| Rapport (verdict/concerns/kodfixar per prospect) | `dossiers-prospect/normalization-report.json` |
| Utkast per prospect | `dossiers-prospect/<legacyId>/_v2-draft/` (manifest, instructions, components, REVIEW.md) |
| Legacy-arkiv (källa, read-only) | `C:\Users\jakem\dev\projects\dossiers-legacy-2026-04-20\` |
| Live-pool | `data/dossiers/{hard,soft}/<id>/` |

## 12 utkast — promotionsstatus

| targetId | class | capability | kodfixar | status / prio |
|---|---|---|---|---|
| `dashboard-charts` | soft | dashboard-charts | 0 | ✅ **PROMOTERAD** (PR #422). Kvar: preview-test + `lastVerified`-bump. |
| `ably-realtime` | hard | realtime | 2 | ✅ **PROMOTERAD** (PR #430, våg 1). Kvar: preview-test. |
| `fal-image-generation` | hard | image-generation | 3 | ✅ **PROMOTERAD** (PR #430, våg 1). Kvar: preview-test. |
| `ai-tool-calling-chat` | hard | ai-tool-calling | 3 | ✅ **PROMOTERAD** (PR #430, våg 1). Kvar: preview-test. |
| `postgres-drizzle` | hard | database (default) | 4 | ✅ **PROMOTERAD** (PR #445, våg 2). Seed-fallback-kontrakt (seedData + DbConfigNotice + 503). Kvar: preview-test + P2 schema-verbatim (backlog). |
| `neon-postgres` | hard | database | 4 | ✅ **PROMOTERAD** (PR #445, våg 2). Väljs via `relevanceKeywords`. Kvar: preview-test. |
| `mongodb-atlas` | hard | database | 3 | ✅ **PROMOTERAD** (PR #445, våg 2). Väljs via `relevanceKeywords`. Kvar: preview-test. |
| `sanity-cms` | hard | cms | 5 | **NÄST** — jämför med `sanity-cms-alt`, **promota EN** (öppet beslut #2) |
| `sanity-cms-alt` | hard | cms | 4 | alt-källa till samma target — promota EN |
| `paddle-billing` | hard | subscriptions | 5 | senare |
| `supabase-auth` | hard | supabase-auth | 6 | senare (ej default-auth, får ej konkurrera med `clerk-auth`) |
| `rag-chat` | hard | rag-chat | 5 | **sist** (störst yta; kräver DB + pgvector + migrationer) |

Återkommande kodfix-tema (från REVIEW.md): lazy-init av SDK-klienter (aldrig på
modulnivå), re-root av `@/lib/...`-importer, 503/config-notice vid saknad env,
inga exempel-scheman i prod-kod.

## Kvar per dossier (konkret — från normalization-report.json)

De 5 kvarvarande är `hard` (integrationer) och delar samma promote-loop som
Fas B/C, men med kodfixar och en ny capability-wiring var. Ordnad efter föreslagen
takt (minst yta först, `rag-chat` sist):

| Dossier | Ny capability att wira? | Kärnfixar (utöver lazy-init) |
|---|---|---|
| `sanity-cms` / `sanity-cms-alt` | `cms` (ny) | **Promota EN.** Droppa `app/layout.tsx` (ge som guidance); re-root `@/sanity/lib/*` → `@/lib/sanity/*`; `getSanityClient()`-factory; `server-only` på token-modulen; separera publik/draft-klient |
| `paddle-billing` | `subscriptions` (ny, ≠ `payments`) | Re-root `@/utils/*` → `@/lib/*`; lazy `supabaseAdmin`; ogiltig signatur → 400/401 (ej 500); kräver `subscriptions`-tabell + user↔Paddle-mappning i host-appen |
| `supabase-auth` | `supabase-auth` (ny; får EJ konkurrera med `auth`) | Re-root `@/utils/supabase/*` → `@/lib/supabase/*`; sanera öppen `next`-redirect (bara same-origin `/`); `getAll/setAll`-cookie-pattern; lazy env-guard |
| `rag-chat` | `rag-chat` (ny) | Lazy OpenAI + Postgres; anpassa chat-route till host-appens AI SDK-major; **beror på DB** (pgvector + `documents`/`document_chunks`-tabeller + migrationer) |

Källor per dossier: `dossiers-prospect/<legacyId>/_v2-draft/REVIEW.md` (checklista)
+ `normalization-report.json` (fulla `concerns` + `requiredCodeChanges`).
`<legacyId>` ≠ `targetId` — mappningen står i `prospects.json`.

## Arbetsordning

### Fas A — verifiera verktyget ✅ (2026-07-08, PR med dashboard-charts)
1. ~~`npm run dossiers:validate-all` grön på master.~~ ✅ grön (26 dossiers, inkl. nya).
2. Backoffice → Dossiers → **Legacy-import**: tabellen visar 12 prospects. (Ej UI-verifierad — CLI-vägen använd i stället.)
3. Valfritt: `npm run dossiers:normalize-legacy -- --all --force` (regenererar
   utkast med senaste normalizer inkl. plan-coerce; ~10 min, OpenAI-kostnad).
   **Ej körd** — öppet beslut #3 kvarstår.

### Fas B — första promotion (proof of loop): `dashboard-charts` ✅ MERGAD (PR #422, `ed438a5a`)
1. ~~Promota~~ ✅ `_v2-draft/` kopierad → `data/dossiers/soft/dashboard-charts/`
   (manifest, instructions, components — REVIEW.md medvetet utelämnad, mönster
   från befintlig pool).
2. ~~validate-all + capability-map~~ ✅ båda gröna/regenererade (25 capabilities, 26 dossiers).
3. ~~Wire capability~~ ✅ brief-schema + prompt (`site-brief-generation.ts`),
   vokabulär med vetoes för analytics-providers/flödesscheman/chart-libs
   (`follow-up-capability-vocabulary.ts`), regressionstester
   (`follow-up-capability-detection.test.ts` + `dep-completer.test.ts`), samt
   `@visactor/react-vchart` i `KNOWN_PACKAGES` (`dep-completer.ts`).
4. **Bot-runda avklarad:** Bugbot (2 medium) + Codex (3×P1, 1×P2) + Vercel VADE
   (P2) — alla åtgärdade i uppföljningscommits. Notabelt P1: `VisactorChart`
   propen `option` → `options` (react-vchart-kontrakt); `lastVerified`
   false-green återställd.
5. Preview-test: **ÅTERSTÅR (enda öppna punkten)** — generera sajt i prod/preview
   som explicit ber om dashboard/charts, bekräfta att `dashboard-charts` valdes
   (via `/logg`), bumpa sedan `lastVerified` → dagens datum i
   `data/dossiers/soft/dashboard-charts/manifest.json`.

### Fas C — databas-vågen ✅ MERGAD (PR #445, våg 2, 2026-07-08)
1. ~~Kodfixar~~ ✅ lazy `getDb()`/`getSql()`/`getMongoClientPromise()`, schema-path,
   drizzle.config-emission, users/posts-exemplet ersatt med markerad rewrite-target.
2. ~~F2-degradering~~ ✅ beslut #1 landade som **seed-fallback-kontraktet**:
   `isDbConfigured()` (avvisar preview-/placeholder-stubbar) + `seedData` +
   `<DbConfigNotice />` + 503-health-route. `database` F2-mutas via
   server-filregeln i `dossierRequiresF3` (medvetet, regressionslåst).
3. ~~Taxonomi~~ ✅ `postgres-drizzle` är default (utan `relevanceKeywords` — den ÄR
   fallbacken); syskon väljs via manifest-`relevanceKeywords` i
   `selectDossiersForRequest`. `needsDatabase` broas i `capability-dossier-bridge`.

### Fas D — resterande prospects, kuraterat (EN i taget)
Ordning: `sanity-cms` (välj en källa — öppet beslut #2) →
`paddle-billing`/`supabase-auth` → `rag-chat` sist (störst yta).

### Fas E — produktförbättringar (ej legacy, ej påbörjade)
| Uppgift | Detalj |
|---|---|
| **F2 dossier-synlighet** | ✅ **(b) F2-mute-luckan fixad via #439** — `dossiers/route.ts` reconciliar nu snapshot-floor mot obruten brief-intent (`briefSummary.requestedCapabilities`) + fil-detektion, så F2-mutade/planerade capabilities (payments, auth, contact-form …) inte längre försvinner ur panelen. Kvar (nit): (a) count-badge tom tills klick (lazy fetch). Filer: `src/app/api/engine/chats/[chatId]/dossiers/route.ts`, `src/lib/builder/dossier-overview.ts`, `PreviewPanelDossiers.tsx`. |
| **Nya soft-dossiers från scratch** | `maps-location`, `booking` (embed-mönster, F2-kompletta), `seo-jsonld`, `cookie-consent`. Ingen bra legacy-källa — skriv smala soft-dossiers direkt. |

## Kommandon

```powershell
node scripts/dossiers/inventory-legacy.mjs                  # inventera arkivet (read-only)
npm run dossiers:normalize-legacy -- --only=<legacyId>      # normalisera en
npm run dossiers:normalize-legacy -- --all [--force]        # alla
npm run dossiers:validate-all                               # efter promotion
npm run dossiers:capability-map:write
npx vitest run src/lib/gen/dossiers/
```

## Kontrakt / lässtoff

- `docs/contracts/dossier-system.md`, `src/lib/gen/dossiers/` (runtime)
- `docs/schemas/strict/dossier.schema.json` (manifest-schema)
- F3-signal: `dossierRequiresF3()` i `src/lib/gen/dossiers/types.ts`
- F2-mute: `getF2MutedIntegrationCapabilities()` i `src/lib/gen/orchestrate.ts`
- Ny capability = tre steg: manifest i pool → capability-map → brief + vocabulary.

## Rör inte

- `publicerings-material/` (användarens personliga, oträckade material — committa ej).
- Batch-import av alla 12 på en gång — kurera en i taget.
- PR #346 openclaw (`[HOLD - MERGA INTE]`, draft).

## Öppna beslut (fråga användaren vid behov)

1. ~~F2 DB-mock~~ ✅ AVGJORT (PR #445): statisk seed — `seedData` +
   `<DbConfigNotice />` + 503-health; `database` F2-mutas via server-filregeln.
2. Sanity: vilken av de två källorna promotas som `sanity-cms`?
3. Ska `--all --force` köras före promotion av de 5 kvarvarande (utkasten
   genererades före Codex-fixarna — giltiga men ej plan-coercade)?

## Definition of done (per dossier)

- [ ] Kodfixar från REVIEW applicerade
- [ ] Promoterad till `data/dossiers/<class>/<id>/`
- [ ] `dossiers:validate-all` grön + capability-map regenererad
- [ ] Capability wired i brief (+ vocabulary)
- [ ] Minst ett preview/generate-test som väljer dossiern
- [ ] `lastVerified` uppdaterad
