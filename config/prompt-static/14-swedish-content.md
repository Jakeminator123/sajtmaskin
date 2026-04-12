# Swedish Content Quality

All generated websites target a **Swedish audience** unless the user explicitly requests another language. Apply the rules below to every text string, metadata field, and alt-text in the output.

## Language & Characters

- Write all UI copy, headings, body text, metadata, navigation labels, alt-texts, and button labels in Swedish.
- Use Swedish characters (å, ä, ö) correctly — never substitute with a, o or ae/oe.
- Use correct Swedish date format (1 januari 2025, not January 1, 2025) and number formatting (1 234,50 kr — space as thousands separator, comma as decimal separator).
- Use Swedish phone number format: 070-123 45 67 or +46 70-123 45 67.
- Streets and addresses must follow Swedish convention: Storgatan 12, 411 38 Göteborg.

## Tone & Style

- Professional yet warm. Lagom — not too stiff, not too casual.
- Never use emojis anywhere in the generated site: not in headings, body text, buttons, metadata, comments, or alt-texts.
- Write real paragraph text — at least 2-3 sentences per content paragraph. No one-liner filler sentences.
- Use authentic-sounding Swedish company names, people names, and place names when inventing content. Avoid anglicisms like "John Doe" or "123 Main Street".
- NEVER use bracket placeholders like `[Text här]` or `[Rubrik]`. Every string in the output must be final, publishable Swedish content.

## Heading Hierarchy

- Exactly one `<h1>` per page.
- Headings must follow a strict hierarchy: h1 → h2 → h3. Never skip levels (h1 then h3).
- Headings should be concise and descriptive — no keyword-stuffing, no all-caps.

## SEO & Metadata

- `title` and `description` in Next.js `metadata` must be in Swedish and descriptive.
- `metadata.keywords` must be a plain mutable `string[]` — never use `as const` on arrays assigned to metadata fields. TypeScript's `Metadata.keywords` expects `string[]`, not `readonly string[]`. Write it as `keywords: ["sök", "ord"]` without `as const`.
- The same applies to `metadata.authors` and any other metadata array: no `as const`, no `satisfies readonly`.
- Open Graph titles and descriptions: Swedish.

## Navigation & Labels

- Navigation links in Swedish: "Hem", "Om oss", "Tjänster", "Kontakt", "Blogg", "Priser", etc.
- Button labels in Swedish: "Kom igång", "Läs mer", "Kontakta oss", "Boka tid", "Skicka", not English equivalents.
- Form labels and placeholders in Swedish: "Ditt namn", "E-postadress", "Meddelande".
- Aria labels and alt-texts in Swedish.

## URL Slugs

- Use Swedish slugs for Swedish sites: `/om-oss` (not `/about` or `/om`), `/kontakt` (not `/contact`), `/priser` (not `/pricing`), `/tjanster` (not `/services`), `/blogg` (not `/blog`), `/boka` (not `/book`).
- Navigation `<Link href>` values MUST exactly match the file paths you create. If you create `app/om-oss/page.tsx`, use `href="/om-oss"`.
- Never generate navigation links to pages you have not created.

## Common Mistakes to Avoid

- Do not mix English and Swedish in the same sentence or section.
- Do not write "Copyright © 2025 Företagsnamn. All rights reserved." — write "© 2025 Företagsnamn. Alla rättigheter förbehållna." or simply "© 2025 Företagsnamn."
- Do not use "Lorem ipsum" or English placeholder text.
- Do not hardcode `as const` assertions on arrays that are assigned to Next.js `Metadata` fields — this causes TypeScript errors (`readonly` not assignable to mutable type) that break the build and leave gray empty areas on the page.
