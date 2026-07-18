---
id: L3
title: Dossier-variants som koncept
status: paused
created: 2026-04-21
linear: null
paused: 2026-04-23
paused_by: OMTAG-2026-04-23
priority: low
parent_plan: .cursor/plans/llm-chain-cleanup-2026-04-21.md
parallel_safe_with: []
blocked_by: [M2-fyll-dossier-poolen]
estimated_total_effort: ~1 vecka
---

> Status: Archived
> Not current architecture.
> Do not use as runtime guidance.
> Replaced by: [Dossier system contract](../../../contracts/dossier-system.md)

> **Paused 2026-04-23:** Parkerad per OMTAG-waven. Dossier-kontraktet är nu stenhårt via fas 2·D AJV-validator — teknisk grund klar, men konceptbeslut (behövs variants alls?) kräver observationstid efter M2.

# L3 — Dossier-variants

## Problem (potentiellt)

`scaffolds` har ett etablerat `variants`-koncept: samma scaffold (t.ex. `landing-page`) kan ha flera variants (`corporate-grid`, `bold-startup`, `warm-local`, …) som delar struktur men har olika visuell signatur (theme tokens, font pairings, signature motifs).

`dossiers` har **inget** sådant koncept idag (dossier-system v2). Antagandet är: en capability resolverar till **exakt en** dossier (den med `defaultForCapability=true`). Tie-break på id-sort.

Frågan: behöver vi `dossier-variants`?

**Två potentiella tolkningar:**

### Tolkning A — Olika provider per capability (existerar redan)

Same capability, olika SaaS:

- `payments`: `stripe-checkout` (default) vs `paddle-checkout` vs `lemonsqueezy-checkout`
- `auth`: `clerk-auth` (default) vs `auth0-auth` vs `next-auth-credentials`

**Detta löses redan** av befintlig design — flera dossiers per capability + `defaultForCapability` + framtida user-override. Inget nytt koncept behövs.

### Tolkning B — Olika style/komplexitet inom samma dossier (nytt koncept)

Samma capability + provider, olika UX-flavor:

- `stripe-checkout` med variants:
  - `simple-button` — "Buy Now"-knapp på en produkt
  - `pricing-tiers` — 3-tier prissida med byt-plan-flöde
  - `subscription-flow` — full subscription-management UI
- `auth` med variants:
  - `magic-link` — minimal, e-postbaserad
  - `social-only` — Google + GitHub-knappar
  - `email-password-with-mfa` — full enterprise

Det är **ingen** av dessa idag. Idag måste man välja: en dossier per capability täcker ett flavor.

## Beslutspunkt

**Vänta tills M2 är gjord** (5–10 nya dossiers). Då vet vi om Tolkning A räcker eller om vi behöver Tolkning B.

Indikatorer som triggar L3 (Tolkning B):

1. Användarprompts begär ofta en specifik flavor som vi inte kan leverera.
2. Vi börjar duplicera dossiers (`stripe-simple` + `stripe-pricing` + `stripe-subscription`) — det är symptom på saknad variants.
3. Dossier-pool växer > 30 och blir svårnavigerad.

Indikatorer som **dementerar** behovet:

1. Tolkning A räcker — användare vill bara byta provider.
2. Capability-naming kan finkornas (`payments-button` vs `payments-pricing-page` blir egna capabilities) — ingen ny variant-modell behövs.
3. Codegen-LLM:n adapterar dossier-koden tillräckligt fritt utan flavor-specifik mall.

## Skiss om vi skulle bygga det (Tolkning B)

```
data/dossiers/hard/stripe-checkout/
  manifest.json                       # Bas-manifest, capability=payments
  instructions.md                     # Default-flavor instructions
  variants/
    simple-button/
      variant.json                    # { id, label, description, replaces.files? }
      instructions.md
      components/checkout-button.tsx
    pricing-tiers/
      variant.json
      instructions.md
      components/pricing-page.tsx
      components/api/checkout-session/route.ts
```

`selectDossiersForRequest` skulle få ny prio-ordning:

1. Brief deklarerar `requestedCapabilities: ["payments"]` (som idag).
2. Brief kan optional deklarera `dossierVariantHints: { payments: "pricing-tiers" }`.
3. Selection: matcha capability → matcha variant via `variant.signaturePatterns` mot prompt.

Variant-pick sker via samma embedding-modell som scaffold-variants idag (`pickScaffoldVariantAsync`). Återanvänd matcher-modulen.

**Kontrakt-ändring:**
- `DossierEntry` får ny optional `variants?: DossierVariant[]`.
- `SelectedDossier` får ny optional `selectedVariantId?: string`.
- System-prompt-renderer väljer variant-instructions istället för dossier-instructions när variant är vald.

## Risker

- **Komplexitetslyft.** Lätt att hamna i samma fälla som dossier-pipeline v1 (96 dossiers, embeddings, domain-veto, …) som togs bort 2026-04-20. v2 är medvetet enkel.
- **Pool-kvalitet.** Flera variants per dossier multiplicerar review-bördan.
- **Brief-LLM måste lära sig flavor-koncept.** Antingen via Deep Brief-prompt-utökning eller via deterministisk inferens från user-prompt.

## Effort

~1 vecka **om** behovet bekräftas. Lämpar sig för cloud-agent när M2 är klart och pool-data finns.

## Status idag

**Ej startad.** Vänta på M2 + 1 veckas användning av poolen.
