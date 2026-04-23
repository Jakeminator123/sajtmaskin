---
id: omtag-07-static-core-type-imports
title: Static Core — type-only-import-exempel in, fixer-tillväxten stopp
phase: 0
priority: P2
parallell_med: [01-embedding-diagnos, 02-eval-baseline, 04-env-flag-collapse]
blockerad_av: []
estimat: "45 min"
owner_files:
  - config/prompt-core/02-component-contract.md
  - config/prompt-core/00-core-contract.md
  - config/prompt-core/_READ_ME_FIRST.md (vid behov)
---

# 07 — Static Core type-only-import-exempel

## Mål

Lägg till 2–3 konkreta exempel i `config/prompt-core/02-component-contract.md` för korrekta type-only-imports (framförallt `LucideIcon`, React-typer, och prop-typ-importer från andra filer). Målet: eliminera 70 % av type-import-bugg-klassen utan att lägga till ytterligare autofix-regler.

## Varför det här

Autofix har just fått #39 `import-alias-type-syntax-fixer` (commit `997f280f7`). Fatigue-agentens plan föreslår #40 + #41. Varje ny fixer är ett nytt lager över samma felkategori. Enklare: **berätta för LLM:en direkt** vad rätt ser ut — det är en billig, stor vinst jämfört med en nionde regex-baserad post-fixer.

## Scope

| In | Ut |
|---|---|
| 2–3 nya exempel-block i `02-component-contract.md` | Lägga till nya autofix-regler |
| Ev. en rad i `00-core-contract.md` som pekar dit | Ändra `system-prompt.ts`-kod |
| `.cursor/rules/pipeline-rules.mdc` consulted (se punkt "stärk prompten istället för ny autofix") | Röra någon `.ts`-fil |

## Inputs

1. `config/prompt-core/02-component-contract.md` — hela
2. `config/prompt-core/00-core-contract.md` — hitta platsen som hänvisar till component-contract
3. `src/lib/gen/autofix/rules/import-alias-type-syntax-fixer.ts` — se exakt vilket mönster #39 plockar (det ska exemplet motverka)
4. `src/lib/gen/autofix/rules/type-only-import-fixer.ts` — samma för dess mönster
5. `.cursor/rules/pipeline-rules.mdc`
6. `STATUS-2026-04-20.md` Block 2 — ser hur tidigare prompt-core-regler formulerades

## Exempel att lägga in (förslag — finjustera mot faktiska fixermönster)

**Exempel 1 — Lucide-ikoner som prop-typ:**

```tsx
// ✅ Korrekt
import type { LucideIcon } from "lucide-react";
import { Star } from "lucide-react";

type Feature = { icon: LucideIcon; label: string };
const features: Feature[] = [{ icon: Star, label: "Kvalitet" }];

// ❌ Felaktigt (utlöser autofix #39)
import { Star, type as type LucideIcon } from "lucide-react";
```

**Exempel 2 — Återanvänd prop-typ från annan komponent:**

```tsx
// ✅ Korrekt
import type { ButtonProps } from "@/components/ui/button";
```

**Exempel 3 — React-event-typer:**

```tsx
// ✅ Korrekt
import type { FormEvent, ChangeEvent } from "react";
import { useState } from "react";
```

Formulera dem i samma ton som befintliga regler i `02-component-contract.md` (kort ingress, ✅/❌-block).

## Exekveringssteg

1. Läs de två fixer-källorna (#39 och `type-only-import-fixer`) och notera vilka anti-patterns de plockar.
2. Skriv 2–3 exempel som explicit demonstrerar rätt mönster mot varje anti-pattern.
3. Lägg dem i en ny sektion `### Type-only imports` under befintlig "Komponent-kontrakt"-struktur.
4. Om `00-core-contract.md` listar exempel-ämnen → lägg till en rad som hänvisar dit.
5. Kör `grep`/läs-verifiering att din nya sektion inte dubblerar existerande regler.

## Får INTE göras

- Inga kodändringar.
- Ingen ny autofix-regel.
- Inga ändringar utanför `config/prompt-core/`.

## Acceptance criteria

- [ ] 2–3 exempel inlagda, totalt ≤ 40 rader.
- [ ] Ingen duplicering av redan existerande prompt-core-regler (manuell läsgenomgång).
- [ ] Eval-baseline (02) på branchen → inga regressions *(och helst: färre autofix-fixes på prompts som använder Lucide-ikoner — sannolik vinst)*.
- [ ] `npx vitest run` — inga nya fails (bör inte röras).

## Branch

`omtag/07-static-core-type-imports`
