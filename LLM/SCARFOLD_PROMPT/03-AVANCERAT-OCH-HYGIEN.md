# Del 3: Avancerade funktioner och kodhygien

> Kör denna EFTER att Del 2 är verifierad. Delarna i denna fil är till stor del oberoende av varandra.

---

## A. Embedding-baserad KB-sökning (E2+M10)

### Nuläge

`src/lib/gen/context/knowledge-base.ts` använder keyword-matchning:
- Tokeniserar query, matchar mot `snippet.keywords`
- Exakt match: +5, substring: +2, title: +1
- ~50 snippets i `src/lib/gen/data/docs-snippets.ts`

En prompt om "recipe sharing app" hittar inte docs om "data fetching patterns".

### Befintlig infra att återanvända

| Fil | Vad den gör |
|-----|------------|
| `src/lib/templates/template-embeddings-core.ts` | `text-embedding-3-small`, 1536 dimensioner, batch-generering |
| `src/lib/templates/template-search.ts` | Cosine similarity, top-K |
| `src/lib/templates/template-embeddings-storage.ts` | Load/save (lokal JSON eller Vercel Blob) |

### Plan

**Steg 1: Skapa `scripts/generate-docs-embeddings.ts`**

```typescript
import { DOCS_SNIPPETS } from "../src/lib/gen/data/docs-snippets";
import { generateEmbeddings } from "../src/lib/templates/template-embeddings-core";

async function main() {
  const texts = DOCS_SNIPPETS.map(s => `${s.title}\n${s.content}`);
  const embeddings = await generateEmbeddings(texts);
  // Spara till src/lib/gen/data/docs-embeddings.json
  const output = DOCS_SNIPPETS.map((s, i) => ({
    id: s.id,
    embedding: embeddings[i],
  }));
  writeFileSync("src/lib/gen/data/docs-embeddings.json", JSON.stringify(output));
}
```

Kör: `npx tsx scripts/generate-docs-embeddings.ts`

**Steg 2: Skapa `src/lib/gen/context/embedding-search.ts`**

```typescript
import embeddingsData from "../data/docs-embeddings.json";
import { DOCS_SNIPPETS } from "../data/docs-snippets";
import { cosineSimilarity } from "@/lib/templates/template-search";

const queryCache = new Map<string, number[]>();

export async function searchByEmbedding(
  query: string,
  maxResults = 5,
): Promise<KBMatch[]> {
  // Generera query-embedding (cachad per serverlivstid)
  let queryEmb = queryCache.get(query);
  if (!queryEmb) {
    const [emb] = await generateEmbeddings([query]);
    queryEmb = emb;
    queryCache.set(query, emb);
  }

  // Cosine similarity mot alla snippets
  const scored = embeddingsData.map((item, i) => ({
    snippet: DOCS_SNIPPETS[i],
    score: cosineSimilarity(queryEmb!, item.embedding),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .filter(s => s.score > 0.3)
    .map(s => ({ ...s.snippet, score: s.score }));
}
```

**Steg 3: Uppdatera `searchKnowledgeBase` i `knowledge-base.ts`**

```typescript
export async function searchKnowledgeBase(options: KBSearchOptions): Promise<KBMatch[]> {
  // Försök embedding-sökning först
  if (process.env.OPENAI_API_KEY) {
    try {
      const results = await searchByEmbedding(options.query, options.maxResults);
      if (results.length > 0) return results;
    } catch {
      // Fallback till keyword
    }
  }

  // Keyword-sökning som fallback
  return searchByKeyword(options);
}
```

**OBS:** Ändrar funktionen från synkron till asynkron. Alla anropare (i `buildDynamicContext`) måste uppdateras.

### Risker och lösning

| Risk | Lösning |
|------|---------|
| 200ms latens per request | Query-cache i minnet |
| Asynkron API i synkront sammanhang | Gör `buildDynamicContext` async |
| Embedding-fil i repo? | Ja, ~50 snippets * 1536 floats = ~300KB, acceptabelt |

---

## B. Ecommerce scaffold

### Filer att skapa

`src/lib/gen/scaffolds/ecommerce/manifest.ts`:

- `app/globals.css` -- `@theme inline` med neutral oklch-palett
- `app/layout.tsx` -- header med varukorg-ikon, footer
- `app/page.tsx` -- produktgrid med kategorier, hero
- `app/products/[id]/page.tsx` -- produktdetaljsida
- `components/product-card.tsx` -- produktkort med bild, pris, lägg-till-knapp
- `components/cart-drawer.tsx` -- sidopanel/drawer med varukorgsinnehåll
- `components/site-header.tsx` -- header med sök, kategorier, varukorg
- `components/site-footer.tsx` -- footer

Alla med generiska platshållare: `[Produktnamn]`, `[Kategori]`, `[Pris]`, `[Butiksnamn]`.

### Registrering

1. `src/lib/gen/scaffolds/types.ts` -- lägg till `"ecommerce"` i `ScaffoldFamily`
2. `src/lib/gen/scaffolds/registry.ts` -- registrera `ecommerceManifest`
3. `src/lib/gen/scaffolds/matcher.ts` -- nya keywords:

```typescript
const ECOMMERCE_KEYWORDS = [
  "ecommerce", "e-commerce", "e-handel",
  "webshop", "webbshop", "shop", "butik",
  "store", "online store", "nätbutik",
  "product", "produkt", "produkter",
  "cart", "varukorg", "kundvagn",
  "checkout", "kassa", "betalning",
  "order", "beställning",
  "inventory", "lager",
  "catalog", "katalog",
  "storefront",
];
```

### Test-prompts

| # | Prompt | Förväntat |
|---|--------|-----------|
| 1 | "Webbshop för kläder med produktgrid och varukorg" | `ecommerce` |
| 2 | "Online store with product catalog and cart" | `ecommerce` |
| 3 | "E-handel för handgjorda smycken med kategorier, produktsidor och betalning" | `ecommerce` |

---

## C. Kodhygien

### C1. Refs i useEffect dependency arrays

**Var:** `src/app/builder/useBuilderPageController.ts` -- 10+ ställen

Följande refs i deps gör ingenting:
- rad 310, 311: `promptFetchDoneRef`, `promptFetchInFlightRef`
- rad 388, 411: generation-settings refs
- rad 518, 549: `hasLoadedInstructions`
- rad 564: `lastSyncedInstructionsRef`
- rad 446, 528: palette refs
- rad 638: `featureWarnedRef`
- rad 804: `lastActiveVersionIdRef`
- rad 866: `promptAssistContextKeyRef`

**Fix per ref:** Ta bort från dependency array. Lägg till ESLint-disable om linting klagar:
```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
```

### C2. Fallback fetch utan abort signal

**Var:**
- `src/lib/hooks/v0-chat/useCreateChat.ts` rad 351
- `src/lib/hooks/v0-chat/useSendMessage.ts` rad 174

**Fix:** Lägg till `signal: streamController.signal` i fetch-optionerna.

### C3. Språkstrategi

**Regel:** Användaren ser svenska. Loggar, debug, och intern kod på engelska.

Filer att korrigera:
- `src/lib/gen/preview.ts`: ändra "Image placeholder" -> "Bild saknas", behåll engelska i console.warn
- `src/lib/builder/promptAssist.ts`: behåll svenska rubriker (MÅL etc.) för användarens prompt, engelska i guidance

---

## Verifiering efter Del 3

- [ ] `npx tsc --noEmit` -- inga fel
- [ ] Kör `npx tsx scripts/generate-docs-embeddings.ts` -- embeddings genererade
- [ ] Generera med prompt "Webbshop för kläder" -- ecommerce-scaffold väljs
- [ ] Generera med prompt "recipe sharing app" -- KB hittar relevanta docs
- [ ] Kontrollera att inga `useEffect` warnings i konsolen
- [ ] Verifiera att avbryt mitt i generering + navigera bort ger inga React-varningar
