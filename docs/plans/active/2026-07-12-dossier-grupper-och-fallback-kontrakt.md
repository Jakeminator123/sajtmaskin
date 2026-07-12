---
status: active
owner: orchestrator-agent (chatt 2026-07-12)
created: 2026-07-12
topic: Dossier-grupper (10 st) + fallback-kontrakt per capability — docs/UI/backoffice/CI-invariant, med spärrad F3-runtime-etapp
source: Ägardialog 2026-07-12 (inkl. extern coach-analys, verifierad mot master 61cfd7f / PR #490–#497 + BUG-SWARM-BACKLOG)
---

# Dossier-grupper och fallback-kontrakt — orkestreringsplan

## TL;DR

Ägarens mål: ett enhetligt kontrakt för integrationer — varje (hard-)dossier ska
kunna **visas som demo utan nycklar (F2)**, **byggas utan att krascha (F3 utan
konfiguration)** och **bli riktig när användaren fyller i det som saknas**.
Plus: ~10 användarvänliga **grupper** ("kategorier") ovanpå de precisa
capabilities, som backoffice och builder-UI kan administrera/visa.

Leveransen kräver **ingen ny schema-dimension**: grupper är presentations-lager
(kanonisk mappning i `src/lib/builder/dossier-groups.ts`; utökad 9 → 10 i
etapp 3), fallbacken finns
redan som `mock`-fältet per dossier. Det nya är: (a) 10-grupplistan beslutas och
implementeras, (b) en CI-invariant som **garanterar** att varje hard-capability
har en default-dossier med meningsfullt mock-läge, (c) backoffice-gruppvy med
lägg-till/ta-bort inom kategori, (d) docs/terminologi/tester synkas. Runtime-
kontraktet i F3 (etapp 7) är **spärrat** bakom öppna backlogposter.

## Låsta beslut (ägare, 2026-07-12)

| # | Beslut |
|---|---|
| B1 | Trenivåmodell: **Grupp** (UI-rubrik, styr aldrig selektion) → **Capability** (exakt funktion, styr dossier-val) → **Dossier/provider** (implementation; flera per capability, en är default). `hard`/`soft` förblir en teknisk egenskap hos dossiern, inte en kategori. |
| B2 | Inget nytt schemafält för grupp. Grupp härleds från capability via mappning i `dossier-groups.ts` (kanonisk källa). Selektionen förblir platt och capability-driven ("No embeddings. No fuzzy matching. No category boost."). |
| B3 | **Fallback per capability, inte per provider.** Capabilityns standard-demo = default-dossierns (`defaultForCapability`) `mock`-läge. Providers under samma capability delar demo-ytan (`DbConfigNotice`, `IntegrationConfigNotice` m.fl.). |
| B4 | **Ingen SQLite-fallback.** Seed-data-linjen behålls (native-build-risk på preview-VM; ingen tyst provider-ersättning). SQLite får ev. bli en egen explicit valbar `database`-dossier senare. |
| B5 | Placeholder-/mockvärden räknas aldrig som riktig konfiguration, persisteras aldrig som användar-secrets och skickas aldrig till riktig deploy (bekräftar befintligt kontrakt i `dossier-system.md`). |
| B6 | Nya behov blir nya **capabilities i befintliga grupper** (t.ex. framtida `maps`), inte nya grupper. Grupplistan hålls på 10. |
| B7 | Etapp 7 (F3-runtime-kontraktet) startas inte förrän inträdeskriterierna nedan är uppfyllda + nytt ägar-OK. |

## De 10 grupperna (kanonisk lista)

Mappningen nedan täcker samtliga 33 capabilities i dagens pool (36 dossiers).
Ändring mot de tidigare 9 grupperna: "Innehåll & sektioner" delas i innehåll vs
visuellt/interaktion; `cms` flyttas från innehåll till Data & lagring.

| # | Grupp-id | Svensk label | Capabilities |
|---|---|---|---|
| 1 | `data-storage` | Data & lagring | `database`, `cms` |
| 2 | `payments` | Betalningar | `payments`, `subscriptions` |
| 3 | `auth` | Inloggning & konton | `auth`, `supabase-auth` |
| 4 | `ai` | AI | `ai-chat`, `ai-tool-calling`, `rag-chat`, `image-generation` |
| 5 | `email` | E-post & utskick | `contact-form`, `newsletter-subscribe` |
| 6 | `analytics` | Analys & övervakning | `analytics`, `error-tracking` |
| 7 | `realtime` | Realtid | `realtime` |
| 8 | `content` | Innehåll & sektioner | `cta-section`, `faq-section`, `pricing-section`, `testimonials-section`, `feature-grid`, `logo-cloud`, `stats-counter`, `stepper` |
| 9 | `visual-interaction` | Visuellt & interaktion | `carousel`, `marquee`, `gallery-lightbox`, `parallax-scroll`, `parallax-pointer`, `visual-3d`, `physics-3d`, `interactive-game`, `dashboard-charts`, `command-search` |
| 10 | `other` | Övrigt | (fångstnät för omappade capabilities) |

## Fallback-invarianten (etapp 4, kärnan i kontraktet)

> Varje **hard**-capability ska ha exakt en default-dossier, och den dossierns
> `mock`-läge ska vara ≠ `none` — **om inte** capabilityn står på den
> dokumenterade undantagslistan (funktioner som inte kan mockas meningsfullt:
> betalning/inloggning/realtid visar `IntegrationConfigNotice`; analytics
> self-disablar via `warn-only`).

Utgångsförslag undantagslista (fastställd oförändrad i aktivitet 4.1):
`payments`, `subscriptions`, `auth`, `supabase-auth`, `realtime`, `analytics`,
`error-tracking`. Invarianten implementeras som ren funktion i
`src/lib/gen/dossiers/validate-manifest.ts` och wiras CI-blockerande i
`scripts/dossiers/validate-all.ts` — inte som nytt schemafält.

## Orkestrerings- och modellplan

Huvudagenten (denna chatt) orkestrerar: startar subagenter, verifierar resultat,
gör småjusteringar mellan leveranser själv, triagerar fynd.

| Roll | Modell (Cursor-slug) |
|---|---|
| Read-only utforskning, rapportering, review-svärmar | `composer-2.5` (ej -fast/-max). Undantag: `/granska`-skillen använder per sin definition 8× `composer-2.5-fast`. |
| Implementation låg–medel (docs, gruppmapp, UI, backoffice) | `claude-sonnet-5-thinking-high` |
| Tungt/kontraktsnära (CI-invariant, validate-all, etapp 7) | `claude-opus-4-8-thinking-xhigh` — **default vid osäkerhet** |
| Sällsynt: svår tväryta/arkitektur | `claude-fable-5-thinking-xhigh` |
| Orkestrering, mellanfixar, verifiering | huvudagenten |

Arbetsregler:

- **En skrivande etapp i taget** (delad checkout, `agent-worktree.mdc`); parallella skriv-agenter kräver egen worktree. Read-only-svärmar får köra parallellt.
- Varje etapp levereras som **liten PR mot master**: `/granska` före push/PR, bugbot-postcheck, `review-window` ≥ 7 min, triage av alla fynd (fixed/logged/dismissed). Ägarens start-OK för planen gäller som begäran för detta PR-flöde per etapp; allt utanför etappscope pausas och frågas.
- Docs/schemas/backoffice synkas **i samma PR** som ändringen (workflow.mdc).
- Paus + fråga vid: arkitekturbeslut utanför B1–B7, >40 filer, oklart ägarskap.

## Etapper och aktiviteter

### Etapp 1 — Beslut & plan ✅ (klar 2026-07-12)

| Akt | Vad | Status |
|---|---|---|
| 1.1 | Besluta trenivåmodell, 10-grupplista, fallback-invariant, SQLite-nej (B1–B7) | ✅ ägardialog |
| 1.2 | Detta plandokument + registrering i `docs/plans/active/README.md` | ✅ |

### Etapp 2 — Terminologi & docs (Sonnet 5) — PR A (ihop med etapp 3) ✅ levererad i PR A

| Akt | Vad | Verifiering |
|---|---|---|
| 2.1 | `docs/architecture/glossary.md`: registrera **dossier-grupp** (UI-kategori, styr ej selektion) vs **capability**; capability-nivå-fallback via default-dossierns mock | länk-/diff-koll |
| 2.2 | `.cursor/rules/terminology.mdc`: rad i förväxlingstabellen — "kategori/grupp" om dossier-UI → `dossier-grupp`, aldrig synonym med capability | — |
| 2.3 | `docs/contracts/dossier-system.md`: grupptabellen ovan + fallback-invariantens kontraktstext + undantagslistans plats | ✅ grupptabell + princip i PR A; undantagslista + CI-invariant-text kompletterad i PR B (etapp 4) |

### Etapp 3 — Gruppmapp 9→10 (Sonnet 5) — PR A ✅ levererad i PR A

| Akt | Vad | Verifiering |
|---|---|---|
| 3.1 | `src/lib/builder/dossier-groups.ts`: ny grupp `visual-interaction`; flytta 10 capabilities från `content`; `cms` → `data-storage`; uppdatera `DOSSIER_GROUP_ORDER` + labels enligt tabellen | `npm run typecheck` |
| 3.2 | `dossier-groups.test.ts`: uppdatera förväntningar (alla capabilities i capability-map → icke-"Övrigt") | riktad `npx vitest run` |
| 3.3 | Verifiera att builder-popovern (`PreviewPanelDossiers`) följer automatiskt (konsumerar gruppmappen) | kodläsning ✅ (konsumerar `DOSSIER_GROUP_ORDER`/`resolveDossierGroup` + catalog-API:t samma buckets); dev-röktest → etapp 6 |

### Etapp 4 — Fallback-invariant i CI (Opus 4.8) — PR B ✅ levererad i PR B

| Akt | Vad | Verifiering |
|---|---|---|
| 4.1 | Fastställ undantagslistan (utgångsförslag ovan); dokumentera i `dossier-system.md` | ✅ **Fastställd lista (7, ingen avvikelse från förslaget):** `payments`, `subscriptions`, `auth`, `supabase-auth`, `realtime`, `analytics`, `error-tracking`. Dokumenterad med motivering per capability i `dossier-system.md` (grupp-sektionen) + `MOCKLESS_CAPABILITY_EXCEPTIONS` i `validate-manifest.ts`. |
| 4.2 | Implementera invarianten i `scripts/dossiers/validate-all.ts` (hard-capability ⇒ default-dossier med `mock ≠ none`, annars undantag) | ✅ Ren funktion `findMissingMockFallbacks()` i `validate-manifest.ts`, wired som blockerande cross-cutting-check i `validate-all.ts`; `npm run dossiers:validate-all` grönt |
| 4.3 | Test för invarianten (bredvid `validate-manifest.test.ts`-mönstret) | ✅ 9 enhetstester + drift-guard mot live-poolen i `validate-manifest.test.ts`; `npx vitest run` grönt (35 tests i filen) |
| 4.4 | Kör invarianten mot live-poolen; åtgärda fynd (saknade/felaktiga `mock`-fält) en dossier i taget | ✅ 36 dossiers validerar. 8 hard-capabilities passerar via mock (`cms`/`contact-form`/`rag-chat`/`database`/`ai-chat`/`newsletter-subscribe`/`image-generation`/`ai-tool-calling`), 7 via undantagslistan. **Inga fynd — inga dossier-/manifest-ändringar behövdes.** |

### Etapp 5 — Backoffice: kategorivy + hantering (Sonnet 5, Opus 4.8 vid behov) — PR C

| Akt | Vad | Verifiering |
|---|---|---|
| 5.1 | Undvik TS/Python-dubbelunderhåll: utöka `scripts/dossiers/regenerate-capability-map.ts` så den genererade vyn i `_index/` även bär grupp per capability (grupp-kartan förblir kanonisk i `dossier-groups.ts`) | regenerera + diff-koll |
| 5.2 | `backoffice/pages/dossiers.py`: gruppvy (dossiers listade per kategori); skapa ny dossier inom vald kategori (förifylld capability); radera med checklista per `dossier-rules.mdc` (capability, defaultForCapability, envVars, dependencies, capability-map) | manuellt backoffice-röktest |
| 5.3 | Regenerera capability-map + `npm run dossiers:validate-all` | grönt |

### Etapp 6 — Builder-UI (Sonnet 5) — ev. noll-arbete, annars PR D

| Akt | Vad | Verifiering |
|---|---|---|
| 6.1 | Bekräfta att `PreviewPanelDossiers` renderar de 10 grupperna korrekt efter etapp 3 (förväntas automatiskt) | dev-röktest |
| 6.2 | UI-copy-svep: "Byggblock" i användarsynlig text, svenska labels, inga "dossier" i user-copy | kodläsning |

### Etapp 7 — F3-runtime-kontrakt 🔒 SPÄRRAD (Opus 4.8 / Fable 5)

**Inträdeskriterier (alla ska vara uppfyllda + nytt ägar-OK):**

1. P1 stängd: F3 ReleaseGate TOCTOU (`quality-gate/route.ts`, readiness före lease).
2. P2 capability-provenance åtgärdad eller ägarbeslutad (kanonisk `CapabilityIntentDelta`).
3. `BB#f3det1` verifierad/fixad (deterministisk F3-väg kan hoppa över dossier-injektion för godkänd provider utan build-nycklar).

| Akt | Vad |
|---|---|
| 7.1 | Verifiera backlog-status mot `BUG-SWARM-BACKLOG.md § Aktiv kö` |
| 7.2 | Designnotat: "F3 utan nycklar installerar vilande integrationskod" — approve-vägen ska gå LLM-/dossier-runda när godkänd provider saknar filer i parent-versionen |
| 7.3 | Implementation + tester (scope sätts i 7.2; egen PR) |

## Definition of done (hela planen, exkl. etapp 7)

- [ ] 10 grupper i `dossier-groups.ts` + test grönt; builder-popovern visar dem
- [ ] Glossary/terminology/dossier-system.md speglar grupp vs capability + fallback-kontraktet
- [x] CI-invariant: hard-capability ⇒ default-dossier med mock ≠ none (eller dokumenterat undantag); `dossiers:validate-all` grönt
- [ ] Backoffice: kategorivy med lägg-till/ta-bort; genererad gruppvy i `_index/`
- [ ] `npm run typecheck` + `npm run lint` + `npx vitest run` gröna per PR; `/granska` + bugbot-postcheck körda per PR
- [ ] Planen flyttad till `docs/plans/avklarat/` med etapp 7 utbruten till egen post (spärrad, i denna fil eller backloggen)
