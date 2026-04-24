# STATUS-06 deep-brief + follow-up som delta + capability-classifier

Status: **short-medium** (10 filer rörda, en quickwin-lint-fix utanför scope).

## Vad var problemet

Plan 01 smoke run 2 — *"Skapa en 3d-kaffekopp som hoovrar och flyger ovanför"* — bevarade `baseVersionId` korrekt (delta-semantiken finns redan i basen) men:

- `followUpIntent` blev `neutral` — classifier såg ingen capability-signal
- `requestedCapabilities` förblev tom → `selectDossiersForRequest` fick noll dossiers
- `three-fiber-canvas`-dossiern injicerades aldrig
- LLM:n improviserade ett tomt `coffee-cup-3d.tsx`-skal

Buggen sitter i **fas 1** (intent + brief + delta). Dossier-systemet är friskt — det får bara aldrig veta om att en capability efterfrågas.

## Lösning på en rad

Ny capability-detektor på follow-up-text. Returnerar `capabilityIds` + `tierByCapability`. Den hittar capability-ord → `followUpIntent` blir `capability-add` → `requestedCapabilities` plumbas in i orchestrate → `selectDossiersForRequest` injicerar dossiern → Plan 07 har en bas att bygga vidare på.

## Strategi: tre-stegs spectrum (från användarens design-input)

| Tier | Heuristik | Plan 07-routing |
|---|---|---|
| `generic` | ≤ 8 ord, inga beteende-markörer, capability-noun finns | Inject dossier verbatim |
| `specific` | > 8 ord eller "där man …", "som låter …", "with X and Y" | Inject dossier shell + LLM custom på toppen |
| `beyond-dossier` | Per-capability beyond-marker (t.ex. `physics-simulation`, `@react-three/rapier`, `studsande`, `paint on canvas`) | Inject dossier som bas + LLM custom scen-fil |

Tier räknas i `resolveTier()` i [`follow-up-capability-detection.ts`](../../../src/lib/builder/follow-up-capability-detection.ts).

## Heuristik / vokabulär

Källa: 16 capabilities i [`data/dossiers/_index/capability-map.json`](../../../data/dossiers/_index/capability-map.json) — vokabulär-keys måste matcha verbatim.

Per capability, högprecisions-mönster i svenska + engelska. Unicode-aware look-arounds (`(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])`) — aldrig ASCII `\b` (skulle missa `ä/ö/å`).

| Capability | Svenska träffar | Engelska träffar |
|---|---|---|
| `visual-3d` | `3d`, `tre dimensioner`, `interaktiv canvas`, `3d-canvas`, `gltf` | `3d`, `three.js`, `@react-three/fiber`, `webgl`, `r3f` |
| `parallax-pointer` | `pointer-parallax`, `mus-parallax`, `följer musen`, `tilt-card` | `mouse-parallax`, `cursor-parallax`, `hover-tilt` |
| `parallax-scroll` | `scroll-parallax`, `parallax-effekt`, `paralaks`, `pinned-section` | `scroll-driven`, `sticky-parallax` |
| `payments` | `stripe`, `klarna`, `swish`, `kassa`, `kortbetalning`, `betalningsflöde` | `checkout`, `payment-flow`, `recurring billing` |
| `auth` | `inloggning`, `logga in`, `registrera konto`, `lösenord`, `magic link` | `sign-in`, `sign-up`, `oauth`, `clerk`, `next-auth` |
| `ai-chat` | `ai-chatt`, `chattbot`, `ai-assistent`, `chat-widget` | `chatbot`, `gpt-chat`, `claude-chat` |
| `contact-form` | `kontaktformulär`, `kontaktform`, `skicka mail`, `skicka e-post` | `contact form`, `email form`, `resend` |
| `newsletter-subscribe` | `nyhetsbrev`, `prenumerera på nyhetsbrev`, `mailchimp` | `newsletter`, `subscribe form`, `email signup` |
| `analytics` | `webbanalys`, `plausible`, `vercel-analytics`, `spåra besökare` | `posthog`, `mixpanel`, `fathom`, `track visitors` |
| `error-tracking` | `sentry`, `fel-spårning`, `crash-reporting` | `error tracking`, `bug reporting`, `datadog` |
| `carousel` | `karusell`, `bildspel`, `hero-slider` | `carousel`, `slider`, `slideshow`, `embla` |
| `command-search` | `kommandopalett`, `cmd+k`, `sökpalett` | `command palette`, `spotlight search`, `cmdk` |
| `faq-section` | `faq`, `vanliga frågor`, `frågor och svar` | `faq`, `q&a` |
| `marquee` | `löpande text`, `löptext`, `logo-marquee` | `marquee`, `ticker`, `scrolling logos` |
| `pricing-section` | `pristabell`, `prisplan`, `prisnivåer`, `pris-sektion` | `pricing table`, `tier table`, `pricing tier` |
| `testimonials-section` | `kundomdömen`, `kundutlåtanden`, `recensioner-sektion`, `kundröster` | `testimonials`, `reviews section`, `testimonial grid` |

### Disambiguation-regler

- **parallax-pointer vinner över parallax-scroll** när pointer/mouse/cursor-variant nämns (veto i `parallax-scroll`).
- **`visual-3d` triggas också av beyond-markers** även när `3d/webgl`-token saknas. Annars skulle "lägg till physics-simulation av studsande tomater" inte detekteras alls.

## Add-verb-gate (för att inte trigga på refine/move)

Capability-detection kräver ett **add-verb** (svenska: `lägg till`, `infoga`, `skapa`, `bygg`, `koppla på`, `vill ha`, `behöver`; engelska: `add`, `include`, `build`, `create`, `enable`, `wire up`, `i want`, `we need`). Undantag: prompts på ≤ 4 ord *utan* refine/move-verb (då räcker capability-substantivet).

Detta löser: *"Move the pricing section above FAQ"* nämner två capability-substantiv (`pricing-section`, `faq-section`) men har inget add-verb och har move-verbet `move` — får ingen capability-add (skulle annars ha re-injicerat dossiers på en ren layout-edit).

## Klassificeringsordning i `classifyFollowUpIntent`

```
1. clear-redesign     (FOLLOW_UP_REDESIGN_PATTERNS)
2. clear-redesign     (verb+noun-combo, t.ex. "byt + tema")
3. clear-redesign     (looksLikeDetailedNewSiteBrief)
4. ambiguous-redesign (newSite + buildVerb)
5. ambiguous-followup (isUnderspecifiedFollowUp)
6. capability-add     ← Plan 06: detectFollowUpCapabilities ger > 0
7. clear-refine       (FOLLOW_UP_REFINE_PATTERNS)
8. neutral
```

Capability-add ligger *efter* clear-redesign-grenarna så att en explicit redesign-intent inte tappas, men *före* clear-refine eftersom `lägg till` är både ett refine-verb och Sveriges vanligaste capability-add-verb.

## Före/efter — de fyra acceptansfallen

| Prompt | Före | Efter |
|---|---|---|
| `Skapa en 3d-kaffekopp som hoovrar och flyger ovanför` | `neutral` · caps `[]` · ingen dossier | `capability-add` · caps `[visual-3d]` · tier `specific` · `three-fiber-canvas` injiceras |
| `lägg till en kontaktform` | `clear-refine` · caps `[]` · ingen dossier | `capability-add` · caps `[contact-form]` · tier `generic` · `resend-contact-form` injiceras |
| `ändra färgen på knappen` | `clear-redesign` (verb+noun-combo) · caps `[]` | Oförändrad — capability-add körs aldrig (verb+noun-combo äger fall först) |
| `lägg till physics-simulation av studsande tomater` | `clear-refine` · caps `[]` · ingen dossier | `capability-add` · caps `[visual-3d]` · tier `beyond-dossier` · `three-fiber-canvas` injiceras + signal till plan 07 att skriva custom scen ovanpå |

`Move the pricing section above FAQ` (regressionstest) — fortsatt `clear-refine`, ingen capability-add (move-verb + add-verb saknas).

## Deep Brief delta-kontrakt (smal)

Bekräftat i kod (ändrat *inget* — bara dokumenterat det som redan gäller plus den nya signalen):

| Beteende | Var det är låst |
|---|---|
| Återanvänd scaffold/variant från `baseVersionId` som default | `resolveOrchestrationBase` (befintligt — Plan 02 + tidigare) |
| Server-auto-brief skippas på follow-ups | `server-auto-brief-policy.ts` rad 22 (befintligt) |
| Capability-refresh ENDAST på follow-up när detection ger non-empty `capabilityIds` | `chat-message-stream-post.ts` rad 681-688 + 882-889 (Plan 06) |
| Inga capability-removes i follow-ups | Garanterat: `requestedDossierCapabilities` är `undefined` när detection är tom — `selectDossiersForRequest` får då bara brief- + inferred-caps från basen, inga subtraktioner |
| `requestedCapabilityTiers` görs tillgänglig för Plan 07 via `OrchestrationBase` | `orchestrate.ts` rad 269-277 + 846 |

## Filer rörda (10)

| Fil | Varför |
|---|---|
| `src/lib/builder/follow-up-capability-detection.ts` (ny) | Detektor + tier-resolver |
| `src/lib/builder/follow-up-capability-vocabulary.ts` (ny) | 16 capability-mönster + vetoes |
| `src/lib/builder/follow-up-capability-detection.test.ts` (ny) | 27 enhetstester |
| `src/lib/gen/follow-up-intent-types.ts` | `capability-add` läggs till i `FollowUpIntentMode` |
| `src/lib/gen/build-spec/policy-inference.ts` | Importerar canonical `FollowUpIntentMode` istället för inline-union |
| `src/lib/providers/own-engine/follow-up-clarification.ts` | `classifyFollowUpIntent` returnerar `capability-add` när detection > 0; LLM-fallback-system-prompt utökad med nya labeln |
| `src/lib/providers/own-engine/follow-up-clarification.test.ts` | 6 nya intent-tester (smoke run 2 + de 4 acceptansfallen + Move-regression) |
| `src/lib/gen/orchestrate.ts` | `requestedDossierCapabilities` + `requestedCapabilityTiers` på `OrchestrationInput` + `OrchestrationBase`; merge i `selectDossiersForRequest`-anrop |
| `src/lib/api/engine/chats/chat-message-stream-post.ts` | Anropar `detectFollowUpCapabilities` när `hasFollowUpBase && !skipIntentClassification` och plumbar både till plan-mode och huvudflödet |
| `src/lib/gen/stream/finalize-preflight.ts` | **Quickwin** — pre-existerande lint-error (`prefer-const` på `preflightIssues`) som blockerade lint-gaten. `let` → `const`. Ingen beteendeändring. |

## Konsekvenser för andra planer

- **Plan 07** kan läsa `OrchestrationBase.requestedCapabilityTiers` för att routea: `generic` → använd dossier verbatim, `specific` → dossier-shell + lätt LLM-overlay, `beyond-dossier` → dossier som bas + custom scen-fil. Plan 07 äger fortfarande package.json-mutation och 3D-specifik scen-generering.
- **Plan 11/12** (LLM-classifier-pass): regex-detection täcker uppskattningsvis 90 % av träffarna men är språk-/synonym-känslig. Stoppregel ej träffad — ingen LLM-call krävs för Plan 06-acceptansen. Om en framtida prompt visar sig falla utanför vokabulären (t.ex. helt ny capability) bör en LLM-double-check läggas till i fallback-banan istället för att svälla regex-listan.

## Acceptans

- ✅ Capability-detection fungerar på follow-up-text (svenska + engelska, 16 capabilities, 27 testfall)
- ✅ `selectDossiersForRequest` får `requestedCapabilities` från follow-ups (rad 800-812 i `orchestrate.ts`)
- ✅ Specifitets-tier finns på `OrchestrationBase.requestedCapabilityTiers` så Plan 07 kan rutta
- ✅ Deep Brief delta-kontrakt dokumenterat (tabell ovan)
- ✅ 4 regressionstester finns och passerar (`follow-up-clarification.test.ts` + `follow-up-capability-detection.test.ts`)
- ✅ `npm run typecheck` 0 fel
- ✅ `npm run lint` 0 fel (efter quickwin-fix av pre-existerande Plan-05-lint-error)
- ✅ Hela `src/lib/builder` + `src/lib/providers/own-engine` + `src/lib/gen` test-suite (1130 tester) passerar
- ✅ `node scripts/dev/check-unicode-regex.mjs` OK

## Hårda begränsningar — efterlevda

- ✅ Inga ändringar i `data/dossiers/` eller `src/lib/gen/dossiers/**`
- ✅ Ingen 3D-specifik injection-orchestration (lämnas till Plan 07 — vi exponerar bara tier-signalen)
- ✅ `selectDossiersForRequest` används som den är, ingen structural ändring
- ✅ Plan 02/03/04/05-filer orörda (förutom 1-rads quickwin-lint-fix i `finalize-preflight.ts`)
- ✅ 10 filer rörda (under maxbudgeten ~12)
