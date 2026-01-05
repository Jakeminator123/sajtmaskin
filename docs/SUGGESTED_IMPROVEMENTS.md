# Föreslagna förbättringar för Sajtmaskin

## 🟢 Klart att implementera (inga nya beroenden)

### 1. Design System Presets
Låt användaren välja färdiga designsystem för sina hemsidor:
- **Modern Minimal** - Mycket whitespace, sans-serif, subtila animationer
- **Bold & Vibrant** - Starka färger, stora typsnitt, dramatiska effekter  
- **Corporate Professional** - Konservativt, trovärdigt, strukturerat
- **Playful Creative** - Rundade hörn, lekfulla animationer, gradient

```typescript
// Exempel: lib/design-presets.ts
export const DESIGN_PRESETS = {
  minimal: {
    colors: { primary: "#0f172a", accent: "#06b6d4" },
    typography: "Inter, system-ui",
    borderRadius: "0.5rem",
    style: "clean and minimal with lots of whitespace"
  },
  // ...
};
```

### 2. Förbättrad Code Crawler med Komponentbibliotek
Spara vanliga komponenter som användare skapar och återanvänd dem:
- Header-varianter
- Footer-templates  
- Hero-sektioner
- Kontaktformulär

### 3. Smart Clarify med Visuella Alternativ
Istället för textfrågor, visa screenshots/previews av alternativen:
- "Menade du denna header?" [bild] eller "denna?" [bild]

### 4. Versionsjämförelse
Låt användare jämföra olika versioner av sin hemsida side-by-side.

---

## 🟡 Kräver nya paket (valfritt)

### 5. AI DevTools för Debugging
```bash
npm install @ai-sdk/devtools
```
- Se exakt vad som skickas till AI
- Debugga token-användning
- Optimera prompts

### 6. Figma/Design Import (avancerat)
```bash
npm install @figma/rest-api-spec
```
- Importera designs från Figma
- Konvertera till kod automatiskt

### 7. Lighthouse Integration för Performance
```bash
npm install lighthouse chrome-launcher
```
- Automatisk performance-audit av genererade sidor
- Föreslå förbättringar baserat på Core Web Vitals

### 8. Internationalisering (i18n)
```bash
npm install next-intl
```
- Generera hemsidor på flera språk
- Automatisk översättning via AI

---

## 🔵 Redan i ditt projekt men kan förbättras

### 9. Bildgenerering (DALL-E/gpt-image-1)
**Status**: ✅ Implementerat
**Förbättring**: 
- Lägg till bildstil-presets (fotorealistisk, illustration, abstrakt)
- Automatisk bildoptimering för web

### 10. Webbsökning för Inspiration
**Status**: ✅ Implementerat
**Förbättring**:
- Sök efter liknande hemsidor för inspiration
- Extrahera färgscheman från konkurrenter

### 11. Voice Input
**Status**: ✅ Implementerat (transcribe API)
**Förbättring**:
- Realtids-transkription medan användaren pratar
- Stöd för flera språk

---

## 📊 Prioriterad Roadmap

| Prioritet | Feature | Komplexitet | Värde |
|-----------|---------|-------------|-------|
| 1 | Design System Presets | Låg | Högt |
| 2 | Versionsjämförelse | Medium | Högt |
| 3 | Komponentbibliotek | Medium | Högt |
| 4 | AI DevTools | Låg | Medium |
| 5 | Lighthouse Integration | Medium | Medium |
| 6 | Visuell Smart Clarify | Hög | Medium |
| 7 | Figma Import | Hög | Medium |
| 8 | i18n | Medium | Låg |

---

## 🛠️ Tekniska skulder att fixa

1. **MCP Server** - `services/mpc/` finns men verkar inte integrerad fullt ut
2. **Template Cache** - Kan optimeras för snabbare laddning
3. **Error Handling** - Mer användarvänliga felmeddelanden vid AI-fel

---

## Nästa steg

1. Kör `npm install` i `app/`-mappen om du inte redan gjort det
2. Starta dev-servern: `npm run dev`
3. Testa AI Features-panelen i builder-vyn
4. Välj vilka förbättringar du vill implementera härnäst!

