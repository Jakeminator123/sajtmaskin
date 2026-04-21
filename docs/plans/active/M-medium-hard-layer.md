---
id: medium-hard-layer
title: LLM-kedjan — Medelsvåra (M1–M4)
status: planerad
created: 2026-04-21
priority: medium
parent_plan: .cursor/plans/llm-chain-cleanup-2026-04-21.md
parallel_safe_with: [easy-medium-layer]
blocked_by: []
estimated_total_effort: ~16–22 timmar
suggested_session: en hel dag fri eller dedikerat cloud-pass
---

# Medelsvåra (M1–M4)

Var och en kräver mer eftertanke och testning än E-lagret, men de är fortfarande kirurgiska. Inget kräver flera dagars arbete. Två av fyra är blockerade på telemetri-data (vänta tills ~2026-04-27 för stabil slutsats).

---

## M1 — Konsolidera `content-site` → `landing-page`

**Status:** Klar att börja (ej blockerad).

**Problem (`scaffold-system.md` §2.1):** Båda har `siteKind: marketing`, `complexity: medium`, samma `allowedBuildIntents`. `content-site.description` säger "Great for landing pages, portfolios, and blogs" — direkt överlapp. `LANDING_KEYWORDS` och `CONTENT_KEYWORDS` delar 7 ord. `content-site` har 1 variant (`warm-editorial`), `landing-page` har 5.

**Lösning:**
1. Flytta `warm-editorial` som 6:e variant under `landing-page`.
2. Ta bort `content-site`-scaffolden från registry.
3. Migrera matcher-regler — addera `content-site`-keywords till `LANDING_KEYWORDS`.
4. **Migration för existerande chats** med `scaffoldId: "content-site"`:
   - SQL-migration: `UPDATE engine_chats SET orchestration_snapshot = jsonb_set(orchestration_snapshot, '{scaffoldId}', '"landing-page"') WHERE orchestration_snapshot->>'scaffoldId' = 'content-site';`
   - Eller en runtime-fallback i `getScaffoldById` som mappar gamla id:t (bakåtkompat).

**Filer:**
- `src/lib/gen/scaffolds/registry.ts`
- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/content-site/` (radera)
- `config/scaffold-variants/warm-editorial.json` → `config/scaffold-variants/landing-page-warm-editorial.json`
- `src/lib/gen/scaffolds/matcher.ts`
- `src/lib/db/migrations/` (ny migration)

**Acceptansgränser:**
- 0 träffar på `"content-site"` i kod-sökning efter migration.
- Existerande chats med gammalt scaffold-id resolveras till landing-page.
- Eval-svit unchanged eller bättre.

**Effort:** 4 h kod + 1 h test/migration.

---

## M2 — Fyll dossier-poolen (5–10 nya dossiers)

**Status:** Klar att börja (förutsätter att A1+A2-fixen från idag faktiskt lever).

**Problem (`docs/architecture/dossier-system.md`):** Bara **3 dossiers existerar** idag (`stripe-checkout`, `openai-chat`, `pricing-tier-table`). Utan en bredare pool är A1+A2-fixen (capability-driven dossier-pick på follow-up) tom optimering — det finns inget att välja.

**Lösning:** Kör `npm run dossiers:curate -- --reference=<id> --class=<hard|soft> --id=<id>` för:

| Capability | Reference (förslag) | Class | Effort |
|-----------|--------------------|-------|--------|
| `auth` | `clerk-nextjs-starter` | hard | 1 h |
| `database` | `drizzle-postgres-starter` | hard | 1 h |
| `analytics` | `posthog-nextjs` | hard | 1 h |
| `forms` | `resend-form-handler` | hard | 1 h |
| `cms` | `sanity-nextjs-blog` | hard | 1 h |
| `i18n` | `next-intl-app-router` | soft | 1 h |
| `email-marketing` | `resend-broadcast` | hard | 0.5 h |
| `feature-flags` | `vercel-flags` | soft | 0.5 h |

Per dossier: review draft i backoffice → fix `instructions.md` → bekräfta `lastVerified`. AI-curaten är draft, inte produktionsmoget.

**Filer:**
- `data/dossiers/{hard,soft}/<id>/manifest.json`
- `data/dossiers/{hard,soft}/<id>/instructions.md`
- `data/dossiers/_index/capability-map.json` (regenereras via backoffice)
- `data/template-references/repos/<id>/` (klona referens-repon först)

**Acceptansgränser:**
- Pool går från 3 → 8–13 dossiers.
- Capability-map täcker minst: `payments`, `auth`, `database`, `analytics`, `forms`, `cms`, `i18n`, `ai-chat`, `pricing-section`.
- Nya dossiers passerar parity-tester.

**Effort:** 6–8 h (1 h per dossier inkl. review).

---

## M3 — Konsolidera 5 cross-file-import-fixers

**Status:** **Blockerad på telemetri** (vänta till ~2026-04-27 för stabilt fixer-call-data).

**Problem (`mental-model-vs-actual-flow.md` §3):** Fem fixers under "Cross-file import-rekonciliering": `local-symbol-import-fixer`, `local-named-import-default-fixer`, `local-default-import-fixer`, `import-declaration-conflict-fixer`, `duplicate-import-binding-fixer`. Kanske några aldrig fyrar.

**Lösning:**
1. Läs `sajtmaskin_fixer_call_total{fixer}` över 1 vecka från `/api/metrics`.
2. Identifiera dead-fixers (< 5 anrop på 1 vecka i prod-trafik).
3. Konsolidera 2–3 kvarstående till en tabelldriven generic-fixer ELLER ta bort dead-fixarna direkt.

**Filer:**
- `src/lib/gen/autofix/common-import-fixer.ts` (sannolik konsoliderings-target)
- `src/lib/gen/autofix/rules/duplicate-import-binding-fixer.ts`
- `src/lib/gen/autofix/pipeline.ts` (ta bort eller konsolidera kall)

**Acceptansgränser:**
- Telemetri visar samma totala fix-frekvens (per kategori, inte per fixer-namn).
- Eval-svit: ingen regression.
- 5 fixers → 2–3.

**Effort:** 4 h efter telemetri-fönster.

---

## M4 — `syntaxFixPasses: 1` i manifest

**Status:** **Soft-blockerad** — kräver eval-validering (men kan göras direkt).

**Problem (LLM-flöde-rapporten):** Idag `syntaxFixPasses: 3` (pro) eller `4` (max/codex). Loop-buggen är fixad sedan Wave 3 (2026-04-20), så fler pass tjänar inte mer i värsta fallet — bara slänger LLM-anrop.

**Lösning:**
1. Ändra `manifest.json` `repairPolicies.<tier>.syntaxFixPasses` till 1 över alla tiers.
2. Kör `npm run eval` baseline → med ändring. Bekräfta att score inte regrerar > 5%.
3. Om regression: backa.

**Filer:**
- `config/ai_models/manifest.json`

**Acceptansgränser:**
- Eval-score inom 95% av baseline.
- `sajtmaskin_fixer_call_total{phase="syntax"}`-frekvens minskar 50–66% per run (mätbart).

**Effort:** 1 h ändring + 2 h eval-validering.

---

## Rekommenderad körordning

1. **M1** (5 h) — fristående, snyggt jobb. Kan göras nu.
2. **M2** (6–8 h) — kritiskt för A1+A2-fixen ska bära frukt. Kan göras nu.
3. **M4** (3 h) — gör efter att telemetri-grunden bekräftat värstafall är ovanligt. Kan göras nu om man vågar.
4. **M3** (4 h) — vänta på telemetri-fönster (~2026-04-27).

**Total:** 18–20 h. Lämpar sig för en hel dag fri ELLER ett cloud-pass över 2 sessioner.
