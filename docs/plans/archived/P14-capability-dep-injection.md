# P14: Formalisera capability → dep/komponent-injektion

## Status

**Ej påbörjad.**

## Problem

`capability-inference.ts` detekterar 11 kapabiliteter (`needsMotion`, `needs3D`, `needsCharts`, `needsCarousel`, `needsForms`, etc.) och bygger prompt-hints via `buildCapabilityHints()`. LLM:en informeras om vilka bibliotek den ska använda — men systemet **garanterar inte** att filerna eller dependencies faktiskt finns.

Idag är kopplingen:
1. Capability-flagga → prompt-hint (text till LLM) ✅
2. LLM genererar kod med imports → `dep-completer` hittar imports → deps adderas reaktivt ✅
3. Capability-flagga → proaktiv dep/komponent-injektion ❌ (saknas)

Gapet: om LLM:en missar en import, eller om en shadcn-komponent inte genereras korrekt, saknas beroendet. Systemet berättar *vad* som ska användas men säkerställer inte *att* det finns.

## Mål

Koppla capability-flaggor till faktisk dep- och komponent-injektion så att:
- dependencies som capability-flaggan kräver alltid hamnar i `package.json`
- relevanta shadcn-komponenter presenteras som tillgänglig kontext (inte bara namndropps i hints)

## Design

### Ny typ: `CapabilityPack`

```typescript
interface CapabilityPack {
  capability: keyof InferredCapabilities;
  requiredDeps: Record<string, string>;     // npm-paket → version
  shadcnComponents: string[];               // shadcn-components.ts nycklar
  promptEnrichment?: string;                 // extra kontext utöver hints
}
```

### Ny funktion: `resolveCapabilityPacks()`

I `capability-inference.ts` (eller ny fil `capability-packs.ts`):
- tar `InferredCapabilities`
- returnerar en lista `CapabilityPack[]` för alla aktiva flaggor
- används av orchestrate.ts och project-scaffold.ts

### Integrationspunkter

| Fil | Ändring |
|-----|---------|
| `src/lib/gen/capability-inference.ts` | Ev. ny export eller ny fil `capability-packs.ts` |
| `src/lib/gen/orchestrate.ts` | Konsumera packs: berika dynamisk kontext med komponentdetaljer |
| `src/lib/gen/project-scaffold.ts` | Proaktiv dep-injektion: merga packens `requiredDeps` i `mergePackageJsonWithBaseline` |
| `src/lib/gen/system-prompt.ts` | Ev. ny sektion i `buildDynamicContext` för enriched component references |
| `src/lib/gen/data/shadcn-components.ts` | Referensdata (ej ändring, men konsumeras av packs) |
| `docs/architecture/component-library-policy.md` | Uppdatera policy med nytt injektionsflöde |

### Packdefinitioner (initial uppsättning)

| Capability | requiredDeps | shadcnComponents |
|-----------|-------------|-----------------|
| `needsCarousel` | `embla-carousel-react`, `embla-carousel-autoplay` | Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious |
| `needsCharts` | `recharts` | ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent |
| `needsForms` | `react-hook-form`, `@hookform/resolvers`, `zod` | Form, FormField, FormItem, FormLabel, FormControl, FormMessage, Input, Select, Calendar |
| `needsMotion` | `framer-motion` | (inga shadcn-specifika) |
| `needs3D` | `three`, `@react-three/fiber`, `@react-three/drei` | (inga shadcn-specifika) |
| `needsDataUI` | `@tanstack/react-table` | Table, TableBody, TableCell, TableHead, TableHeader, TableRow |
| `needsAuth` | (inga extra — baseline täcker) | Form, Input, Label, Button, Card |
| `needsAppShell` | (inga extra) | Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger |
| `needsEcommerce` | (inga extra) | Sheet, SheetContent, Badge, Card, Separator |
| `needsPremiumVisuals` | (inga extra deps — CSS-drivet) | (inga specifika) |

## Vad som inte ingår

- Nya scaffolds (→ P16)
- Enhancement pack-abstraktionen som mellanlager (→ P15, bygger på denna)
- DaisyUI/Flowbite-integration (utreds separat per policy)

## Verifiering

- `capability-inference.test.ts` — utöka med pack-resolving
- `dep-completer.test.ts` — versionssynk med packs
- `npm run typecheck`
- Manuellt: generera med prompt som triggar carousel + charts, verifiera att deps och hints är korrekta

## Prioritet

**Hög** — detta är den enskilt viktigaste bryggan mellan detektion och leverans. P15 och P16 bygger på denna.

## Beroenden

Ingen — kan påbörjas direkt. `component-library-policy.md` finns redan.
