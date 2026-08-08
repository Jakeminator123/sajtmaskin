> **GENERATED FILE — DO NOT EDIT MANUALLY**
>
> Source: `data/dossiers/{hard,soft}/*/manifest.json`
> Source: `src/lib/gen/dossiers/types.ts#dossierRequiresF3`
> Generator: `scripts/docs/generate-contract-docs.mjs`

# Capabilities

This index contains 17 capabilities derived from 18 validated dossier manifests.
Capability is the selection key. Dossier groups are presentation only.
Canonical owner: dossier manifest `capability`; runtime consumer/validator: dossier registry and `dossierRequiresF3`.

| Capability             | Dossiers                      | Default dossier         | Classes | F2 mock modes | F3-required dossiers          |
| ---------------------- | ----------------------------- | ----------------------- | ------- | ------------- | ----------------------------- |
| `ai-chat`              | `openai-chat`                 | `openai-chat`           | `hard`  | `canned`      | `openai-chat`                 |
| `analytics`            | `vercel-analytics`            | `vercel-analytics`      | `hard`  | `none`        | —                             |
| `auth`                 | `clerk-auth`, `supabase-auth` | `clerk-auth`            | `hard`  | `visual`      | `clerk-auth`, `supabase-auth` |
| `carousel`             | `embla-carousel`              | `embla-carousel`        | `soft`  | `none`        | —                             |
| `cms`                  | `sanity-cms`                  | `sanity-cms`            | `hard`  | `seed`        | `sanity-cms`                  |
| `command-palette`      | `cmdk-command-palette`        | `cmdk-command-palette`  | `soft`  | `none`        | —                             |
| `contact-form`         | `resend-contact-form`         | `resend-contact-form`   | `hard`  | `success`     | `resend-contact-form`         |
| `dashboard-charts`     | `dashboard-charts`            | `dashboard-charts`      | `soft`  | `none`        | —                             |
| `database`             | `postgres-drizzle`            | `postgres-drizzle`      | `hard`  | `seed`        | `postgres-drizzle`            |
| `gallery-lightbox`     | `gallery-lightbox`            | `gallery-lightbox`      | `soft`  | `none`        | —                             |
| `interactive-game`     | `interactive-game-loop`       | `interactive-game-loop` | `soft`  | `none`        | —                             |
| `map-display`          | `maplibre-map`                | `maplibre-map`          | `soft`  | `none`        | —                             |
| `newsletter-subscribe` | `mailchimp-newsletter`        | `mailchimp-newsletter`  | `hard`  | `success`     | `mailchimp-newsletter`        |
| `payments`             | `stripe-checkout`             | `stripe-checkout`       | `hard`  | `visual`      | `stripe-checkout`             |
| `physics-3d`           | `three-fiber-physics`         | `three-fiber-physics`   | `soft`  | `none`        | —                             |
| `site-search`          | `local-site-search`           | `local-site-search`     | `soft`  | `none`        | —                             |
| `visual-3d`            | `three-fiber-canvas`          | `three-fiber-canvas`    | `soft`  | `none`        | —                             |
