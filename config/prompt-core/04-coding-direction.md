## Coding Direction

Content quality is 50% of what makes a site look professional. This section controls tone, copy style, and domain-specific content generation.

## Default Voice

Write realistic, specific content that matches the site's purpose. NEVER use lorem ipsum or generic "Feature 1", "Feature 2" text.

## Domain-Specific Content Examples

- Restaurant/hospitality: menu items, prices, hours, location, ingredients, atmosphere.
- SaaS/product: named features, metrics, social proof, differentiated tiers.
- Portfolio/creative: project names, case-study snippets, skills, named testimonials.
- Ecommerce: product names, materials/specs, prices, shipping/return trust signals.
- Agency/services: named services, scope, team roles, client testimonials.

## Media Assets

Images and videos must be subject-matter relevant. A site for a carpentry firm gets workshop, wood, and craft visuals — never an unrelated nature documentary or a generic abstract loop. Off-topic placeholders read as a broken or careless build.

- Never use generic public test videos (`Big Buck Bunny`, `Sintel`, `Tears of Steel`, `Elephants Dream`, `commondatastorage.googleapis.com/gtv-videos-bucket`, `sample-videos.com`).
- Video placeholders should use relative `/public/media/<topic>.mp4` or `.webm` paths with subject-relevant `poster`, labels/captions, and graceful fallback copy.
- Do not materialize external `.mp4` / `.webm` URLs.

### Image placeholders

- For placeholder images use either `images.unsplash.com/photo-<id>?...` direct CDN URLs (resolved post-generation by the image-materializer) or named placeholder services with topic-relevant queries. **NEVER** emit `https://source.unsplash.com/...` URLs — that domain was shut down in mid-2024 and every such URL ships as a broken image. Avoid generic `/placeholder.svg` filler when the subject is clear enough to query.
- Always set descriptive `alt` text — the alt is the fallback when the image fails or is replaced later by the validator.
- When the user prompt mentions specific persons, do not use stock-photo people as if they were that person. Use a deliberate placeholder or mark the section as demo-only.
- This is a prompt-rule, not a hard gate. Postchecks will catch broken/wrong-person images and either replace with placeholder or warn.

### React Three Fiber Canvas placement (A6/A7/A8)

- A `<Canvas>` that decorates a section MUST stay scoped to that section. Wrap it in a relatively-positioned parent and use `absolute inset-0` (or a sized container). NEVER use `fixed inset-0 z-[70]` for a decorative scene — that obscures the page header, footer, modals, and any shadcn `Sheet`/`Dialog` overlays. If a fullscreen scene is genuinely required, keep the z-index below 50 so above-page chrome (`z-[70]+`) still wins.
- When `frameloop="demand"` is set, also short-circuit the entire `<Canvas>` mount when `prefers-reduced-motion: reduce` is on — `frameloop="demand"` only pauses the render loop; the WebGL context, GPU memory, and three.js scene graph all stay alive. Pattern: `const reduced = useReducedMotion(); if (reduced) return null;` (use the framer-motion hook or a small `useMediaQuery` helper). The scene returns and re-mounts when the user re-enables motion.
- For incidental 3D (a single floating phone, a small glyph, a loading shape) DO NOT use `<Environment preset="studio" />` or any other drei `Environment` preset — they pull 4–8 MB HDR cubemaps from a third-party CDN on first paint. Use a directional + ambient light pair (`<directionalLight intensity={1} position={[2, 3, 1]} /><ambientLight intensity={0.4} />`) which renders identically for these small scenes. Reserve `Environment` for scenes that genuinely need PBR reflections.

### Focus rings (A10)

- DO NOT add a global `:focus-visible { outline: ... }` rule in `app/globals.css`. shadcn primitives ship with carefully tuned `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` — a global outline overrides them and breaks both light- and dark-mode visibility because the global colour rarely matches the theme's `--ring` token. If you need a focus tweak, scope it to a specific component or override the `--ring` CSS variable inside `:root` / `.dark`.

### CSP-incompatible iframes (A15)

- The preview iframe enforces a strict `frame-src` policy (`'self'` + Vercel preview hosts). Embedding `<iframe src="https://www.openstreetmap.org/...">` or any other third-party map / video / form provider in generated pages produces a CSP violation and a blank box. Use a static map image (Mapbox/Google Static API URL or an Unsplash photo of a city map) plus a `Visa på karta`-link to the live provider. The same applies to YouTube embeds in F2 — link out instead of embedding when the host is not Vercel-owned.

### Default Next.js error / loading / 404 routes (A18)

- For every generated `app/<route>/page.tsx` that is non-trivial, also generate a sibling `loading.tsx` and `error.tsx`. At the app-root, generate `app/error.tsx` and `app/not-found.tsx`. Keep them minimal but on-brand (heading + supportive copy + a `Link href="/"`-back action) so SSR errors and missing routes do not surface as a blank white page in preview or production.

### One import per source (A16)

- Coalesce multiple named imports from the same module into a single statement. `import { Card } from "@/components/ui/card"` followed five lines later by `import { CardHeader, CardContent } from "@/components/ui/card"` is wrong — emit a single `import { Card, CardContent, CardHeader } from "@/components/ui/card"`. The eslint rule `import/no-duplicates` is set to `error` in generated projects (see `eslint.config.mjs`), so duplicate-source imports fail the build, not just lint.

### Schema.org JSON-LD (A11)

- For `siteType` brochure / restaurant / hotel / portfolio / corporate, emit a `<script type="application/ld+json">` block in `app/layout.tsx` describing the appropriate schema.org type (`Organization`, `Hotel`, `Restaurant`, `LocalBusiness`, `Person` for portfolio). Pull `name`, `description`, `address`, `image`, `telephone`, and `url` from the brief — leave `null`-valued fields out of the JSON instead of emitting empty strings. Wrap with `dangerouslySetInnerHTML={{ __html: JSON.stringify(...) }}`. Without JSON-LD the site is invisible to Google rich results even when the rest of the SEO is correct.

### Analytics opt-in (A12)

- When the brief includes a workflow that needs measurement (lead form, signup, checkout, contact CTA), import `<Analytics />` from `@vercel/analytics/next` once in `app/layout.tsx` and render it inside the `<body>` after the page tree. The package is zero-config on Vercel and degrades to a noop locally — so emitting it costs nothing on dev. Do NOT inject Plausible / GA / PostHog without an explicit user request; those need accounts.

### next/image instead of plain img (A13)

- For every external image inside an `app/<route>/page.tsx`, use `import Image from "next/image"` and render `<Image src={...} alt={...} width={...} height={...} priority={...} />` instead of a raw `<img>`. Set `priority` on the LCP hero image only; let the rest lazy-load.
- For external image hosts (Unsplash, etc.), set `unoptimized={true}` on the `<Image>` so the runtime bypasses `next/image`'s remote loader. Do NOT emit `next.config.js`, `next.config.mjs`, or `next.config.ts` to add hosts — the host config is owned by the scaffold and your output never overrides it.
- Plain `<img>` ships without LCP prioritisation, blur placeholder, or responsive `srcset` and noticeably slows down generated sites on real devices.

## Tone Adaptation

When the brief provides `toneAndVoice` keywords, adapt content accordingly:
- **Professional/corporate** → Formal language, industry terminology, measured claims.
- **Playful/fun** → Conversational, exclamation marks, light humor, emoji-friendly.
- **Luxury/premium** → Understated elegance, sensory language, exclusivity signals.
- **Technical** → Precise terminology, code examples where relevant, specification-heavy.
- **Warm/friendly** → First-person plural ("we"), inviting language, community focus.
