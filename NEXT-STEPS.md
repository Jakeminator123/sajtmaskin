# Nästa steg — Egen Motor

> Senast uppdaterad: 2026-03-10
> Branch: `egen-motor-v2`
> Dokumentation: `LLM/egen-motor/README.md`

## Status idag

Egen kodgenereringsmotor med GPT 5.2. ~85-90% av v0:s kapabilitet.
Största kvarvarande gap: preview-fidelitet och avsaknad av starter-scaffolds.

## Prioriterade förbättringar

### 1. Starter-scaffolds (HÖGST PRIORITET)

**Problem:** Varje generation startar från noll. LLM:en måste generera hela sajten — nav, hero, features, footer — varje gång. Det ger inkonsekvent kvalitet och fler felkällor.

**Lösning:** Skapa 5-8 lokala starter-scaffolds som LLM:en redigerar istället för att generera from scratch.

**Scaffolds att skapa (i `src/lib/gen/scaffolds/`):**

| Scaffold | Beskrivning | Inspiration |
|----------|-------------|-------------|
| `landing-page` | Hero + features + pricing + testimonials + CTA + footer | [vercel.com/templates](https://vercel.com/templates) "Website Templates" |
| `dashboard` | Sidebar + topbar + stats-cards + data-table | Vercel "Admin Dashboard" templates |
| `blog` | Post-lista + single-post + sidebar + navigation | Vercel "Blog" templates |
| `portfolio` | Gallery-grid + about + skills + contact | Vercel "Portfolio" templates |
| `e-commerce` | Product-grid + filter + cart + product-detail | Vercel "Ecommerce" templates |
| `saas-app` | Dashboard + settings + billing + onboarding | Vercel "SaaS" templates |
| `auth-pages` | Login + register + forgot-password + layout | Vercel "Login and Sign Up" templates |
| `docs-site` | Sidebar-nav + markdown content + search | Vercel "Documentation" templates |

**Hur det fungerar:**
1. Varje scaffold är 3-5 filer med fungerande Next.js-kod (shadcn/ui, Tailwind, Lucide)
2. Vid generation: matcha prompt mot scaffold via keywords
3. Skicka scaffold-filerna som kontext till LLM:en: "Modify this starter to match the user's request"
4. LLM:en ändrar ~30-50% istället för att generera 100%

**Fördelar:**
- Garanterat fungerande bas (nav + footer finns alltid)
- Snabbare generation (mindre att generera)
- Konsekvent kvalitet
- Färre kompileringsfel

**Vercel Templates som referens:**
- https://vercel.com/templates — kategorier: AI, Starter, Ecommerce, SaaS, Blog, Portfolio, CMS, Admin Dashboard
- Studera deras struktur, inte kopiera kod — skapa egna minimala scaffolds

### 2. Preview-sandbox (MEDEL PRIORITET)

**Problem:** Preview renderar med stubs (70% av riktiga sajten). v0 kör riktigt Next.js i en sandbox.

**Möjliga lösningar:**
- **A) Cloudflare Workers + Deno**: Kör genererad kod i isolerad runtime
- **B) WebContainers (StackBlitz)**: Open source in-browser Node.js runtime
- **C) Förbättra nuvarande stubs**: Billigare, lägre effort, ~80% fidelitet

Rekommendation: Börja med C (redan påbörjat med stylade stubs), utvärdera B som nästa steg.

### 3. Riktiga Lucide-ikoner i preview (LÅG INSATS, HÖG EFFEKT)

**Problem:** Ikoner renderas som tomma SVG-rektanglar i preview.

**Lösning:** Bunta de ~50 vanligaste ikonernas SVG-paths i preview-preluden. Lucide-ikonerna är bara `<path d="...">` — det är ~2KB per ikon, 100KB totalt för 50 ikoner. Alternativ: ladda från lucide.dev CDN.

### 4. Progressiv preview-rendering (MEDEL INSATS)

**Problem:** Användaren ser tom skärm i 20-60 sek medan LLM:en genererar.

**Lösning:** Detektera kompletta fil-block i SSE-strömmen, rendera partiell preview per fil.

Se byggplan: `LLM/egen-motor/byggplaner/12-progressiv-preview.md`

### 5. Embedding-baserad docs-sökning (LÅG PRIORITET)

**Problem:** Kunskapsbasen använder keyword-matchning.

**Lösning:** Embed 50 snippets med `text-embedding-3-small`, spara som JSON, cosine similarity vid sökning.

Se byggplan: `LLM/egen-motor/byggplaner/09-embedding-sokning.md`

## Vad vi lärt oss av v0:s arkitektur

Från analysen i `LLM/egen-motor/analys/`:

1. **v0:s styrka är post-processing, inte prompten.** De fixar ~10% av alla generationer automatiskt via streaming-regler, autofix och retry. Vi har nu liknande (12 regler + 7-stegs autofix + LLM fixer).

2. **Systempromptens kvalitet avgör output-kvaliteten.** Specifika CSS-klasser, layout-mönster och designregler i prompten är viktigare än infrastruktur. Vår prompt är nu ~17K tokens med detaljerade designinstruktioner.

3. **Scaffolds > from-scratch generation.** v0 har troligen interna templates/scaffolds som startpunkt. Det är det enskilt viktigaste vi saknar.

4. **Preview behöver inte vara perfekt.** v0:s preview är bättre, men användare accepterar 80% fidelitet om nedladdningen fungerar. Vår nedladdning ger nu ett komplett Next.js-projekt.

## Vercel Templates som scaffold-källa

Vercels template-galleri (https://vercel.com/templates) har hundratals kategoriserade templates. Vi bör INTE kopiera deras kod, men vi kan:

1. **Studera strukturen** — vilka filer, vilka sektioner, vilken layout
2. **Skapa minimala egna versioner** — 3-5 filer per scaffold med shadcn/ui
3. **Matcha mot kategorier** — landning, dashboard, blog, portfolio, e-commerce, SaaS
4. **Pre-testa** varje scaffold — måste kompilera och se bra ut lokalt

Varje scaffold bör vara ~200-400 rader total kod (alla filer), med:
- `app/page.tsx` — huvudsida med sektioner
- `components/` — 2-3 återanvändbara komponenter
- Fungerande navigation + footer
- Placeholder-bilder med `/placeholder.svg?...`
- Realistiskt innehåll (inte lorem ipsum)
