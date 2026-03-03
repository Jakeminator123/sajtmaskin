# Plan 5: Template Search UI med Embeddings

## Mål
Visa AI-drivna mallförslag i template-galleriet baserat på användarens beskrivning.
Backend (embeddings + sökning) finns redan – detta handlar om UI.

## Bakgrund
- `/api/templates/search` (POST, body: `{ query, topK? }`) – returnerar rankade templates
- `/api/templates` (GET, query: `intent`, `source`) – returnerar alla templates per kategori
- `src/lib/templates/template-search.ts` – embeddings + cosine similarity
- `src/lib/templates/template-catalog.ts` – statisk katalog
- `scripts/generate-template-embeddings.ts` – genererar embeddings offline
- Template-data: `template-data.ts` + `templates.json`

Befintligt template-UI:
- `ChatInterface.tsx` har `onStartFromTemplate` callback
- `UnifiedElementPicker.tsx` har troligen en "Mallar"-flik

## Steg

### S1. Inventera befintligt template-UI
**Filer att läsa:**
- `src/components/builder/UnifiedElementPicker.tsx`
- `src/components/builder/ChatInterface.tsx` (template-relaterade delar)
- Eventuella template-gallery/list-komponenter

Identifiera:
- Var visas templates idag?
- Hur väljer användaren en mall?
- Finns det en sökruta?

### S2. Lägg till sökning i template-galleriet
I den komponent som visar templates (troligen UnifiedElementPicker eller en sub-komponent):

- Lägg till sökfält överst: "Beskriv vad du vill bygga..."
- Vid input (debounced 500ms): POST till `/api/templates/search` med query
- Visa resultat med matchningsgrad (cosine similarity score)
- Sortera: AI-matchade först, sedan kategoriserade

### S3. Auto-föreslå baserat på wizard-data
Om användaren redan fyllt i wizard (bransch, företagsnamn, ton):
- Automatiskt söka med `${industry} ${companyName} hemsida` som query
- Visa "Föreslagna mallar för din bransch" ovanför manuell sökning
- Skicka wizard-data som kontext (via query-param eller body)

### S4. Template-kort med matchningsgrad
Designa template-kortet:
- Thumbnail (om tillgängligt)
- Namn + beskrivning
- Matchningsgrad som badge: "95% match", "82% match"
- Kategori-tag
- "Använd mall"-knapp

### S5. Integrera med builder-flödet
När användaren klickar "Använd mall":
- Anropa `onStartFromTemplate(template)` (redan finns i ChatInterface)
- Fyll prompt med template-kontext
- Visa preview

### S6. Empty state och loading
- Ingen sökning: visa populära/rekommenderade
- Under laddning: skeleton cards
- Inga resultat: "Inga mallar hittades. Prova att beskriva mer specifikt."
- Fel: fallback till kategoriserad vy

## Filer som ändras
| Fil | Ändring |
|-----|---------|
| `src/components/builder/UnifiedElementPicker.tsx` | Sökfält + AI-förslag |
| Ny eller befintlig template-gallery komponent | Sökresultat + matchningsgrad |
| Template-kort komponent | Matchningsgrad-badge |
| ChatInterface.tsx | Propagera wizard-data för auto-förslag |

## Acceptanskriterier
- [ ] Sökfält visas i template-galleriet
- [ ] Sökning mot `/api/templates/search` fungerar
- [ ] Resultat sorteras efter relevans
- [ ] Matchningsgrad visas på template-kort
- [ ] Auto-förslag baserat på wizard-data
- [ ] Loading/empty/error states hanteras
- [ ] "Använd mall" kopplar till builder-flödet
- [ ] Bygger utan TypeScript-fel
