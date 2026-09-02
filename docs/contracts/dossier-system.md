# Dossier system (v2)

**Status:** Active. Replaces `dossier-format.md`, `dossier-promotion-flow.md`, and `dossier-pipeline-roadmap.md` (archived 2026-04-20). Schema: `docs/schemas/strict/dossier.schema.json`. Runtime: `src/lib/gen/dossiers/`.

## TL;DR

A dossier is a **reusable building block** the codegen LLM can drop into a generated site. The pipeline is **deterministic and capability-driven**: the brief declares which capabilities the site needs (`payments`, `auth`, `ai-chat`, `pricing-section`, …), and each capability resolves to exactly one dossier (or none).

**Dossiers are NOT templates.** "Templates" (= v0-mallar, the Blob-backed gallery on `/templates` / the Mallar tab) are complete sites imported verbatim — a separate system with its own categories and thumbnails (see `docs/architecture/templates.md`). Dossiers have neither. The similarly-named `data/template-references/` is dossier-curation input, not gallery content.

No embeddings. No fuzzy matching. No category boost. No domain veto. What the brief asks for is what gets injected.

## Two classes (path-encoded)

```
data/dossiers/
  hard/<id>/manifest.json   # declared provider/integration coupling (Stripe, OpenAI, Postgres, analytics)
  soft/<id>/manifest.json   # no declared integration provider/secret; npm + public keyless resources allowed
  _index/capability-map.json   # generated view: capability → [ids] + groups (dossier-grupp)
```

| Class  | When to use                                                                                                                                                            | Behavior                                                                                                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hard` | Declares a coupling to an external provider/service or its integration-runtime contract. It may have secrets, public config, SDK/server files, or a client-only provider integration. | Selection marks `configured: true\|false` per project (see the selection algorithm below). Missing values follow the dossier's `mock`/enforcement contract. `hard` does **not** by itself mean "requires F3". |
| `soft` | No declared integration provider/account/secret. npm dependencies, local files, and public keyless resources are allowed.                                                              | Always considered configured.                                                                                                                                                                                 |

### Provider identity and ownership

Every `hard` manifest must declare a non-empty `providers` array; `soft`
manifests must omit it. The values are canonical provider identities such as
`stripe`, `openai` or `postgres`. (Composite multi-provider dossiers left the
live pool with etapp 4 — `rag-chat` owned both `openai` and `postgres`.)

The ownership hierarchy is strict:

1. `manifest.json` owns provider → exact dossier ids/capabilities, env
   enforcement, files, exports and verification status.
2. `src/lib/gen/dossiers/registry.ts` exposes the generated runtime projection.
   Exactly one matching dossier is `unique`; more than one is `ambiguous` and
   must not be selected implicitly.
3. `src/lib/integrations/registry.ts` supplies generic provider metadata only
   when no unique dossier contract exists.
4. `agent-tools.ts` derives its provider enum from that registry plus the
   manifest provider catalog; it is never a separately maintained owner.

Do not infer provider ownership from dossier ids, npm dependencies,
capabilities or integration categories. Thus `stripe` resolves uniquely to
`stripe-checkout`, while a bare `openai` approval remains generic until an
exact capability/dossier is known.

Hard dossiers whose runtime crashes on missing/placeholder keys should additionally **key-gate themselves in the shipped files** — e.g. `clerk-auth/components/middleware.ts` only constructs `clerkMiddleware` when the keys are structurally valid and otherwise degrades to `NextResponse.next()` (placeholder keys must never 500 the whole preview). The `configured` flag from selection is a prompt signal, not a runtime guard — it is never wired to any gate.

## Grupper (presentations-lager)

Grupper är UI-rubriker för backoffice och builderns Byggblock-panel — inte en
ny schemadimension. Trenivåmodellen: **Grupp** (UI-rubrik, styr aldrig
selektion) → **Capability** (exakt funktion, styr dossier-val enligt
selektionsalgoritmen ovan) → **Dossier/provider** (implementation; flera per
capability, en är default via `defaultForCapability`). Grupp härleds från
capability via kanonisk mappning i
[`src/lib/builder/dossier-groups.ts`](../../src/lib/builder/dossier-groups.ts)
(`resolveDossierGroup`) — inget nytt manifestfält, ingen runtime-/selektionspåverkan.
Aktuell capability→grupp-vy:
[`docs/generated/capabilities.generated.md`](../generated/capabilities.generated.md).

| #   | Grupp-id       | Svensk label        | Capabilities                                                                 |
| --- | -------------- | ------------------- | ---------------------------------------------------------------------------- |
| 1   | `data-content` | Data & innehåll     | `database` (`cms` lämnade 2026-09-02 med parkerade sanity-cms)               |
| 2   | `auth`         | Inloggning & konton | `auth` (en capability — clerk-auth default, supabase-auth leverantörssyskon) |
| 3   | `commerce`     | Betalning & handel  | `payments` (`subscriptions` lämnade 2026-08-06 med parkerade paddle-billing) |
| 4   | `contact`      | Kontakt & utskick   | `contact-form`, `newsletter-subscribe`, `booking`                            |
| 5   | `ai`           | AI                  | `ai-chat` (`ai-tool-calling` / `rag-chat` lämnade 2026-08-06 med etapp 4)    |
| 6   | `search-maps`  | Sök & karta         | `site-search`, `map-display`, `command-palette`                              |
| 7   | `media`        | Media & galleri     | `gallery-lightbox`, `carousel`, `media-storage` (vercel-blob-media, 2026-09-02) |
| 8   | `interactive`  | Interaktivt & 3D    | `visual-3d`, `physics-3d`, `physics-2d`, `scroll-story`, `spatial-canvas`, `interactive-game`, `dashboard-charts` |
| 9   | `ops`          | Drift & mätning     | `analytics` (visitor-counter default sedan 2026-09-02, vercel-analytics syskon) |
| 10  | `other`        | Övrigt              | (fångstnät för omappade capabilities)                                        |

> **Taxonomi-omtag 2026-07-22 (ägarbeslut):** elva soft-dossiers parkerades
> (utfasade soft-dossiers 2026-07-22 — rena innehållssektioner och
> CSS-effekter som codegen-LLM:en skriver bättre frihand: cta/faq/pricing/
> testimonials/feature-grid/logo-cloud/stats-counter/stepper/marquee/parallax
> ×2; träd borttaget 2026-08-10, finns i git-historik). `command-search` döptes om till `command-palette`, `supabase-auth`
> slogs ihop med `auth` (en capability, två leverantörsdossiers), och två nya
> nyckelfria capabilities tillkom: `map-display` (maplibre-map — MapLibre +
> OpenFreeMap) och `site-search` (local-site-search — MiniSearch).
> Legacy-id:n normaliseras via `CAPABILITY_ALIASES` i `select.ts`
> (`supabase-auth` → `auth` med dossier-pin, `command-search` →
> `command-palette`) så gamla snapshots fortsätter selektera rätt.
>
> **Nedbantning 2026-08-06 (ägarens fria-händer-uppdrag 2026-08-05):** sju
> hard-dossiers parkerades 2026-08-06 (träd borttaget 2026-08-10; git-historik):
> etapp 1 `sentry-error-tracking`, `plausible-analytics`,
> `fal-image-generation`, `ably-realtime`; etapp 2 `paddle-billing`; etapp 3
> `neon-postgres`, `mongodb-atlas` — noll prod-selektioner sedan telemetristart
> och inga lastbärande kodreferenser. Capabilities `error-tracking`,
> `image-generation`, `realtime` och `subscriptions` lämnade därmed grupper,
> brief-prompt, follow-up-vokabulär och undantagslistan; `analytics` kvarstår
> med `vercel-analytics` som ensam provider, `database` med
> `postgres-drizzle` som ensam provider. Ops-gruppens label smalnade från
> "Realtid & drift" till "Drift & mätning". En gammal snapshot med ett utfasat
> capability-id eller parkerat dossier-id selekterar tyst ingenting; ett
> F3-godkännande av providern (`mongodb`/`neon` m.fl.) går den generiska
> vägen (`providerKeysWithoutBackingDossier`).
>
> **Småföretagar-översyn 2026-09-02 (ägarbeslut):** `sanity-cms` parkerades
> (träd borttaget; git-historik) — den levererade bara frontend-glue utan
> Studio eller innehållsmodeller, vilket en sajtägare utan utvecklare inte kan
> använda. Capability `cms` lämnade grupper, brief-prompt, follow-up-vokabulär
> och negationstermer; `contentful` m.fl. går den generiska providervägen.
> Samtidigt tillkom `vercel-blob-media` under den nya capability
> `media-storage` (grupp `media`): sajtägarens egna tunga media (MP4, större
> bildsamlingar) serveras från en Vercel Blob-store i stället för repot, med
> `mock: seed` (medskickad `seedMedia` + `<MediaConfigNotice />`) och utan
> publik upload-route. `next-sanity` ligger kvar som frihandspin i
> `dep-completer.ts` (samma behandling som `@paddle/paddle-node-sdk`).
> `analytics` fick en ägarsynlig default: sajter deployas i Sajtmaskins
> Vercel-team, så Vercel Analytics-siffrorna når aldrig sajtägaren. Nya
> `visitor-counter` (providers `upstash`, `mock: seed`) skeppar
> `<VisitBeacon />` för root-layouten, `/api/visits` (page views + besök per
> lokal dag i Upstash Redis via ren REST) och en standardiserad
> `/statistik`-sida med `<VisitorStats />`; utan lagring tickar en in-memory
> demoserie med ärlig notis. `vercel-analytics` kvarstår som explicit syskon
> (`relevanceKeywords` "vercel analytics"/"speed insights"). Eftersom
> defaulten har serverfiler härleds `analytics` nu till F3 av kontraktet;
> policy-residualen i `f2-mute.ts` behålls för det klient-only-syskonet.
> `resolvePendingIntegrationDossiers` fick samtidigt en dubbelmonteringsspärr:
> en klient-only dossier vars provider designrundan redan skrivit in
> (`@vercel/analytics`) installeras inte en andra gång i F3.
>
> **Mjuk våg 1 2026-09-02 (ägarbeslut efter extern review):** två nya soft-
> dossiers under `interactive`, båda explicit-ask-only (mood-ord som "cool",
> "premium", "cinematic" väljer dem aldrig). `scroll-story-orchestrator`
> (capability `scroll-story`, framer-motion) ger scrollytelling med fastnålade
> scener på desktop och linjär dokumentordning på mobil/reduced motion — all
> kapiteltext finns alltid i DOM, ingen scroll-hijack; `needsParallax` snävades
> samtidigt så `scroll-driven`/`pinned section` ensamt inte längre räknas som
> parallax. `matter-physics-2d` (capability `physics-2d`, matter-js) driver
> riktiga DOM-element med 2D-fysik i en avgränsad scen och faller tillbaka på
> ett statiskt grid vid reduced motion; en ny inferensflagga `needsPhysics2D`
> tar över fysikverben från `needsPhysics` när prompten är explicit 2D/Matter
> utan 3D-stack-token, så WebGL-stacken aldrig dras in. `matter-js` stubbas i
> repots tester (`tests/stubs/matter-js.ts`). Hårda kandidater
> (Redis/QStash/Algolia) är medvetet inte med i dessa vågor.
>
> **Mjuk våg 2 2026-09-02:** `xyflow-spatial-canvas` (capability
> `spatial-canvas`, `@xyflow/react` v12) — panorerbar/zoombar arbetsyta med
> kort-noder, relationer, minimap, fit-view och detaljpanel utan att lämna
> ytan; state i minnet med ärlig "sparas inte"-notis i redigerbart läge,
> embedded-läge stjäl aldrig sidscroll. Samtidigt snävades 3D-detektionen:
> bara `canvas`/`scene` är inte längre en 3D-signal (`NEEDS_3D_PATTERNS`,
> `explicitlyRequests3D`, vokabulären `visual-3d`) — 3D kräver ett 3D-token
> eller en sammansättning (`3d-canvas`, `webgl canvas`). `@xyflow/react`
> stubbas i repots tester (`tests/stubs/xyflow-react.tsx`). Två kandidater
> från samma review parkerades medvetet: **shared-view-transitions** — Next
> 16.3.1 exponerar `viewTransition` bara i de experimentella
> app-page-runtimes (ingen flagga i `config-schema`), så Reacts
> `<ViewTransition>` kräver canary och den nakna `document.startViewTransition`
> är skör mot App Routers asynkrona commits; omprövas när baseline har stabilt
> stöd. **kinetic-type-engine** — en rubrikanimation är frihandsjobb; blir
> dossier först om ett återkommande behov av den gemensamma säkra kärnan
> (Intl.Segmenter, aria-hidden-span, reduced motion) bevisas.

**Fallback-principen:** demo-_mönstret_ (seed-data, canned-svar, fejkad
success) är gemensamt per capability, men garantin gäller **per dossier**:
runtime läser alltid den _valda_ dossierns eget `mock`-fält — väljs en
icke-default provider via `relevanceKeywords` (t.ex. "logga in med supabase" →
`supabase-auth`) används den dossierns mock-läge. Därför kräver kontraktet
(ägarbeslut 2026-07-12, skärpning av det ursprungliga capability-beslutet B3)
att **varje** hard-dossier under en icke-undantagen capability deklarerar ett
riktigt mock-läge — inte bara defaulten.

**CI-invariant (tvingande sedan 2026-07-12; per-dossier sedan samma dag):**
**varje hard-dossier** i en icke-undantagen capability ska ha `mock ≠ none`,
och varje hard-capability ska ha exakt en upplösbar default-dossier — annars
måste capabilityn stå på undantagslistan nedan. Kontrollen är CI-blockerande
via `npm run dossiers:validate-all` och implementeras av
`findMissingMockFallbacks()` i
[`validate-manifest.ts`](../../src/lib/gen/dossiers/validate-manifest.ts)
(ingen ny schemadimension). Undantagen är **capability-breda** (en framtida
provider under t.ex. `payments` ärver undantaget). Default-upplösningen är
avsiktligt **strängare än runtime-selektionen**: CI godkänner den enda dossiern
med `defaultForCapability: true`, eller — om ingen är flaggad — capabilityns
_enda_ dossier. Flera hard-dossiers utan flaggad default är ett CI-fel här
(ingen upplösbar standard-demo), medan `select.ts` i det läget tyst väljer
första dossiern i id-ordning; flera _flaggade_ defaults ägs av
`defaultForCapability`-unikhetskontrollen. **Obs:** detta är en
metadata-invariant — beteendegarantin (monterar utan krasch, känner igen
placeholders, gör inga riktiga provider-anrop, visar ärlig config-notis)
är ett acceptanskriterium som ägs av detta kontrakt och bevisas med tester
(t.ex. `dossier-config-fallback.test.tsx`), inte bara med manifest-fält.
(Ursprung: grandmaster-planen för dossier-grupper och fallback-kontrakt,
etapp 7 — planfilen är trimmad, full text i git-historik.)

**Undantagslistan** (`MOCKLESS_CAPABILITY_EXCEPTIONS` i samma fil) — capabilities
där `mock: none` är legitimt eftersom det inte finns någon användarsynlig yta
alls att visa demo på. Skärpt 2026-07-22 (ägarbeslut: varje användarsynlig
kategori ska ha en demo-fallback): `payments` och `auth` (samt sedermera
parkerade `subscriptions` och `realtime`) lämnade listan och deklarerar nu
`mock: "visual"` — den
interaktiva ytan renderas fullt ut och handlingen öppnar en ärlig
demo-notis/modal i stället för att utföra den riktiga operationen (aldrig
fejkade sessioner, debiteringar eller transport). `error-tracking` lämnade
listan 2026-08-06 av det motsatta skälet: dess enda dossier parkerades, så
det finns ingen hard-dossier kvar för undantaget att gälla.

| Capability  | Varför undantagen                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics` | Fire-and-forget-beacons har ingen visuell yta att mocka; dossiern har `envVars: []` och komponenten self-disablar utan hosting-token. |

Att lägga till en capability här är ett kontraktsbeslut, inte en genväg: en
demo-bar capability (DB, CMS, e-post, AI, betalning, inloggning …) ska i
stället få ett riktigt `mock`-läge. Nya behov blir nya capabilities i en
befintlig grupp, inte en ny grupp.

## Tre oberoende axlar (läs denna innan du drar en slutsats om en dossier)

Systemets vanligaste feltolkning är att de tre axlarna nedan svarar på
varandra. Det gör de inte — **ingen av dem kan härledas ur någon av de andra.**

| Axel                                     | Frågan den svarar på                                         | Kanonisk ägare                                                                                                   | Var användaren ser den                                                          |
| ---------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Kopplad / Fristående** (`hard`/`soft`) | Har manifestet en deklarerad provider-/integrationskoppling, eller saknar det sådan provider och konfiguration? | mappen `data/dossiers/{hard,soft}/`                                                                              | Badge på varje rad i Byggblock-panelen + `Klass`-kolumnen i backoffice          |
| **Demoläge** (`mock`)                    | Hur beter sig ytan i F2/preview _utan livekonfiguration_?    | manifestfältet `mock` på den **valda** dossiern                                                                  | Chip i den expanderade raden ("Demoläge: …") + `Demoläge`-kolumnen i backoffice |
| **Kräver F3**                            | Måste den riktiga integrationen byggas i ett eget steg?      | [`dossierRequiresF3()`](../../src/lib/gen/dossiers/types.ts) — `enforcement: "build"` **eller** `role: "server"` | Badge "Kräver F3" i panelens båda flikar + `Kräver F3`-kolumnen i backoffice    |

Konkreta kombinationer som visar oberoendet:

| Dossier            | Kopplad? | Demoläge | Kräver F3? | Varför                                                                                       |
| ------------------ | -------- | -------- | ---------- | -------------------------------------------------------------------------------------------- |
| `stripe-checkout`  | Ja       | `visual` | Ja         | Serverfil (`/api/checkout-session`) — inte nyckeln; `STRIPE_SECRET_KEY` är `feature-runtime` |
| `clerk-auth`       | Ja       | `visual` | Ja         | Enda kvarvarande `enforcement: "build"` — trasig inloggning är värre än demo-friktion        |
| `vercel-analytics` | Ja       | `none`   | **Nej**    | Inga egna env-nycklar (`envVars: []`) + bara klientfil; F2-policyn mutar ändå analytics (`F2_MUTE_POLICY_ONLY_CAPABILITIES`) så den inte injiceras i designläget; self-disable utan hosting-token |
| `calcom-booking`   | Ja       | `visual` | **Nej**    | Publik event-path med `feature-runtime` + bara klientfil; riktig kalender körs direkt medan saknad config ger ärligt demoläge |
| `embla-carousel`   | Nej      | —        | Nej        | Fristående; npm-paket + lokal komponentfil                                                    |

Följden av detta: **läs aldrig av "Kopplad" som "kräver F3"**, och läs aldrig av
`mock` som en fas-signal. Vokabulären ägs av
[`src/lib/builder/dossier-axes.ts`](../../src/lib/builder/dossier-axes.ts)
(produkt-UI). Kurator-UI speglar orden via
[`backoffice/pages/dossiers_lib/`](../../backoffice/pages/dossiers_lib/)
(`constants.py` / `labels.py` — fasaden `dossiers.py` är bara re-export).
F3-kravet speglas också som `buildServerRequirement` i
[`capability-map.json`](../../data/dossiers/_index/capability-map.json).

### Härledd livscykelvy för Byggblock-panelen

[`resolveDossierLifecycle()`](../../src/lib/gen/dossiers/lifecycle.ts) är den
rena ägaren av panelens befintliga fem statusar: `planned`, `self-contained`,
`blocked-build`, `built-demo` och `built-live`. Routens adapter laddar och
normaliserar bevisen; resolvern gör ingen DB-, registry- eller filläsning.

Detta är **inte** en ordnad state machine. Följande bevis förblir separata:

| Bevis                     | Betydelse                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pending`                 | Exakt dossier-id är uppskjutet från F2 och saknar ännu leveransbevis.                                                                      |
| `materialized`            | Exakt manifestbaserad filnärvaro från `resolveDossierIdsPresentInVersion`; `null` betyder att ingen läsbar version/fillista finns.         |
| `configured`              | Alla `required`-nycklar har riktiga projektvärden. Detta är fortfarande bara selectionens promptsignal.                                    |
| `detected`                | En filhärledd Tier3-requirement överlappar dossierns env-yta; `null` betyder att specen inte kunde härledas.                               |
| `serverEvidenceSatisfied` | Alla manifest-serverfiler finns, en modellbyggd API-route bevisar kopplingen, **eller** dossiern saknar en server-yta som behöver bevisas. |

Statusprecedensen är beteendebevarande:
`pending → planned`; ingen F3-yta → `self-contained`; ingen matchad requirement
→ `planned`; readiness saknar build-nyckel → `blocked-build`; annars avgör
riktiga build-/feature-runtime-värden och serverfilbevis `built-demo` kontra
`built-live`.

`overviewStatus` är endast panelens reporting-projektion. Modellbyggd kod kan
ge `built-live` utan exakt `materialized` dossieridentitet; statusen får därför
aldrig återanvändas som readiness-, deploy-, installations- eller
versionsverifieringsbevis.

Versionsverifiering hör **inte** till denna per-dossierprojektion. RenderGate/
ReleaseGate och revisionsmatchning kvitterar hela versionssnapshoten; att
projicera det som `verified: boolean` på varje dossier skulle skapa falsk
precision. Katalogfältet `lastVerified` är i sin tur kurationsbevis och ska inte
blandas ihop med ett versionskvitto.

### F2/F3-gräns: dossier-kontraktet är signalen (kanonisk)

Samma dossier kan spänna över F2 och F3 — det är inte två separata dossiers och det finns ingen extra `hard/soft/visual`-taxonomi som styr fasen:

- **F2 (design)** renderar en klient-/demo-/placeholder-safe version (visuell mockup).
- **F3 (integrations)** installerar den riktiga provider-/serverkoden; env-enforcement avgör om ett riktigt värde krävs före build eller om demo/self-disable får leva vidare.

**Kanonisk signal i dagens kod** för "kräver F3" är dossierns eget kontrakt, via helpern [`dossierRequiresF3()`](../../src/lib/gen/dossiers/types.ts) (enda källan). Två regler:

1. **Env-kontrakt:** en `envVars`-post med `enforcement: "build"` (default när `enforcement` utelämnas). Efter #468 är `clerk-auth` (`CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) den **enda** hard-dossiern som fortfarande har `build`-enforcement — trasig inloggning är värre än demo-friktion. Övriga (Stripe, OpenAI, DB, e-post …) är `feature-runtime`/`warn-only` och degraderar via sitt mock-läge i stället för att blockera. En `build`-nyckel gör dossiern F3-relevant via env-vägen, men readiness blockerar bara om både ett riktigt projektvärde och en katalog-godkänd placeholder saknas. Clerk-nycklarna har i dag katalog-placeholder och kan därför köra demo utan ett automatiskt F3-stopp.
2. **Server-yta:** en `files[]`-post med `role: "server"` — dossiers som skeppar backend-wiring (API-route, middleware, server-config) hör till F3 även utan build-secret. Exempel: `resend-contact-form` (alla nycklar `feature-runtime`, men `/api/contact`-routen importerar `resend` som F2:s SDK-deny-lista strippar) och `mailchimp-newsletter`. I F2 renderas formuläret som visuell mockup enligt F2-kontraktet i `session-contracts.ts`; mejl/prenumeration aktiveras först i F3 ("Bygg integrationer").

[`getF3RequiredCapabilities()`](../../src/lib/gen/dossiers/registry.ts) räknar upp de capability-nycklar vars dossier kräver F3, och `orchestrate.ts` deriverar F2-mute-listan därifrån (union med policy-residualen `{analytics}` — icke-secret, server-fri integration som ändå ska F2-mutas, per [`env-flow-f2-mute`](../../.cursor/rules/env-flow-f2-mute.mdc)). En dossier med `envVars: []` och enbart klientfiler (t.ex. `interactive-game-loop`) är alltså **fullt F2-användbar**. Utöka gränsen i helpern om ett framtida fall behöver det — inte via en ny per-dossier-flagga eller separat hårdkodad lista.

### Mock/demo-läge (`mock`) — hur en hard-dossier beter sig i F2 utan livekonfiguration

Det deklarativa `mock`-fältet ([`DossierMockMode`](../../src/lib/gen/dossiers/types.ts)) beskriver hur en hard-dossier gör sin **visuella yta** funktionell i F2/preview utan livekonfiguration, till exempel när en nyckel saknas eller är en preview-stub. Fältet driver dels dossierns egen komponentkod (den emitterade användarsajtens degraderingsväg), dels en promptrad till codegen-LLM:n via `describeMockMode` ([`system-prompt/sections/dossiers.ts`](../../src/lib/gen/system-prompt/sections/dossiers.ts)) så modellen förlitar sig på den inbyggda fallbacken i stället för att hitta på en egen.

| `mock`                         | Beteende i F2/preview utan livekonfiguration                                                                                                                                                                                                                                                                                                                                                                                                                                             | Exempel-dossiers                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `canned`                       | Server-routen returnerar ett trovärdigt fabricerat svar i demo-läge (chatboten streamar ett canned-svar). Riktiga vägen återupptas när en riktig nyckel sätts.                                                                                                                                                                                                                                                                                                                          | `openai-chat`                                                                       |
| `seed`                         | Data-lagret faller tillbaka på medskeppad `seedData` + en diskret `<DbConfigNotice />` när connection-strängen saknas/är stub, så DB-vyer renderar utan riktig databas. **Medvetet vald framför in-preview-SQLite:** `better-sqlite3` kräver native-build på preview-VM:en (skört), medan in-memory seed ger samma visuella resultat utan native-deps.                                                                                                                                  | `postgres-drizzle`, `vercel-blob-media`, `visitor-counter`                          |
| `success`                      | Mutations-endpoints returnerar en fejkad success + en demo-notis (`demo: true`) så formulär går igenom i F2 utan att koppla providern.                                                                                                                                                                                                                                                                                                                                                  | `resend-contact-form`, `mailchimp-newsletter`                                       |
| `visual` (nytt 2026-07-22)     | Den interaktiva ytan renderas fullt ut (betalknapp, inloggningsknappar, live-widget) och **handlingen** öppnar en ärlig demo-notis/modal i stället för att utföra den riktiga operationen — aldrig fejkade sessioner, debiteringar eller transport. Riktiga backend aktiveras när leverantörsvärden sparas. Exempel: stripe-checkouts `CheckoutButton` är klickbar och öppnar "Demoläge — ingen riktig betalning"-modalen; clerk-auths knappar öppnar "Inloggning i demoläge"-dialogen. | `stripe-checkout`, `clerk-auth`, `supabase-auth`                                    |
| `none` (default vid utelämnat) | Ingen användarsynlig demo-yta alls → komponenten self-disablar (analytics) eller visar en diskret konfigurationsbanner.                                                                                                                                                                                                                                                                                                                                                                 | `vercel-analytics`                                                                  |

Mock-värden är **F2/preview-only** — de persisteras aldrig till `projectEnvVars` och skeppas aldrig till en riktig deploy. En dossier som fått en _riktig_ primärnyckel men har platshållare på en sekundärnyckel tar den ärliga setup-vägen (t.ex. `resend-contact-form`: riktig `RESEND_API_KEY` men placeholder `EMAIL_FROM`/`CONTACT_EMAIL_TO` → `503 email-not-configured` + `IntegrationConfigNotice`), aldrig ett riktigt anrop med fejkad config.

**Alla hard-dossiers har ett explicit `mock`-läge utom analytics-undantaget.** Endast `vercel-analytics` utelämnar fältet → `none`; det är korrekt eftersom den saknar egna env-nycklar (`envVars: []` — komponenten self-disablar helt utan visuell yta att mocka) och capability `analytics` står på undantagslistan. Att **varje** hard-dossier i en icke-undantagen capability har `mock ≠ none` är **CI-tvingat** (per-dossier sedan 2026-07-12) — se **Fallback-principen** i grupp-sektionen ovan (`findMissingMockFallbacks` i `validate-manifest.ts`). Aktuell katalog: [`docs/generated/dossiers.generated.md`](../generated/dossiers.generated.md).

## Two code-fidelities (per-dossier default + per-file override)

| Fidelity     | When                                                                                                                | Effect on prompt                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verbatim`   | Integration glue where paraphrasing breaks the integration: webhook signing, OAuth callbacks, SDK init, middleware. | The file is rendered into the system prompt under `## Dossier Files To Emit Verbatim`. The codegen LLM **must** emit it byte-exact in its CodeProject output. |
| `rewritable` | UI components, layout patterns, render glue the LLM should adapt to the project.                                    | The file is described via compact manifest-derived guidance in the prompt (see `promptInstructionMode` below) and the codegen LLM may paraphrase freely.      |

The dossier-level `codeFidelity` is the default. Individual files can override via `files[].injectionMode`.

**Verbatim enforcement is two-layered.** The prompt block is layer 1; layer 2 is post-merge: `applyDossierVerbatimPolicy()` (`src/lib/gen/dossiers/verbatim-policy.ts`, called from `finalize-merge.ts`) restores any verbatim dossier file the LLM drifted from back to the canonical dossier source. On follow-ups, verbatim files already present in the project are listed under `## Dossier Verbatim Files Already in Project` instead of being re-rendered in full.

## Capability surface ownership (one owner per capability)

A dossier that `exposes` a UI component owns that capability's surface. When a follow-up adds such a dossier to a project whose previous version does **not** contain the exposed component, `renderDossierBlocks` emits `## Capability Surface Ownership` (`src/lib/gen/system-prompt/sections/dossiers.ts`): the dossier's component, its import specifier and its server route are named, and the model must pick **adapt** (point the existing surface at the dossier's route) or **replace** (make the dossier component the owner) — never leave two live.

The block is emit-time prevention, which is the part the pipeline can guarantee: follow-up merge (`mergeVersionFilesWithWarnings`) carries previous files forward, and the only deterministic deletion path is `removeExplicitlyRemovedDossierFiles`, which drops dossier-owned paths for dossiers the user explicitly removed. So the contract tells the model to stop _calling_ the competing endpoint rather than to delete it, and `runProjectSanityChecks` flags any component still pointing at an API path no route handler serves (Advisory).

Incident this closes: chat `747636c8` (2026-07-13) built its own `components/chatbot-widget.tsx` + `app/api/ai-chat/route.ts` in F2, then added the `openai-chat` dossier for the same `ai-chat` capability. Nothing declared ownership, the page ended up with two chat implementations, and the hand-rolled one carried the `TS2345` that failed the F3 ReleaseGate.

## Manifest schema (7 common required + class rule)

```json
{
  "$schema": "../../../../docs/schemas/strict/dossier.schema.json",
  "id": "stripe-checkout",
  "mock": "visual",
  "label": "Betalning — Stripe",
  "capability": "payments",
  "providers": ["stripe"],
  "codeFidelity": "verbatim",
  "complexity": "medium",
  "defaultForCapability": true,
  "summary": "Hosted Stripe Checkout for ONE-TIME payments. …",
  "envVars": [
    {
      "key": "STRIPE_SECRET_KEY",
      "required": true,
      "enforcement": "feature-runtime",
      "purpose": "API auth",
      "setupUrl": "https://docs.stripe.com/keys"
    }
  ],
  "dependencies": ["stripe"],
  "files": [
    { "path": "components/checkout-button.tsx", "role": "client", "injectionMode": "verbatim" },
    {
      "path": "components/integration-config-notice.tsx",
      "role": "shared",
      "injectionMode": "verbatim"
    },
    {
      "path": "components/api/checkout-session/route.ts",
      "role": "server",
      "injectionMode": "verbatim"
    }
  ],
  "exposes": [
    { "name": "CheckoutButton", "type": "component", "import": "@/components/checkout-button" }
  ],
  "lastVerified": "2026-04-20",
  "sourceRepoUrl": "https://github.com/..."
}
```

| Field                   | Required                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | ✓                          | Kebab-case, must match the directory name.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `label`                 | ✓                          | Human label for backoffice.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `capability`            | ✓                          | Single kebab-case capability (matched against `brief.requestedCapabilities`).                                                                                                                                                                                                                                                                                                                                                                                           |
| `providers`             | hard: ✓ · soft: forbidden  | Canonical provider identities this dossier implements. One or more for `hard`; omit for `soft`. Multiple matches for the same provider are intentionally ambiguous and require an exact capability/dossier selection.                                                                                                                                                                                                                                                   |
| `codeFidelity`          | ✓                          | `verbatim` or `rewritable` (default for files).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `complexity`            | ✓                          | `simple` / `medium` / `advanced`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `summary`               | ✓                          | 1-3 sentences. Used in prompt + backoffice.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `lastVerified`          | ✓                          | ISO date YYYY-MM-DD for the latest completed human acceptance pass; for an explicitly `unverified` draft it remains only the imported source date. Cadence is owned by `config/dossier-verification-policy.json`.                                                                                                                                                                                                                                                       |
| `verificationStatus`    | optional                   | `"accepted"` or `"unverified"`. `unverified` always fails the dedicated evidence/freshness gate regardless of date. Omitted remains backward-compatible with existing accepted manifests; all new AI/backoffice drafts are written as `unverified`.                                                                                                                                                                                                                     |
| `defaultForCapability`  | optional (default `false`) | Tie-breaker when two dossiers share the same capability.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `relevanceKeywords`     | optional                   | Provider-specific keywords/phrases (max 12) marking an EXPLICIT ask for this dossier when several share one capability — e.g. `"supabase"` on `supabase-auth` under `auth`. A prompt hit overrides the `defaultForCapability` pick (Unicode word-boundary match, hyphen counts as part of the word). Keep high-precision; generic nouns belong in the follow-up capability vocabulary.                                                                                     |
| `envVars`               | hard: optional · soft: empty/omit | External configuration needed at runtime. Each entry takes optional `enforcement` (P31): `"build"` (default — requires a real value or catalog-approved placeholder for F3), `"feature-runtime"` (UI shows banner / popup at runtime, F3 reports as warning not blocker), or `"warn-only"` (component self-disables on empty value), plus optional `setupUrl` to an official provider page for obtaining that exact value. See [glossary](../architecture/glossary.md). |
| `dependencies`          | optional                   | npm packages added to `package.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `files`                 | optional                   | Files injected into the project. Per-file `injectionMode` overrides dossier `codeFidelity`.                                                                                                                                                                                                                                                                                                                                                                             |
| `exposes`               | optional                   | Symbols the codegen LLM may import.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `sourceRepoUrl`         | optional                   | Provenance pointer to the upstream implementation/reference. Never use it as the user's provider-setup link; that belongs on `envVars[].setupUrl`.                                                                                                                                                                                                                                                                                                                      |
| `notes`                 | optional                   | Curator-only free text (drafts from `dossiers:curate`); never reaches the prompt. Remove once validated.                                                                                                                                                                                                                                                                                                                                                                |
| `promptInstructionMode` | optional                   | How much of `instructions.md` reaches the prompt: `compact` (default — manifest-derived summary), `selected-sections`, or `full`.                                                                                                                                                                                                                                                                                                                                       |
| `mock`                  | optional                   | How the dossier renders its visual surface in F2/preview without live configuration: `canned` / `seed` / `success` / `visual` / `none`. Omitted = `none`. Drives the dossier's own degradation code + a codegen-prompt hint. See the **Mock/demo-läge** section above.                                                                                                                                                                                                     |
| `summarySv`             | optional                   | Swedish catalog description shown to END USERS (builder Byggblock panel + backoffice). Never reaches the codegen prompt — the English `summary` owns that surface. UI falls back to `summary` when omitted.                                                                                                                                                                                                                                                             |

## `instructions.md` template

Every dossier ships with a Markdown file. Five standard sections — CI (`dossiers:validate-all` via `validate-manifest.ts`) **requires** the first two (`When to use`, `How to integrate`) and treats the other three (`UX rules`, `Avoid`, `Verification`) as recommended warnings:

```markdown
# When to use

[1-3 bullets where this dossier is the right pick]

# How to integrate

[Numbered steps: import, env, mount-point]

# UX rules

[Feedback, validation, mobile, accessibility]

# Avoid

[Concrete don'ts that the LLM might naively try]

# Verification

[Manual smoke checks the developer can run]
```

Keep it **scaffold-agnostic** when the rule applies regardless of layout, and **scaffold-aware** when the integration depends on it (e.g. "if the scaffold has a sidebar, mount X there"). Avoid vague hedges.

## Selection algorithm

`selectDossiersForRequest(opts)` lives in `src/lib/gen/dossiers/select.ts`:

1. Read `requestedCapabilities` (from explicit option or `brief.requestedCapabilities`). When the caller COMPUTED the list (the F3 capability-scope in orchestrate passes `disableBriefFallback: true`), an empty list is authoritative — the brief fallback never resurrects speculative capabilities in F3.
2. Normalize legacy aliases (`CAPABILITY_ALIASES`): `supabase-auth` → `auth` (with a dossier PIN on the `supabase-auth` dossier so the legacy id keeps meaning "Supabase specifically") and `command-search` → `command-palette` — old snapshots/briefs keep resolving. Then expand dependent capabilities (`expandDependentCapabilities`): a capability that only works with a companion pulls it in automatically — the table is EMPTY since 2026-08-06 (the only entry ever needed, `subscriptions` ⇒ `auth` pinned to `supabase-auth`, left with the parked paddle-billing dossier); the mechanism stays for a future dossier whose F3 surface genuinely cannot work alone, never as a convenience bundle. The former ai-tool-calling ⇒ drop ai-chat dedup died with etapp 4 (those dossiers parked). The former supabase-auth/auth dedup is obsolete since the capability merge — one capability selects exactly one dossier, so two colliding root middlewares can no longer be picked. The same helper runs in `filterDossierCapabilitiesForPrompt` (orchestrate) so prompt and selection stay in lockstep; in F2 the base capability is already muted, so expansion only fires in F3.
3. For each capability, find dossiers via `getDossiersByCapability(cap)`.
4. If multiple match: a dependency/alias PIN wins first (reason `dependency-pin`); otherwise an explicit `relevanceKeywords` hit in `promptText` (when the caller supplies it — orchestrate passes the raw prompt) overrides the default, e.g. "logga in med supabase" → `supabase-auth` even though `clerk-auth` is the `auth` default. Otherwise pick the one with `defaultForCapability=true`, else the first by id-sort. Callers without a prompt (dep-completer backstop, snapshot re-selection) always get the capability default.
5. For hard dossiers, mark `configured: true|false` from the **current project's** stored env keys (`SelectDossiersOptions.configuredEnvKeys`, threaded from `getStoredProjectEnvVarMap`) — a hard dossier is `configured` only when all its required keys have a real stored value for that project. Reading the platform `process.env` is a **deprecated fallback** kept only for callers that cannot supply a project env map (e.g. the dep-completer backstop); it is wrong for user projects (Sajtmaskin's own keys leak in). The flag is a prompt-only signal, never wired to a gate.
6. Eagerly load `instructions.md` for selected dossiers.

### Version-presence union (reporting + gates)

Selection answers "what should THIS round wire"; the separate question "what is
IN this chat/version" is owned by `resolveSelectedDossiersWithVersionPresence`
(`version-presence.ts`): snapshot-derived selection ∪ dossiers whose files are
actually present in the version (all `role: "server"` files + at least one
distinctive, non-shared file; client-only dossiers need one distinctive file).
A **baseline path is never distinctive.** The scaffold fills in `lib/utils.ts`,
`app/layout.tsx` and the rest of `SCAFFOLD_FILES` for every project regardless of
selection, so a manifest that declares one of them would make its dossier look
built in every single site. That is not hypothetical: `dashboard-charts` declared
`components/lib/utils.ts`, which maps to the baseline `lib/utils.ts`, and reported
as connected in sites without a single chart (F2, 2026-07-25). The baseline set is
derived from `SCAFFOLD_FILES` plus every scaffold manifest's files in
`src/lib/gen/scaffolds/baseline-paths.ts` — derived, not hand-listed, so a new
scaffold cannot reopen the hole. Locked by `version-presence.test.ts`.

The dossiers panel route, the readiness route, `finalize-design`, the stream
route's F3 gate and the deploy env gate all read that union — never their own.
This matters because the snapshot's top-level `requestedCapabilities` is the
floor of the MOST RECENT round and legitimately SHRINKS after an F3 build (the
next design round re-mutes integration capabilities): that shrink is intended,
and file presence is what keeps a built integration visible/enforced through it.

**F3 pending-dossier contract + deterministic backstop (BB#f3det1).**
F2 persists both deferred capability ids (`mutedCapabilities`) and exact
provider-specific dossier ids (`mutedDossierIds`). `finalize-design` resolves
those ids, subtracts dossiers with actual version presence, and treats every
remaining id as real F3 work. It persists capability + exact dossier id as a
durable approval and starts the LLM/dossier round even when the dossier has no
required real build key. The generic button message therefore cannot swap a
provider sibling back to the capability default.

`selectedDossierIds` records generation intent, not delivery. After the merged
version has been saved, finalize derives `fileEvidenceDossierIds` and
`fileEvidenceCapabilities` from that final `files_json`; only this evidence (or
explicit removal) clears the corresponding pending entries.

An exact-file integrations fork + ReleaseGate without codegen is allowed only
when **no pending dossier remains** and the existing file-derived build spec has
no reason to run a general LLM build. An APPROVE-continuation remains exempted
from the deterministic backstop in three legacy/interactive cases:

1. **Uniquely dossier-backed provider, DOSSIER-ID granularity:** an approved
   provider maps via explicit `manifest.providers` to exactly one dossier whose
   files are not present in the parent (`resolveDossierIdsPresentInVersion`).
   Capability granularity is deliberately not used — a present sibling
   (`clerk-auth` under `auth`) must not satisfy an approved exact sibling id
   (`supabase-auth`). Legacy approval values that already contain an exact
   dossier id (for example `stripe-checkout`) remain accepted as explicit
   identities. Note: after etapp 3, `mongodb` is dossierless and takes the
   generic path (case 2).
2. **Dossierless or ambiguous / forced-generic provider:** a known provider with
   zero manifest matches (`posthog`, `google-analytics`) or forced-generic keys
   (`openai`, `supabase` via `FORCED_GENERIC_PROVIDER_KEYS` — intent-ambiguity
   even when registry-unique after parkings) is reported by
   `providerKeysWithoutBackingDossier` and goes through the GENERIC LLM path.
   It must never pick an arbitrary dossier sibling or take a deterministic
   exact-file fork that would ship the wrong/zero code. (`postgres` injects
   `postgres-drizzle` deterministically since etapp 4 — rag-chat was the only
   other claimant.)
3. **Durable snapshot capability**: a persisted `f3ApprovedCapabilities` entry
   (no provider identity to sharpen with) lacking file presence, compared at
   capability level.

Approvals resolve as marker `suggestedProviders` (else persisted snapshot
providers). On the exemption path the marker is consumed at the normal Phase B
persistence boundary; the consume-before-persist ordering (BB#f3det2) applies
specifically to the deterministic backstop branch — Phase B keeps its
pre-existing persist-then-consume semantics (lost race downgrades the round to
non-approval instead of 409, tracked as a P3 backlog note).

### Explicit capability removal

A follow-up such as "ta bort Stripe" is an explicit exception to the
can-only-grow floor. `detectCapabilityRemoval` emits the removed capability;
orchestrate then subtracts it from inferred flags, Deep Brief capability lists,
contracts, durable F3 approvals and dossier selection before codegen. The stream
meta carries both `removedCapabilities` and the file-evidenced
`removedDossierIds`, so finalize cannot resurrect the capability from a stale
`briefSummary`. Both `f3ApprovedCapabilities` and `f3ApprovedProviders` are
overwritten with the filtered sets in the next snapshot.

After the normal follow-up merge and verbatim restoration,
`removeExplicitlyRemovedDossierFiles` deletes paths owned by those removed
dossiers. A path is preserved when a still-selected dossier also declares it;
this protects shared helpers such as config notices. The removal hint still
requires the model to remove imports, navigation and provider usage, while the
deterministic post-merge deletion guarantees that omitted legacy dossier files
do not survive by union-merge. Cross-file import checking runs once more after
deletion so a missed importer is rewired/stubbed and surfaced as degraded
instead of becoming a dangling module import.

Output: `DossierSelectionResult` consumed by `src/lib/gen/system-prompt/` to render three blocks:

- `## Available Dossiers` — compact list of selected dossiers.
- `## Selected Dossier Instructions` — per-dossier runtime instructions, rendered per `promptInstructionMode`: `compact` (default; manifest-derived summary plus class, `requiresF3`, mock, env enforcement and compact env purpose), `selected-sections`, or `full` (the whole `instructions.md`). The full file is thus NOT injected by default. Instructions-only behavioral dossiers should use `selected-sections`; otherwise their actual rules never reach codegen.
- `## Dossier Files To Emit Verbatim` — files whose effective injection mode is `verbatim`. Resolution: per-file `files[].injectionMode` overrides the dossier-level `codeFidelity`. So a `rewritable` dossier can still mark one file as `verbatim` (or vice-versa). On follow-ups, verbatim files already in the project render as pointers under `## Dossier Verbatim Files Already in Project`.

## Adding a new dossier

### Manually

1. Decide class: `hard` (declared provider/integration coupling) or `soft` (no declared integration provider/secret; npm dependencies and public keyless resources are allowed).
2. Create `data/dossiers/<class>/<id>/manifest.json` matching the schema;
   declare canonical `providers` for `hard`, and omit it for `soft`.
3. Write `data/dossiers/<class>/<id>/instructions.md` with the two required
   headings and preferably the three recommended headings from the author
   template.
4. Place files under `data/dossiers/<class>/<id>/components/...` matching `files[].path`.
5. Run `npm run dossiers:validate-all` (canonical AJV validation + invariants; `typecheck` alone does not validate manifest JSON).
6. Open the backoffice "Dossiers" page → "Capability map" tab → "Bygg om" to refresh `_index/capability-map.json`.

### AI-assisted from a template-reference repo

1. Clone the upstream repo into `data/template-references/repos/<reference-id>/` (or pick one already there from the legacy auto-pipeline).
2. Run:
   ```bash
   npm run dossiers:curate -- --reference=<reference-id> --class=hard --id=<dossier-id>
   ```
3. The script samples README, `package.json`, `.env.example`, and ~6 source files, then calls GPT to produce a draft `manifest.json` + `instructions.md`.
4. Review the draft in the backoffice Dossiers page (Redigera tab) and fix anything wrong before relying on it.
5. Complete the acceptance checklist below. Only then bump `lastVerified` and remove the `notes` field.

The script is intentionally one-at-a-time. Batch promotion was the source of pool-quality problems in the legacy pipeline.

### Re-verification and acceptance evidence

`config/dossier-verification-policy.json` is the canonical cadence policy.
`npm run dossiers:check-freshness` warns inside the configured warning window and fails
when a dossier is stale, has an invalid date, or claims a future verification.
It also fails every dossier marked `verificationStatus: "unverified"`, even if
its imported source date is recent. The dedicated scheduled maintenance
workflow runs this as a blocking evidence check; ordinary schema validation
does not pretend the current legacy backlog is accepted.
Provider-coupled (`hard`) dossiers expire sooner than provider-free (`soft`)
dossiers because provider APIs, SDKs and webhook contracts drift faster.

Do **not** bump `lastVerified` just to make CI green. A completed pass means:

1. the dossier materializes and production-builds without provider secrets;
2. its F2 mock/seed/visual path remains usable and honest with missing or
   placeholder values;
3. for a hard dossier, the primary F3 flow works with credentials from a
   dedicated provider sandbox/test account;
4. a missing/invalid key takes the documented calm error or degraded path and
   never leaks a provider response or secret;
5. if the dossier ships a webhook route, signature rejection and one valid
   sandbox event have both been exercised;
6. official `envVars[].setupUrl` links still lead to the page where each value
   can be obtained, and dependency/API usage still matches current official
   provider documentation.

The always-on PR, weekly and manual [dossier-acceptance workflow](../../.github/workflows/dossier-acceptance.yml)
automates the first, keyless layer for **every dossier that ships files —
hard AND soft** (instructions-only dossiers have nothing to build and are
skipped). Every pull request runs a path-scope job against the materialization
contract (`scripts/dossiers/acceptance-paths.mjs`). Hits install, typecheck and
production-build the matrix; misses skip the matrix and still publish the
required `dossier-acceptance` aggregate as green. The same workflow materializes
the exact dossier files on the common generated-project scaffold, merges the
canonical export baseline and manifest dependency ranges, then runs `tsc --noEmit`
and a production build with only the pipeline's harmless preview placeholders.
Soft coverage was added 2026-08-06 after `maplibre-map`'s verbatim component
rotted unnoticed under the former hard-only matrix (maplibre-gl v6 dropped its
default export; prod chat 3a6c5472 shipped a broken map and lost an F3 build
on it). The same workflow checks every
resolved dependency range against npm and runs the evidence/freshness gate.

This is build acceptance, not proof that Clerk login, Stripe checkout or a
provider webhook actually completed. The credentialed provider/webhook layer
stays explicit until the repository has isolated sandbox accounts and narrowly
scoped secrets for that provider; a skipped or unavailable live test is never
treated as green evidence. Materialize one case locally with
`npm run dossiers:acceptance:materialize -- --id=<id> --out=<empty-dir>`.

### Ny LEVERANTÖR under en befintlig capability (den billiga vägen)

Att lägga Klarna bredvid Stripe, eller MySQL bredvid Postgres, kräver **ingen
kodändring i urvalet**: `select.ts` hittar syskonet via capabilityn, och
`relevanceKeywords` är hela mekanismen för "användaren bad uttryckligen om
Klarna". Checklista:

1. `data/dossiers/hard/<provider-id>/manifest.json` med **samma `capability`**
   som syskonet, `defaultForCapability: false` (befintlig default behåller
   tie-breaken) och `relevanceKeywords: ["klarna", …]` — högprecisa ord, max 12.
2. `mock ≠ none` — garantin gäller **per dossier**, inte per capability. Väljs
   din leverantör via ett nyckelord är det _din_ fallback besökaren ser.
3. `instructions.md` (minst `When to use` + `How to integrate`) och
   komponentfilerna under `components/`.
4. `npm run dossiers:validate-all` (CI-blockerande) och backoffice → Capability
   map → "Bygg om".

**Hur svårt är det?** Metadata-delen är liten — manifest + instruktioner tar
under en timme och rör ingen delad kod. Arbetet ligger i två andra saker:

| Del                           | Varför den kostar                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Degraderingskoden (demoläget) | Komponenten måste montera **utan** nyckel, känna igen placeholders, aldrig göra ett riktigt provider-anrop och visa en ärlig notis. Det är kontraktets acceptanskriterium, inte ett manifestfält.                                                                  |
| Monteringstestet              | Varje renderbar `client`/`shared`-`.tsx` i en hard-dossier måste stå i `MOUNTED` eller `UNMOUNTABLE` i [`dossier-client-mount.test.tsx`](../../src/lib/gen/dossiers/dossier-client-mount.test.tsx) — annars fäller täckningsgrinden med sökvägen i felmeddelandet. |
| Delade notis-filer            | Kopior som `integration-config-notice.tsx` måste vara byte-identiska per familj (en dossier får aldrig importera ur en annan). Kopie-vakten i samma testfil håller dem lika.                                                                                       |

En **ny capability** (inte bara en ny leverantör) kostar tre saker till:
en rad i [`dossier-groups.ts`](../../src/lib/builder/dossier-groups.ts) (annars
fäller `dossier-groups.test.ts` — den läser capabilities ur manifesten, inte ur
den genererade capability-mapen), ett ord i brief-promptens capability-lista
(`src/lib/builder/site-brief-generation.ts`) och ett ställningstagande om
capabilityn behöver stå i `MOCKLESS_CAPABILITY_EXCEPTIONS` (nästan aldrig — en
demo-bar capability ska ha ett riktigt `mock`-läge).

## Validation (canonical validator + capability-map status)

The **canonical** manifest validator is the Node/AJV `validateDossierManifest()`
in [`src/lib/gen/dossiers/validate-manifest.ts`](../../src/lib/gen/dossiers/validate-manifest.ts)
(strict `docs/schemas/strict/dossier.schema.json`). It runs in three places:

- **Runtime** — `registry.ts` excludes any manifest that fails it from the pool.
- **CI** — `npm run dossiers:validate-all` (blocking) plus exposes/import-closure,
  `defaultForCapability` uniqueness, the hard-capability mock-fallback invariant
  (`findMissingMockFallbacks`; see the grupp-section's **Fallback-principen**),
  instructions headings, deterministic dependency ranges, explicit SDK
  `apiVersion` pins and the module-level SDK-init rule (below). The dependency
  check covers every manifest package even when there are zero explicit
  `apiVersion` literals, so "0 pins checked" is no longer the only drift signal.
  Verification evidence/freshness is a separate blocking maintenance
  lane because explicit legacy-unverified dossiers must stay visible as debt,
  never be laundered into a green manifest-validation result.
- **Curation** — `dossiers:curate` validates the AI draft with the same function.

**Module-level SDK-init rule (B5-standard, 2026-07-03):** dossier code must not
construct env-dependent SDK clients at module scope (`const stripe = new
Stripe(process.env.KEY ?? "")`) — the constructor throws at import time when the
key is missing, which makes the handler's env guard (503 `*-not-configured`)
unreachable and kills the graceful-degradation contract. Construct clients
inside the handler, **after** the env guard (lazy init). Enforced by
`findModuleLevelSdkConstructions()` in `dossiers:validate-all` (heuristic:
column-0 declarations whose statement references `process.env`; env-free
factories like Clerk's `createRouteMatcher` are allowed). Dossiers whose
instructions declare a not-configured contract should also ship component
tests exercising the 503 → notice path (see
`src/lib/gen/dossiers/dossier-config-fallback.test.tsx`).

**Backoffice validation:** every class-aware write path in
`backoffice/pages/dossiers.py` (safe edit, raw JSON, capability override,
legacy promotion, and skeleton creation) applies the hard/soft `providers`
rule and the strict JSON schema before backup/write. The lightweight
`_validate_manifest` still supplies immediate field-level feedback, while the
strict-schema pass prevents the raw editor from bypassing canonical shape
rules. Node/AJV remains the full source of truth because
`dossiers:validate-all` additionally checks cross-manifest defaults,
instructions, files/import closure, mock fallbacks, and SDK construction; run
it after backoffice edits.

**Capability map:** `data/dossiers/_index/capability-map.json` is a **generated
view only** (backoffice + curation tooling); the runtime registry walks
`data/dossiers/{hard,soft}/` directly and never reads it. Its freshness is
CI-enforced by the blocking `npm run dossiers:capability-map:check` step because
Backoffice/Systemkarta consumes the committed projection. Regenerate it with
`npm run dossiers:capability-map:write` or the backoffice "Capability map" tab's
"Bygg om" button after changing an owning source.

The freshness gate does **not** make the projection a capability owner. Dossier
manifests, read through the runtime registry, own the available capability set;
`dossier-groups.ts` owns the capability→group mapping and the other sources named
by the generator own their respective projected facts. The group-coverage test
(`dossier-groups.test.ts`) and follow-up vocabulary test therefore read the live
pool through `getAllDossiers()`, so runtime guarantees remain tied to manifests
rather than to a derived file. The capability-map owns only its generated shape
and serves Backoffice/tooling as a CI-fresh projection.

Since etapp 5 (2026-07-12) the generated file also carries a top-level
**`groups`** field: `{ "<group-id>": { "label": "<svensk label>", "capabilities":
["..."] } }`, in `DOSSIER_GROUP_ORDER` order, built by
[`regenerate-capability-map.ts`](../../scripts/dossiers/regenerate-capability-map.ts)
from `resolveDossierGroup`/`DOSSIER_GROUP_ORDER` (`dossier-groups.ts` stays the
one canonical mapping — no Python copy). The backoffice Dossiers page reads this
field to render dossiers grouped by dossier-grupp in the "Lista" tab (checkbox
toggle) and to let a curator pick a group → capability before running AI-kuration
on a new dossier ("AI-kuration" tab); its own "Bygg om" button shells out to
`npm run dossiers:capability-map:write` rather than re-implementing the mapping.

## Disabling the pipeline

Set `SAJTMASKIN_DOSSIER_PIPELINE=false` (or `0`) in any environment to skip dossier selection entirely. With no selection there is no `DossierSelectionResult`, so **all** dossier blocks (`## Available Dossiers`, `## Selected Dossier Instructions`, `## Dossier Files To Emit Verbatim`) disappear from the system prompt; the rest of the pipeline is unaffected.

**Code default (if env is unset):** on in dev/preview/prod, **off under `NODE_ENV=test`** (`useDossierPipeline` in `src/lib/config.ts`). Per-environment opt-out via the env var on that Vercel target.

## Files at a glance

| Path                                                                                                                       | Role                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/dossiers/hard/<id>/`, `data/dossiers/soft/<id>/`                                                                     | Manifests + instructions + components                                                                                                                                                                                                                                                                                           |
| `data/dossiers/_index/capability-map.json`                                                                                 | Generated view: `capabilities` + `groups` (backoffice + tooling)                                                                                                                                                                                                                                                                |
| `data/template-references/repos/<reference>/`                                                                              | Cloned upstream repos (input to AI curation)                                                                                                                                                                                                                                                                                    |
| `data/template-references/_metadata/<reference>.github.json`                                                               | GitHub stars + last-pushed metadata for ranking                                                                                                                                                                                                                                                                                 |
| `src/lib/gen/dossiers/registry.ts`                                                                                         | Disk reader + mtime cache                                                                                                                                                                                                                                                                                                       |
| `src/lib/gen/dossiers/select.ts`                                                                                           | Deterministic capability-driven selection                                                                                                                                                                                                                                                                                       |
| `src/lib/gen/dossiers/version-presence.ts`                                                                                 | Canonical "which dossiers are IN this version" resolver (server files + ≥1 distinctive file; se § Version-presence union) + `resolveSelectedDossiersWithVersionPresence` — the snapshot ∪ presence union shared by panel, readiness, finalize-design, F3-gate and deploy.                                                       |
| `src/lib/gen/dossiers/lifecycle.ts`                                                                                        | Pure evidence/status projection for the builder overview; preserves independent pending/materialized/configured/detected/server-evidence axes and the existing five UI statuses.                                                                                                                                                |
| `src/lib/gen/dossiers/types.ts`                                                                                            | `DossierEntry`, `SelectedDossier`, `DossierSelectionResult`                                                                                                                                                                                                                                                                     |
| `src/lib/gen/system-prompt/`                                                                                               | Renders the three dossier blocks into the system prompt                                                                                                                                                                                                                                                                         |
| `scripts/dossiers/curate-from-reference.ts`                                                                                | AI-curation script (single dossier from a cloned reference repo). The model comes from `config/ai_models/manifest.json` → workload `backoffice_dossier_curation`; `--model=<id>` picks another id from that entry and an unlisted id is rejected before the LLM call                                                            |
| `scripts/dossiers/inventory-legacy.mjs`, `normalize-legacy-prospect.ts`, `validate-all.ts`, `regenerate-capability-map.ts` | Legacy-import chain (PR #419): inventory a legacy v1 archive → LLM-normalize to v2 draft → validate promoted pool → rebuild the capability-map view. Backoffice UI: "Legacy-import" tab in `dossiers.py`.                                                                                                                       |
| `backoffice/pages/dossiers.py`                                                                                             | Backoffice UI: browse (incl. grupperad kategorivy), edit, delete (checklista + id-bekräftelse), curate (inom vald kategori), rebuild capability-map via TS-scriptet                                                                                                                                                             |
| Old 96-dossier v1 pool, 16-script pipeline, scaffold-recommendations, embeddings                                           | Gitignored local archive (`/archive/` in `.gitignore`), not guaranteed present on every checkout. Legacy-import material (prospects, normalization reports, drafts) lives outside the repo — see the archived handoff `docs/plans/avklarat/2026-07-08-dossier-legacy-import.md` for the remaining curated-promotion follow-ups. |
