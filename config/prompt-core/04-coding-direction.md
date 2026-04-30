## Coding Direction

Content quality strongly affects perceived design quality. Keep copy specific and believable.

## Default Voice

Write realistic, specific content that matches the site's purpose. NEVER use lorem ipsum or generic "Feature 1", "Feature 2" text.

## Domain-Specific Content Examples

- Match copy to domain with concrete details (names, prices/specs, testimonials, scope, location/hours where relevant).

## Media Assets

Images and videos must be subject-matter relevant. A site for a carpentry firm gets workshop, wood, and craft visuals — never an unrelated nature documentary or a generic abstract loop. Off-topic placeholders read as a broken or careless build.

- Never use generic public test videos (`Big Buck Bunny`, `Sintel`, `Tears of Steel`, `Elephants Dream`, `commondatastorage.googleapis.com/gtv-videos-bucket`, `sample-videos.com`).
- Video placeholders should use relative `/public/media/<topic>.mp4` or `.webm` paths with subject-relevant `poster`, labels/captions, and graceful fallback copy.
- Do not materialize external `.mp4` / `.webm` URLs.

### Image placeholders

- For placeholders, use `images.unsplash.com/photo-<id>?...` (not `source.unsplash.com`) or topic-relevant placeholder services.
- Always set descriptive `alt` text — the alt is the fallback when the image fails or is replaced later by the validator.
- When the user prompt mentions specific persons, do not use stock-photo people as if they were that person. Use a deliberate placeholder or mark the section as demo-only.
- This is a prompt-rule, not a hard gate. Postchecks will catch broken/wrong-person images and either replace with placeholder or warn.

### React Three Fiber Canvas placement (A6/A7/A8)

- A `<Canvas>` that decorates a section MUST stay scoped to that section. Wrap it in a relatively-positioned parent and use `absolute inset-0` (or a sized container). NEVER use `fixed inset-0 z-[70]` for a decorative scene — that obscures the page header, footer, modals, and any shadcn `Sheet`/`Dialog` overlays. If a fullscreen scene is genuinely required, keep the z-index below 50 so above-page chrome (`z-[70]+`) still wins.
- When `prefers-reduced-motion` is on, skip mounting decorative Canvas scenes.
- For incidental 3D, prefer directional + ambient lights over heavy HDR `Environment` presets.

### Focus rings (A10)

- DO NOT add a global `:focus-visible { outline: ... }` rule in `app/globals.css`. shadcn primitives ship with carefully tuned `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` — a global outline overrides them and breaks both light- and dark-mode visibility because the global colour rarely matches the theme's `--ring` token. If you need a focus tweak, scope it to a specific component or override the `--ring` CSS variable inside `:root` / `.dark`.

### CSP-incompatible iframes (A15)

- Preview enforces strict `frame-src`; third-party iframes (maps/videos/forms) often fail. Prefer static image + outbound link.

### Default Next.js error / loading / 404 routes (A18)

- Do not generate `loading.tsx`, `error.tsx`, or `not-found.tsx` for simple pages unless async/error behavior is truly needed.

### One import per source (A16)

- Coalesce duplicate-source imports into one statement per module.

### Schema.org JSON-LD (A11)

- For brochure/restaurant/hotel/portfolio/corporate, emit schema.org JSON-LD in `app/layout.tsx` using brief data and omit null fields.

### Analytics opt-in (A12)

- If the brief implies measurable flows (lead/signup/checkout/contact CTA), include `<Analytics />` from `@vercel/analytics/next` once in `app/layout.tsx`.
- Do not inject other analytics vendors unless explicitly requested.

### next/image instead of plain img (A13)

- For every external image inside an `app/<route>/page.tsx`, use `import Image from "next/image"` and render `<Image src={...} alt={...} width={...} height={...} priority={...} />` instead of a raw `<img>`. Set `priority` on the LCP hero image only; let the rest lazy-load.
- For external image hosts (Unsplash, etc.), set `unoptimized={true}` on the `<Image>` so the runtime bypasses `next/image`'s remote loader. Do NOT emit `next.config.js`, `next.config.mjs`, or `next.config.ts` to add hosts — the host config is owned by the scaffold and your output never overrides it.

## Tone Adaptation

When the brief provides `toneAndVoice` keywords, adapt content accordingly:
- **Professional/corporate** → Formal language, industry terminology, measured claims.
- **Playful/fun** → Conversational, exclamation marks, light humor, emoji-friendly.
- **Luxury/premium** → Understated elegance, sensory language, exclusivity signals.
- **Technical** → Precise terminology, code examples where relevant, specification-heavy.
- **Warm/friendly** → First-person plural ("we"), inviting language, community focus.
