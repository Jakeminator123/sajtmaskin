# When to use

- Use when a Next.js App Router project needs text-to-image generation through Fal.
- Use when the Fal API key must stay server-side behind an internal POST route.
- Best for one-provider implementations using request payloads with `prompt`, `provider: "fal"`, and `modelId`.
- Useful for demos, dashboards, asset-generation tools, and MVPs that return base64 images for preview or download.

# How to integrate

- Install `ai` and `@ai-sdk/fal`.
- Add `FAL_API_KEY` from the Fal dashboard to the server environment.
- Emit the API route at `/api/generate-images`.
- Emit shared helpers under `lib/` so imports like `@/lib/api-types` resolve.
- POST JSON with `prompt`, `provider: "fal"`, and a Fal model id such as `fal-ai/flux/schnell`.
- Render successful responses as `data:image/png;base64,${image}` or pass the base64 value to `imageHelpers.shareOrDownload`.

# Mock/demo mode

`mock: canned`. When there is no real `FAL_API_KEY` (missing OR a preview stub
containing `placeholder` / `not_real`), the `/api/generate-images` route returns
a deterministic placeholder PNG (base64) plus `demo: true` instead of calling
Fal — so the gallery renders in an F2/preview without real credentials. Render
the returned base64 exactly as a real result (`data:image/png;base64,${image}`)
and, when `demo` is true, add a small "Demo-bild" label so it never reads as a
real generation. Real generation runs as soon as a genuine key is configured.

# UX rules

- Show an explicit loading state while generation is running.
- Disable duplicate submits during an active request.
- Keep the prompt editable after errors and make retry simple.
- Provide a clear download or share action after success.
- Label generated media as AI-generated in consumer-facing experiences.
- If model selection is exposed, provide a safe default instead of forcing users to know raw model IDs.

# Avoid

- Do not expose `FAL_API_KEY` to client components or browser-side Fal SDK calls.
- Do not import template layout, fonts, branding, analytics, or unrelated UI from the source app.
- Do not introduce a multi-provider abstraction unless the product actually needs more than Fal.
- Do not mix env names; use `FAL_API_KEY` consistently.
- Do not return raw provider error details to end users.
- Do not let requests hang indefinitely; keep a predictable timeout.

# Verification

- With a valid `FAL_API_KEY`, POST to `/api/generate-images` with a prompt, `provider: "fal"`, and a real Fal model id.
- Confirm success returns JSON containing a base64 `image` string.
- Confirm missing `prompt`, `provider`, or `modelId` returns `400`.
- Confirm unsupported providers return `400`.
- Confirm that WITHOUT a real `FAL_API_KEY` (missing or a preview stub) the route returns a placeholder image with `demo: true` (mock: canned) — never a crash — and that a real key routes to genuine Fal generation.
- Confirm the client preview can render the returned image with a `data:` URL.