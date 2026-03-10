# Nästa steg — Egen Motor

> Senast uppdaterad: 2026-03-10
> Branch: `egen-motor-v2`
> Dokumentation: `LLM/egen-motor/README.md`

## Status idag

Egen kodgenereringsmotor med GPT 5.2. ~85-90% av v0:s kapabilitet.
Största kvarvarande gap: preview-fidelitet och avsaknad av starter-scaffolds.

## Prioriterade förbättringar

## Terminologi och arkitektur

Det finns fyra olika saker som lätt blandas ihop. De ska hållas isär:

| Begrepp | Vad det är | Var det lever | Rekommenderad term |
|---------|------------|---------------|--------------------|
| **Nuvarande templates i sajtmaskin** | Katalogobjekt/inspirationsobjekt med metadata, preview-bilder och kategorier. De är inte lokala körbara kodbaser. | `src/lib/templates/*` | `template-katalog` eller `extern template-katalog` |
| **Hemsidemall / scaffold** | Intern startkod som motorn utgår från och modifierar. Ska vara ett minimalt men körbart Next.js-projekt/sektionpaket. | `src/lib/gen/scaffolds/*` (framtida) | `hemsidemall`, `startmall`, `scaffold` |
| **Vercel Template** | Publikt template/starter-repo från Vercels katalog. Bra som referens eller råmaterial, inte som live runtime-input. | [vercel.com/templates](https://vercel.com/templates) | `Vercel template` |
| **Vercel for Platforms** | Hosting-/deploy-arkitektur för att driva en plattform som skapar och hostar användarsajter. Inte samma sak som en kodmall. | Vercel SDK / Platforms | `multi-tenant` eller `multi-project` |

### Vår rekommenderade modell

1. Behåll nuvarande `src/lib/templates/*` som katalog-/metadata-lager.
2. Bygg ett nytt lager med interna hemsidemallar/scaffolds.
3. Använd Vercel templates som referens när vi bygger dessa scaffolds.
4. Använd Vercel for Platforms för deploy-/hostingmodellen, inte för kodgenereringen i sig.

### 1. Starter-scaffolds / hemsidemallar (HÖGST PRIORITET)

**Problem:** Varje generation startar från noll. LLM:en måste generera hela sajten — nav, hero, features, footer — varje gång. Det ger inkonsekvent kvalitet och fler felkällor.

**Lösning:** Skapa 5-8 lokala starter-scaffolds som LLM:en redigerar istället för att generera from scratch.

Terminologi:
- `hemsidemall` / `startmall` = användarvänligt ord
- `starter scaffold` = internt tekniskt ord
- `Vercel template` = extern publik mall från vercel.com/templates

Det är viktigt att hålla isär dessa, eftersom sajtmaskin redan använder ordet `templates` för en annan kategori-/UI-funktion.

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

### Hur Vercel Templates ska användas

Använd dem inte som live-källa under varje generation.

Fel sätt:
1. användaren promptar
2. sajtmaskin hämtar ett helt externt repo live
3. skickar repot till modellen

Rätt sätt:
1. välj ut 6-10 relevanta Vercel templates i förväg
2. analysera deras struktur, sektioner, dependencies och UI-mönster
3. destillera dem till egna interna scaffolds som följer vår stack
4. låt modellen modifiera scaffolden istället för att bygga från noll

### Plattformsstrategi: Multi-tenant vs Multi-project

För sajtmaskin bör vi skilja på **byggare** och **hostingmodell**:

| Modell | När den passar | Relevans för sajtmaskin |
|--------|----------------|-------------------------|
| **Multi-tenant** | Alla kunder delar samma kodbas men med olika data/domäner | Bra för själva sajtmaskin-appen/buildern |
| **Multi-project** | Varje användare får egen app/deployment med egen kod | Bra för genererade användarsajter / demo-URLs / deploys |

Rekommendation:
- **Sajtmaskin själv** = multi-tenant app (en kodbas, många användare/projekt)
- **Genererade användarsajter** = multi-project / per-project deployer

Detta ligger i linje med Vercels egna rekommendationer för AI coding platforms och template-based platforms, där multi-project passar bäst när användare får unik genererad kod och egna deployment-ytor [(Vercel for Platforms)](https://vercel.com/platforms), [(Multi-Project concepts)](https://vercel.com/platforms/docs/multi-project-platforms/concepts), medan multi-tenant passar när samma app körs för många kunder [(Multi-Tenant concepts)](https://vercel.com/platforms/docs/multi-tenant-platforms/concepts).

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

### Validerade externa referenser

| Referens | Beslut | Varför |
|---------|--------|--------|
| `vercel/vercel/examples/nextjs` | Behåll som `base-nextjs` | Minimal, ren App Router-bas |
| `vercel/commerce` | Behåll som strukturreferens | Stark e-commerce-struktur men för stor/specifik som direkt scaffold |
| `medusajs/nextjs-starter-medusa` | Sekundär referens | Kräver extern Medusa-backend, för tung för första vågen |
| `Blazity/next-enterprise` | Kvalitetsreferens | Bra boilerplate-/infra-lärdomar, men inte en hemsidemall |
| `vercel/platforms` | Plattformsreferens | Relevant för sajtmaskin-appen, inte för användarsajter |

Detaljerad bedömning: `LLM/egen-motor/scaffold-candidates.md`

## Hur detta hjälper byggaren konkret

När hemsidemallar/scaffolds finns blir flödet:

1. användaren skriver prompt i buildern
2. prompten klassificeras mot rätt hemsidemall
3. systemprompten får scaffoldens kod som utgångspunkt
4. GPT 5.2 modifierar scaffolden i stället för att generera allt från scratch
5. samma post-processing-loop (suspense, autofix, validateAndFix) körs ovanpå
6. resultatet blir mer robust, mer konsekvent och mer visuellt polerat

Detta bör ge större kvalitetslyft än ytterligare prompt-tuning ensam, eftersom:
- navigation, footer och layout redan finns
- dependencies är redan korrekta
- shadcn-importer är redan rätt
- sektionstrukturen är redan beprövad
