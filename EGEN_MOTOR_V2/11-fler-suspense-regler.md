# Plan 11: Fler suspense-regler (8 → 15+)

> Prioritet: HÖG — färre trasiga genereringar
> Beroenden: Plan 02 (befintliga regler)
> Insats: 3-4 dagar

## Problemet

8 suspense-regler finns. v0 uppskattas ha ~20+. Specifika gap:
- Ingen dependency-validering
- Ingen self-import-detektering
- Ingen image-src-fix för `/ai/`-paths som fortfarande kan smita igenom
- Ingen tom-komponent-detektering

## Nya regler att skapa

### 1. `src/lib/gen/suspense/rules/self-import-strip.ts`
Ta bort imports som refererar till filen själv. LLM:er genererar ibland `import X from "./same-file"`.
Detektera: rad är en import-statement vars from-path matchar aktuell fils namn (via context).

### 2. `src/lib/gen/suspense/rules/image-src-fix.ts`
Om `src="/ai/..."` hittas i en JSX-attribut, ersätt med `/placeholder.svg?text=...&height=400&width=600`.
Extrahera filnamnet som text-parameter.

### 3. `src/lib/gen/suspense/rules/empty-return-fix.ts`
Om en rad är `return null;` eller `return (<></>)` ensam i en komponent-kontext, ersätt med en placeholder-div.

### 4. `src/lib/gen/suspense/rules/forbidden-import-strip.ts`
Strippa imports som garanterat kraschar i preview:
- `import ... from "next/headers"` → kommentera ut
- `import ... from "next/navigation"` → behåll bara useRouter/usePathname/useSearchParams
- `import ... from "server-only"` → ta bort helt
- `import ... from "next/font/..."` → kommentera ut

### 5. `src/lib/gen/suspense/rules/jsx-attribute-fix.ts`
Fixa vanliga JSX-attributfel:
- `class=` → `className=`
- `for=` → `htmlFor=`
- `onclick=` → `onClick=`
- `onchange=` → `onChange=`
- `tabindex=` → `tabIndex=`

### 6. `src/lib/gen/suspense/rules/relative-import-fix.ts`
Fixa imports med fel path-format:
- `import X from "components/..."` → `import X from "@/components/..."`
- `import X from "lib/..."` → `import X from "@/lib/..."`
- `import X from "app/..."` → `import X from "@/app/..."`

### 7. `src/lib/gen/suspense/rules/cn-import-fix.ts`
Om `cn(` används i koden men `import { cn }` saknas, detektera raden och logga.
Om raden ÄR en import som inkluderar cn men från fel path → fixa till `@/lib/utils`.

## Filer att modifiera

### `src/lib/gen/suspense/index.ts`
Registrera alla 7 nya regler i `createDefaultRules()`.

## Acceptanskriterier

- [ ] 7 nya regler skapade
- [ ] Registrerade i DEFAULT_RULES
- [ ] Befintliga regler oförändrade
- [ ] Inga false positives
- [ ] Inga nya lint-/TSC-fel
