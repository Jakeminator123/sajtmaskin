---
status: done (etapp 1–6 levererade 2026-07-12 i PR #498/#499/#500; etapp 7 UPPLÅST med ägar-OK 2026-07-12 — blockers under fix, se etapp 7-sektionen. Obs: "100 % klart" avser etapp 1–6; det ursprungliga end-to-end-målet — vilande riktig integrationskod i F3 utan nycklar — är klart först när etapp 7 levererats.)
owner: orchestrator-agent (chatt 2026-07-12)
created: 2026-07-12
topic: Dossier-grupper (10 st) + fallback-kontrakt (per capability, skärpt till per-dossier 2026-07-12) — docs/UI/backoffice/CI-invariant + upplåst F3-runtime-etapp
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
har en default-dossier med meningsfullt mock-läge (skärpt 2026-07-12 till
**varje** hard-dossier), (c) backoffice-gruppvy med
lägg-till/ta-bort inom kategori, (d) docs/terminologi/tester synkas. Runtime-
kontraktet i F3 (etapp 7) var initialt spärrat bakom öppna backlogposter —
**upplåst med ägar-OK 2026-07-12**, se etapp 7-sektionen.

## Låsta beslut (ägare, 2026-07-12)

| # | Beslut |
|---|---|
| B1 | Trenivåmodell: **Grupp** (UI-rubrik, styr aldrig selektion) → **Capability** (exakt funktion, styr dossier-val) → **Dossier/provider** (implementation; flera per capability, en är default). `hard`/`soft` förblir en teknisk egenskap hos dossiern, inte en kategori. |
| B2 | Inget nytt schemafält för grupp. Grupp härleds från capability via mappning i `dossier-groups.ts` (kanonisk källa). Selektionen förblir platt och capability-driven ("No embeddings. No fuzzy matching. No category boost."). |
| B3 | **Fallback per capability, inte per provider.** Capabilityns standard-demo = default-dossierns (`defaultForCapability`) `mock`-läge. Providers under samma capability delar demo-ytan (`DbConfigNotice`, `IntegrationConfigNotice` m.fl.). **Skärpt 2026-07-12 (nytt ägarbeslut):** demo-MÖNSTRET är fortsatt gemensamt per capability, men mock-kravet gäller **varje** hard-dossier (CI-invarianten kontrollerar alla providers, inte bara defaulten). |
| B4 | **Ingen SQLite-fallback.** Seed-data-linjen behålls (native-build-risk på preview-VM; ingen tyst provider-ersättning). SQLite får ev. bli en egen explicit valbar `database`-dossier senare. |
| B5 | Placeholder-/mockvärden räknas aldrig som riktig konfiguration, persisteras aldrig som användar-secrets och skickas aldrig till riktig deploy (bekräftar befintligt kontrakt i `dossier-system.md`). |
| B6 | Nya behov blir nya **capabilities i befintliga grupper** (t.ex. framtida `maps`), inte nya grupper. Grupplistan hålls på 10. |
| B7 | Etapp 7 (F3-runtime-kontraktet) startas inte förrän inträdeskriterierna nedan är uppfyllda + nytt ägar-OK. **Uppfyllt 2026-07-12:** ägar-OK gavs; kriteriernas status i etapp 7-sektionen. |

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

## Fallback-invarianten (etapp 4, kärnan i kontraktet; skärpt per-dossier 2026-07-12)

> **Varje hard-dossier** i en icke-undantagen capability ska ha `mock ≠ none`,
> och varje hard-capability ska ha exakt en upplösbar default-dossier —
> **om inte** capabilityn står på den dokumenterade undantagslistan
> (funktioner som inte kan mockas meningsfullt: betalning/inloggning/realtid
> visar `IntegrationConfigNotice`; analytics self-disablar via `warn-only`).
> *(Ursprungligen gällde mock-kravet bara capabilityns default-dossier;
> skärpt till per-dossier på ägarbeslut 2026-07-12 — "allt ska vara lika för
> alla hard dossiers".)*

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

### Etapp 5 — Backoffice: kategorivy + hantering (Sonnet 5, Opus 4.8 vid behov) — PR C ✅ levererad i PR C

| Akt | Vad | Verifiering |
|---|---|---|
| 5.1 | Undvik TS/Python-dubbelunderhåll: utöka `scripts/dossiers/regenerate-capability-map.ts` så den genererade vyn i `_index/` även bär grupp per capability (grupp-kartan förblir kanonisk i `dossier-groups.ts`) | ✅ Nytt toppnivåfält `groups` (`{ "<group-id>": { label, capabilities[] } }`, `DOSSIER_GROUP_ORDER`-ordning) byggt i `regenerate-capability-map.ts` via import av `DOSSIER_GROUP_ORDER`/`resolveDossierGroup`. `npm run dossiers:capability-map:write` regenererad och diff-kollad — matchar plans grupptabell exakt (10 grupper, `other` tom). |
| 5.2 | `backoffice/pages/dossiers.py`: gruppvy (dossiers listade per kategori); skapa ny dossier inom vald kategori (förifylld capability); radera med checklista per `dossier-rules.mdc` (capability, defaultForCapability, envVars, dependencies, capability-map) | ✅ **Gruppvy:** ny checkbox i "Lista"-fliken grupperar raderna per dossier-grupp (läser `groups` från capability-map.json — ingen Python-kopia av mappningen; fallback-varning om vyn saknas). **Skapa inom kategori:** "AI-kuration"-fliken (den faktiska skapa-flödet) har fått en grupp→capability-väljare (+ fritt fält för ny capability) som patchar draftens `capability` efter kurationen, plus en textpåminnelse om mock-invarianten (hänvisar till `MOCKLESS_CAPABILITY_EXCEPTIONS`, hårdkodar inte listan). "Capability map"-fliken visar nu även en tabell över grupperna och kör om via `npm run dossiers:capability-map:write` (subprocess) i stället för en egen Python-implementation. **Radera:** ny "Radera dossier"-sektion i Redigera-fliken (ägarkravet "ta bort inom kategori"): dossier-rules-checklistan renderas med konkret läges-info (syskon under capabilityn, default-flytt-varning, envVars/deps, capability-map-påminnelse) + kryssad bekräftelse + exakt id-inmatning innan `shutil.rmtree`; återställbart via git före commit. |
| 5.3 | Regenerera capability-map + `npm run dossiers:validate-all` | ✅ Båda gröna (36/36 dossiers, 33 capabilities). Dessutom: `npx vitest run src/lib/builder/dossier-groups.test.ts` (7/7), `npm run backoffice:test` (52/52), typecheck (0 fel), `python -m py_compile backoffice/pages/dossiers.py` (0 fel). |

### Etapp 6 — Builder-UI ✅ (noll kodarbete, verifierad 2026-07-12)

| Akt | Vad | Verifiering |
|---|---|---|
| 6.1 | Bekräfta att `PreviewPanelDossiers` renderar de 10 grupperna korrekt efter etapp 3 (förväntas automatiskt) | ✅ **catalog/API- och komponenttest** (precisering efter coach-review — inget visuellt browser-test av panelen gjordes): `GET /api/dossiers/catalog` mot lokal dev-server gav alla 9 icke-tomma grupper i `DOSSIER_GROUP_ORDER`-ordning med rätt labels (tomma `other` utelämnas korrekt); komponent-/API-tester 50/50 gröna |
| 6.2 | UI-copy-svep: "Byggblock" i användarsynlig text, svenska labels, inga "dossier" i user-copy | ✅ kodläsning: all user-copy i `PreviewPanelDossiers.tsx` använder "Byggblock"; `dossier` förekommer bara i kodidentifierare/API-paths (per terminologiregeln) |

### Etapp 7 — F3-runtime-kontrakt — UPPLÅST (ägar-OK 2026-07-12), pågår

**Ägar-OK gavs 2026-07-12** ("du får ändå mitt OK"). Inträdeskriteriernas status:

1. P1 F3 ReleaseGate TOCTOU → ✅ **fixad i PR #504** (lease före readiness, EN filläsning under lease trådad till readiness/export/verify/promotion, fail-closed 503 på lease-fel, false-RED-guard för pre-verify-fel).
2. P2 capability-provenance → **ägarbeslut 2026-07-12: accepterad som deferred.** Tombstone-lagret från #494→#497 + rund-scopad filtrering är tillräcklig mitigering nu; den kanoniska `CapabilityIntentDelta`-refaktorn tas som eget initiativ när området rörs nästa gång. Splittrat ägarskap kvarstår som känd, dokumenterad risk (backlograden behålls, F3-frysen hävd).
3. `BB#f3det1` (+ syskonet `BB#f3det2`) → ✅ **fixade i PR #503**.

| Akt | Vad | Status |
|---|---|---|
| 7.1 | Verifiera backlog-status mot `BUG-SWARM-BACKLOG.md § Aktiv kö` | ✅ 2026-07-12 (P1 + f3det1/2 fixade i #503/#504, provenance ägarbeslutad-deferred) |
| 7.2 | Designnotat: "F3 utan nycklar installerar vilande integrationskod" | ✅ 2026-07-12 — se designnotatet nedan |
| 7.3 | Implementation + tester | **Kärnan levererad** (#503: approve-injektionsvägen; #504: race-fri ReleaseGate). **Residualscope öppet:** acceptanskriteriernas beteendetester per hard-dossier + aktivering-utan-regenerering-verifiering (E2E). |

### Designnotat 7.2 — "F3 utan nycklar installerar vilande integrationskod" (levererat 2026-07-12)

**Kontraktet.** När användaren godkänner en integrations-provider i F3 utan att
ha riktiga nycklar ska systemet ändå installera den RIKTIGA integrationskoden
(dossierns verbatim-filer + wiring) i en ny F3-version — vilande, ärligt
degraderad enligt dossierns `mock`-läge/config-notis — så att ifyllda nycklar
senare bara *aktiverar* koden utan ny strukturell generering.

**Beslutslogik (implementerad i #503).** Den deterministiska F3-vägen (#493,
`f3_deterministic_release_required` 409 → exakt-fil-fork utan LLM) gäller
enbart no-build-key-parents UTAN nya providers. En approve-continuation
undantas när `approveRoundNeedsDossierInjection` är sann: någon godkänd
provider (marker-providers, annars persisterade snapshot-providers) mappar via
`mapProviderKeysToBackingDossierIds` (strikt id-/dependency-matchning, samma
suppression som capability-varianten) till en backing-dossier vars filer
SAKNAS i parent-versionen per den kanoniska version-presence-signalen
(`resolveDossierIdsPresentInVersion`) — dossier-ID-granularitet, så en
närvarande syskon-dossier aldrig tillfredsställer en nygodkänd provider.
Durabla snapshot-approvals (`f3ApprovedCapabilities`, utan provider-identitet)
jämförs på capability-nivå. Rundan går då den vanliga LLM-/dossier-vägen:
dossier-injektion, kreditgate (`prepareCredits`), #374-graceful-kontraktet
(placeholders OK, inga riktiga anrop).

**Env-policyn (medveten, bekräftad vid Codex-triage på #503).** Nygodkända
providers env-gate:as INTE vid bygget — bygg-med-placeholders + ReleaseGate
412 vid release är kontraktet (endast `clerk-auth` har build-nycklar, och dess
middleware key-gate:ar sig själv). Att blockera vid bygget skulle hindra exakt
den vilande-kod-installation som är målet.

**Aktivering.** Ifyllda nycklar via env-panelen träffar den redan installerade
koden: `feature-runtime`-nycklar aktiverar direkt vid nästa runtime-anrop;
`build`-nycklar släpper ReleaseGate-412:an. Ingen ny generering krävs.

**Residual (öppet 7.3-scope, ägs av acceptanskriterierna nedan):**
beteendetester per hard-dossier (montera utan konfiguration → ingen krasch,
placeholder-igenkänning, inga riktiga provider-anrop, ärlig notis) utöver
dagens `dossier-config-fallback`-mönster, samt en E2E-verifiering av
aktiverings-flödet. Kända P3-residualer från granskningen: Phase B:s
persist-före-consume-asymmetri och exempted-telemetrins prod-synlighet
(loggade i backloggen).

**Acceptanskriterier för etapp 7 (tillagda efter coach-review 2026-07-12):**

- Demo-ytan får vara gemensam per capability, men **säker degradering ska bevisas per hard-dossier/provider** — även icke-default providers och capabilities på undantagslistan:
  1. kan monteras/byggas utan krasch när konfiguration saknas,
  2. känner igen saknad/placeholder-konfiguration,
  3. gör aldrig riktiga provider-anrop med placeholder-värden,
  4. visar ärlig config-notis eller self-disable.
- Metadata-fältet `mock` räcker inte som bevis — beteendet ska täckas av tester (utöka `dossier-config-fallback`-testmönstret till samtliga hard-dossiers).
- F3 utan nycklar producerar en version som innehåller den riktiga integrationskoden (vilande), och ifyllda nycklar aktiverar den utan ny strukturell generering.

## Definition of done (hela planen, exkl. etapp 7) — ALLA UPPFYLLDA 2026-07-12

- [x] 10 grupper i `dossier-groups.ts` + test grönt; builder-popovern visar dem (catalog/API- och komponenttest, etapp 6)
- [x] Glossary/terminology/dossier-system.md speglar grupp vs capability + fallback-kontraktet (PR #498 + #499)
- [x] CI-invariant: hard-capability ⇒ default-dossier med mock ≠ none (eller dokumenterat undantag); `dossiers:validate-all` grönt. **Skärpt 2026-07-12 (ägarbeslut): per-dossier** — varje hard-dossier i icke-undantagen capability kräver mock ≠ none.
- [x] Backoffice: kategorivy + genererad gruppvy i `_index/` (etapp 5). Lägg-till (skapa inom kategori) och ta-bort (radera med checklista + id-bekräftelse) levererade.
- [x] `npm run typecheck` + `npm run lint` + `npx vitest run` gröna per PR; `/granska` + bugbot-postcheck körda och triagedokumenterade på alla tre PR:er (#498, #499, #500)
- [x] Planen flyttad till `docs/plans/avklarat/`; etapp 7 UPPLÅST 2026-07-12 (ägar-OK + inträdeskriteriernas status dokumenterad i etapp 7-sektionen)
