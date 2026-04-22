# Plan — Synka brief-LLM, dossier-registret och integration-registret

**Status:** Alla P0-problem åtgärdade 2026-04-21 (se [Gjorda ändringar](#gjorda-ändringar) i slutet av filen). **Kvar: P1/P2 polish-punkter** — frivilliga, låg prio. Core-synk (capability-map auto-gen, brief-LLM dynamic vocab, F3 clamp mot dossier-backing, schema-rensning) är levererad.

Konkret åtgärdsplan baserad på iakttagelser från [`docs/devlogs/2026-04-21-kapten-krabba-run.md`](../../devlogs/2026-04-21-kapten-krabba-run.md). Varje rubrik är ett observerat problem med severity, fil-pekare och föreslagen fix.

**Kärnregel som nu gäller hela systemet**: de enda dossiers som räknas i runtime är de som ligger under `data/dossiers/hard/<id>/` eller `data/dossiers/soft/<id>/`. Klass (hard/soft) bestäms av om env-variabler behövs. `capability`-fältet fungerar som kategori — flera dossiers kan dela capability (t.ex. en framtida `klarna-checkout` skulle ha `capability: "payments"` bredvid `stripe-checkout`), och `defaultForCapability: true` avgör vilken som vinner vid val.

## Översikt

Sajtmaskin har idag **fyra parallella kataloger** som beskriver "vilka förmågor sajten kan ha". Ingen av dem refererar till varandra vid runtime:

| Katalog | Var | Antal | Används av |
|---|---|---|---|
| Dossier-registret | [`data/dossiers/{hard,soft}/`](../../../data/dossiers/) | 11 | `selectDossiersForRequest()` → `buildDynamicContext()` → codegen-LLM |
| Brief-LLM:ns capability-vokabulär | [`src/lib/builder/site-brief-generation.ts:294`](../../../src/lib/builder/site-brief-generation.ts) | 6 hardkodade strängar | brief-LLM-prompten |
| Capability-map (curation) | [`data/dossiers/_index/capability-map.json`](../../../data/dossiers/_index/capability-map.json) | 10 capabilities → 11 dossier-ids | backoffice-listor, manuellt uppdaterad |
| Integration-registret (F3) | [`src/lib/integrations/registry.ts`](../../../src/lib/integrations/registry.ts) | 24 | `deriveTier3BuildSpec()` → fidelity-3 env-validering |

Plus schema-fältet `capability.description` i [`docs/schemas/strict/dossier.schema.json`](../../../docs/schemas/strict/dossier.schema.json) rad 35 som återfördyttar samma gamla "examples"-lista och aldrig valideras mot disk.

Alla är ur synk. Det är roten till de flesta P0/P1-problemen nedan.

## P0: Tre parallella kataloger ur synk

**Symptom:** Capability-strängar har tre olika "kanoniska" former:

| Term | Brief-LLM-prompt | Capability-map | Disk (dossier.capability) |
|---|---|---|---|
| FAQ | (saknas) | `faq-section` | `faq` (i `faq-accordion`) |
| Contact | (saknas) | `contact-form` | `email-form` (i `resend-contact-form`) |
| Testimonials | (saknas) | `testimonials-section` | `testimonials` (i `testimonials-grid`) |
| Image gen | `image-gen` | (saknas) | (saknas) |
| Auth | `auth` | (saknas) | (saknas) |
| Parallax | (saknas) | `parallax-scroll`, `parallax-pointer` | `parallax-scroll`, `parallax-pointer` |
| Analytics | (saknas) | `analytics` (ger 2 dossiers) | separata per-dossier |

**Var:**

- [`data/dossiers/_index/capability-map.json`](../../../data/dossiers/_index/capability-map.json) — manuellt skapad, uppenbarligen en gång 2026-04-21T08:00:00
- Varje `data/dossiers/{hard,soft}/<id>/manifest.json` har sitt eget `capability:`-fält — det är runtime-sanningen ([`registry.ts`](../../../src/lib/gen/dossiers/registry.ts) läser här)
- [`docs/schemas/strict/dossier.schema.json`](../../../docs/schemas/strict/dossier.schema.json) rad 35 kommenterar `"Examples: 'payments', 'auth', 'ai-chat', 'image-gen', 'pricing-section', 'visual-3d'"` — exempel är normativa signaler, de påverkar vad curatorer namnger

**Fix (i ordning):**

1. **Fyll `capability-map.json` från disk vid varje commit** — lägg till ett Python/TS-script i `scripts/` som läser manifesten och regenererar. Sätt som pre-commit hook eller CI-check.
2. **Standardisera capability-namn** — välj en form (`faq-section` eller `faq`?) och byt i alla manifest. Dossier-schemat kan sen lägga till `enum` eller strängare validering.
3. **Ta bort hårdkodade exempel i schema:t** och ersätt med en referens till capability-map.
4. **Dynamisk injection i brief-LLM-prompten** — se nästa sektion.

## P0: Dossier-vokabulär mismatch

**Symptom:** Init-genereringen för Kapten Krabba returnerade `requestedCapabilities: ["image-gen"]`. Ingen dossier har den capability:n. 0 av 11 dossiers valdes.

**Var:**

- Hardkodad lista i [`src/lib/builder/site-brief-generation.ts:294`](../../../src/lib/builder/site-brief-generation.ts):
  ```text
  payments, auth, ai-chat, image-gen, pricing-section, visual-3d
  ```
- Disk har: `stripe-checkout, openai-chat, plausible-analytics, vercel-analytics, resend-contact-form, faq-accordion, pointer-parallax, scroll-parallax, pricing-tier-table, testimonials-grid, three-fiber-canvas`

**Mismatch:**

- Brief-LLM:n hallucinerar `auth` och `image-gen` som om dossiers fanns → tomma val
- Brief-LLM:n missar 6 dossiers (`faq-accordion`, `pointer-parallax`, `scroll-parallax`, `resend-contact-form`, `plausible-analytics`/`vercel-analytics`, `testimonials-grid`) → modellen får aldrig veta att de finns

**Fix:**

- Generera capability-listan dynamiskt i `site-brief-generation.ts` från `getAllDossiers().map(d => d.capability)` (se [`src/lib/gen/dossiers/registry.ts`](../../../src/lib/gen/dossiers/registry.ts))
- Resultatet blir en sanning, inte två
- Lägg till en CI-test som assert:ar `briefCapabilityVocabulary ⊆ diskCapabilities`

## P0: Fidelity-3 bryter mot dossier-poolen

**Symptom:** Försök till F3-build (Kapten Krabba) krävde real-värden för `CLERK_SECRET_KEY`, `CONTENTFUL_SPACE_ID`, `CONTENTFUL_ACCESS_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MONGODB_URI`. Inget av detta backas av en dossier — generationen kan inte rendera det meningsfullt även om env-keys finns.

**Var:**

- [`src/lib/integrations/tier3-build-spec.ts`](../../../src/lib/integrations/tier3-build-spec.ts) — `deriveTier3BuildSpec()` läser ur [`integrationRegistry`](../../../src/lib/integrations/registry.ts) (24 entries: clerk, contentful, mongodb, sanity, storyblok, algolia, meilisearch, typesense, elasticsearch, sentry, posthog, …)
- Dossier-registret har **0 av dessa 24** som matchande implementationer

**Konsekvens:** F3 kan be om `CLERK_SECRET_KEY` men sajten har ingen Clerk-integrerande kodfil att fylla — env-värdet blir oanvänt.

**Fix-alternativ:**

1. **Clamp:** filtrera `integrationRegistry` mot `getAllDossiers()` innan F3-spec genereras. Be bara om env-keys för integrationer som har en dossier som faktiskt implementerar dem.
2. **Fyll i dossier-luckorna:** lägg till dossiers för `clerk-auth`, `contentful-cms`, `mongodb-data`, `sanity-cms` osv om de ska stödjas på riktigt.
3. **Markera registry-entries som "no-dossier":** lägg till `requiresDossier: boolean` på `IntegrationDefinition` så F3 vet vad som är prata-om-bart vs implementerbart.

Förslag: gör (1) som omedelbar safety-net + bestäm policy mellan (2) och (3) som långsiktigt arbete.

## P0: Autofix stub-fabrikering förstör genererad 3D

**Symptom:** Tre.js-gubben renderas som en streckad ruta `[PaddlingCaptain]` i live-previewen. Filen `components/paddling-captain.tsx` i `version-0f1750ed.zip` är 9 rader — en `data-stub`-placeholder, inte ett R3F-mesh. Samma mönster i `components/direction.tsx` och `components/point.tsx` (`Direction` och `Point` är typer i `surf-snake-game.tsx`, inte komponenter).

**Källa lokaliserad:** [`src/lib/gen/autofix/rules/cross-file-import-checker.ts`](../../../src/lib/gen/autofix/rules/cross-file-import-checker.ts) rad 156–170 (`stubForName()`):

```ts
function stubForName(name: string): string {
  if (/Provider$/.test(name)) { /* React-stub */ }
  if (/Context$/.test(name)) { /* createContext-stub */ }
  if (/^use[A-Z]/.test(name)) { /* hook-stub */ }
  if (/^[a-z]/.test(name)) { /* null-returnerande funktion */ }
  return `export function ${name}(props: Record<string, unknown>) {
    return (
      <div data-stub="${name}" style={...streckad-ram...}>
        [${name}]
      </div>
    );
  }`;
}
```

Funktionen körs från `createStubFile()` → `checkCrossFileImports()` när en lokal import inte kan resolveras i file-set:et. I run 2 (13:36:22 UTC, `cross-file-import-checker` i timeline) triggade det när modellen emitterade `ocean-swimmer-overlay.tsx` som importerade `@/components/paddling-captain` men *innan* modellens egen `paddling-captain.tsx` hann merges in — stub skapades först och vann sedan över modellens fil. För `Point` och `Direction` är orsaken liknande: någon fil importerade dem som om de vore komponenter.

**Fix-alternativ:**

1. **Byt default-stub till tyst `null`-return** istället för synlig dashed `[Name]`-ruta. Mindre värre för användarens preview — en osynlig komponent upplevs som "kanske inte mountad än" snarare än "broken design".
2. **Order-of-operations fix**: kör `checkCrossFileImports` *efter* modellens filer är fullständigt merged, inte under. Stub-fabrikering ska bara gälla för imports som *aldrig* kunde resolveras, inte för imports som resolveras i nästa merge-iteration.
3. **Konkurrens-skydd**: om `stubPath` skrivs, jämför med vad modellen emitterar i samma pass — om modellens version är längre/richer, behåll modellens.
4. **Track upstream**: lägg till en varning-signal `autofix.stub.overwrote-model` när en stub skriver över en fil som modellen också har i sin output. Då ser vi när buggen triggar.

Förslag: (1) som omedelbar UX-förbättring + (2) eller (3) som strukturell fix.

**Rekommenderad minimal förändring:**

```ts
// cross-file-import-checker.ts:169 — ändra default-grenen
return `export function ${name}(_props: Record<string, unknown>) { return null; }`;
// + default-export bibehålls
```

Det tar bort den visuella skadan och bevarar import-resolutionen. Modellens "riktiga" fil kan fortfarande vinna i följande pass om merge-ordningen fixas.

## P1: Follow-ups hoppar över dossier-omval

**Symptom:** Follow-upen "tre.js-gubbe" var `promptType: followup_technical` + `promptStrategy: direct`. Ingen ny brief-LLM kördes → ingen ny dossier-selektion. Three.js-overlayn fick uppfinnas från scratch trots att `three-fiber-canvas`-dossiern hade passat 1:1.

**Var:**

- [`src/lib/hooks/chat/useSendMessage.ts`](../../../src/lib/hooks/chat/useSendMessage.ts) skickar `pendingBriefRef` men kör aldrig `useInitBrief` på follow-ups
- [`src/lib/api/engine/chats/chat-message-stream-post.ts`](../../../src/lib/api/engine/chats/chat-message-stream-post.ts) återanvänder scaffold/dossier-context från `engine_chat`-rader

**Fix-alternativ:**

1. **Mini-brief på follow-ups** som bara extraherar `requestedCapabilities` (inte hela brief-objektet) — billigt, ~3-5s, lägger till nya dossiers vid behov
2. **Capability-detection utan LLM**: kör en regex/keyword-match på follow-up-prompten mot `getAllDossiers().map(d => d.capability)` och `d.summary`. Om matchen är hög → injicera dossiern
3. **Persist `requestedCapabilities` i `engine_chat`** + lägg till en UI-knapp "lägg till capability" som användaren kan trigga

Förslag: (2) som default + (1) som upgrade-väg.

## P1: Slug-derivering kollapsar

**Symptom:** Init-loggens `slug` blev `orchestration-styledirection` istället för t.ex. `kapten-krabbas-surfskola`. `comm.request.create` hade `slug: "freeform"`. Slug-cachen byggs av en signal som inte borde vara primärkälla.

**Var:**

- [`src/lib/logging/devLog.ts`](../../../src/lib/logging/devLog.ts) `deriveSlugFromEntry()` rad 333-357
- Fallback-ordningen är: `entry.slug` → `siteSlug` → `projectSlug` → `message` (om `type === "site.start"`) → `project-${projectId}` → `chat-${chatId}` → `entry.type`
- I praktiken vinner `entry.type` ofta för signaler som kommer innan `site.start` har hunnit cachea

**Fix:**

- Cachea slug:en i `chatSlugMap` redan på `comm.request.create` (som har `rawMessage` + `chatId`)
- Eller: derivera slug från `siteConfig.name` när `version.created` skrivs
- Eller: ändra fallback-ordningen så `chatId`-baserat slug vinner över `type` (det är iaf stabilare per-konversation)

## P1: Prompt-formatting-loggraden är vilseledande

**Symptom:** `Prompt formatting result {originalLength: 620, finalLength: 620, changed: false, briefActive: true}` ser ut som en bug — användaren tolkade det som att deep brief inte gjorde något.

**Var:**

- [`src/lib/hooks/chat/useCreateChat.ts:353-358`](../../../src/lib/hooks/chat/useCreateChat.ts)

**Förklaring:** När brief är aktiv passeras hela utökningen via `meta.brief` (strukturerad JSON) och bakas in i system-prompt server-side via `buildDynamicContext()`. User-prompten ska *inte* wrappas. `changed: false` är rätt — men loggraden visar inte `meta.brief`-storleken.

**Fix:**

- Utöka loggraden:
  ```ts
  debugLog("AI", "Prompt formatting result", {
    originalLength: initialMessage.length,
    finalLength: formattedMessage.length,
    changed: ...,
    briefActive: hasBrief,
    briefBytes: hasBrief ? JSON.stringify(pendingBriefRef.current).length : 0,
    briefPages: hasBrief ? Array.isArray(pendingBriefRef.current?.pages) ? pendingBriefRef.current.pages.length : 0 : 0,
    briefRequestedCapabilities: hasBrief ? pendingBriefRef.current?.requestedCapabilities ?? [] : [],
  });
  ```
- Eller: byt loggradens namn till `User-message formatting result` så det är tydligt att raden inte är "hela prompten".

## P1: TSC tyst skippas

**Symptom:** `Validering (syntax + typecheck): tsc-skipped` syns ofta i agent-loggen. Typfel går igenom till runtime utan tröskel.

**Var:**

- [`src/lib/gen/autofix/validate-and-fix.ts:113-121`](../../../src/lib/gen/autofix/validate-and-fix.ts):
  ```ts
  if (!opts.resolvedScaffold && !opts.forceTsc) {
    opts.onProgress?.({ pass: opts.pass, phase: "tsc-skipped", errorCount: 0 });
    return { ... tsc: { ran: false, skipped: "no_files", durationMs: 0 } ... };
  }
  ```
- Sekundärt skip i [`src/lib/gen/preview/warm-typecheck.ts`](../../../src/lib/gen/preview/warm-typecheck.ts) — flera möjliga `result.skipped`-anledningar

**Fix:**

- Utöka `tsc-skipped`-loggen med `reason` (`no_files`, `no_scaffold`, `budget_exceeded`, `warm_typecheck_skipped:<sub-reason>`)
- Lägg till en metric-counter `sajtmaskin_tsc_skipped_total{reason}` så vi kan trenda hur ofta tsc faktiskt körs i prod
- Överväg att flippa default: `forceTsc: true` när follow-up rör endast TS/TSX-filer

## P2: WS HMR prefix-mismatch i preview_host

**Symptom:** `wss://vm-fly-jakem.fly.dev/{chatId}/_next/webpack-hmr?id=...` failas konstant i preview-iframen. Preview renderar OK; HMR funkar inte.

**Var:**

- Preview_host VM:ens Next.js dev-server (`next dev`) startar utan `assetPrefix` / `basePath`
- Fly proxar `/{chatId}/*` mot intern Next-instans men `Upgrade: websocket` släpps inte igenom på prefix-pathen, eller VM:en lyssnar inte på `/{chatId}/_next/webpack-hmr`

**Fix-alternativ:**

1. Sätt `assetPrefix: '/${chatId}'` i preview_host:s `next.config.ts` vid VM-start (kräver att VM:en känner till sin chatId)
2. Konfigurera Fly-proxyn att strippa `/{chatId}` innan WS-upgrade forwardas till Next
3. Stäng av HMR-klienten i preview_host helt (`webpackDevMiddleware: false`) — användare reload:ar manuellt mellan versioner

Förslag: (1) eller (2) — vi tappar inte HMR och slipper konsol-spam.

## P2: Verifier blind findings rapporteras som error

**Symptom:** `verifierFindingId: footer-dead-links` med meddelande "Cannot verify footer link destinations because components/site-footer is not included in provided snippets" rapporteras som `error` (severity 2) i UI:t. Det är inte ett fynd — det är "kunde inte kolla".

**Var:**

- Verifier-pipelinen — leta efter findingens definition (`footer-dead-links`)
- Kandidat: [`src/lib/gen/verify/`](../../../src/lib/gen/verify/) eller [`src/lib/own-engine/verify/`](../../../src/lib/own-engine/verify/)

**Fix:**

- När verifier inte fått snippeten den behöver, returnera `severity: "skipped"` (eller `"warning"` om vi vill att autofix ska försöka leverera snippet)
- Lägg till metric: `sajtmaskin_verifier_finding_total{id, severity, reason}` så vi ser om "kunde inte kolla"-fall är vanliga

## P2: Server auto-brief tystar problem

**Symptom:** När client-brief misslyckas eller hoppas över, kör servern auto-brief som fallback. UI:t säger inget. Devloggen visar `briefQuality: server-auto` men bara i `meta`-payloaden, inte synligt i `comm.request.create`-toppen.

**Var:**

- [`src/lib/api/engine/chats/create-chat-stream-post.ts:222-260`](../../../src/lib/api/engine/chats/create-chat-stream-post.ts)

**Fix:**

- Lägg `briefQuality` på toppnivå i `comm.request.create`-signalen
- Visa en diskret status i UI:t när `server-auto` aktiveras ("Snabb-brief användes — uppgradera profil för deep brief?")

## P2: Autofix ignorerar a11y-findings

**Symptom:** Run 4 (shadcn Input-tillägget) triggade `a11y-duplicate-id`:

> "app/page.tsx: duplicate id value 'input-demo' is used on both `<section id=\"input-demo\">` and `<Input id=\"input-demo\">`. IDs must be unique for valid HTML and correct label targeting."

Verifiern fångade det (quality-finding), men auto-repair-passet rörde det inte. Fyndet kvarstår i `version-0f1750ed.zip`.

**Var:**

- Verifier-regel finns (`a11y-duplicate-id` — sök i [`src/lib/gen/verify/`](../../../src/lib/gen/verify/) eller [`src/lib/own-engine/verify/`](../../../src/lib/own-engine/verify/))
- Autofix-regler i [`src/lib/gen/autofix/rules/`](../../../src/lib/gen/autofix/rules/) saknar en motsvarande fixer

**Fix:**

- Lägg till en autofix-regel `rename-duplicate-ids` som: hittar duplicates, behåller första, suffixar andra (`input-demo-2`, `input-demo-3` …), uppdaterar ev. `htmlFor`-kopplingar i samma pass
- Alternativt: när shadcn-component-tillägget kör sitt "preserve_registry_payload"-flöde, generera ett unikt id via nanoid istället för default `input-demo`

## P2: D-ID avatar CORS i lokal dev

**Symptom:** Avatar laddar inte video. Console: `POST https://api.d-id.com/agents/v2_agt_h5geNb9N/streams ... CORS blocked`. SDK försöker direktanrop från `localhost:3000`.

**Var:** D-ID dashboard, agent-konfig (inte vår kod)

**Fix:**

- Lägg till `http://localhost:3000` som allowed origin på agent `v2_agt_h5geNb9N`
- Eller: konditionera `useDidAvatar({ enabled: false })` när `process.env.NODE_ENV === "development"` (om avataren bara behövs i prod-demos)

## Säkerhets-/städ-nit i `.env.local`

Inte pipeline-buggar, men listas här för fullständighet:

- **`JUICEFACTORY_API="pk_live_..."`** — live-nyckel i lokal dev. Byt till test-nyckel.
- **Duplicates:** `SAJTMASKIN_PROMPT_DUMP` rad 167 + 174, `SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT` rad 172 + 175.
- **`SAJTMASKIN_MODEL_ANTHROPIC="claude-opus-4.6"`** — verifiera att aliaset löses i [`config/ai_models/manifest.json`](../../../config/ai_models/manifest.json).

## Föreslagen ordning

1. ~~**P0 + lågrisk:** "Dossier-vokabulär mismatch"~~ **KLAR** — se [Gjorda ändringar #1](#1-dossier-vokabulär-synkas-fr%C3%A5n-disk).
2. ~~**P0 + hög impact:** "Autofix stub-fabrikering"~~ **KLAR** — se [Gjorda ändringar #2](#2-autofix-stubs-blir-tysta-null-returns).
3. ~~**P0 (clamp):** Filtrera F3-integrations mot dossiers~~ **KLAR** — se [Gjorda ändringar #3](#3-f3-integrations-clampade-mot-dossier-backing).
4. ~~**P0:** Regenerera capability-map.json från disk~~ **KLAR** — se [Gjorda ändringar #4](#4-capability-map-auto-genereras).
5. **P1:** Follow-up dossier-omval (mini-brief eller keyword-match).
6. **P1:** Slug-derivering + prompt-formatting-loggrad + tsc-skip-reason. Tre snabba observability-fixar.
7. **P2:** WS HMR, verifier-blind, server-auto-brief-synlighet, D-ID, a11y-duplicate-id. Polish.

## Gjorda ändringar

Alla ändringar nedan landade 2026-04-21 kväll. Verifikation: 58 test-filer, 377 tester passerar. Lint + typecheck rena i samtliga ändrade filer (pre-existing typfel i `build-spec.test.ts` om `complexityScore` är orelaterade och orörda).

### 1. Dossier-vokabulär synkas från disk

**Fil:** [`src/lib/builder/site-brief-generation.ts`](../../../src/lib/builder/site-brief-generation.ts)

Den hardkodade listan `"payments, auth, ai-chat, image-gen, pricing-section, visual-3d"` är borta. Ersatt med `buildCapabilityBulletList()` som läser `getAllDossiers()` vid varje request och returnerar en alfabetisk kebab-case-lista med dossier-id och första mening från summary.

**Effekt:** Lägg till `data/dossiers/hard/klarna-checkout/` med `capability: "payments"` så ser brief-LLM:n den i nästa run — utan kodändring. Hallucinerade capabilities (`image-gen`, `auth` utan dossier-backing) kan inte längre "smita igenom" eftersom listan den ser är härledd från faktisk disk.

**Defensiv fallback:** om registry-läsningen kraschar loggas det via `debugLog("brief", ...)` och brief-LLM:n får den generiska kebab-case-instruktionen.

### 2. Autofix-stubs blir tysta null-returns

**Fil:** [`src/lib/gen/autofix/rules/cross-file-import-checker.ts`](../../../src/lib/gen/autofix/rules/cross-file-import-checker.ts) rad 156–176

Default-stuben för PascalCase-komponenter returnerar nu `null` med en `// autofix-stub:<Name>` kommentar i stället för en synlig streckad `[Name]`-ruta. Provider/Context/hook-stubs är oförändrade (de behöver sina React-semantiker).

**Effekt:** När autofix i run 2 skapade `paddling-captain.tsx` innan modellens fil hann landa, hade användaren sett en streckad ruta i previewen som såg ut som trasig design. Med ändringen renderas inget alls — upplevs som "komponenten är inte monterad än", vilket är närmare sanningen. Import-resolvern + TypeScript-bindningar tillfredsställs fortfarande, så om modellens riktiga fil merges in i nästa pass kan den vinna utan crashes.

**Observerbarhet:** Grepa efter `autofix-stub:` i genererad kod för att hitta var modellen inte hann fylla i ett riktigt impl.

### 3. F3-integrations clampade mot dossier-backing

**Fil:** [`src/lib/integrations/tier3-build-spec.ts`](../../../src/lib/integrations/tier3-build-spec.ts)

`deriveTier3BuildSpec()` bygger nu ett `DossierBackingIndex` (från `getAllDossiers()`) och kollar varje integration mot det. Backing detekteras via:

- Dossier-id lika med eller börjar med integration-nyckeln (t.ex. `stripe-checkout` matchar `stripe`)
- Dossier-capability lika med integration-kategori (t.ex. dossier `capability: "payments"` matchar integration `category: "payments"`)
- Integration-nyckeln förekommer i dossierns `dependencies` (t.ex. `@clerk/nextjs`)

Integrations utan backing nedgraderas från `requiredRealEnvKeys` → `warnOnlyEnvKeys`. F3-validationen blockerar inte längre på dem; UI:t kan visa dem som advisory.

**Effekt:** Fidelity-3-försöket som bad om `CLERK_SECRET_KEY`, `CONTENTFUL_SPACE_ID`, `MONGODB_URI` osv kommer nu att slå igenom *utan* att kräva värden för dessa (eftersom ingen dossier implementerar dem). Så fort Klarna, Clerk eller MongoDB får egna dossiers kommer clampen plocka upp dem automatiskt.

**Test:** ny test `downgrades unbacked integrations (no matching dossier) to warn-only` verifierar beteendet.

### 4. Capability-map auto-genereras

**Ny fil:** [`scripts/dossiers/regenerate-capability-map.ts`](../../../scripts/dossiers/regenerate-capability-map.ts)

**Uppdaterad fil:** [`data/dossiers/_index/capability-map.json`](../../../data/dossiers/_index/capability-map.json) — regenererad, alfabetisk, deterministisk sortering.

**Package-scripts:**

- `npm run dossiers:capability-map:check` — exit 1 om disk drev från mappen
- `npm run dossiers:capability-map:write` — regenererar

**Effekt:** Capability-map:en var 2 månader gammal och hade gammal nyckel-ordning. Nu är den härledd från disk vid behov. CI eller pre-commit-hook kan köra check-varianten för att larma om någon lägger till en dossier utan att uppdatera indexet.

### 5. Schema ränsat

**Fil:** [`docs/schemas/strict/dossier.schema.json`](../../../docs/schemas/strict/dossier.schema.json) rad 35

Den hårdkodade exempel-listan `"'payments', 'auth', 'ai-chat', 'image-gen', 'pricing-section', 'visual-3d'"` är borta från `capability.description`. Ersatt med en hänvisning till `npm run dossiers:capability-map:write` och en instruktion om att återanvända befintliga capability-id:n när flera dossiers konkurrerar under samma kategori (explicit Klarna/Stripe-exempel).

**Effekt:** Curatorer som skapar nya dossiers vägleds inte längre till en föråldrad lista som driver drift mellan brief-LLM, dossier-disk och F3-registry.

## Övergripande designfråga (för diskussion)

Värt att fundera över: ska de **tre katalogerna konsolideras till en**? Dvs:

- En `data/capabilities/`-mapp där varje capability har `manifest.json` + ev. `dossier/`-undermapp + ev. `f3-integration/`-undermapp
- Brief-LLM, codegen-LLM och F3-validering läser alla från samma katalog
- Kostnad: en stor refaktor; vinst: ingen mer "vilken katalog säger vad"

Den frågan är för stor för den här planen — flagga som långsiktig arkitekturdiskussion istället.
