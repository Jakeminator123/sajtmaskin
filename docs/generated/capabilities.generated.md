> **GENERATED FILE — DO NOT EDIT MANUALLY**
>
> Source: `data/dossiers/{hard,soft}/*/manifest.json`
> Source: `src/lib/gen/dossiers/types.ts#dossierRequiresF3`
> Generator: `scripts/docs/generate-contract-docs.mjs`

# Capabilities

This index contains 33 capabilities derived from 36 validated dossier manifests.
Capability is the selection key. Dossier groups are presentation only.
Canonical owner: dossier manifest `capability`; runtime consumer/validator: dossier registry and `dossierRequiresF3`.

| Capability             | Dossiers                                             | Default dossier         | Classes | F2 mock modes | F3-required dossiers                                 |
| ---------------------- | ---------------------------------------------------- | ----------------------- | ------- | ------------- | ---------------------------------------------------- |
| `ai-chat`              | `openai-chat`                                        | `openai-chat`           | `hard`  | `canned`      | `openai-chat`                                        |
| `ai-tool-calling`      | `ai-tool-calling-chat`                               | `ai-tool-calling-chat`  | `hard`  | `canned`      | `ai-tool-calling-chat`                               |
| `analytics`            | `plausible-analytics`, `vercel-analytics`            | `vercel-analytics`      | `hard`  | `none`        | —                                                    |
| `auth`                 | `clerk-auth`                                         | `clerk-auth`            | `hard`  | `none`        | `clerk-auth`                                         |
| `carousel`             | `embla-carousel`                                     | `embla-carousel`        | `soft`  | `none`        | —                                                    |
| `cms`                  | `sanity-cms`                                         | `sanity-cms`            | `hard`  | `seed`        | `sanity-cms`                                         |
| `command-search`       | `cmdk-command-palette`                               | `cmdk-command-palette`  | `soft`  | `none`        | —                                                    |
| `contact-form`         | `resend-contact-form`                                | `resend-contact-form`   | `hard`  | `success`     | `resend-contact-form`                                |
| `cta-section`          | `cta-section`                                        | `cta-section`           | `soft`  | `none`        | —                                                    |
| `dashboard-charts`     | `dashboard-charts`                                   | `dashboard-charts`      | `soft`  | `none`        | —                                                    |
| `database`             | `mongodb-atlas`, `neon-postgres`, `postgres-drizzle` | `postgres-drizzle`      | `hard`  | `seed`        | `mongodb-atlas`, `neon-postgres`, `postgres-drizzle` |
| `error-tracking`       | `sentry-error-tracking`                              | `sentry-error-tracking` | `hard`  | `none`        | `sentry-error-tracking`                              |
| `faq-section`          | `faq-accordion`                                      | `faq-accordion`         | `soft`  | `none`        | —                                                    |
| `feature-grid`         | `feature-grid`                                       | `feature-grid`          | `soft`  | `none`        | —                                                    |
| `gallery-lightbox`     | `gallery-lightbox`                                   | `gallery-lightbox`      | `soft`  | `none`        | —                                                    |
| `image-generation`     | `fal-image-generation`                               | `fal-image-generation`  | `hard`  | `canned`      | `fal-image-generation`                               |
| `interactive-game`     | `interactive-game-loop`                              | `interactive-game-loop` | `soft`  | `none`        | —                                                    |
| `logo-cloud`           | `logo-cloud`                                         | `logo-cloud`            | `soft`  | `none`        | —                                                    |
| `marquee`              | `marquee-scroller`                                   | `marquee-scroller`      | `soft`  | `none`        | —                                                    |
| `newsletter-subscribe` | `mailchimp-newsletter`                               | `mailchimp-newsletter`  | `hard`  | `success`     | `mailchimp-newsletter`                               |
| `parallax-pointer`     | `pointer-parallax`                                   | `pointer-parallax`      | `soft`  | `none`        | —                                                    |
| `parallax-scroll`      | `scroll-parallax`                                    | `scroll-parallax`       | `soft`  | `none`        | —                                                    |
| `payments`             | `stripe-checkout`                                    | `stripe-checkout`       | `hard`  | `none`        | `stripe-checkout`                                    |
| `physics-3d`           | `three-fiber-physics`                                | `three-fiber-physics`   | `soft`  | `none`        | —                                                    |
| `pricing-section`      | `pricing-tier-table`                                 | `pricing-tier-table`    | `soft`  | `none`        | —                                                    |
| `rag-chat`             | `rag-chat`                                           | `rag-chat`              | `hard`  | `canned`      | `rag-chat`                                           |
| `realtime`             | `ably-realtime`                                      | `ably-realtime`         | `hard`  | `none`        | `ably-realtime`                                      |
| `stats-counter`        | `stats-counter`                                      | `stats-counter`         | `soft`  | `none`        | —                                                    |
| `stepper`              | `stepper`                                            | `stepper`               | `soft`  | `none`        | —                                                    |
| `subscriptions`        | `paddle-billing`                                     | `paddle-billing`        | `hard`  | `none`        | `paddle-billing`                                     |
| `supabase-auth`        | `supabase-auth`                                      | `supabase-auth`         | `hard`  | `none`        | `supabase-auth`                                      |
| `testimonials-section` | `testimonials-grid`                                  | `testimonials-grid`     | `soft`  | `none`        | —                                                    |
| `visual-3d`            | `three-fiber-canvas`                                 | `three-fiber-canvas`    | `soft`  | `none`        | —                                                    |
