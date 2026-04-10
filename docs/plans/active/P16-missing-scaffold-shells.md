# P16: Nya scaffold-shells (docs-knowledge, form-workflow)

## Status

**Ej påbörjad.**

## Problem

Det finns 10 scaffolds idag:

| Scaffold | Grundspår |
|----------|----------|
| `base-nextjs` | generisk |
| `landing-page` | marketing/content |
| `saas-landing` | marketing/content (SaaS) |
| `portfolio` | marketing/content (portfolio) |
| `blog` | editorial |
| `content-site` | editorial |
| `app-shell` | app |
| `dashboard` | app |
| `auth-pages` | auth |
| `ecommerce` | commerce |

Två tydliga promptkategorier faller igenom och landar i `landing-page` eller `base-nextjs` som default:

1. **Dokumentation / knowledge base** — prompter som "hjälpcenter", "API-docs", "dokumentationssida", "changelog", "knowledge base"
2. **Formulärtunga flöden** — prompter som "bokningssystem", "ansökningsformulär", "multi-step survey", "kalkylator", "quiz"

Dessa har distinkt filstruktur, routing och komponentbehov som nuvarande scaffolds inte täcker.

## Mål

Lägg till två nya scaffold-familjer som ger bättre startpunkt för dessa promptkategorier.

## 1. `docs-knowledge`

### Syfte

Dokumentation, knowledge base, help center, changelog, API-referens.

### Rutter

```
app/
  layout.tsx           # sidenav + breadcrumb layout
  page.tsx             # docs landing / overview
  docs/
    layout.tsx         # docs-specifik sidebar/nav
    page.tsx           # docs index
    [slug]/
      page.tsx         # enskild docs-sida
  changelog/
    page.tsx           # changelog / release notes
```

### shadcn-komponenter (i manifest-filer)

NavigationMenu, Collapsible, CollapsibleContent, CollapsibleTrigger, Accordion, AccordionItem, AccordionTrigger, AccordionContent, Table, Tabs, TabsList, TabsTrigger, TabsContent, Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator, ScrollArea, Separator, Badge, Input (sök)

### Manifestmetadata

```typescript
{
  id: "docs-knowledge-001",
  family: "docs-knowledge",
  label: "Documentation / Knowledge Base",
  structureProfile: "multi-page-docs",
  contentProfile: "technical-reference",
  siteKind: "editorial",
  complexity: "medium",
  features: ["sidebar-nav", "search", "breadcrumbs", "collapsible-sections"],
  buildIntents: ["website"],
  tags: ["docs", "documentation", "knowledge-base", "help-center", "changelog", "api-docs", "wiki"],
}
```

### Matcher-keywords (i `matcher.ts`)

```
docs, documentation, dokumentation, knowledge base, kunskapsbas, help center,
hjälpcenter, changelog, release notes, api docs, api reference, wiki, manual,
handbok, guide, faq-site, support portal
```

## 2. `form-workflow`

### Syfte

Bokning, surveys, multi-step formulär, quiz, kalkylatorer, ansökningar.

### Rutter

```
app/
  layout.tsx
  page.tsx             # landing / intro
  booking/
    page.tsx           # bokningsformulär (multi-step)
  apply/
    page.tsx           # ansökan / intake
  confirmation/
    page.tsx           # bekräftelsesida
```

### shadcn-komponenter (i manifest-filer)

Form, FormField, FormItem, FormLabel, FormControl, FormMessage, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Checkbox, RadioGroup, RadioGroupItem, Calendar, Label, Button, Card, CardContent, CardHeader, CardTitle, Progress, Separator, Badge

### Manifestmetadata

```typescript
{
  id: "form-workflow-001",
  family: "form-workflow",
  label: "Form / Workflow / Booking",
  structureProfile: "form-centric",
  contentProfile: "service-intake",
  siteKind: "marketing",
  complexity: "medium",
  features: ["multi-step-form", "validation", "calendar-picker", "confirmation-page"],
  buildIntents: ["website"],
  tags: ["booking", "form", "survey", "quiz", "calculator", "application", "intake", "multi-step", "wizard"],
}
```

### Matcher-keywords (i `matcher.ts`)

```
booking, boka, bokning, survey, enkät, undersökning, quiz, frågesport,
calculator, kalkylator, multi-step, wizard, intake, ansökan, application form,
questionnaire, frågeformulär, appointment, tidsbokning
```

## Filer att skapa/ändra per scaffold

| Fil | Åtgärd |
|-----|--------|
| `src/lib/gen/scaffolds/<family>/manifest.ts` | **Ny** — fullständigt manifest med files-array |
| `src/lib/gen/scaffolds/types.ts` | Utöka `ScaffoldFamily` union med nya namn |
| `src/lib/gen/scaffolds/registry.ts` | Importera och registrera nya manifests i `ALL_SCAFFOLDS` |
| `src/lib/gen/scaffolds/matcher.ts` | Nya keyword-arrays och matchningslogik |
| `src/lib/gen/scaffolds/scaffold-search.ts` | Ev. uppdatera embeddingdata |
| `config/prompt-static/08-scaffold-starters.md` | Ev. referera nya familjer |

## Vad som inte ingår

- `marketplace`/`directory`-scaffold (utreds vid behov, lägre prioritet)
- `api-only`-scaffold (ej scaffold-scope, mer specialfall)
- Enhancement packs (→ P15, separat lager)

## Verifiering

- `scaffold-manifest-validation.ts` — nya manifests ska klara validering
- Matcher-test: prompt "dokumentationssida med sidebar" → `docs-knowledge`; prompt "bokningssystem med stegvis formulär" → `form-workflow`
- `npm run typecheck`
- Manuellt: generera med typiska prompter, verifiera att rätt scaffold väljs och att filerna är rimliga

## Prioritet

**Medel** — lägre akut effekt än P14/P15, men fyller tydliga luckor i scaffold-familjen.

## Beroenden

Ingen hård dependency på P14/P15, men P15:s enhancement packs (form-pack, feedback-pack) kompletterar `form-workflow`-scaffoldet naturligt.
