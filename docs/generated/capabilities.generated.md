> **GENERATED FILE — DO NOT EDIT MANUALLY**
>
> Source: `data/dossiers/{hard,soft}/*/manifest.json`
> Source: `src/lib/gen/dossiers/types.ts#dossierRequiresF3`
> Source: `src/lib/builder/dossier-groups.ts#resolveDossierGroup`
> Source: `src/lib/gen/dossiers/f2-mute.ts#getF2MutedIntegrationCapabilities`
> Generator: `scripts/docs/generate-contract-docs.mjs`

<!-- source-fingerprint: validated dossier registry sha256:2265c748867a4beb -->
<!-- source-fingerprint: src/lib/gen/dossiers/f2-mute.ts#getF2MutedIntegrationCapabilities sha256:4c270839b579be81 -->
<!-- source-fingerprint: src/lib/builder/dossier-groups.ts#resolveDossierGroup sha256:bfb77d6fdf0d1026 -->

# Capabilities

This index contains 21 capabilities derived from 23 validated dossier manifests.
Capability is the selection key. Dossier groups are presentation only. Designläge disposition and the integrationsbygge/build-server contract are independent: Analytics is currently planned in designläge while having no build/server requirement.
Canonical owners: dossier manifest `capability`; `resolveDossierGroup()` for presentation groups; `getF2MutedIntegrationCapabilities()` for designläge disposition; `dossierRequiresF3()` for the build/server contract.

| Group                            | Capability             | Designläge         | Dossiers                              | Default dossier             | Classes | Manifest mock modes | Build/server-required dossiers |
| -------------------------------- | ---------------------- | ------------------ | ------------------------------------- | --------------------------- | ------- | ------------------- | ------------------------------ |
| `ai` (AI)                        | `ai-chat`              | Planned (deferred) | `openai-chat`                         | `openai-chat`               | `hard`  | `canned`            | `openai-chat`                  |
| `ops` (Drift & mätning)          | `analytics`            | Planned (deferred) | `vercel-analytics`, `visitor-counter` | `visitor-counter`           | `hard`  | `none`, `seed`      | `visitor-counter`              |
| `auth` (Inloggning & konton)     | `auth`                 | Planned (deferred) | `clerk-auth`, `supabase-auth`         | `clerk-auth`                | `hard`  | `visual`            | `clerk-auth`, `supabase-auth`  |
| `contact` (Kontakt & utskick)    | `booking`              | Available          | `calcom-booking`                      | `calcom-booking`            | `hard`  | `visual`            | —                              |
| `media` (Media & galleri)        | `carousel`             | Available          | `embla-carousel`                      | `embla-carousel`            | `soft`  | `none`              | —                              |
| `search-maps` (Sök & karta)      | `command-palette`      | Available          | `cmdk-command-palette`                | `cmdk-command-palette`      | `soft`  | `none`              | —                              |
| `contact` (Kontakt & utskick)    | `contact-form`         | Planned (deferred) | `resend-contact-form`                 | `resend-contact-form`       | `hard`  | `success`           | `resend-contact-form`          |
| `interactive` (Interaktivt & 3D) | `dashboard-charts`     | Available          | `dashboard-charts`                    | `dashboard-charts`          | `soft`  | `none`              | —                              |
| `data-content` (Data & innehåll) | `database`             | Planned (deferred) | `postgres-drizzle`                    | `postgres-drizzle`          | `hard`  | `seed`              | `postgres-drizzle`             |
| `media` (Media & galleri)        | `gallery-lightbox`     | Available          | `gallery-lightbox`                    | `gallery-lightbox`          | `soft`  | `none`              | —                              |
| `interactive` (Interaktivt & 3D) | `interactive-game`     | Available          | `interactive-game-loop`               | `interactive-game-loop`     | `soft`  | `none`              | —                              |
| `search-maps` (Sök & karta)      | `map-display`          | Available          | `maplibre-map`                        | `maplibre-map`              | `soft`  | `none`              | —                              |
| `media` (Media & galleri)        | `media-storage`        | Planned (deferred) | `vercel-blob-media`                   | `vercel-blob-media`         | `hard`  | `seed`              | `vercel-blob-media`            |
| `contact` (Kontakt & utskick)    | `newsletter-subscribe` | Planned (deferred) | `mailchimp-newsletter`                | `mailchimp-newsletter`      | `hard`  | `success`           | `mailchimp-newsletter`         |
| `commerce` (Betalning & handel)  | `payments`             | Planned (deferred) | `stripe-checkout`                     | `stripe-checkout`           | `hard`  | `visual`            | `stripe-checkout`              |
| `interactive` (Interaktivt & 3D) | `physics-2d`           | Available          | `matter-physics-2d`                   | `matter-physics-2d`         | `soft`  | `none`              | —                              |
| `interactive` (Interaktivt & 3D) | `physics-3d`           | Available          | `three-fiber-physics`                 | `three-fiber-physics`       | `soft`  | `none`              | —                              |
| `interactive` (Interaktivt & 3D) | `scroll-story`         | Available          | `scroll-story-orchestrator`           | `scroll-story-orchestrator` | `soft`  | `none`              | —                              |
| `search-maps` (Sök & karta)      | `site-search`          | Available          | `local-site-search`                   | `local-site-search`         | `soft`  | `none`              | —                              |
| `interactive` (Interaktivt & 3D) | `spatial-canvas`       | Available          | `xyflow-spatial-canvas`               | `xyflow-spatial-canvas`     | `soft`  | `none`              | —                              |
| `interactive` (Interaktivt & 3D) | `visual-3d`            | Available          | `three-fiber-canvas`                  | `three-fiber-canvas`        | `soft`  | `none`              | —                              |
