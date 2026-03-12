OpenClaw rollout roadmap
Updated: 2026-03-12

Scope 1 - Reversible flag
- Added IMPLEMENT_UNDERSCORE_CLAW to env validation.
- Added affirmative env parsing for y/yes/true/1/on.
- Split OpenClaw gateway availability from OpenClaw UI surface availability.
- Gated the global OpenClaw chat surface behind gateway + IMPLEMENT_UNDERSCORE_CLAW.
- Exposed the flag and OpenClaw gateway presence in admin env status.
- Documented the flag in config/env-policy.json with development/preview/production targets.

Scope 2 - Branded launcher and panel polish
- Added a homepage-first OpenClaw teaser card above the floating launcher.
- Restyled the floating launcher to feel more like a premium assistant entrypoint.
- Upgraded the chat panel with clearer OpenClaw branding, better empty state copy and starter prompts.
- Updated chat message styling to fit the darker OpenClaw panel theme.
- Follow-up: starter prompts now clear any draft text in the textarea before sending.

Scope 3 - Company-specific OpenClaw surface
- Added a client-safe slug-to-company-name helper so OpenClaw can personalize copy on company routes.
- Personalized the OpenClaw teaser, FAB subtitle, panel header, empty state, starter prompts and input placeholder on `kostnadsfri/[slug]`.
- Kept the personalization route-aware and reversible without adding new backend coupling or feature flags.

Scope 4 - Configurable company copy
- Added a lightweight OpenClaw config shape for `kostnadsfri` pages with `roleLabel`, `introTitle`, `introBody` and starter prompts.
- Stored optional company-specific OpenClaw config in `kostnadsfri_pages.extra_data.openclaw` via the existing create API.
- Extracted and normalized the public OpenClaw config when reading company data so UI copy can stay typed and fallback-safe.
- Wired `kostnadsfri/[slug]` to publish route context into `window.__SITEMASKIN_CONTEXT`, allowing the global OpenClaw surface to pick up company config without a new API route.

Scope 5 - Hardening and rollout visibility
- Added a shared OpenClaw status helper that describes rollout blockers and gateway health in one place.
- Hardened `/api/openclaw/chat` so the chat surface now respects the same rollout gate as the UI and returns clear blocker reasons when disabled.
- Upgraded `/api/openclaw/health` to return structured rollout and gateway status instead of only a bare health string.
- Exposed an explicit `openclaw` status block in `admin/env`, so admins can see gateway config, flag state, surface state and health endpoint details together.

Validation notes
- Local .env.local now sets IMPLEMENT_UNDERSCORE_CLAW="y".
- Active local dev server detected in a separate terminal.
- Other parallel changes are present in unrelated files and are intentionally excluded from the Scope 1 commit.
- Targeted ESLint passed for all Scope 1 code files.
- Scope 1 gating smoke test passed:
  - gateway + flag => surface on
  - flag without gateway => surface off
  - gateway without flag => surface off
- Scope 2 browser validation passed on http://localhost:3000/.
- Launcher teaser rendered on the homepage and opened the panel correctly.
- Starter prompt click triggered POST /api/openclaw/chat with 200 response.
- Follow-up validation: typing draft text and then clicking a starter prompt now clears the textarea as expected.
- Scope 3 browser validation passed on `http://localhost:3000/` and `http://localhost:3000/kostnadsfri/ikea-ab`.
- Homepage kept the default OpenClaw sales copy.
- `kostnadsfri/[slug]` now showed slug-derived company copy in the teaser, starter prompts and input placeholder.
- Scope 4 smoke test passed for OpenClaw config normalization and company-data extraction.
- Scope 4 browser regression check passed on `http://localhost:3000/kostnadsfri/ikea-ab`.
- The `kostnadsfri` route still exposed the company-specific OpenClaw surface, and the new context wiring kept the route stable without breaking the password flow.
- Scope 5 status smoke test passed for enabled and disabled rollout combinations.
- Scope 5 runtime check passed on `http://localhost:3000/api/openclaw/health`, returning structured rollout status with `surfaceEnabled: true`.
- Full project typecheck is currently blocked by an unrelated existing error in src/app/api/prompts/[id]/route.ts.

Commit boundary
- Include only:
  src/lib/env.ts
  src/lib/config.ts
  src/app/layout.tsx
  src/app/api/admin/env/route.ts
  src/app/api/kostnadsfri/route.ts
  src/app/api/openclaw/chat/route.ts
  src/app/api/openclaw/health/route.ts
  config/env-policy.json
  src/app/kostnadsfri/[slug]/page.tsx
  src/components/kostnadsfri/kostnadsfri-page.tsx
  src/components/openclaw/OpenClawChat.tsx
  src/components/openclaw/OpenClawChatPanel.tsx
  src/components/openclaw/OpenClawMessage.tsx
  src/lib/kostnadsfri/company-name.ts
  src/lib/kostnadsfri/index.ts
  src/lib/kostnadsfri/openclaw-config.ts
  src/lib/openclaw/status.ts
  roadmap.txt
- Do not include:
  .env.local
  unrelated v0/chat/backend changes from other parallel work
