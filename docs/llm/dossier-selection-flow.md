# Dossier — urvalsflöde och prompt-injection

**Källtruth:** `src/lib/gen/dossiers/select.ts` + `src/lib/gen/system-prompt/`. **Schema:** `docs/schemas/strict/dossier.schema.json`. **Operativ guide:** `docs/operating/dossier-cheatsheet.md`. **Uppdaterad:** 2026-04-21.

Den här filen visar **hur** en dossier väljs och **var** den landar i prompten — komplement till [`dossier-system.md`](../contracts/dossier-system.md) som beskriver **vad** systemet är.

## Översikt

```
Brief deklarerar requestedCapabilities: ["payments", "auth", ...]
                          │
                          ▼
                 selectDossiersForRequest({ brief })
                          │
                          ▼
            För varje capability:
                          │
                ┌─────────┴──────────┐
                ▼                    ▼
       getDossiersByCapability      0 träffar
                │                    │
                ▼                    ▼
         ≥ 1 träff              Skippa tyst
                │                (capability hoppas över;
                │                 loggas som
                │                 dossier_capability_unresolved)
                ▼
       Sortera id-deterministiskt
                │
                ▼
       defaultForCapability=true vinner
       (annars första id-sorterade)
                │
                ▼
       hard-class? → kolla envVars mot projektets sparade nycklar
                │
                ▼
       configured: true|false
                │
                ▼
       Eager-load instructions.md
                │
                ▼
       SelectedDossier {entry, reason, configured}
```

**Inga embeddings. Ingen fuzzy matching. Ingen domain-veto. Inga caps.** Det brief säger är det som injiceras.

## Två klasser (path-encoded)

| Klass | Path | När |
|-------|------|-----|
| `hard` | `data/dossiers/hard/<id>/` | Behöver `process.env`-secrets (Stripe-key, OpenAI-key, DB-URL). |
| `soft` | `data/dossiers/soft/<id>/` | Självförsörjande (UI-sektioner, R3F-scener, FAQ-accordions). |

`hard`-dossiers utan satta env-vars **injiceras ändå** men markeras `configured: false`. `configured` läses mot **projektets** sparade env-nycklar (`configuredEnvKeys`, trädat från `getStoredProjectEnvVarMap`) — inte plattformens `process.env` (deprecerad fallback för callers utan projekt-env-map). Flaggan är en prompt-signal, aldrig kopplad till en gate. Codegen-LLM:n får dessutom dossierns `mock`-läge (`describeMockMode`) så demo-ytan renderar i F2 utan riktig nyckel i stället för att krascha.

## Två kod-fideliteter (per-dossier default + per-fil override)

| Fidelity | När | Effekt på prompt |
|----------|-----|------------------|
| `verbatim` | Integration-glue där paraphrasering bryter integrationen: webhook-signing, OAuth-callbacks, SDK-init, middleware. | Filen renderas i system-prompten under `## Dossier Files To Emit Verbatim`. Codegen-LLM:n **måste** emit:a den byte-exakt i sin CodeProject-output. |
| `rewritable` | UI-komponenter, layout-mönster, render-glue som LLM:n ska adaptera. | Filen beskrivs i `instructions.md` och codegen-LLM:n får paraphrasera fritt. |

Per-fil `injectionMode` overrider dossier-nivåns `codeFidelity`. Så en `rewritable`-dossier kan ha en (1) fil markerad `verbatim` (eller vice versa).

## Tre prompt-block (`system-prompt/`)

När minst en dossier väljs renderar `src/lib/gen/system-prompt/` följande:

### 1. `## Available Dossiers`

Kompakt lista. Per dossier: id, label, capability, configured-status. Format:

```
## Available Dossiers

- **stripe-checkout** (capability: `payments`) [configured]
  Hosted Stripe Checkout for one-time and subscription payments.

- **clerk-auth** (capability: `auth`) [UNCONFIGURED — render placeholder UI]
  Clerk-based authentication with social providers and MFA.
```

### 2. `## Selected Dossier Instructions`

Full `instructions.md` per vald dossier. Fem fasta sektioner:

```
# When to use
[1-3 bullets där denna dossier är rätt val]

# How to integrate
[Numrerade steg: import, env, mount-point]

# UX rules
[Feedback, validering, mobil, accessibility]

# Avoid
[Konkreta don'ts som LLM:n naivt skulle prova]

# Verification
[Manuella smoke checks utvecklaren kan köra]
```

### 3. `## Dossier Files To Emit Verbatim`

Alla filer vars effektiva `injectionMode === "verbatim"`. Renderas som fenced code-blocks med fil-path som rubrik. Codegen-LLM:n måste emit:a oförändrade.

## När gäller vilken dossier-yta?

| Situation | Brief | Capabilities | Dossiers |
|-----------|-------|--------------|----------|
| **Init** | Färsk Deep Brief (LLM) | Färska från brief | Capability-driven |
| **Follow-up (vanlig)** | `null` inline → **rekonstrueras från snapshot** (NY 2026-04-21) | Från `snapshot.briefSummary.requestedCapabilities` | **Fungerar nu** (var noll dossiers innan A1+A2-fix) |
| **Follow-up (`clear-redesign`)** | Färsk delta-brief LLM | Färska från delta-brief | Capability-driven (ev. nya capabilities) |
| **Repair-pass** (server-verify) | Samma som triggande generation | Samma | Samma |

Före 2026-04-21-fixen tappades capabilities tyst på follow-up — alla integrationer som användaren bett om i init-prompten försvann ur prompten på första follow-up. Symptomet syntes som FIXA.txt B5 ("Brief: applicerad visas inte för follow-ups").

## Hur disable:as systemet?

```
SAJTMASKIN_DOSSIER_PIPELINE=false  # av (explicit opt-out)
SAJTMASKIN_DOSSIER_PIPELINE=true   # på (kod-default i alla miljöer)
```

**Nuvarande deploy-status (sedan 2026-04-23):** explicit satt till `true` på alla tre Vercel-miljöer — pipelinen är aktiv överallt. För att stänga av den i en specifik miljö, sätt den till `false` eller `0`.

Hela `## Available Dossiers`-blocket försvinner från system-prompten. Inget annat påverkas. Sätt `false` om dossier-pool blir ohälsosam (t.ex. många unconfigured-dossiers spam:ar prompten).

## Lifecycle: lägga till en dossier

Två vägar (full guide i [`docs/operating/dossier-cheatsheet.md`](../operating/dossier-cheatsheet.md)):

### A. Hand-skriven

1. Skapa mapp `data/dossiers/<class>/<id>/`.
2. Skriv `manifest.json` (validera mot [`dossier.schema.json`](../schemas/strict/dossier.schema.json)).
3. Skriv `instructions.md` (5 sektioner).
4. Lägg ev. komponentfiler under `<id>/components/`.
5. Kör `npm run dossiers:validate-all` (CI-blockerande; inkluderar mock-fallback-invarianten — hard-capabilityns default-dossier behöver `mock ≠ none` eller ett dokumenterat undantag, se `docs/contracts/dossier-system.md`).
6. Backoffice → Dossiers → Capability map → "Bygg om" så `_index/capability-map.json` synkar.

### B. AI-curate från upstream-repo

```bash
npm run dossiers:curate -- \
  --reference=<reference-id> \
  --class=<hard|soft> \
  --id=<dossier-id>
```

Skriptet samplar README + package.json + .env.example + ~6 source-filer från `data/template-references/repos/<reference-id>/` och kallar GPT med structured output. Drafts kräver alltid manuell review.

## Capability-map (genererad view)

`data/dossiers/_index/capability-map.json` är en read-only översikt:

```json
{
  "capabilities": {
    "payments": ["stripe-checkout"],
    "ai-chat": ["openai-chat"],
    "pricing-section": ["pricing-tier-table"]
  },
  "groups": {
    "payments": { "label": "Betalningar", "capabilities": ["payments", "subscriptions"] }
  }
}
```

Read-only vid runtime — dossier-registry walkar `data/dossiers/{hard,soft}/` direkt. Filen finns för backoffice-listningar + sanity-check vid curation. `groups` är dossier-grupp-vyn (kategori-rubriker; kanonisk källa `src/lib/builder/dossier-groups.ts`) som backoffice läser. Bygg om via backoffice-tab (kör TS-scriptet).

## Nuvarande pool

Per 2026-06-25: **25 dossiers över 24 capabilities** (8 `hard`, 17 `soft`).

Den kanoniska, alltid-aktuella listan är den genererade vyn
[`data/dossiers/_index/capability-map.json`](../../data/dossiers/_index/capability-map.json)
(capability → dossier-id). Hårdkoda inte en kopia här — den driftar. Regenerera
via `npm run dossiers:capability-map:write` (eller backoffice-tabben).

- `hard` kräver env-secrets — t.ex. `payments` (stripe-checkout), `auth`
  (clerk-auth), `ai-chat` (openai-chat), `contact-form` (resend-contact-form),
  `newsletter-subscribe` (mailchimp-newsletter), `analytics`
  (plausible-analytics + vercel-analytics), `error-tracking`
  (sentry-error-tracking).
- `soft` är självförsörjande sektioner/interaktionsmönster — t.ex.
  `pricing-section`, `faq-section`, `testimonials-section`, `carousel`,
  `command-search`, `marquee`, `visual-3d`, `physics-3d`, samt
  sektions-tillskotten 2026-06: `logo-cloud`, `stats-counter`, `feature-grid`,
  `cta-section`, `gallery-lightbox`, `stepper`.

## Felsökning

| Symptom | Möjlig orsak | Var kolla |
|---------|--------------|-----------|
| `## Available Dossiers` saknas | `SAJTMASKIN_DOSSIER_PIPELINE=false` ELLER brief har inga `requestedCapabilities` | `.env.local` + prompt-dump `generation-input-package.json` |
| Capability deklareras men ingen dossier väljs | Ingen dossier täcker capability | Logg: `dossier_capability_unresolved` |
| Hard-dossier renderas som UNCONFIGURED | required env-vars saknar sparat värde för projektet | `manifest.json → envVars[].required` vs projektets `projectEnvVars` (`configuredEnvKeys`) |
| Två dossiers delar capability — fel vald | Saknad eller dubbel `defaultForCapability=true` | `defaults.length > 1`-warning i logg |
| Capability-map ej uppdaterad efter ny dossier | Glömt klicka "Bygg om" i backoffice | `data/dossiers/_index/capability-map.json` |
