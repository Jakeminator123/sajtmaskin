## Coding Direction

Content quality is 50% of what makes a site look professional. This section controls tone, copy style, and domain-specific content generation.

## Default Voice

Write realistic, specific content that matches the site's purpose. NEVER use lorem ipsum or generic "Feature 1", "Feature 2" text.

## Domain-Specific Content Examples

### Restaurant / Hospitality
- Real-sounding menu items with prices, opening hours, location description.
- Evocative descriptions of atmosphere, ingredients, preparation methods.
- Named dishes with plausible pricing (not "$X.XX" placeholders).

### SaaS / Product
- Specific feature names, benefit-driven descriptions, tiered pricing.
- Concrete metrics and social proof: "Trusted by 2,500+ teams", "99.9% uptime".
- Clear value propositions per tier, not generic "Basic / Pro / Enterprise" without differentiation.

### Portfolio / Creative
- Project names with descriptions, skills, testimonials from named people.
- Case study narratives with before/after or challenge/solution structure.
- Specific tool/technology mentions relevant to the creative domain.

### Ecommerce
- Product names, descriptions with materials/specifications, realistic pricing.
- Trust signals: shipping info, return policies, customer reviews.
- Category organization that reflects real shopping behavior.

### Agency / Services
- Named service offerings with scope descriptions.
- Team member profiles with roles and brief bios.
- Client testimonials with names and company affiliations.

## Media Assets

Images and videos must be subject-matter relevant. A site for a carpentry firm gets workshop, wood, and craft visuals — never an unrelated nature documentary or a generic abstract loop. Off-topic placeholders read as a broken or careless build.

### Forbidden public-domain stock videos

Do NOT use the following well-known free test videos, regardless of how convenient they are. They are immediately recognizable and destroy credibility:

- "Big Buck Bunny", "Sintel", "Tears of Steel", and especially "Elephants Dream" (Blender Foundation open movies).
- Any URL on `commondatastorage.googleapis.com/gtv-videos-bucket/` (Google's public sample bucket).
- `sample-videos.com` and similar generic sample-clip hosts.

### How to handle video placeholders

- Prefer `<video>` with a relative path under `/public/media/<topic>.mp4` (or `.webm`). The asset itself can be filled in later via the media bank — your job is to render the markup with subject-relevant filename and `poster` attribute.
- Always provide a `poster` attribute pointing to a topic-relevant still image (Unsplash-style URL with a query that names the subject is acceptable as a poster).
- Use `aria-label` or visible caption that names the subject so missing assets degrade gracefully.
- Do NOT materialize external `.mp4` / `.webm` URLs in the build pipeline — they are excluded from blob upload (`src/lib/imageAssets.ts`) and will remain as live external links pointing wherever you put them.

### Image placeholders

- When emitting placeholder images, use Unsplash search URLs (`https://source.unsplash.com/...`) with a topic query that matches the site's subject, or named placeholder services with topic-relevant queries. Avoid generic `/placeholder.svg` filler when the subject is clear enough to query.
- Always set descriptive `alt` text — the alt is the fallback when the image fails or is replaced later.

## Tone Adaptation

When the brief provides `toneAndVoice` keywords, adapt content accordingly:
- **Professional/corporate** → Formal language, industry terminology, measured claims.
- **Playful/fun** → Conversational, exclamation marks, light humor, emoji-friendly.
- **Luxury/premium** → Understated elegance, sensory language, exclusivity signals.
- **Technical** → Precise terminology, code examples where relevant, specification-heavy.
- **Warm/friendly** → First-person plural ("we"), inviting language, community focus.
