# 06-E: Embeddings for Semantic Template Search

**Reference:** [LLM/ROADMAP-next.txt](../LLM/ROADMAP-next.txt) — Section E  
**Roadmap:** `implementationer/README.md` — Steg 6 av 6  
**Status:** [ ] Ej påbörjad  
**Priority:** LOW–MEDIUM  
**Effort:** MEDIUM  
**Beroenden:** Bör köras EFTER 02-B (kan kombineras med Brave Search i E5)

---

## Översikt

Semantisk sökning av mallar med OpenAI embeddings. Användaren skriver t.ex. *"Jag vill ha en modern restaurangsida med bokningssystem"* och systemet returnerar de mest relevanta mallarna baserat på betydelse, inte bara nyckelord.

**Nuvarande system:** Mallar filtreras endast på kategori via `getTemplateCatalog({ intent })`.  
**Mål:** Embed-query → cosine similarity → topp 5 mest relevanta mallar.

---

## Arkitektur

### Build-time (uppdateras när templates ändras)
1. Läs alla mallar från `templates.json` (via template-data.ts)
2. För varje mall: kombinera **title + category + category description** till en text
3. Anropa OpenAI Embeddings API (`text-embedding-3-small`)
4. Spara vektorer i `src/lib/templates/template-embeddings.json`

### Runtime (vid användarsökning)
1. Embed användarens söksträng via OpenAI
2. Beräkna cosine similarity mot alla förberäknade mall-embeddings
3. Returnera top K mallar sorterade efter relevans

### Lagring
- **Val:** Lokal JSON-fil (enkel, räcker för ~290 mallar)
- Alternativ: Supabase pgvector eller Upstash Redis (för framtida skala)

---

## Steg-för-steg

### E1. Skript för att generera embeddings
- [ ] Skapa `scripts/generate-template-embeddings.ts`
- [ ] Läs mallar från `templates.json` (+ template-data.ts för kategoriinfo)
- [ ] För varje mall: bygg embedding-text = `title + " " + categoryTitle + " " + categoryDescription`  
  (V0_CATEGORIES ger kategori-metadata; fallback till slug om ingen beskrivning finns)
- [ ] Batchera API-anrop (t.ex. 100 mallar per batch för att undvika rate limits)
- [ ] Spara till `src/lib/templates/template-embeddings.json` med format:
  ```json
  {
    "_meta": { "model": "text-embedding-3-small", "dimensions": 1536 },
    "embeddings": [
      { "id": "0BACVQanX9P", "embedding": [0.1, -0.02, ...] },
      ...
    ]
  }
  ```
- [ ] Lägg till npm-script: `"templates:embeddings": "npx tsx scripts/generate-template-embeddings.ts"`
- [ ] **Regenerering:** Kör manuellt vid ändring i `templates.json` eller `template-categories.json`. Dokumentera i README / CI.

### E2. Sökmodul
- [ ] Skapa `src/lib/templates/template-search.ts`
- [ ] Export: `searchTemplates(query: string, topK?: number): Promise<TemplateCatalogItem[]>`
- [ ] Ladda förberäknade embeddings från `template-embeddings.json`
- [ ] Embed användarens `query` via OpenAI
- [ ] Beräkna cosine similarity mot alla mallar (inkludera mallar utan embedding med fallback till tom array → ingen match)
- [ ] Returnera top K resultat mappade till `TemplateCatalogItem` (använd `getTemplateCatalog` + lookup by id)

### E3. API-route
- [ ] Skapa `src/app/api/templates/search/route.ts`
- [ ] POST-handler, body: `{ query: string }`
- [ ] Anropa `searchTemplates(query, 5)` (eller topK från body)
- [ ] Returnera `{ results: TemplateCatalogItem[] }`
- [ ] Felhantering: tom query, API-fel

### E4. UI-uppdateringar
- [ ] **Mallar-sidan** (`src/app/templates/page.tsx`): Lägg till sökfält ovanför kategori-griden
- [ ] **Entry/startflöde:** Lägg till sökfält där mallar visas som alternativ (t.ex. i chat-area eller wizard)
- [ ] Visa sektion "AI-föreslagna mallar" när användaren söker – visa top 5 baserat på sökresultat
- [ ] Debounce sökning (300–500 ms) för att undvika för många API-anrop
- [ ] Loading- och tomtillstånd

### E5. (FRAMTID) Kombinera med Brave Search
- [ ] Se ROADMAP B5: Brave Search för externa mallar/inspiration
- [ ] Sök "restaurang hemsida mall" i Brave → få externa resultat
- [ ] Embed resultaten och ranka med samma embeddings-logik som interna mallar
- [ ] Visa både interna och externa förslag i samma UI

---

## Kostnadsuppskattning

| Post | Beräkning | Kostnad |
|------|-----------|---------|
| Initial embedding av ~290 mallar | ~300 tokens/mall × 290 ≈ 87k tokens | ~\$0.002 |
| Per sökning | ~20 tokens/query × 1 anrop | ~\$0.00004 |
| 1000 sökningar/månad | 20k tokens | ~\$0.04 |

**Sammanfattning:** Mycket låg kostnad (~\$0.01 för alla mallar, ~\$0.0001 per sökning).

---

## Filer att skapa/ändra

| Fil | Åtgärd |
|-----|--------|
| `scripts/generate-template-embeddings.ts` | Skapa |
| `src/lib/templates/template-embeddings.json` | Skapa (genereras av script) |
| `src/lib/templates/template-search.ts` | Skapa |
| `src/app/api/templates/search/route.ts` | Skapa |
| `src/app/templates/page.tsx` | Ändra – sökfält + AI-föreslagna mallar |
| `src/components/landing-v2/chat-area.tsx` eller liknande | Ändra – sökfält där mallar visas |
| `package.json` | Lägg till `templates:embeddings`-script |
| `README` eller `LLM/`-docs | Notera att embeddings ska regenereras vid template-ändringar |

---

## Testplan

1. **Unit:** `searchTemplates` med mock-embeddings – verifiera att cosine similarity och sortering stämmer.
2. **Integration:** API-route `POST /api/templates/search` med query → kontrollera att rätt mallar returneras.
3. **Manuell:** Sök "restaurang bokning", "portfolio", "SaaS landing" – verifiera att resultaten känns relevanta.
4. **Regenerering:** Ändra en mall i `templates.json`, kör `templates:embeddings`, verifiera att den nya mallen har embedding.

---

## Beroenden

- **openai** – redan installerad (`package.json`)
- Ingen extra npm-paket krävs; kan använda `openai.embeddings.create` eller AI SDK `embed()` om föredraget

---

## OBS

- **Regenerering:** `template-embeddings.json` måste uppdateras när `templates.json` eller `template-categories.json` ändras. Antingen:
  - Lägg till i `templates:refresh`-scriptet, eller
  - Kör manuellt `npm run templates:embeddings` vid template-ändringar, eller
  - Lägg till pre-commit/CI-steg som varnar om mismatch
- **Beskrivning:** Mallar har ingen separat `description` – använd `title` + kategori + kategori-beskrivning (V0_CATEGORIES) som embedding-text.
- **Dimensions:** `text-embedding-3-small` ger 1536 dimensioner – sparar dessa i JSON.
