## Coding Direction

Content quality strongly affects perceived design quality. Keep copy specific and believable.

## Default Voice

Write realistic, specific content that matches the site's purpose. NEVER use lorem ipsum or generic "Feature 1", "Feature 2" text. Match copy to domain with concrete details (names, prices/specs, testimonials, scope, location/hours where relevant).

## Media Assets

Images and videos must be subject-matter relevant. A carpentry site gets workshop/wood visuals — not unrelated nature or abstract loops. Off-topic placeholders read as broken.

- Never use generic public test videos (`Big Buck Bunny`, `Sintel`, `Tears of Steel`, `Elephants Dream`, `commondatastorage.googleapis.com/gtv-videos-bucket`, `sample-videos.com`).
- Video placeholders use relative `/public/media/<topic>.mp4`/`.webm` paths with a subject-relevant `poster`, labels/captions, and graceful fallback copy. Do not materialize external `.mp4`/`.webm` URLs.
- Image placeholders: `images.unsplash.com/photo-<id>?...` (not `source.unsplash.com`) or topic-relevant placeholder services. Always set descriptive `alt`.
- When the user prompt names a specific person, do not use a stock-photo person as if they were that person — use a deliberate placeholder or mark the section as demo-only.

## Recurring Pitfalls (follow-up / repair avoids these)

- **R3F Canvas placement:** a `<Canvas>` that decorates a section stays scoped to that section — wrap it in a relatively-positioned parent and use `absolute inset-0` (or a sized container). NEVER use `fixed inset-0 z-[70]` for a decorative scene — it obscures the page header, footer, modals, and shadcn `Sheet`/`Dialog` overlays. If a fullscreen scene is genuinely required, keep z-index below 50. Skip decorative Canvas scenes when `prefers-reduced-motion` is on. For incidental 3D, prefer directional + ambient lights over heavy HDR `Environment` presets.
- **Focus rings:** do NOT add a global `:focus-visible { outline: ... }` rule in `app/globals.css`. shadcn primitives ship tuned `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. If you need to tweak, scope it to a specific component or override `--ring` inside `:root` / `.dark`.
- **CSP-incompatible iframes:** preview enforces strict `frame-src`; third-party iframes (maps, videos, forms) often fail. Prefer static image + outbound link.
- **Default Next.js error/loading/404 routes:** do not generate `loading.tsx`, `error.tsx`, or `not-found.tsx` for simple pages unless async/error behavior is truly needed.
- **One import per source:** coalesce duplicate-source imports into a single statement per module.
- **Schema.org JSON-LD:** for brochure/restaurant/hotel/portfolio/corporate, emit JSON-LD in `app/layout.tsx` using brief data, omitting null fields.
- **Analytics opt-in:** if the brief implies measurable flows (lead/signup/checkout/contact CTA), include `<Analytics />` from `@vercel/analytics/next` once in `app/layout.tsx`. No other analytics vendors unless requested.
- **next/image for external hosts:** for every external image inside `app/<route>/page.tsx`, `import Image from "next/image"` and render `<Image src alt width height priority />` instead of raw `<img>`. Set `priority` only on the LCP hero; rest lazy-loads. For external hosts (Unsplash etc.), set `unoptimized={true}` on the `<Image>`. Do NOT emit `next.config.*` to add hosts — scaffold owns host config.

## Tone Adaptation

When the brief provides `toneAndVoice` keywords, adapt content:

- **Professional/corporate** → formal language, industry terminology, measured claims.
- **Playful/fun** → conversational, exclamation marks, light humor, emoji-friendly.
- **Luxury/premium** → understated elegance, sensory language, exclusivity signals.
- **Technical** → precise terminology, code examples where relevant, specification-heavy.
- **Warm/friendly** → first-person plural ("we"), inviting language, community focus.
