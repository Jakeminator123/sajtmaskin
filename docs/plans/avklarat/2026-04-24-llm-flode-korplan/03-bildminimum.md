---
status: active
created: 2026-04-24
spår: 3 av 7 (LLM-flöde-körplan, REVIDERAD efter deep-prefab feedback)
prio: P3 (synligt för user; minimum först, AI-bildgen senare)
estimat: 2 dagar (minimum), AI-bildgen separat scope
---

# Spår 3 — Bildminimum (inga 404-bilder, ingen uppenbart fel bild)

## Bakgrund

Tidigare plan 04 buntade ihop "fixa Unsplash-404 + bygga AI-bildgen". Deep-prefab-agent föreslog att **dela**:

> "Minimum nu: inga 404-bilder, ingen rå Unsplash utan HEAD/GET-fallback, ingen bild som uppenbart inte matchar alt/prompt. Sedan: `[image_prompt:]` eller genererade/stiliserade bilder bakom kostnads- och cachepolicy."

Detta spår fokuserar på **minimum**. AI-bildgenerering (`[image_prompt:]`-syntax + DALL-E/Sora-integration) flyttas till framtida spår — det kräver kostnadstak, cachelogik och säkerhetsgate som är egen designdiskussion.

## Symtom (observerat)

I körning `eb152443-...`:

1. `https://images.unsplash.com/photo-1541544181051-...` blev **404 i klienten** (synligt i nätverkspanelen).
2. Server-side `validate-images` returnerade 200 OK utan att ersätta URL:en.
3. Två gallery-items visade samma "blond kvinna" från Unsplash.
4. Hero/Jakob-bild visade fel person (LLM valde stockfoto utan koppling till prompt).

## Rotorsak (verifierat)

### A. HEAD-validering har 8 s timeout, ingen GET-fallback

`src/lib/utils/image-validator.ts`:
- `headCheckOnce` rad 163-178: `fetch(url, { method: "HEAD" })` med `HEAD_TIMEOUT_MS = 8_000`.
- Inget retry vid 405/501 (Unsplash CDN kan returnera detta).
- `source.unsplash.com` kortsluts utan HEAD (rad 211-227) — nästan rätt, men hardcoded.

**Konsekvens:** server-HEAD kan ge 200 medan klient-fetch får 404 pga olika cache, geo-routing, eller server-IP-rate-limit.

### B. Ingen `naturalWidth`-check (kräver browser)

Den typen av check kräver headless-browser. **Detta hör till spår 02 Product Postcheck.** Här fokuserar vi på server-side-fix.

### C. `[image_prompt:]`-syntax dokumenterad men implementerad inte

Audit V4 verifierade: `grep` på `src/` ger **0 träffar** på `[image_prompt:`. `imageGenerations: true`-flaggan binds som `_imageGenerations` (underscore = oanvänd) i `build-dynamic-context.ts` rad 111. **Hela mekanismen finns inte i koden.**

### D. Telemetri-fält felbenämnt

`src/lib/gen/stream/finalize-version/runner.ts` rad 486-496:
```ts
imageMaterialization: resolveStepDurationMs("materialize_images"),  // ms!
```
Värdet är millisekunder, inte antal bilder. Förvirrar mot `POST .../files`-routens response som har `imageMaterialization: { uploaded, replaced }` (objekt med antal).

### E. Ingen uniqueness-check på `alt`

`extractImageRefs` (rad 119-135) deduplicerar på URL, inte på `alt`. Två gallery-items kan visa samma motivtema om LLM valde två likartade Unsplash-URL:er.

## Föreslagen fix — bara minimum, INGEN AI-bildgen

### Fix A — Stärka HEAD-validering

**A1.** I `src/lib/utils/image-validator.ts` `headCheckOnce` rad 163-178: sänk timeout till 3 s + GET-fallback för 405/501:

```ts
async function headCheckOnce(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    if (res.status === 405 || res.status === 501) {
      // Vissa CDN tillåter inte HEAD — fall tillbaka till lite-GET
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

**Risk:** några CDN:er ignorerar `Range`-header och skickar full bild → 1 KB blir hela 200 KB. Acceptabel kostnad för ett fåtal failade HEAD per generation.

### Fix B — Placeholder-fallback för broken images

**B1.** I `findBrokenImages` / `applyReplacements` (`src/lib/utils/image-validator.ts` rad 431-464): för broken URL:er som **inte** har en lyckad Unsplash-replacement, ersätt med:

```
/api/placeholder?w=1200&h=800&label=<encoded alt>
```

`app/api/placeholder/route.ts` finns redan (SVG GET) — verifiera att den ligger i scaffold-fröet (`src/lib/gen/scaffolds/landing-page/files/`) så genererad sajt har den.

**Designval:** placeholder ska se "uppenbart placeholder" ut (gradient + alt-text) så att user inser att bilden missing — inte snyggt nog att luras tro att den är "bilden".

### Fix C — Telemetri-rename (GLASKLAR)

**C1.** `src/lib/gen/stream/finalize-version/runner.ts` rad 486-496:

```ts
debugLog("finalize", "Finalize pipeline complete", {
  ...
  imageMaterializationMs: resolveStepDurationMs("materialize_images"),  // var: imageMaterialization
  ...
});
```

**C2.** Konsekvensändring: sök efter `imageMaterialization` i `backoffice/`, `docs/`, ev. Datadog-dashboards. Fyra träffar hittade i `src/`-grep. Behåll `imageMaterialization`-fältet i `POST .../files`-rutens response (annan betydelse: `{ uploaded, replaced }`-objekt).

### Fix D — Uniqueness-warning på alt

**D1.** Ny varning i `findSemanticImageWarnings` (`src/lib/utils/image-validator.ts` rad 49-86):

```ts
const altCounts = new Map<string, number>();
for (const ref of refs) {
  const norm = ref.alt.toLowerCase().trim();
  if (norm.length < 10) continue; // skip korta alts som "Logo"
  altCounts.set(norm, (altCounts.get(norm) ?? 0) + 1);
}
for (const [alt, count] of altCounts) {
  if (count > 1) {
    warnings.push({
      type: "duplicate_alt",
      severity: "warning",
      detail: `Alt-text "${alt}" repeats ${count} times — gallery items should be unique`,
    });
  }
}
```

**Risk:** falska positiver för medvetet repeterade gallery-items (t.ex. "Produkt 1", "Produkt 2" har olika namn men samma struktur). Borde vara en signal till user, inte en hård gate.

### Fix E — Prompt-regel mot stock-foton för persontprompt

**E1.** I `config/prompt-core/04-coding-direction.md` rad 55-58 (befintlig image-sektion), lägg till:

> "When the user prompt mentions specific persons (names like 'Emilia Eberg', ages like '40 år', or descriptions like 'blond'), do NOT use Unsplash URLs of stock-photo people. Either:
> - Use `<Image src="/api/placeholder?label=Emilia" alt="Porträtt av Emilia" />` so the user sees a placeholder, OR
> - Mark the section as `data-demo-only` so postcheck flags it as 'fake content'."

**E2.** Detta är en **prompt-regel**, inte en hard-gate. LLM:en kan välja att ändå använda Unsplash, men då fångas det av Product Postcheck (spår 02) som flaggar `broken_image` eller `wrong-person-image`.

## Vad som flyttas till FRAMTIDA spår

**`[image_prompt:]`-implementation + DALL-E/Sora-integration:**

- Kräver kostnadstak per chatId (max N bilder/genering, kostnad ~$0.04-0.20/bild).
- Caching-strategi: samma prompt → samma blob-URL.
- Säkerhetsgate: filtrera prompts från PII (namn ska inte skickas till AI image-API).
- Eval: visar AI-bilder verkligen Emilia/Jakob bättre än placeholders?
- Egen designdoc + opt-in-flagga + canary-rollout.

Detta är ett **separat** spår som bör tas i en framtida runda, inte i denna leverans.

## Acceptanskriterier

- [ ] HEAD-timeout 8s → 3s + GET-fallback för 405/501.
- [ ] Broken images (4xx/5xx) ersätts med `/api/placeholder?w=1200&h=800&label=<alt>`.
- [ ] `app/api/placeholder/route.ts` finns i scaffold-fröet (verifiera).
- [ ] `imageMaterialization` → `imageMaterializationMs` (rename i finalize-debug-log; bevarar `POST .../files`-response).
- [ ] `duplicate_alt`-varning loggas vid uniqueness-fail.
- [ ] Prompt-regel för persontnamn finns i `04-coding-direction.md`.
- [ ] Manuell verifiering: kör eb152443-prompt igen → inga 404-bilder, eventuella Unsplash-foton är inte av personer (eller är placeholder-stub).

## Risker

- **B (placeholder-fallback)** ändrar visuell output — tidigare brokens visade trasig img-ikon, nu visar de en SVG. Designa placeholder bra så det inte upplevs som regression.
- **D (uniqueness)** kan ge falska positiver för medvetet upprepade items — håll som warning, inte block.
- **E (prompt-regel)** ökar dynamisk prompt-text med ~150 tokens. Acceptabelt för förväntad kvalitetsvinst.

## Filer att läsa innan implementation

- `src/lib/utils/image-validator.ts` (hela, ~470 rader)
- `src/lib/imageAssets.ts` (rad 1-150 — `looksLikeImageUrl`)
- `src/lib/gen/post-process/image-materializer.ts`
- `src/app/api/engine/chats/[chatId]/validate-images/route.ts`
- `src/app/api/placeholder/route.ts` (befintlig SVG GET-route)
- `src/lib/gen/scaffolds/landing-page/files/` (verifiera att placeholder-route ingår)
- `src/lib/gen/stream/finalize-version/runner.ts` (rad 486-496 — telemetri-rename)
- `config/prompt-core/04-coding-direction.md` (rad 55-58)
- `src/lib/gen/system-prompt/sections/imagery-media-seo.ts`

## Källor

- Audit-agent #4 (claude-4.6-sonnet-medium-thinking) 2026-04-24, första pass — full bildflöde-analys
- Deep-prefab-agentens svar i `svar_gpt`: "först 'inga trasiga/relevanslösa bilder', sedan AI-bilder" (delning av scope)
