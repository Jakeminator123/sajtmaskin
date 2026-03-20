# Exempel: Dossier-referens (AI-inspiration vid generering)

## Vad det är

En dossier är ett **kurerat referenspaket** från ett externt projekt. Den
innehåller inte kod som används direkt — istället ger den AI-modellen
kodexempel och kvalitetssignaler som inspiration vid generering.

## Aktuellt exempel: `ai-chatbot` dossier (kvalitetspoäng 94)

```
scaffold-pipeline/dossiers/ai-chatbot/
├── manifest.json       ← metadata, poäng, styrkor, rekommenderade scaffold-familjer
├── summary.md          ← kort mänsklig sammanfattning
└── selected_files/     ← handplockade kodfiler från det externa repot
    ├── readme-md.md
    ├── package-json.md
    ├── app-layout-tsx.md
    ├── env-example.md
    └── components-ui-sidebar-tsx.md
```

### manifest.json (förkortad)

```json
{
  "id": "ai-chatbot",
  "title": "Chatbot",
  "categorySlug": "ai",
  "qualityScore": 94,
  "verdict": "valid",
  "repo": { "url": "https://github.com/vercel/chatbot", "hasNext": true },
  "stackTags": ["Next.js", "Tailwind", "Postgres", "Auth", "Vercel Blob"],
  "strengths": [
    "verified Next.js codebase",
    "App Router structure",
    "auth flow reference",
    "dashboard shell patterns"
  ],
  "recommendedScaffoldFamilies": ["app-shell", "auth-pages", "dashboard"]
}
```

## Hur det används vid runtime

1. Användare skriver: "Bygg en chattapplikation med inloggning"
2. Scaffold-matchning väljer `app-shell` (grund)
3. `rankTemplateReferences()` söker embeddings mot alla 53 dossiers
4. `ai-chatbot` rankas högt (hög kvalitetspoäng + scaffold-fit)
5. Systemprompt får:
   - Dossier-summary
   - Kodexempel från `app-layout-tsx.md` och `components-ui-sidebar-tsx.md`
   - Quality checklist-items

**AI-modellen ser aldrig dossiern direkt — den ser utvalda snippets som
inspiration i systemprompt.**

## Alla 53 dossiers per kategori

| Kategori | Antal | Relevanta för svenska slutanvändare |
|---|---|---|
| Portfolio | 3 | Hög |
| Authentication | 2 | Hög (inlogg-mönster) |
| Ecommerce | 2 | Hög |
| SaaS | 4 | Medel-Hög |
| Blog | 2 | Hög |
| AI | 3 | Medel (för chatbots, inte hemsidor) |
| Admin Dashboard | 1 | Medel |
| CMS | 2 | Medel |
| Documentation | 3 | Låg-Medel |
| CDN/Edge/Cron | 15 | Låg (developer-verktyg) |
| Övriga | 16 | Låg |

## Hur utöka

**Alternativ 1: Skrapa och filtrera (befintlig pipeline)**
```bash
npm run scaffold-pipeline:full   # Skrapar vercel.com, bygger dossiers
```

**Alternativ 2: Manuellt kurerat paket**
Skapa en mapp i `scaffold-pipeline/dossiers/<id>/` med:
- `manifest.json` (metadata + styrkor)
- `summary.md` (beskrivning)
- `selected_files/` (kodexempel)

**Alternativ 3: Figma som referens**
Figma-filer kan inte bli dossiers direkt (de är visuella, inte kod). Men
Sajtmaskin stödjer redan Figma-referenser via `designReferences` i prompten.
En Figma-referens ger AI:n visuell inspiration för layout, spacing, hierarki.

Det är en **parallell kanal** till dossiers:
- Dossier = kod-referens (struktur, komponenter, mönster)
- Figma = visuell referens (layout, typografi, färg, avstånd)

Bäst resultat: kombinera scaffold + dossier-referens + Figma-referens.
