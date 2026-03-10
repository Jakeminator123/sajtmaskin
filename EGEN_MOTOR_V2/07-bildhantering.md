# Plan 07: Bildhantering och placeholder-fix

> Prioritet: HÖG — fixar "bilder laddas inte" och "likadana sidor"
> Beroenden: Inga
> Insats: 3-5 dagar

## Problemen

### Bilder laddas inte
1. Systemprompt instruerar LLM:en att använda `/placeholder.svg?height=H&width=W` — men `public/placeholder.svg` finns inte
2. LLM:en genererar `/ai/hero-image.png` etc. — men ingen route servar `/ai/`-filer
3. Media-catalog använder `{{hero-image}}`-alias men suspense-regeln matchar bara `{{MEDIA_N}}`/`{{URL_N}}`
4. Preview-stubs visar "AI-bild saknas" men ger ingen visuell representation

### Likadana sidor
Systemprompt saknar instruktioner om layoutvariation. Alla genererade sidor följer samma hero→content→CTA→footer-mönster med samma färgschema.

## Lösning

### Del A: Placeholder-SVG

Skapa `public/placeholder.svg` som genererar dynamiska platshållarbilder.

### Del B: Förbättrad bildhantering i preview

Uppgradera Image-stuben för att visa visuellt informativa platshållare istället för grå "saknas"-boxar.

### Del C: Utökad alias-expansion

Bredda suspense-regeln för URL-alias.

### Del D: Layoutvariation i systemprompt

Lägg till instruktioner som tvingar variation.

## Nya filer att skapa

### `public/placeholder.svg`

Dynamisk SVG som läser width/height från URL:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="100%" height="100%" fill="#1e293b"/>
  <rect x="2" y="2" width="596" height="396" fill="none" stroke="#334155" stroke-width="2" rx="8"/>
  <text x="50%" y="45%" text-anchor="middle" fill="#64748b" font-family="system-ui" font-size="18">
    600 × 400
  </text>
  <text x="50%" y="55%" text-anchor="middle" fill="#475569" font-family="system-ui" font-size="14">
    Placeholder Image
  </text>
</svg>
```

OBS: Denna måste servas som en route (inte statisk fil) för att dynamiskt generera rätt storlek.

### `src/app/api/placeholder/route.ts`

Dynamisk SVG-generator:

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const width = parseInt(searchParams.get("width") || searchParams.get("w") || "600");
  const height = parseInt(searchParams.get("height") || searchParams.get("h") || "400");
  const text = searchParams.get("text") || `${width} × ${height}`;

  const svg = generatePlaceholderSvg(width, height, text);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

SVG-generatorn skapar en snygg mörk platshållare med dimensioner och valfri text.

## Filer att modifiera

### `src/lib/gen/preview.ts` — Image-stub förbättring

Nuvarande Image-stub (runt rad 405-434) visar bara text "AI-bild saknas". Uppgradera till:

1. För `/placeholder.svg?...` → visa en mörk SVG-box med dimensioner (inline-genererad)
2. För `/ai/...` → visa en snygg gradient-placeholder med alt-texten synlig
3. För http(s)-URLs → behåll vanlig `<img>` med error-fallback
4. Använd placeholder-routens URL som fallback-src

### `src/lib/gen/suspense/rules/url-alias-expand.ts`

Nuvarande regex: `\{\{((?:MEDIA|URL)_\d+)\}\}/g`

Bredda till att matcha alla alias-format:
```typescript
const ALIAS_RE = /\{\{([A-Za-z][A-Za-z0-9_-]*)\}\}/g;
```

Sök i `context.urlMap` efter matchande nyckel. Om nyckeln inte finns, lämna oförändrad.

### `src/lib/gen/system-prompt.ts` — Bildhantering

Uppdatera bild-sektionen i STATIC_CORE:

```
## Images

- Use `/placeholder.svg?height=H&width=W` for placeholder images. Example: `/placeholder.svg?height=400&width=600`
- You can add descriptive text: `/placeholder.svg?height=400&width=600&text=Hero+Image`
- Always include descriptive `alt` text on every `<img>` and `<Image>` element.
- For hero images: use large, full-width placeholders (height=500-700, width=1200)
- For cards/thumbnails: use smaller placeholders (height=200-300, width=400)
- For avatars: use square placeholders (height=64&width=64)
- NEVER use `blob:` or `data:` URIs for images.
- NEVER use `/ai/` paths for images (these do not exist).
```

### `src/lib/gen/system-prompt.ts` — Layoutvariation

Lägg till i STATIC_CORE (i styling-sektionen):

```
## Layout Variety

Every page must feel unique. Do NOT repeat the same layout pattern.

Variation techniques:
- Hero sections: alternate between full-width image, split (text + image), centered text-only, diagonal/angled backgrounds, video-background-style
- Content grids: vary between 2-col, 3-col, masonry, alternating left-right, timeline, cards
- Color accents: use different accent colors for different sections (primary, secondary, accent hues)
- Typography: mix section heading sizes (text-3xl, text-4xl, text-5xl) and weights
- Spacing: alternate between compact sections and spacious breathing-room sections
- Visual elements: mix gradients, patterns, subtle backgrounds, borders, shadows

If generating multiple pages, each page MUST have a distinct visual character while sharing the same design system.
```

## Acceptanskriterier

- [ ] `/placeholder.svg?height=400&width=600` returnerar en snygg SVG
- [ ] Preview visar visuella platshållare istället för "saknas"-text
- [ ] URL-alias-expansion matchar alla alias-format
- [ ] Systemprompt har uppdaterade bildinstruktioner (inga `/ai/`-paths)
- [ ] Systemprompt har layoutvariation-instruktioner
- [ ] Inga nya lint-fel
- [ ] TypeScript kompilerar rent
