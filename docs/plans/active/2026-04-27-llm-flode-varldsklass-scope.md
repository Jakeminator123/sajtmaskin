---
status: scope
created: 2026-04-27
trigger: /långbänk efter session 897ab640 — användarens externa review beskrev målbild i 10 lager
context_links:
  - .cursor/rules/terminology.mdc
  - docs/architecture/llm-flow-target-worldclass.md
  - docs/architecture/llm-signal-flow.md
  - docs/plans/active/2026-04-24-llm-flode-korplan/README.md
---

# LLM-flöde i världsklass — Scope 2026-04-27

Den här filen är **nästa sessions anchor**. Den summerar målbilden från extern review och kopplar varje lager till **kod-källan** + **vad som faktiskt felar idag** + **kommande spår**.

> **Ledord (extern review, parafraserad):**
> LLM får vara kreativ. Autofix får vara mekanisk. Verifier får vara skeptisk. Repair får vara försiktig. Preview får bara visa sådant som faktiskt kan köras. **UI ska aldrig ljuga om status.**

## Källa-till-sanning per lager

| # | Lager | Canonical kod | Senaste verifierade gap |
|---|---|---|---|
| 1 | Brief / intent | `src/lib/gen/site-brief-generation.ts` + `src/lib/gen/orchestrate.ts` (`requestKind`) | `requestKind` loggas men styr inte `deriveBuildSpec` (P32 Fas B) → frågor blir full regen |
| 2 | Orkestrering | `src/lib/gen/orchestrate.ts`, `src/lib/gen/scaffolds/scaffold-search.ts`, `src/lib/gen/dossiers/select.ts` | 3 olika init/follow-up-bedömningar i `orchestrate.ts` kan divergera; `inferScaffoldRetrySuggestion` får wrappad `optimizedMessage` istället för rå prompt (P26-poisoning); **Audit D (2026-04-27): cap-bridge nu utökad till 6 cap-keys** (`needs3D`, `needsParallax`, `needsPayments`, `needsAuth`, `needsCarousel`, `needsCommandSearch`); 12 övriga cap-keys förblir scaffold/system-prompt-concerns |
| 3 | LLM Codegen | `src/lib/providers/own-engine/`, `src/lib/gen/system-prompt/` | LLM får producera "Parallax" som litterärt innehåll (literal-tolkning); ingen kreativ-vs-strukturell separation i prompt |
| 4 | Deterministisk autofix | `src/lib/gen/autofix/*` | `runAutoFix.rebuildContent` global `replace` kan uppdatera fel fil; LLM-fixer balanced-delimiters kan acceptera ofullständig fil |
| 5 | Pre-VM typecheck / verifier | `src/lib/gen/preview/warm-typecheck.ts`, `src/lib/gen/verify/verifier-pass.ts` | `href-route-cross-check` är line-by-line och missar multi-line `href` (efter denna sessions broadening är detalj-regex bättre, men route-check kvar) |
| 6 | Repair-loop | `src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/repair/*` | Rollback-fixen landade 2026-04-27 (`f37dc74ed`); kvar: stale-versionId-collision under repair-pass (separat fix `e00a231ab`) |
| 7 | Persist version | `src/lib/db/chat-repository-pg.ts`, `src/lib/gen/stream/finalize-version/*` | "latest" har två definitioner (highest version-num vs recommended base) — UI-copy ljuger |
| 8 | Preview / VM | `preview-host/`, `src/lib/gen/preview/*`, `src/components/builder/preview-panel/` | Hibernate 404 nu separerad (denna session); kvar: `preview-status` kan returnera `versionId: null` för giltig version; CSP report-only-warnings blandas med build-fel |
| 9 | Diagnostics UI | `src/components/builder/preview-panel/*`, `src/components/builder/version-diagnostics/*` | "Stream had error but version returned" toastar success; client-baseline för post-check ignorerar `currentPreviewUrl` när `done` saknar URL |
| 10 | F3 / Bygg | `src/app/api/v0/deployments/route.ts`, `src/lib/deploy/*` | F3 kan triggas på blockerad F2 (mjuk varning, inte hård gate) |

## Det viktigaste styrkortet — kod-status idag

| Fråga | Mål-svar | Idag |
|---|---|---|
| Kan LLM generera fel kod? | Ja, alltid. | ✅ vi vet |
| Ska fel kod kunna bli vit preview? | Nej. | 🟡 pre-VM typecheck blockerar nu (SAJ-61), men white-page kan fortfarande uppstå om `warmTscSkipped=true` + manifest-typecheck inte fångar runtime-import |
| Ska systemet kunna laga kända mekaniska fel? | Ja. | ✅ deterministic autofix + LLM-fixer; rollback fungerar nu |
| Ska osäkra fixar gissas? | Nej. | ✅ exact-match policy i `common-import-fixer`; lokal-decl-guard adderad SAJ-61b |
| Ska gamla verifierfynd ligga kvar som aktiva? | Nej. | ✅ `verifierRerunAfterFix` finns; legacy "optimistic clear"-grenen togs bort 2026-04-27 (`7fce679c2`) |
| Ska Product Postcheck/SEO-varningar blandas med buildfel? | Nej. | 🟡 separata badges finns; men stream-success-toast triggas även med blocking findings |
| Ska F3 köras på blockerad F2? | Helst nej. | 🔴 idag tillåtet — skall ändras till **hård gate** med override-flag |

## Glasklara fynd från audit-pass (denna session) — sortering

### Levererat 2026-04-27 (commits `d8525cbd6` … `3bf9bb829`)

1. SAJ-61b verifier suppress för giltiga in-page hash-anchors + `Lane`-konflikt-test (`d8525cbd6`)
2. Docs/test refs `promptAssist.ts` → `prompt-assist/`-paket (`a95c83a6c`)
3. Manifest verifier-pass `codeEntry`-path (`76fcaa7ba`)
4. `validateAndFix` rollback till `bestContent` vid regression (`f37dc74ed`)
5. `needsPhysics` regex utvidgad för engelska flying/floating-verb (`169863855`)
6. `FEATURES.escalateMergeSyntaxToLlm = true` (`f2a3cf0b5`)
7. Batch: partial-file repair, quality-gate stillLatest-check, profile-link auth, project upload-limits (`e00a231ab`)
8. Merge-preflight escalates LLM repair på **alla** `!valid` syntax; warm-tsc/eslint exception → empty diagnostics; verifier-phase legacy "optimistic clear" borttagen (`7fce679c2`)
9. `runVerifierPass` accepterar abortSignal som verifier-phase rerun nu propagerar; preview-host hibernate 404 → `notFound: true`; F2 quality-gate route default → `DESIGN_PREVIEW_QUALITY_GATE_CHECKS` (`dded81259`)
10. **2 layout-distinkta landing-page-varianter** (`hero-fullbleed-bg`, `asymmetric-stack`) + 26→28 variant-embeddings regenererade. Adresserar Audit E-fyndet att 5/7 existerande varianter delar split-hero-topologi. Plus rate-limit på 9 oskyddade routes (oavsiktligt med-committat) (`4621dd2f4`)
11. Cap-bridge: `needsAuth` → `auth`, `needsCarousel` → `carousel`, `needsCommandSearch` → `command-search` i `orchestrate.ts` `inferredCapabilityIds`. Adresserar Audit D-fyndet att 18 cap-keys infereras men bara 3 hade dossier-bridge (`3bf9bb829`)

### Kvar — kräver designval (Wave 4 nästa session)

- **B2.1** `requestKind` styr inte `deriveBuildSpec` → frågor regen:eras (P32 Fas B). **Lösning kräver:** bestäm vilka requestKinds som ska blockera generation (t.ex. `followup_question` → ren chat-respons utan codegen) och hur UI signalerar det.
- **B2.5** 3 olika "init/follow-up"-bedömningar i `orchestrate.ts` kan divergera. **Lösning:** välj canonical signal-källa (sannolikt `messageRole` + `chatHistory.length`) och refaktorera de andra två till härledningar.
- **B2.7** `inferScaffoldRetrySuggestion` använder wrappad `optimizedMessage` (`P26`-poisoning). **Lösning:** trä raw user-prompt genom orchestration-paketet eller acceptera optimization som canonical input.
- **B3.1** "latest" tvetydigt. **Lösning:** byt UI-copy till "Senast skapad" (highest `created_at`) eller "Rekommenderad bas" (highest `preferredVersionId`-prio) — välj **en**, döp om den andra. Affecter `useSendMessage` + version-picker.
- **B3.2** `preview-status` returnerar `versionId: null` för giltig version. **Lösning:** spåra var nullen skapas — sannolikt en off-by-one i preview-status-routens cache-resolve.

### Kvar — säkerhet (Wave 5)

- **B1.1** `/api/uploads/media/*` lacks auth + `ACAO:*` (designval — VM behöver okänd origin?)
- ~~**B1.4** Missing `withRateLimit` på deploy GET/SSE/single, `quality-gate`, `repair`, `readiness`, preferences GET/PATCH, product-postcheck~~ → **landat 2026-04-27 (`4621dd2f4`)** med separata buckets per route
- **B1.5** `/api/metrics` accepterar `?token=` (visible in logs) — flytta till `Authorization`-header
- **B1.6** Quality-gate JSON returnerar full `output` (12k logs/check)
- **B1.7** 500-errors returnerar `error.message` cleartext på flera routes

### Kvar — observability/städ (Wave 6)

- **B4.1** `meta.json` saknar `previewBlockingReason` (denna session adderade `describePreviewBlockFromIssues` men sparar inte i meta)
- **B5.1** `templates_v0/`-paths hardcoded (legacy)
- **B5.2** `V0_CATEGORIES` public symbol — naming-debt, kräver namnbyte i 3 filer
- **B5.4** Två test-filer importerar gitignored embeddings-JSON utan fallback

## Eval-baseline (vad som krävs för "världsklass")

Hård e2e-gate som extern review beskrev — vad ska finnas för att vi kan säga "klart":

| Eval-prompt | Måste passera (status) |
|---|---|
| Enkel landing page | ✅ verifierat 2026-04-27 (`c018cd5e` → version `27e30084`) |
| Tvåsidig sajt med spel | 🔴 hamburgespelet kraschade i sandbox (separat preview-host crash, inte gen-fel) — kräver isolering av runtime vs gen |
| E-handel/mock products | ❓ inte testat post #109 |
| Dashboard/charts | ❓ inte testat post #109 |
| Follow-up repair | ✅ verifierat 2026-04-27 (Stripe follow-up gick repair-loop, aborterade på provider-fel — SAJ-7 fungerade) |
| F3 Bygg med SEO | ❓ separat test krävs |

**Saknade evaluatorer i kod:**

- Det finns **inte** en `npm run eval:f2-baseline` som kör 5 prompts mot dev-server och rapporterar "X/5 ready". Detta är **det** som behövs för att stoppa "fixa-en-bugg-hitta-nästa-av-samma-typ"-cykeln.
- Förslag på struktur: `scripts/eval/baseline.ts` som anropar `/api/engine/chats/[chatId]/stream` med 5 fasta promptar mot lokal dev, väntar på `done`-event, hämtar version + preview-status, skriver JSON-rapport. Kör i CI på PR mot `master` när PR rör `src/lib/gen/`.

## Anti-mönster vi inte vill upprepa

1. **Slumpmässig patchning** — varje LLM-flow-fix måste motiveras mot styrkortet ovan, inte mot "den här bugfixen finns i en review-rapport".
2. **Wide refactor blandat med bugfix** — om en commit både ändrar pipeline-arkitektur och fixar en bugg, splittra.
3. **UI-copy ändras utan att kod-semantik följer med** — t.ex. byta "latest" till "rekommenderad" utan att uppdatera DB-fält → ny tvetydighet.
4. **F3 trigger på blockerad F2** — explicit gate krävs; mjuk varning räcker inte.

## Föreslagen ordning för Wave 4–6 (nästa session)

| Wave | Fil-touch | Risk | Estimerad commit-volym |
|---|---|---|---|
| **4a** | `src/lib/gen/orchestrate.ts` (requestKind → buildSpec) | Medel — designval krävs | 1 commit |
| **4b** | `src/lib/db/chat-repository-pg.ts` + `src/lib/hooks/chat/*` (latest-semantik) | Medel — UI-copy + kod | 1-2 commits |
| ~~**5a**~~ | ~~API-routes utan rate-limit (10 routes)~~ | ~~Låg~~ | ✅ **landat 2026-04-27 (`4621dd2f4`)** |
| **5b** | `/api/uploads/media/*` auth + ACAO | Hög — designval, kan bryta VM | inte denna runda |
| **6** | `meta.json` previewBlockingReason; `templates_v0/`-städ | Låg | 1 commit |
| **Eval** | `scripts/eval/baseline.ts` MVP | Medel — kräver fixed prompt-set | 1 commit |

## Vad denna scope INTE täcker

- 3D-kvalitet (separat dossier-design)
- Brief-tid 25s (latency-spår, inte korrekthet)
- Sora/DALL-E faktisk integration
- Hela P32 (Fas A levererad; Fas B = ovan; Fas C/D framtida)
- L2 prompt-kit refactor
- Backoffice/Streamlit förbättringar utöver telemetri-sidan

## Acceptance — när är detta scope "klart"?

Detta scope-dokument är klart när **eval-baseline (`scripts/eval/baseline.ts`)** finns och **alla 6 eval-prompts passerar grönt på `master`**. Då slutar vi "fixa en bugg, hitta nästa av samma typ" och har en hård gate.

Tills dess: varje merge mot `master` som rör `src/lib/gen/` ska köra eval-baseline manuellt och länka resultatet i PR-beskrivningen.

---

**Nästa steg:** Wave 4a (`requestKind` → `deriveBuildSpec`) kräver designval från Jake (vilka requestKinds blockerar codegen). När det är beslutat går implementationen snabbt.
