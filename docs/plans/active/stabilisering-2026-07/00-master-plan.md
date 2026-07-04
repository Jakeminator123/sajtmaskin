---
id: stabilisering-2026-07
title: "Stabilisering 2026-07: init-grön, F3-integrationer och preview/DB-lugn"
status: active
created: 2026-07-03
priority: P1
owner: "orkestrator (Cursor-agent) + Jake (godkännare av fasstart och merge)"
sources:
  - docs/plans/avklarat/stort-framsteg-2026-07-03/ (prod-session chatId cc10e7de — notiser + slutrapport; v8-exporten ligger lokalt i gitignorerade .cursor/bugs/)
  - BUG-SWARM-BACKLOG.md § Aktiv kö (M#jsx1, M#imp1, M#pv1, M#pv2, M#db1, M#pv3 m.fl.)
  - Extern coach-review 2026-07-03 (öppna PR:er + P2-lista)
  - Kodkartläggning mot master 06351d537 (tre explore-pass 2026-07-03, fil:rad-evidens)
owner_files:
  - src/lib/gen/autofix/**
  - src/lib/gen/verify/**
  - src/lib/gen/stream/finalize-version/**
  - data/dossiers/hard/{stripe-checkout,resend-contact-form}/**
  - src/lib/integrations/**
  - src/components/builder/** (readiness/integration-ytor)
  - preview-host/** (endast C-spåret)
---

# Stabilisering 2026-07 — master-plan (nivå 1)

**Uppdrag i en mening:** gör att (1) initversionen blir grön direkt, (2) F3
("bygg integrationer") överlever hela vägen till promotad version och genererade
sajter degraderar snyggt när env-nycklar saknas, (3) preview/DB-P2:orna från
backloggen stängs — utan nya lager, genom att laga de ägare som redan finns.

**Relation till kontrollflöde-initiativet:** `kontrollflode/` är kodlevererad
(alla 7 faser, #360–#367) och väntar bara på prod-mätningen ~2026-07-10. Denna
plan är uppföljaren: den tar prod-evidensen från 2026-07-03 (chat `cc10e7de`)
och stänger de luckor som mätningen + live-sessionen exponerade. Ingen
dubbelleverans — kontrollflödets stoppregler (avsnitt 4 där) gäller även här.

**Arbetsmodell:** samma som kontrollflödet. Orkestratorn skriver agent-prompt
per arbetspaket (nivå 3, `aktiviteter/`), builder-agenter implementerar i egna
branches/worktrees och PR:ar, orkestratorn granskar + kör bugbot-postcheck,
Jake godkänner fasstart och merge.

---

## 1. Bevisläge (prod-session 2026-07-03, chat cc10e7de)

8 versioner, F2→F3, projekt "Neon Glassblowing 2400". Full evidens:
[`../../avklarat/stort-framsteg-2026-07-03/2026-07-03_slutrapport.md`](../../avklarat/stort-framsteg-2026-07-03/2026-07-03_slutrapport.md).

| Fynd | Evidens | Kodläge (verifierat mot master 06351d53) |
|---|---|---|
| Init (v1) röd direkt: `<HTMLFormElement/>` som JSX | v1, v5, v8 — 3 av 8 versioner | `dom-builtin-jsx-fixer` finns (Normalize steg 5.5 + verifier-phase pre-fix) men träffar inte; DOM-fynd exkluderas medvetet från import-repair (`parseUndefinedJsxSymbolFinding` → null). Backlog **M#jsx1** |
| F3-bygget (v8) föll: `Stripe`/`Resend`/`toast`/`Badge`/`Button` utan import | 5 blockerande fynd, alla still-failing | `ts2304-known-import-fixer` har `Stripe` (server-only) + `toast`→sonner, **saknar `Resend`**; `dep-completer` lade deps men skannar bara befintliga import-rader; varför den diagnostikdrivna vägen inte träffade v8 är **orotorsakad** |
| Auto-repair misslyckades: `[llm-fixer] aborted (AbortSignal/timeout)` | contact-route ofullständig → exkluderad → `no_improvement` | Timeout 180 s (`LLM_FIXER_TIMEOUT_MS`), retry 240 s; deterministiskt delresultat överlevde inte hela vägen; `files_json advanced` stale-guard slog också till (korrekt, men repairen landade aldrig) |
| Döda Unsplash-photo-ID återkommer varje generering | v6→v7→v8, samma `photo-1518709268805` | image-validator ersätter per pass men modellen får gamla filinnehållet i follow-up-kontext och återinför |
| Malformad UI-rad `Integration: Integration`, inga env-vars | F3 steg 1 | Fallback-namn `"Integration"` när tool-args saknar `name`/`provider` + UI-rad som prefixar `Integration:` → dubblering; möjlig dedupe-miss mellan tool-signal och post-finalize-detektion |
| Rått fel vid klick på Stripe-CTA i genererad sajt | `ReferenceError: toast is not defined`; generellt: 503 utan vänlig copy | Dossiern `stripe-checkout/instructions.md` KRÄVER disabled-state + "Configure Stripe"-tooltip — men `checkout-button.tsx` implementerar det inte; ingen delad "ej konfigurerad"-komponent finns |
| Det som fungerade | F2-mute, ReleaseGate (true-red), dossier-val, kvalitetsmål-promotion, concurrency-guard, 0 Vercel-infra-fel | Behålls — inga ändringar i dessa ägare utanför scope nedan |

**Diagnos i en mening:** en dominerande felklass — *modellen refererar symboler
den inte importerar (+ `<HTMLFormElement/>`)* — orsakar nästan alla röda
versioner; den är mekaniskt lösbar i ägare som redan finns, och F3:s sista mil
(repair-robusthet + graceful degradation i genererad kod) är det som skiljer
"nöjd användare" från "rött bygge".

## 2. Principer & stoppregler

Ärver kontrollflödets tio (F3-strikthet, promote-guard, render-risk hårda,
ingen fjärde repair-lane, ingen regex-importkirurgi utan parser/tsc-kvitto,
sopa framför egen dörr, en ägare per signal, kod är source of truth, mät
före/efter). Tillägg för denna plan:

11. **Inga nya kontrollsteg.** Varje fix landar i en befintlig ägare
    (Normalize, RepairGate, dossier, readiness-route). Om en ägare inte räcker:
    pausa och eskalera till Jake.
12. **Inline-frågorna i chatten är fredade.** `CompactToolParts`-flödet
    (integration/env/approval-knappar i chatten) får inte flyttas till
    dialog/popup. Regressionstest krävs i B-spåret.
13. **Prod-evidens är fixtur.** v8-exporten (`version-4a29c7b4.zip`) och
    fynd-listan från cc10e7de används som eval-/regressionsunderlag — inte
    påhittade exempel.
14. **Read-only mot prod.** All mätning via `env:pull:prod-snapshot` +
    `control-stats`/`dump-logs`. Inga skrivningar.

## 3. Arbetspaket

### Spår A — "Init blir grön" (Normalize/verifier) — P1, störst hävstång

| # | Paket | Innehåll | Ägarytor | Backlog |
|---|---|---|---|---|
| A1 | `<HTMLFormElement/>` determinism | Rotorsaka varför `dom-builtin-jsx-fixer` inte träffade v1/v5/v8 (körordning? content-sträng? regex-miss?). Garantera att fixen körs på ALLA vägar (Normalize-pipeline, verifier-phase pre-fix, repair-loop) och utöka `KNOWN_HTML_INTERFACE_TO_TAG` vid behov. Regressionstest byggt på prod-filerna (contact-form.tsx, chat-bot.tsx ur v8-zippen) | `dom-builtin-jsx-fixer.ts`, `pipeline.ts` (steg 5.5), `verifier-phase.ts` | **M#jsx1** |
| A2 | Known-import-luckor + v8-eval | (a) `Resend` → `resolveKnownImportRaw` (server-only, samma mönster som `Stripe`); (b) LucideIcon `import type`-emission (`kind: "type-named"`); (c) **eval-testcase av hela v8-filträdet** genom deterministisk import-repair med `allowTier3=true` — förväntat: 0 kvarvarande TS2304 på Stripe/Resend/toast/Badge/Button; (d) rotorsaka varför den diagnostikdrivna vägen inte träffade v8 i prod (kördes warm-tsc? var allowTier3 satt? stale files?) | `ts2304-known-import-fixer.ts`, `deterministic-import-repair.ts`, eval-sviten (fas 6) | LucideIcon-raden, **M#imp1** |
| A3 | M#imp1-diagnos | Varför missade Normalize Link/Button/Badge i prod trots `detectMissingImports`? Trolig samma rot som A1/A2-timing — instrumentera (telemetri-fält räcker, ingen ny logg-yta) och stäng eller omklassa backlog-raden | `import-validator.ts`, `pre-phases.ts` | **M#imp1** |
| A4 | Bild-defekt B | Ersatta bild-URL:er ska inte återinföras: persistera ersättningen till files_json före version-save i alla vägar + ge follow-up-kontexten den ERSATTA URL:en (eller känd död-lista i Normalize). Ingen ny extern tjänst | `image-validator.ts`, `fast-path.ts` (materialize), `validate-images/route.ts` | slutrapport §6 |

### Spår B — F3-stabilisering (integrationer) — P1, användarens uttryckliga mål

| # | Paket | Innehåll | Ägarytor | Backlog |
|---|---|---|---|---|
| B1 | Graceful "ej konfigurerad"-UX i genererade sajter | Implementera det dossier-instruktionerna redan kräver: delad klientkomponent (arbetsnamn `IntegrationConfigNotice`) i hard-dossiers `stripe-checkout` + `resend-contact-form` — vid 503/`email-not-configured`: lugn svensk copy i sajtens stil ("För att ta emot betalningar behöver Stripe konfigureras. Ange env-nyckeln STRIPE_SECRET_KEY — den fungerar som ett lösenord. Läs mer: [länk till setupGuide]"), disabled CTA-state, ingen rå feltext. `tier3-build-spec.ts` buildInstructions uppdateras så modellen alltid wirar mönstret | `data/dossiers/hard/stripe-checkout/**`, `data/dossiers/hard/resend-contact-form/**`, `tier3-build-spec.ts`, `dossiers:validate-all` | slutrapport §10.4 |
| B2 | F3-repair-robusthet | (a) När llm-fixern abortas: deterministiska delresultat (import-repair + dep-completer) ska persisteras/ligga kvar som bas i stället för att kastas med `no_improvement`; (b) targeted per-fil-scope vid retry (mindre prompt → hinner inom budget); (c) utvärdera höjd `LLM_FIXER_TIMEOUT_MS` endast för F3-repair (env-ratten finns redan) — mät, gissa inte | `repair-loop.ts`, `llm-fixer.ts`, `llm-repair-gate.ts` | slutrapport §5b |
| B3 | Malformad suggestion + dedupe | Validera `suggestIntegration`-tool-args (tomt `name`/`provider` → droppa eller normalisera i stället för fallback `"Integration"`); dedupe tool-signal vs post-finalize-detektion på provider-nyckel; UI-raden ska aldrig rendera `Integration: Integration` | `generation-stream-tools.ts`, `shared-own-engine-helpers.ts`, `BuilderMessageTooling.tsx`, `helpers.ts` | notis §8 |
| B4 | Inline-frågor fredade | Regressionstest som låser att integration-/env-/approval-frågor renderas som `CompactToolParts` inline i chatten (inte i `pendingReply`-dialogen) i standardläget | `MessageList.tsx`, `BuilderMessageTooling.tsx` (endast test) | — |
| B5 | Dossier-standard: degradation-kontrakt valideras mekaniskt | Codex-fyndet på #374 (modul-nivå `new Stripe()` gjorde 503-guarden onåbar) ska fångas av tooling, inte review-tur: (a) `dossiers:validate-all`-regel — verbatim API-routes i hard-dossiers får inte konstruera SDK-klienter på modulnivå när deras env-nycklar har runtime-/build-enforcement (lazy init efter guard); (b) dossiers med not-configured-kontrakt i instructions ska ha komponenttest som övar 503→notis-vägen; (c) dokumentera standarden i dossier-docs | `scripts/dossiers/validate-all.ts`, dossier-docs | ägarkrav 2026-07-03 |

### Spår C — Preview/DB-P2 (backlog + extern coach) — P2

| # | Paket | Innehåll | Ägarytor | Backlog |
|---|---|---|---|---|
| C1 | Ärlig `preview_success` | Telemetrin ska betyda "runtime svarade", inte "session skapad". Omklassa skrivaren, dokumentera mappning gammal→ny (jfr fas 0-mönstret), synka backoffice-läsare | `persist-telemetry.ts`, preview-status-ägaren | **M#pv1** |
| C2 | `preview_url`-persist ownership | `updateVersionPreviewUrl` får inte tyst hoppa över vid verify-lease-kontention — retry efter lease-släpp eller kö:a på ägaren | `engine-version-lifecycle.ts`, verify-ytan | **M#pv2** |
| C3 | DB-pool-svält | Bounded: utred `POSTGRES_POOL_MAX` (idag 3/instans) mot polling+streams; åtgärd = konfig + ev. query-konsolidering, INTE ny pool-arkitektur | `src/lib/db/client.ts`, polling-routes | **M#db1** |
| C4 | Restore/iframe-studs (valfri, P3) | `version_mismatch` auto-resync ska inte studsa mellan failad + restore:ad version | `usePreviewSession.ts` | **M#pv3** |

### Spår D — Verifierings-UX (litet) — P2

| # | Paket | Innehåll | Ägarytor |
|---|---|---|---|
| D1 | Readiness-kortets copy | Skilj Blocker/Advisory synligt i kortet (SEO/metadata = alltid Advisory, typecheck/build = Blocker); en rad per fynd med kategori; ingen logikändring i gaten | `LaunchReadinessCard.tsx`, `readiness/route.ts` (endast copy/payload-fält) |

### Spår E — Schema/policies/städ/docs/backoffice (~15 % av totalen)

| # | Paket | Innehåll |
|---|---|---|
| E1 | Plan-hygien — **KLAR 2026-07-03** | `stort-framsteg/` flyttad till `docs/plans/avklarat/stort-framsteg-2026-07-03/`; zip flyttad till gitignorerade `.cursor/bugs/`; router-README + plan-länkar uppdaterade |
| E2 | Backoffice-luckor | image-validator-utfall synligt i telemetri-sidan (idag bara `DEBUG=images`); `f2TimeMs`/`f3TimeMs`-TODO i `llm_flode_telemetry.py`; dossier-val i Selection Rationale läser DB (inte bara console) |
| E3 | Docs-spegling | `quality-gate.md`, `llm-pipeline.md`, `fixer-registry.md` synkas i samma PR som A/B-ändringarna (ersätt, stapla inte); glossary-post för `IntegrationConfigNotice` om B1 inför begreppet |
| E4 | Schema-/policy-låsning | Verifiera att `db:schema-drift` körs blockerande i CI (inte bara soft i predev); `dossiers:validate-all` + `capability-map`-regen efter B1:s dossier-ändringar; env-policy-genomgång av de nya integration-env-nycklarnas synlighet (läsbara, ej sensitive i onödan — per repo-regel) |
| E5 | Öppna PR-beslut (ägarbeslut, ingen agent) | Se avsnitt 5 |

## 4. Vågkarta & agent-smarthet

```text
Våg 1 (parallellt):  W1-A = A1+A2+A3 (init-grön, smarthet 9/10, mellan-stor PR)
                     W1-B = B1        (integration-fallback, 7/10, mellan PR)
                     W1-C = B3+B4     (suggestion-städ + fredningstest, 5/10, liten PR)
Våg 2 (parallellt):  W2-A = B2        (F3-repair-robusthet, 8/10 — EFTER W1-A, samma filer)
                     W2-B = A4        (bilder, 6/10)
                     W2-C = C1+C2     (preview-telemetri/persist, 7/10)
Våg 3 (parallellt):  W3-A = C3 (+C4)  (DB-pool + ev. restore, 7/10)
                     W3-B = D1        (readiness-copy, 4/10)
Våg 4:               W4   = E1–E4     (städ/docs/backoffice, 4/10) — E3 delvis löpande i A/B-PR:erna
```

- En PR per paket. Builder-agenter i egna branches/worktrees — aldrig
  `git checkout` i huvudcheckouten. Agent-prompts skrivs just-in-time i
  [`aktiviteter/`](aktiviteter/) (Våg 1-prompts finns redan).
- Efter varje våg: riktad verifiering + **en prod-smoke** (init → preview →
  follow-up → restore → F3) via `/logg-internet`, innan nästa våg startar.
- Reserverade filer per våg listas i respektive prompt (W1-A äger
  autofix/verify-ytan; W2-A väntar därför).

## 5. Öppna PR:er (ägarbeslut — ingen agentuppgift)

| PR | Läge | Rekommendation |
|---|---|---|
| #355 bug-swarm batch (39 filer) | CONFLICTING, base före #360–#373 | **Stäng.** Många av de 26 fynden är redan lösta av kontrollflödet/#368–#373; kvarvarande giltiga fynd plockas som färska små PR:ar via backloggen. Rebase av 39 filer över 14 mergade PR:ar är dyrare än omtag |
| #358 prod-deps (55 bumps) | MERGEABLE | **Vänta** tills Våg 1–2 mergade + en lugn prod-smoke. Ta sedan i 2–3 delar (AI-SDK/OpenAI separat från React/Stripe/TypeScript) |
| #348 dev-deps (20 bumps) | MERGEABLE | **Vänta**, kan tas före #358 (lägre runtime-yta) efter Våg 1 |
| #346 OpenClaw edit agent | draft, HOLD | **Behåll hold** — säger själv "MERGA INTE ÄN" |

## 6. KPI-mål

Baslinje = kontrollflödets frysta 2026-07-02-baslinje + cc10e7de-sessionen.
Mäts med `control-stats` + `stats:compare` (samordnas med kontrollflödets
mätavstämning ~2026-07-10 — en mätning, två konsumenter).

| Mätvärde | Baslinje | Mål efter Våg 1–2 |
|---|---|---|
| Init-version (v1) promotad utan repair | cc10e7de: 0/1; prod-andel mäts i avstämningen | ≥ 80 % av init-körningar |
| `undefined-jsx-symbol` (DOM-varianten) i prod | 3/8 versioner i sessionen | 0 (mekaniskt eliminerad) |
| TS2304 på kända bibliotek (Stripe/Resend/toast/Badge/Button) når gaten | v8: 5/5 still-failing | 0 still-failing för known-set |
| F3-byggen som når promotad version | v8: 0/1 | eval-sviten grön på v8-fixturen + nästa prod-F3 grön |
| Rått integrationsfel i genererad sajt utan env-nycklar | Stripe-CTA → rå error | vänlig config-notis, 0 råa fel för stripe/resend-dossiers |
| `preview_success` semantik | false-green (M#pv1) | = runtime svarade |

## 7. Medvetet utanför scope

| Sak | Varför | Var den bor |
|---|---|---|
| Dependency-bumps (#358/#348) | Sekvenseras efter stabilitet, eget beslut | Avsnitt 5 |
| Ny auth/rate-limit/kryptering/governance | Repo-regel: kräver explicit scope | — |
| Full component-registry, WebContainers, durable event-bus (B3/E2) | Egna spår | `active/README.md` backlog |
| Scaffold-matcher-tuning (G#50/52/54/66) | Matchern gjorde rätt i sessionen; ingen ny evidens | Backlog |
| 3D/CapabilitySmoke, P34 lint C–E, postcheck advisory→hard | Kontrollflödets fas 6-beslut efter mätningen | `kontrollflode/00-master-plan.md` §9 |

## 8. Beslutslogg

| Datum | Beslut | Av |
|---|---|---|
| 2026-07-03 | Master-plan skriven mot prod-evidens cc10e7de + kodkartläggning; väntar Jakes OK för Våg 1-start | orkestrator |
| 2026-07-03 | Våg 1 startad som tre parallella builder-subagenter i isolerade worktrees (W1-A Fable 5 · W1-B Opus 4.8 · W1-C GPT 5.3 Codex); orkestratorn granskar (≥7 min bot-fönster + bugbot-pass + triage) och mergar | Jake + orkestrator |
| 2026-07-03 | **W1-C mergad** som #375 (`0d3dfe9cb`): 4 bot-fynd (1 VADE camelCase-dedupe, 2 Codex P2 spökprompt/detektor-suppression, 1 CI-kontraktsbrott) — alla fixade före merge; Codex-review är åter aktiv | orkestrator |
| 2026-07-03 | Nytt ägarkrav → B5: dossier-standarder/tester ska mekaniskt fånga klassen "SDK-init på modulnivå före env-guard" (Codex P1 på #374) | Jake |
| 2026-07-03 | Våg 2-B (bilder, GPT 5.5) och Våg 2-C (preview-telemetri M#pv1/M#pv2, Opus 4.8) startade TIDIGT parallellt med Våg 1 — filytorna är disjunkta mot W1-A/W1-B; W2-A (repair-robusthet) väntar på W1-A:s slutläge. Prompts utfärdade inline av orkestratorn (ej i `aktiviteter/`) | orkestrator (Jakes "kör parallellt"-OK) |
| 2026-07-03 | **W1-B mergad** som #374 (`ab40246b1`): graceful integration-fallback (config-notis + lazy SDK-init + placeholder-guards) + **B5-regeln** i `dossiers:validate-all`. 9 bot-fynd över 3 rundor (Codex 3×P1+2×P2, bugbot 1×HIGH, Codex-runda 2 2×P2 + 1 stale) — alla fixade/avfärdade med triage i PR:en | orkestrator |
| 2026-07-03 | **W2-B mergad** som #376 (`bb2e5b41b`): persistent bildläkning (känd död-lista i orchestration_snapshot, SQL-sidig merge + hårt tak, endast 404/410 cachas, in-memory-läkning av follow-up-bas). 8 bot-fynd över 2 rundor (bugbot 2×HIGH+2×MEDIUM, Codex/VADE 4×P2) — alla fixade | orkestrator |
| 2026-07-03 | **W2-C mergad** som #377 (`f91a9aca2`): ärlig `preview_success` (tri-state, stämpel vid heartbeat-verifierat runtime-kvitto, atomisk SQL-monotonicitet, `after()` av heta vägar, legacy-cutoff i control-stats + backoffice, `preview_ready`/`preview_url_handoff`-split) + `preview_url` bounded retry (M#pv2). 12 bot-fynd över bugbot + 4 Codex-rundor — 10 fixade, 2 loggade som ny M#pv4 (versionId ≠ innehållsrevision, konservativ felriktning). **Våg 1 + tidigarelagda Våg 2-paket därmed KLARA: 5/5 PR mergade** | orkestrator |
| 2026-07-03 | **W1-A mergad** som #378 (`947b0b656`): init-grön. Rotorsakerna FLIPPADE två antaganden: M#jsx1 var verifier-scanner-falskpositiv på typ-generics (`FormEvent<HTMLFormElement>` — prod hade aldrig JSX-misuse; dom-fixern var frisk), M#imp1 var guard-revert på flerradiga importblock, och **v8:s F3-bygge körde i själva verket F2-lane (`fidelity2`)** → tier3-guarden strippade Stripe/Resend-importerna — **ny P1 om F3-entry loggad i backloggen** (kandidat för W2-A/Våg 3-scope). Fixat: scanner-lookbehind, delad flerradsmedveten bindnings-kollektor, Resend+LucideIcon i known-import-mappningen (användningsmedveten type/värde-emission), server-helper-gate för SDK:er, v8-eval end-to-end, cannotFindSummary-telemetri. 4 bot-fynd (bugbot 1×HIGH, Codex 3×P2) — alla fixade | orkestrator |

### Våg 3 (start 2026-07-03 kväll, efter tagg `backup_BRA-2000`)

| Datum | Beslut | Av |
|---|---|---|
| 2026-07-03 | Läget taggat `backup_BRA-2000` (= `f91a9aca2`) på ägarens begäran efter verifierad lyckad prod-generering. E1 utförd (evidens → avklarat, zip → `.cursor/bugs/`). Våg 3 startad med fyra parallella builder-subagenter: W3-A F3-entry-P1 (Fable 5) · W3-B repair-robusthet B2 (Opus 4.8) · W3-C restore-studs C4 + readiness-copy D1 (GPT 5.3) · W3-D backoffice/schema-låsning E2+E4 (GPT 5.5). C3 (DB-pool) kvarstår som ägar-infra-beslut | Jake + orkestrator |
| 2026-07-04 | **Våg 3 KOMPLETT — alla fyra PR mergade:** #379 backoffice/CI (`37cb4f786`, 2 fynd fixade av orkestratorn: ready-rate-nämnare + timeline-spegling), #380 repair-robusthet (`ea278b22d`, VADE-invariant + bugbot-HIGH stale-bundle fixade av orkestratorn), #381 restore-studs + Blocker/Advisory-readiness (`1070d530f`, bugbot-HIGH ljugande overlay + VADE allowFailed-memo), #382 **F3-entry-P1** (`996add2b9`, 5 fynd över 2 rundor: intent-gatat arv, atomisk marker-konsumtion EFTER gates, lineage=byggbas — stänger rotorsaken till v8-haveriet i cc10e7de). Kvar i planen: C3 (ägar-infra-beslut), mätavstämning ~2026-07-10, PR-beslut #355/#358/#348 (ägare) | orkestrator |

| 2026-07-04 | **Våg 4 mergad** som #383 (`cb12eec04`) — F3-loopen från prod-chat `fa6515bc` stängd: approval-rundor TVINGAR kodgenerering (förslags-tools ur tool-setet + byggdirektiv med graceful fallback), godkänd provider → hard-dossier-injektion (strikt mappning, ingen kategori-läcka), stub-placeholders är inte längre integrationsbevis (ny `stub-env-filter`), loop-breaker (tyst + tool-only delar räknare, terminal cap), "Avvisa" avslutar F3 utan generation (bekräftad marker-konsumtion). 10 fynd över 3 rundor (bugbot 2×HIGH, Codex 1×P1+5×P2, GitGuardian-falskpositiv, VADE) — 8 fixade, 1 loggad P3, 1 bypassad dokumenterat (GitGuardian på historisk fixtur-commit; tip rent). OBS: W4-agenten avbröts av Cursor-fakturaspärr — orkestratorn slutförde fixarna själv | orkestrator |

## 9. Nästa steg

1. Jake godkänner master-planen (och PR-rekommendationerna i avsnitt 5 som separata beslut).
2. Våg 1 startas: tre parallella builder-agenter med prompts i
   [`aktiviteter/`](aktiviteter/) (`vag1-a-init-gron-prompt.md`,
   `vag1-b-integration-fallback-prompt.md`, `vag1-c-suggestion-stad-prompt.md`).
3. Orkestratorn granskar PR:erna (bugbot-postcheck per `pr-merge-review-gate.mdc`),
   Jake godkänner merge, prod-smoke via `/logg-internet`.
4. Våg 2-prompts skrivs efter Våg 1-merge (W2-A behöver W1-A:s slutläge).
5. Mätavstämning ~2026-07-10 delas med kontrollflödet; utfall skrivs in här och
   i KPI-tabellen.
