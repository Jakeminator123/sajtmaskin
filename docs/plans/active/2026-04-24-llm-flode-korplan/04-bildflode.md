---
status: active
created: 2026-04-24
spår: 4 av 5 (LLM-flöde-körplan)
prio: P3 (synligt för user direkt + felaktig terminologi i telemetri)
estimat: 2 dagar
---

# Spår 4 — Bildflöde (HEAD-validering, `[image_prompt:]`-implementation, dedup, telemetri-rename)

## Symtom (observerat)

I körning `eb152443-...` (och visat i user-screenshot):

1. **Röd 404 i nätverkspanelen:** `https://images.unsplash.com/photo-1541544181051-e46607d3d8a4?...` failade i klienten, men `validate-images` returnerade 200 OK utan att markera URL:en som broken.
2. **`imageGenerations: true` ⇒ 0 AI-bilder genererade.** LLM:en skrev råa Unsplash-länkar istället för att begära AI-bilder.
3. **Två gallery-items visar samma "blond kvinna"** från Unsplash — LLM-output saknar uniqueness-check.
4. **Hero-porträtt är gradient-card** istället för bild av Emilia/Jakob (prompten innehöll explicit personbeskrivning).
5. **Telemetri-fält `imageMaterialization: 1`** — uppfattas som "1 bild materialiserad" men är faktiskt **1 millisekund i materialize_images-fasen**.

## Rotorsak

### A. `validate-images` HEAD finns, men med 8 s timeout + ingen GET-fallback

**Verifierat:** HEAD-validering finns i `src/lib/utils/image-validator.ts`:
- `headCheckOnce` rad 163-178 (`fetch(url, { method: "HEAD", ... })`)
- `HEAD_TIMEOUT_MS = 8_000` rad 159-160
- Batching `MAX_CONCURRENT_CHECKS = 6` rad 161, 231-240

**Problemet:** servern HEAD-check kan returnera 200 medan klient-fetch får 404 pga:
- Olika cache-state (CDN edge)
- Olika geo-routing
- Unsplash rate-limit på server-IP men inte på klient-IP
- Server kanske gör HEAD som bara verifierar att domänen svarar, inte content-type

Dessutom: vissa CDN:er (inklusive Unsplash) returnerar `405 Method Not Allowed` för HEAD och fungerar bara med GET. Då hoppas valideringen tyst över URL:en.

### B. `[image_prompt:`-syntax finns inte i koden

**Verifierat:** grep i `src` → 0 träffar på `[image_prompt:`.

`materializeImages` (`src/lib/gen/post-process/image-materializer.ts` rad 8-9, 188-221) ersätter **bara** `\/placeholder\.svg\?` mönstret med Unsplash-sök. Inte AI-genererade bilder (DALL-E/Sora).

`imageGenerations`-flaggan i `src/lib/gen/system-prompt/build-dynamic-context.ts` rad 111 binds som `_imageGenerations` (underscore-prefix = används inte). Den påverkar **ingen** prompt-text.

`FEATURES.useBuilderImageGenerations` (`src/lib/config.ts` rad 433-434) styr bara om OpenAI-nyckel finns, inte om LLM:en faktiskt instrueras att begära bilder.

### C. Ingen uniqueness-check på `alt`/gallery-items

`extractImageRefs` (`src/lib/utils/image-validator.ts` rad 119-135) deduplicerar på **URL** (`seen.has(url)`), inte på `alt`. `findSemanticImageWarnings` rad 49-86 varnar bara på Unsplash + vissa nyckelord, ingen Levenshtein/Jaccard.

### D. `materializeImagesInTextFiles` matchar inte typiska Unsplash-URL:er

`extractHttpUrls` (`src/lib/imageAssets.ts` rad 52-55) plockar `https?://...`. `looksLikeImageUrl` rad 57-108 accepterar URL med filändelse, `/_next/image`, eller `fm`/`format` i query. **Typisk Unsplash-URL `https://images.unsplash.com/photo-XYZ?auto=format&w=1200`** har `format` i query → matchar (faktiskt OK).

**Faktisk effekt:** Unsplash-URL:er passerar `looksLikeImageUrl` ✓, men ingenstans i pipelinen ersätts de med blob/lokal kopia. De serveras direkt från Unsplash → 404-risk i prod.

### E. Telemetri-fält felbenämnt

`src/lib/gen/stream/finalize-version/runner.ts` rad 486-496:

```ts
debugLog("finalize", "Finalize pipeline complete", {
  ...
  imageMaterialization: resolveStepDurationMs("materialize_images"),  // ms!
  ...
});
```

Värdet är millisekunder, inte antal bilder. Förväxlas med `POST .../files`-rutens response som har `imageMaterialization: { uploaded, replaced }` (objekt med antal). Två fält med samma namn, olika betydelse.

## Föreslagna fixar

### Fix A — Stärka `validate-images`

**A1. Sänk timeout till 3 s + GET-fallback vid HEAD-fail.** I `src/lib/utils/image-validator.ts` `headCheckOnce` rad 163-178:

```ts
async function headCheckOnce(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    if (res.status === 405 || res.status === 501) {
      // GET-fallback med small range
      const get = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-1023" },
        signal: AbortSignal.timeout(5000),
      });
      return get.ok;
    }
    return res.ok;
  } catch {
    return false;
  }
}
```

**A2. Placeholder-fallback för 4xx/5xx.** I `findBrokenImages` (eller `applyReplacements`): för broken URL:er, om `findReplacements` inte hittar Unsplash-ersättning, ersätt med `/api/placeholder?w=1200&h=800&label=<encoded alt>`. Säkerställ att `app/api/placeholder/route.ts` (SVG GET) finns i scaffold-fröet.

### Fix B — Implementera `[image_prompt:]` på riktigt

**B1. Ny system-prompt-regel.** I `config/prompt-core/04-coding-direction.md` rad 55-58 (eller ny sektion `imagery-media-seo.ts`):

> "When the user prompt mentions specific persons (names, ages, descriptions), do NOT use Unsplash URLs. Instead, write `<Image src="[image_prompt: blond woman 40 by pool, sunlit reflection, cinematic]" alt="..." width={1200} height={800} />`. The `[image_prompt: ...]` will be resolved post-generation by the AI image-materializer."

**B2. Implementera materializer.** Ny fas i `src/lib/gen/post-process/image-materializer.ts`:

```ts
export async function materializeImagePrompts(
  files: CodeFile[],
  options: { imageGenerations: boolean; openaiApiKey: string },
): Promise<{ files: CodeFile[]; uploaded: number }> {
  const PROMPT_PATTERN = /\[image_prompt:\s*([^\]]+)\]/g;
  // För varje match: kalla OpenAI Images API → ladda upp till Vercel Blob → ersätt
}
```

Trådas in i `finalize-pipeline-contract.ts` mellan `materialize_images` och `verifier`.

**Risk:** Kostar pengar per AI-bild ($0.04-0.20). Måste:
- Gate:as bakom `imageGenerations === true` (gate finns redan).
- Rate-limita per chatId (max N bilder per generering).
- Caching: samma `image_prompt`-text → samma blob-URL.

### Fix C — Uniqueness-check på alt-strings

**C1. Ny varning** i `findSemanticImageWarnings` (`src/lib/utils/image-validator.ts` rad 49+):

```ts
// Räkna förekomst av normaliserad alt-string
const altCounts = new Map<string, number>();
for (const ref of refs) {
  const norm = ref.alt.toLowerCase().trim();
  altCounts.set(norm, (altCounts.get(norm) ?? 0) + 1);
}
for (const [alt, count] of altCounts) {
  if (count > 1 && alt.length > 10) {
    warnings.push({
      type: "duplicate_alt",
      severity: "warning",
      detail: `Alt-text "${alt}" repeats ${count} times — gallery items should be unique`,
    });
  }
}
```

**C2. Levenshtein-similarity för "nästan identiska" alts:** vid behov, men starta med exakt match (enklare, fångar 80 % av fallen).

### Fix D — Telemetri-rename (GLASKLAR)

**D1.** `src/lib/gen/stream/finalize-version/runner.ts` rad 486-496:

```ts
debugLog("finalize", "Finalize pipeline complete", {
  ...
  imageMaterializationMs: resolveStepDurationMs("materialize_images"),  // var: imageMaterialization
  ...
});
```

Behåll `imageMaterialization`-objekt-fältet i `POST .../files`-rutens response (den har annan betydelse: `{ uploaded, replaced }`).

**D2.** Konsekvensändring: alla konsumenter av denna log-rad (Datadog dashboards, backoffice). Sök efter `imageMaterialization` i `backoffice/`, `docs/`, `dashboards/`.

## Acceptanskriterier

- [ ] `validate-images` HEAD med 3 s timeout + GET-fallback för 405/501.
- [ ] Broken images (4xx/5xx) ersätts med placeholder eller Unsplash-replacement (om sökning lyckas).
- [ ] `[image_prompt:]`-syntax dokumenterad i prompten + materializer implementerad bakom `imageGenerations === true` flag.
- [ ] Duplicate-alt-varning loggas + (valfritt) flaggas i UI.
- [ ] `imageMaterialization` → `imageMaterializationMs` i finalize-debug-log.
- [ ] Manuell verifiering: skapa "Emilia & Jakob"-prompt → AI-bild av personerna i hero, inga Unsplash-URL:er av främlingar.

## Risker

- **B (image_prompt) är dyr** — kosta-mätning behövs. Caching-strategi (samma prompt → samma URL) viktig.
- **A2 (placeholder-fallback) ändrar visuell output** — tidigare brokens visade trasig img-ikon, nu visar de en SVG. Kan upplevas som regression om placeholder är ful. Designa placeholder-stub bra.
- **D2 (telemetri-rename) bryter dashboards** — koordinera med backoffice/Datadog innan deploy.

## Filer att läsa innan implementation

- `src/lib/utils/image-validator.ts` (hela, ~470 rader)
- `src/lib/imageAssets.ts` (rad 1-150)
- `src/lib/gen/post-process/image-materializer.ts`
- `src/app/api/engine/chats/[chatId]/validate-images/route.ts`
- `src/app/api/engine/chats/[chatId]/normalize-text/route.ts`
- `src/app/api/placeholder/route.ts`
- `src/lib/config.ts` (rad 396-440 — FEATURES + SECRETS)
- `config/prompt-core/04-coding-direction.md` (rad 55-58)
- `src/lib/gen/system-prompt/sections/imagery-media-seo.ts`
- `src/lib/gen/system-prompt/build-dynamic-context.ts` (rad 111 — `_imageGenerations`)
- `src/lib/gen/stream/finalize-version/runner.ts` (rad 486-496)

## Källa

Audit-agent #4 (claude-4.6-sonnet-medium-thinking) 2026-04-24, prompt fokus: bildflöde, `[image_prompt:]`, validate-images, telemetri-naming.
