# Exempel: Template Gallery Item (användarens browsing-yta)

## Vad det är

Ett template gallery item är det användaren **ser och klickar på** i
kategori-vyn på startsidan. Det är en UI-yta — inte startkod och inte
AI-referens. Det påverkar inte genereringskvaliteten direkt, utan styr
vilken prompt och kontext som skickas till buildern.

## Aktuellt exempel: ett gallery item

```typescript
// src/lib/templates/template-data.ts
export interface Template {
  id: string;         // "chat-interface-01"
  title: string;      // "Modern Chat Interface"
  slug: string;       // "chat-interface-01"
  viewUrl: string;    // "https://v0.dev/t/..."
  editUrl: string;    // "https://v0.dev/chat/..."
  previewImageUrl: string;  // Förhandsbild i galleriet
  category: string;   // "ai"
}
```

### Kategorier i galleriet

```typescript
// Kategorierna som visas för användaren i Sajtmaskin:
"ai"                // AI-relaterade mallar
"animations"        // Animationer och effekter
"components"        // UI-komponenter
"login-and-sign-up" // Inloggning och registrering
"blog-and-portfolio" // Blogg och portfolio
"design-systems"    // Designsystem
"layouts"           // Layoutmallar
"website-templates" // Hemsidemallar
"apps-and-games"    // Appar och spel
```

## Hur det används

1. Användaren klickar "Kategori" på startsidan
2. Galleriet visas med förhandsbilder och titlar
3. Användaren väljer en mall → skickas till `/builder?templateId=...`
4. Buildern laddar mallen som utgångspunkt

**Viktigt:** Gallery items använder v0-mallar (förhandsbilder + edit-URLs).
De är separata från scaffolds och dossiers. Ett gallery item kan trigga
scaffold-matchning indirekt via prompten som skickas.

## Skillnaden mot scaffold och dossier

| Egenskap | Template Gallery | Scaffold | Dossier |
|---|---|---|---|
| **Synlig för användaren** | Ja (bild + titel) | Nej | Nej |
| **Ger startkod** | Nej (via v0 edit-URL) | Ja (filer) | Nej |
| **Ger AI referens** | Nej | Nej | Ja (snippets) |
| **Källa** | v0.dev gallery | Handgjorda | Vercel templates |
| **Antal** | ~100+ | 13 | 53 |
| **Påverkar generation** | Indirekt (prompt) | Direkt (grund) | Direkt (inspiration) |

## Hur utöka

**Lägg till fler gallery items:**
Redigera `src/lib/templates/templates.json` med nya poster.
Varje post behöver: id, title, slug, view_url, edit_url, preview_image_url.

**Skapa egna förhandsbilder:**
Generera via Sajtmaskin själv → ta screenshot → ladda upp till Vercel Blob.

## De "irrelevanta" repos — vad de egentligen kan ge

Repos som `Slack Agent Template`, `Express on Bun`, och `Firewall Rules`
filtrerades bort som `non_next_template` (inte Next.js/React). Men de kan
ändå ha värde — inte som scaffolds eller dossiers, utan som **funktionella
implementation-mönster**:

| Borfiltrerat repo | Implementationsvärde |
|---|---|
| Slack Agent Template | Webhook-mönster, OAuth-flöde, bot-struktur |
| Coinbase Onchain | Wallet-connect, Web3-patterns |
| NestJS on Vercel | API-routing-mönster, serverless backend |
| Express on Bun / Hono | Middleware-patterns, routing |
| Firewall Rules | Security headers, rate limiting |

Dessa är inte "sidor" och ska inte bli scaffolds. Men de *kan* bli en
separat referenstyp: **implementation patterns** — kodsnuttar som AI:n
kan använda när en prompt nämner "webhook", "API", "betalning" etc.

Det är ett framtida utökningsområde, inte något som behövs nu.

## Figma som referens

Sajtmaskin stödjer redan Figma-filer som `designReferences`:

```typescript
// I orchestrate.ts
designReferences: DesignReferenceAsset[]  // Kan vara Figma-URL:er
```

En Figma-referens ger AI:n visuell guidance för:
- Hierarki och layout
- Typografi och färgval
- Spacing och proportioner
- Kompositionsidéer

**Bästa kombinationen för hög kvalitet:**
```
Scaffold        → struktur och startkod
+ Dossier       → kod-inspiration från liknande projekt
+ Figma         → visuell inspiration för design
+ Användarens prompt → specifika krav och innehåll
= Bästa möjliga generering
```

Figma ersätter inte scaffolds eller dossiers — det är en parallell kanal
för visuell input som redan fungerar i systemet.
