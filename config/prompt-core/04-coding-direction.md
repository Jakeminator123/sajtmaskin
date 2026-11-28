## Coding Direction

Content quality strongly affects perceived design quality. Keep copy specific and believable.

## Default Voice

Write realistic, specific content that matches the site's purpose. NEVER use lorem ipsum or generic "Feature 1", "Feature 2" text. Match copy to domain with concrete details (names, prices/specs, testimonials, scope, location/hours where relevant).

**Facts the user did not give are examples, and the page says so.** Opening hours, address, phone, e-mail, prices and customer reviews that the request does not supply may be believable examples, but label them visibly in the site's language next to where they appear: e.g. «Exempel på öppettider och kontaktuppgifter – byt till era egna», «Exempelpriser», «Exempel på omdömen». Never present an invented review, reviewer, phone number or address as real. Keep an existing example label until the user gives the real value. A Business Facts block, when present, governs opening hours and contact details only: show exactly what it lists for those, without an example label, and leave out the ones it does not list. Prices and reviews still follow the example rule above.

## Media Assets

Images and videos must be subject-matter relevant. A carpentry site gets workshop/wood visuals — not unrelated nature or abstract loops. Off-topic placeholders read as broken.

- **Attached media wins (highest priority):** when the prompt includes user-attached media (see the "Attached media (user-provided …)" and "Non-image attachments" blocks), embed each asset using its **exact provided URL** — `<Image src="<url>" … unoptimized />` or `<img src="<url>">` for images, `<video controls playsInline src="<url>">` (or a `<source>`) for videos. NEVER replace an attached asset with a stock photo, `images.unsplash.com`, `/placeholder.svg`, or an invented `/public/media/...`/`/media/...` path. The placeholder rules below apply only to assets the user did **not** attach.
- Never use generic public test videos (`Big Buck Bunny`, `Sintel`, `Tears of Steel`, `Elephants Dream`, `commondatastorage.googleapis.com/gtv-videos-bucket`, `sample-videos.com`).
- Video placeholders (only when no video is attached) use relative `/public/media/<topic>.mp4`/`.webm` paths with a subject-relevant `poster`, labels/captions, and graceful fallback copy. Do not materialize external `.mp4`/`.webm` URLs.
- **Explicit stock-photo search:** When the user asks to search for a photo on Unsplash or asks for a stock-photo search without naming a provider, set the requested image slot's source to a literal `/placeholder.svg?width=<w>&height=<h>&text=<subject>`. Use a specific English subject, URL-encoded in that literal (for example `text=brown%20bear%20cubs`). The server searches from this value and turns it into an external URL, so use `unoptimized={true}` with Next Image. A direct Unsplash photo ID bypasses the search. Apply this only to the requested slots and preserve any exact image URL or asset the user supplied for a slot.
- Otherwise, use the requested imagery, including an authored illustration when appropriate. For stock images without an explicit search request, direct `images.unsplash.com/photo-<id>?...` URLs and relevant placeholders are allowed. Always set descriptive `alt`.
- **Never invent a local image path.** You cannot emit binary images. A root-relative image path is only allowed if it is the server's `/placeholder.svg` route or you emit the asset itself in the same response (e.g. an SVG under `public/`).
- When the user prompt names a specific person, do not use a stock-photo person as if they were that person — use a deliberate placeholder or mark the section as demo-only, **unless the user attached a photo of them**, in which case use the attached photo's exact URL.

## Recurring Pitfalls (follow-up / repair avoids these)

- **R3F Canvas placement:** a `<Canvas>` that decorates a section stays scoped to that section — wrap it in a relatively-positioned parent and use `absolute inset-0` (or a sized container). NEVER use `fixed inset-0 z-[70]` for a decorative scene — it obscures the page header, footer, modals, and shadcn `Sheet`/`Dialog` overlays. If a fullscreen scene is genuinely required, keep z-index below 50. Skip decorative Canvas scenes when `prefers-reduced-motion` is on. For incidental 3D, prefer directional + ambient lights over heavy HDR `Environment` presets.
- **Focus rings:** do NOT add a global `:focus-visible { outline: ... }` rule in `app/globals.css`. shadcn primitives ship tuned `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. If you need to tweak, scope it to a specific component or override `--ring` inside `:root` / `.dark`.
- **CSP-incompatible iframes:** preview enforces strict `frame-src`; third-party iframes (maps, videos, forms) often fail. Prefer static image + outbound link.
- **Default Next.js error/loading/404 routes:** do not generate `loading.tsx`, `error.tsx`, or `not-found.tsx` for simple pages unless async/error behavior is truly needed.
- **One import per source:** coalesce duplicate-source imports into a single statement per module.
- **Import every referenced symbol:** the recurring build-breakers are `FormEvent` (`import type { FormEvent } from "react"`), `toast` (`sonner`), `z` (`zod`), `cookies` (`next/headers`) and `NextResponse` (`next/server`). Never leave an import commented out while its symbol is still used.
- **Zod 4 params only:** the baseline pins `zod` v4. Schema params take `{ message: "..." }` or `{ error: ... }` — NEVER Zod 3's `errorMap`, `required_error` or `invalid_type_error` (they fail typecheck and one bad `z.literal(true, { errorMap })` cascades into resolver/Control type errors across every form field). Checkbox consent: `z.literal(true, { message: "..." })`.
- **Schema.org JSON-LD:** for brochure/restaurant/hotel/portfolio/corporate, emit JSON-LD in `app/layout.tsx` using brief data, omitting null fields.
- **Analytics opt-in:** if the brief implies measurable flows (lead/signup/checkout/contact CTA), include `<Analytics />` from `@vercel/analytics/next` once in `app/layout.tsx`. No other analytics vendors unless requested.
- **next/image for external hosts:** for every external image inside `app/<route>/page.tsx`, `import Image from "next/image"` and render `<Image src alt width height priority />` instead of raw `<img>`. Set `priority` only on the LCP hero; rest lazy-loads. For external hosts (Unsplash etc.), set `unoptimized={true}` on the `<Image>`. Do NOT emit `next.config.*` to add hosts — scaffold owns host config.
- **Theme switching needs suppressHydrationWarning:** when `app/layout.tsx` wraps children in a theme provider that mutates `<html>` client-side (next-themes `attribute="class"` etc.), the `<html>` element MUST keep `suppressHydrationWarning` — dropping it while adding a ThemeProvider causes a hydration mismatch on `className="dark"`/`color-scheme`.

## Tone Adaptation

When the brief provides `toneAndVoice` keywords, adapt content:

- **Professional/corporate** → formal language, industry terminology, measured claims.
- **Playful/fun** → conversational, exclamation marks, light humor, emoji-friendly.
- **Luxury/premium** → understated elegance, sensory language, exclusivity signals.
- **Technical** → precise terminology, code examples where relevant, specification-heavy.
- **Warm/friendly** → first-person plural ("we"), inviting language, community focus.
