# Motor-status: Egen kodgenereringsmotor

> Senast uppdaterad: 2026-03-10
> Syfte: Övergripande status, kända problem och nästa steg

## Arkitektur

```
Användarens prompt
       │
       ▼
┌──────────────────────────┐
│  PRE-GENERATION          │
│  - Prompt-orkestrering   │
│  - URL-komprimering      │
│  - Dynamisk kontext (KB) │
│  - File context (uppf.)  │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  GENERATION              │
│  GPT 5.2 via AI SDK      │
│  (v0 = opt-in fallback)  │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  POST-GENERATION         │
│  - 12 suspense-regler    │
│  - 7-stegs autofix       │
│  - esbuild-validering    │
│  - LLM fixer (4.1-mini)  │
│  - Säkerhetscheckar      │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  PREVIEW & DELIVERY      │
│  - Preview-render (iframe)│
│  - Nedladdning (zip)     │
│  - Deploy (Vercel)       │
└──────────────────────────┘
```

## Kända problem (att lösa)

### P1: Nedladdning saknar shadcn/ui-komponenter (KRITISKT)

**Problem:** Systemprompt instruerar LLM:en "shadcn/ui är pre-installerat, generera dem inte". Men nedladdningszipfilen innehåller inte `components/ui/*`. Resultat: `npm run build` misslyckas med "Module not found: Can't resolve '@/components/ui/input'" etc.

**Lösning:** `project-scaffold.ts` måste inkludera de shadcn/ui-komponenter som genererad kod faktiskt importerar. Två alternativ:
- A) Statiskt: Bunta alla ~50 shadcn-komponenter i scaffolden (stor men garanterat komplett)
- B) Dynamiskt: Scanna genererade filer efter `@/components/ui/`-imports, inkludera bara de som används

**Status:** Under implementering

### P2: Preview visar "ful" version (MEDEL)

**Problem:** Preview-renderaren använder:
- Nakna HTML-stubs för shadcn-komponenter (Button = `<button>`, Card = `<div>`)
- Tomma `<span>` för Lucide-ikoner
- Tailwind CDN utan komplett shadcn-konfiguration

**Resultat:** Preview ser ut som ~40% av den riktiga sajten.

**Lösning:** Förbättra stubs med inline-styling som approximerar shadcn:s utseende. Rendera Lucide-ikoner som inline-SVG.

### P3: Ingen template/scaffold-matching (FÖRBÄTTRING)

**Problem:** Varje generation startar från noll. LLM:en genererar hela sajten from scratch, vilket ger:
- Inkonsekvent kvalitet
- Mer kod = fler felkällor
- Saknade grundelement (nav, footer ibland)

**Lösning:** Skapa 5-8 lokala starter-scaffolds (landing-page, dashboard, blog, etc.). Matcha användarens prompt mot rätt scaffold. Skicka scaffolden som kontext så LLM:en redigerar istället för att generera.

Scaffolds:
1. `landing-page` — Hero + features + pricing + testimonials + footer
2. `dashboard` — Sidebar + topbar + stats-cards + data-table
3. `blog` — Post-lista + single-post + sidebar
4. `portfolio` — Gallery + about + contact
5. `e-commerce` — Product-grid + filter + cart
6. `auth-app` — Login/register + protected layout
7. `saas-app` — Dashboard + settings + billing

## Implementerat (fungerande)

| Modul | Filer | Status |
|-------|-------|--------|
| Kodgenerering (GPT 5.2) | `src/lib/gen/engine.ts` | Fungerar |
| Systemprompt (~17K tokens) | `src/lib/gen/system-prompt.ts` | Fungerar |
| 12 suspense-regler | `src/lib/gen/suspense/rules/*` | Fungerar |
| 7-stegs autofix pipeline | `src/lib/gen/autofix/*` | Fungerar |
| esbuild syntax-validering | `src/lib/gen/autofix/syntax-validator.ts` | Fungerar |
| LLM fixer (GPT 4.1 mini) | `src/lib/gen/autofix/llm-fixer.ts` | Fungerar |
| validateAndFix i routes | `src/lib/gen/autofix/validate-and-fix.ts` | Integrerat |
| Säkerhetsmodul | `src/lib/gen/security/*` | Fungerar |
| 50 docs-snippets + KB | `src/lib/gen/data/docs-snippets.ts` | Fungerar |
| 792 Lucide-ikoner | `src/lib/gen/data/lucide-icons.ts` | Fungerar |
| File context + merge | `src/lib/gen/context/*` | Integrerat |
| Preview-render | `src/lib/gen/preview.ts` | Fungerar (med begränsningar) |
| Projekt-scaffold | `src/lib/gen/project-scaffold.ts` | Ny — saknar shadcn-filer |
| Eval-ramverk | `src/lib/gen/eval/*` | Fungerar (ej körd) |

## Byggplaner och dokumentation

- `EGEN_MOTOR/` — Ursprunglig analys (v0 vs sajtmaskin, mars 2026)
- `EGEN_MOTOR_V2/` — Byggplaner 01-13 + valideringslogg
