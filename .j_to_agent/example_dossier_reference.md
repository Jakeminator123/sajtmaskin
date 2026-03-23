# Exempel: Dossier-referens (AI-inspiration vid generering)

## Vad det är

En dossier är ett **kurerat referenspaket** från ett externt projekt. Den
innehåller inte kod som används direkt — istället ger den AI-modellen
kodexempel och kvalitetssignaler som inspiration vid generering.

## Aktuellt exempel: `ai-chatbot` dossier (kvalitetspoäng 94)

```
research/dossiers/ai-chatbot/
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
3. Mallbibliotek / template-referenser (`rankTemplateReferences()` m.m.) kan söka mot det kurerade `template-library`-artefaktet; dossiers matar **research**-artefakter (`scaffold-research.generated.json`), inte direkt filsystemläsning per request.
4. Högt rankade dossier-rader i research kan förstärka promptkontext (checklist, sammanfattning).
5. Systemprompt får:
   - Dossier-summary (via genererad research-data)
   - Ev. kodexempel om sådana finns i dossier-paket som byggts in i pipelinen
   - Quality checklist-items

**AI-modellen ser aldrig råa dossier-mappar direkt — den ser material som
formats in via byggda artefakter och promptlager.**

## Dossiers per kategori (exempel — räkna i `research/dossiers/`)

Historiska totalsiffror (t.ex. 53) gäller äldre pipeline; dagens repo kan ha färre
kurerade dossiers. Använd kataloglistning eller egen inventering.

## Hur utöka

**Alternativ 1: Rå discovery → kurerad dossier**
Lägg skrapad rådata under `research/raw-discovery/`, granska, flytta till
`research/dossiers/<id>/`, kör `npm run scaffolds:build`.

**Alternativ 2: Manuellt kurerat paket**
Skapa en mapp i `research/dossiers/<id>/` med:
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
