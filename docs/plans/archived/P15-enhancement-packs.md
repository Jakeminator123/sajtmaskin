# P15: Enhancement packs som mellanlager

## Status

**Ej påbörjad.** Beror på P14 (capability → dep-injektion).

## Problem

Systemet väljer **ett scaffold** tidigt i flödet. Scaffoldet äger hela strukturen. Det finns ingen mekanism för att lägga på modulära funktionspaket ovanpå ett scaffold.

Om en användare ber om "en portfolio med karusell, kontaktformulär och statistik" väljs `portfolio`-scaffoldet, men karusell-, form- och chart-funktionalitet injiceras bara som prompt-hints — inte som strukturerade paket med definierade komponenter, deps och mönster.

Resultatet: LLM:en får textinstruktioner men ingen konkret kodbas att utgå från för dessa tillägg. Kvaliteten varierar.

## Mål

Införa **enhancement packs** — modulära funktionspaket som aktiveras av capabilities och läggs ovanpå det valda scaffoldet. Inte nya scaffolds, utan komplementlager.

## Design

### Ny typ: `EnhancementPack`

```typescript
interface EnhancementPack {
  id: string;
  label: string;
  trigger: keyof InferredCapabilities;
  shadcnComponents: string[];           // från shadcn-components.ts
  npmDeps: Record<string, string>;
  promptGuidance: string;               // konkret markdown för LLM
  exampleUsage?: string;                // kodexempel att injicera i prompt
  conflictsWith?: string[];             // andra pack-ID:n som inte bör kombineras
}
```

### Packs (prioritetsordning)

| Pack | Trigger | shadcn-komponenter | Extra deps | Prompt-tillägg |
|------|---------|-------------------|-----------|---------------|
| **motion-pack** | `needsMotion` | — | `framer-motion` | Reveal, scroll-motion, gesture-mönster, `motion.div` exempel |
| **carousel-pack** | `needsCarousel` | Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious | `embla-carousel-react`, `embla-carousel-autoplay` | Auto-rotation, touch-swipe, responsive sizing |
| **chart-pack** | `needsCharts` | ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend | `recharts` | Area/bar/line/pie, realistisk mock-data (10-12 punkter), ChartConfig |
| **form-pack** | `needsForms` | Form, FormField, FormItem, FormLabel, FormControl, FormMessage, Input, Select, Textarea, Checkbox, RadioGroup, Calendar | `react-hook-form`, `@hookform/resolvers`, `zod` | Zod-schema, multi-step-mönster, validering |
| **data-table-pack** | `needsDataUI` | Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, DropdownMenu | `@tanstack/react-table` | Sorting, filtering, pagination, column defs |
| **3d-pack** | `needs3D` | — | `three`, `@react-three/fiber`, `@react-three/drei` | Canvas wrapping, "use client", useFrame, bundlevarning |
| **feedback-pack** | (implicit/default) | Skeleton, Progress, Sonner, Badge | `sonner` | Loading/empty/error state patterns |
| **command-pack** | (ny flagga: `needsCommandPalette` eller manuell) | Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList | `cmdk` | ⌘K-mönster, snabbnavigering |

### Flöde

```
prompt → inferCapabilities → resolveCapabilityPacks (P14)
                            → resolveEnhancementPacks (P15)
                               ↓
scaffold (routing/layout) + enhancement packs (widgets/patterns)
                               ↓
serializeForPrompt: scaffold-block + pack-blocks
                               ↓
project-scaffold: baseline deps + pack deps
```

### Integrationspunkter

| Fil | Ändring |
|-----|---------|
| `src/lib/gen/enhancement-packs.ts` | **Ny fil**: packdefinitioner, `resolveEnhancementPacks()` |
| `src/lib/gen/orchestrate.ts` | Anropa `resolveEnhancementPacks`, skicka till prompt-builder |
| `src/lib/gen/system-prompt.ts` | Ny sektion i `buildDynamicContext`: `## Enhancement Packs` med packens `promptGuidance` och `exampleUsage` |
| `src/lib/gen/project-scaffold.ts` | Merga packens `npmDeps` i baseline |
| `src/lib/gen/capability-inference.ts` | Ev. ny flagga `needsCommandPalette` |
| `docs/architecture/component-library-policy.md` | Dokumentera pack-lagret |

### Skillnad mot P14

P14 kopplar capabilities till deps och shadcn-namn. P15 lägger till **konkret prompt-guidance med mönster och kodexempel** — det som gör att LLM:en genererar bättre kod för varje funktionsområde, inte bara vet vilka bibliotek som finns.

## Vad som inte ingår

- Nya scaffolds (→ P16)
- DaisyUI-tematisering (separat utredning)
- CLI-baserad shadcn-hämtning vid buildtime (framtida förbättring)

## Verifiering

- Nytt testfall: `enhancement-packs.test.ts`
- Integration: generera med "portfolio med karusell och statistik" → verifiera att båda packens deps och hints hamnar i output
- `npm run typecheck`

## Prioritet

**Medel-hög** — ger störst kvalitetslyft per prompt, men kräver P14 som grund.

## Beroenden

- P14 (capability-dep-injection) måste vara klar först, eller implementeras parallellt.
