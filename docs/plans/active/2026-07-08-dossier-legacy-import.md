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
12 kandidater är normaliserade — **alla accept, 0 promoterade**. Live-poolen är
oförändrad (8 hard + 17 soft). Kvarvarande arbete = promota kuraterat (en i taget,
med kodfixar + capability-wiring + preview-test), plus två produktförbättringar
(F2-synlighet av valda dossiers, nya soft-dossiers från scratch).

## Var materialet ligger

| Vad | Sökväg |
|---|---|
| Prospect-root (utanför repo, ej Cursor-indexerad) | `C:\Users\jakem\dev\projects\dossiers-prospect\` (default `../dossiers-prospect`, override `DOSSIER_PROSPECT_ROOT`) |
| Kurationsplan (låst targetId/class/capability per prospect) | `dossiers-prospect/prospects.json` |
| Rapport (verdict/concerns/kodfixar per prospect) | `dossiers-prospect/normalization-report.json` |
| Utkast per prospect | `dossiers-prospect/<legacyId>/_v2-draft/` (manifest, instructions, components, REVIEW.md) |
| Legacy-arkiv (källa, read-only) | `C:\Users\jakem\dev\projects\dossiers-legacy-2026-04-20\` |
| Live-pool | `data/dossiers/{hard,soft}/<id>/` |

## 12 utkast — status accept, väntar på promotion

| targetId | class | capability | kodfixar | prio |
|---|---|---|---|---|
| `dashboard-charts` | soft | dashboard-charts | 0 | **börja här** (enklaste promote-testet) |
| `ably-realtime` | hard | realtime | 2 | medel |
| `mongodb-atlas` | hard | database | 3 | medel |
| `fal-image-generation` | hard | image-generation | 3 | medel |
| `ai-tool-calling-chat` | hard | ai-tool-calling | 3 | medel |
| `postgres-drizzle` | hard | database | 4 | **hög produktnytta** |
| `neon-postgres` | hard | database | 4 | alt till postgres-drizzle |
| `sanity-cms-alt` | hard | cms | 4 | jämför med sanity-cms — promota EN |
| `rag-chat` | hard | rag-chat | 5 | senare (kräver DB + pgvector) |
| `paddle-billing` | hard | subscriptions | 5 | senare |
| `sanity-cms` | hard | cms | 5 | jämför med sanity-cms-alt |
| `supabase-auth` | hard | supabase-auth | 6 | senare (ej default-auth) |

Återkommande kodfix-tema (från REVIEW.md): lazy-init av SDK-klienter (aldrig på
modulnivå), re-root av `@/lib/...`-importer, 503/config-notice vid saknad env,
inga exempel-scheman i prod-kod.

## Arbetsordning

### Fas A — verifiera verktyget ✅ (2026-07-08, PR med dashboard-charts)
1. ~~`npm run dossiers:validate-all` grön på master.~~ ✅ grön (26 dossiers, inkl. nya).
2. Backoffice → Dossiers → **Legacy-import**: tabellen visar 12 prospects. (Ej UI-verifierad — CLI-vägen använd i stället.)
3. Valfritt: `npm run dossiers:normalize-legacy -- --all --force` (regenererar
   utkast med senaste normalizer inkl. plan-coerce; ~10 min, OpenAI-kostnad).
   **Ej körd** — öppet beslut #3 kvarstår.

### Fas B — första promotion (proof of loop): `dashboard-charts` ✅ (samma PR)
1. ~~Promota~~ ✅ `_v2-draft/` kopierad → `data/dossiers/soft/dashboard-charts/`
   (manifest, instructions, components — REVIEW.md medvetet utelämnad, mönster
   från befintlig pool).
2. ~~validate-all + capability-map~~ ✅ båda gröna/regenererade (25 capabilities).
3. ~~Wire capability~~ ✅ brief-schema + prompt (`site-brief-generation.ts`),
   vokabulär med vetoes för analytics-providers/flödesscheman
   (`follow-up-capability-vocabulary.ts`), regressionstester
   (`follow-up-capability-detection.test.ts`), samt `@visactor/react-vchart`
   i `KNOWN_PACKAGES` (`dep-completer.ts`).
4. Preview-test: **ÅTERSTÅR** — generera sajt som explicit ber om
   dashboard/charts; bumpa `lastVerified` efter verifierat test.

### Fas C — första hard-dossier: `postgres-drizzle`
1. Applicera de 4 kodfixarna i REVIEW.md (lazy `getDb()`, schema-path,
   drizzle.config, ta bort users/posts-exemplet).
2. Överväg F2-degradering: PGlite eller seed-mock när `DATABASE_URL` saknas
   (användarens önskan om "lättare variant" i F2 — formalisera i kontraktet).
3. Taxonomi: `postgres-drizzle` + `neon-postgres` delar capability `database`
   — exakt en får `defaultForCapability: true`.

### Fas D — resterande prospects, kuraterat (EN i taget)
Ordning: `fal-image-generation`/`ably-realtime` → `sanity-cms` (välj en källa) →
`paddle-billing`/`supabase-auth` → `rag-chat` sist (störst yta).

### Fas E — produktförbättringar (ej legacy, ej påbörjade)
| Uppgift | Detalj |
|---|---|
| **F2 dossier-synlighet** | Popover `PreviewPanelDossiers` finns men (a) count-badge tom tills klick (lazy fetch), (b) F2-mutade capabilities (payments, auth, contact-form …) syns inte alls — de filtreras ur snapshot-selektionen. Fix: visa union med status "Parkerad till F3". Filer: `src/app/api/engine/chats/[chatId]/dossiers/route.ts`, `src/lib/builder/dossier-overview.ts`, `PreviewPanelDossiers.tsx`. |
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

1. F2 DB-mock: PGlite vs statisk seed vs bara mock-UI?
2. Sanity: vilken av de två källorna promotas som `sanity-cms`?
3. Ska `--all --force` köras före promotion (utkasten, utom `mongodb-atlas`,
   genererades före Codex-fixarna — giltiga men ej plan-coercade)?

## Definition of done (per dossier)

- [ ] Kodfixar från REVIEW applicerade
- [ ] Promoterad till `data/dossiers/<class>/<id>/`
- [ ] `dossiers:validate-all` grön + capability-map regenererad
- [ ] Capability wired i brief (+ vocabulary)
- [ ] Minst ett preview/generate-test som väljer dossiern
- [ ] `lastVerified` uppdaterad
