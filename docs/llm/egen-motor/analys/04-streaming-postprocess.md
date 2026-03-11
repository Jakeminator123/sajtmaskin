# Streaming Post-Processing (LLM Suspense-ersättning)

> 2026-03-06 — Guide för att bygga sajtmaskins eget streaming-manipulationslager.
> Baserat på Vercels offentliga blogg, AI SDK-dokumentation och webbresearch.

---

## Vad är LLM Suspense?

Vercel kallar det "LLM Suspense" — ett ramverk som manipulerar text UNDER
streaming (SSE) till klienten. Användaren ser aldrig felaktiga mellansteg.

Vercel beskriver tre kapabiliteter:
1. **Find-and-replace** på kända felmönster (imports, URLs)
2. **Embedding-baserad substitution** (lucide-ikoner → nearest-match)
3. **Token-komprimering** (långa URLs → korta alias före LLM, expandera efter)

Källa: vercel.com/blog/how-we-made-v0-an-effective-coding-agent (2026-01-07)

---

## Finns det dokumentation?

**Kort svar: Nej.** "LLM Suspense" är ett internt Vercel-koncept. Det finns:

- Ingen officiell Vercel-dokumentation utöver blogginlägget
- Ingen v0 API-dokumentation som exponerar detta
- Inget i Vercel MCP-servern
- Inget open source-bibliotek

**Vad som FINNS** är de byggstenar som behövs:

| Byggsten | Källa | URL |
|----------|-------|-----|
| AI SDK `fullStream` + `TransformStream` | AI SDK Cookbook | ai-sdk.dev/cookbook/next/custom-stream-format |
| AI SDK Language Model Middleware | AI SDK Core docs | ai-sdk.dev/docs/ai-sdk-core/middleware |
| `wrapLanguageModel()` med custom middleware | AI SDK Core docs | ai-sdk.dev/docs/ai-sdk-core/middleware |
| SSE-format + ReadableStream | Vercel KB | vercel.com/kb/guide/streaming-from-llm |
| TransformStream Web API | MDN | developer.mozilla.org/en-US/docs/Web/API/TransformStream |

---

## Implementationsplan

### Var i sajtmaskins arkitektur

Streaming-manipulationen ska sitta i server-side route-handlern,
MELLAN v0 API-svaret och klientens SSE-ström:

```
v0 Platform API
    │ SSE-ström (rå)
    ▼
┌──────────────────────┐
│ stream/route.ts      │
│                      │
│ v0-svar.fullStream   │
│    .pipeThrough(     │
│      suspenseTransform│ ◄── NYTT LAGER
│    )                 │
│    → klient SSE      │
└──────────────────────┘
```

### Alternativ A: TransformStream i route-handler (rekommenderat)

Enklast: intercepta SSE-strömmen med en `TransformStream` som kör
regex-regler på varje chunk innan den vidarebefordras.

```typescript
// Pseudokod — skiss för stream/route.ts

const suspenseRules: SuspenseRule[] = [
  {
    name: "shadcn-import-fix",
    // Matchar: from "@/components/ui" (utan subpath)
    pattern: /from\s+["']@\/components\/ui["']/g,
    replace: (match, context) => {
      // Extrahera komponentnamn från import-statement
      const component = extractComponentName(context.currentLine);
      if (component) {
        return `from "@/components/ui/${toKebabCase(component)}"`;
      }
      return match;
    },
  },
  {
    name: "lucide-icon-fix",
    // Matchar: import { NonExistentIcon } from "lucide-react"
    pattern: /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g,
    replace: (match, context) => {
      const icons = parseImportNames(match);
      const fixed = icons.map(icon => {
        if (KNOWN_LUCIDE_ICONS.has(icon)) return icon;
        const nearest = findNearestIcon(icon, KNOWN_LUCIDE_ICONS);
        return `${nearest} as ${icon}`;
      });
      return `import { ${fixed.join(", ")} } from "lucide-react"`;
    },
  },
  {
    name: "url-alias-expand",
    pattern: /\{\{URL_(\d+)\}\}/g,
    replace: (match, context) => {
      const index = parseInt(match.replace(/\D/g, ""));
      return context.urlMap?.[index] || match;
    },
  },
];

function createSuspenseTransform(rules: SuspenseRule[], context: StreamContext) {
  let buffer = "";

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;

      // Vänta tills vi har en komplett rad (eller flush vid timeout)
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        let processed = line;
        for (const rule of rules) {
          processed = processed.replace(rule.pattern, (match) =>
            rule.replace(match, context)
          );
        }
        controller.enqueue(processed + "\n");
      }
    },
    flush(controller) {
      if (buffer) {
        let processed = buffer;
        for (const rule of rules) {
          processed = processed.replace(rule.pattern, (match) =>
            rule.replace(match, context)
          );
        }
        controller.enqueue(processed);
      }
    },
  });
}
```

### Alternativ B: AI SDK Middleware (mer integrerat)

AI SDK v6 har `wrapLanguageModel()` med middleware-stöd. Befintliga
middlewares inkluderar `extractReasoningMiddleware` och
`extractJsonMiddleware`. En custom middleware kan transformera output.

```typescript
import { wrapLanguageModel } from "ai";

const suspenseMiddleware = {
  transformStream: async function* ({ stream }) {
    for await (const chunk of stream) {
      if (chunk.type === "text-delta") {
        yield {
          ...chunk,
          text: applySuspenseRules(chunk.text),
        };
      } else {
        yield chunk;
      }
    }
  },
};
```

Nackdel: sajtmaskin anropar v0 Platform API direkt (inte AI SDK:s
`streamText`), så middleware-approachen kräver omstrukturering.

**Rekommendation: Alternativ A** (TransformStream i route-handler).

---

## Fas 1: Grundläggande regler (2–3 veckor)

Implementera dessa regler först — täcker ~70% av kända felproblem:

### Regel 1: shadcn/ui import-path-fix

```
FEL:  import { Button } from "@/components/ui"
FIX:  import { Button } from "@/components/ui/button"

FEL:  import { Card, CardHeader } from "@/components/ui"
FIX:  import { Card, CardHeader } from "@/components/ui/card"
```

Implementation:
- Underhåll en mappning: komponentnamn → subpath
- shadcn/ui har ~50 komponenter, mappningen är statisk
- Regex: `/from\s+["']@\/components\/ui["']/`
- Extrahera komponentnamn från import-raden, lookup i mappning

### Regel 2: Lucide-icon-validering

```
FEL:  import { VercelLogo } from "lucide-react"
FIX:  import { Triangle as VercelLogo } from "lucide-react"
```

Implementation:
- Hämta lista med alla giltiga ikonnamn från `lucide-react` package
  (ca 1500 ikoner, exporteras som named exports)
- Vid okänt ikonnamn: string-similarity-match mot listan
- Alternativt: Lucide har ett API (lucide.dev) för dynamisk lookup
- Enklare variant: hårdkodad fallback → `Circle` för okända ikoner

### Regel 3: URL-alias-expansion

```
PRE-LLM:  Ersätt "https://abc123.public.blob.vercel-storage.com/xyz.png"
          med "{{MEDIA_1}}"
POST-LLM: Expandera "{{MEDIA_1}}" tillbaka till full URL
```

Implementation:
- Före API-anrop: bygg alias-map, ersätt i prompten
- I TransformStream: enkel regex-replacement
- Sparar ~10–50 tokens per URL (100–500 tecken)

---

## Fas 2: Avancerade regler (2–3 veckor ytterligare)

### Regel 4: Dependency-detektion

Scanna genererad kod efter import-statements. Jämför med kända packages.
Om en import inte finns i standardbiblioteket och inte i shadcn/ui:
flagga som potentiellt saknad dependency.

### Regel 5: Provider-wrapping-check

Om `useQuery` eller `useMutation` används men ingen `QueryClientProvider`
finns i koden → flagga för autofix (kan lösas post-streaming via
AST-parse, inte i streaming-lagret).

### Regel 6: CSS-variabel-validering

Verifiera att genererad Tailwind-CSS använder `bg-primary` etc.
istället för hårdkodade färger (matchar v0:s promptregel).

---

## Datakällor att underhålla

| Data | Storlek | Uppdateringsfrekvens | Källa |
|------|---------|----------------------|-------|
| shadcn/ui komponent → subpath-mappning | ~50 entries | Vid shadcn-uppgradering | shadcn/ui docs |
| Lucide-ikonlista | ~1500 entries | Varje vecka (lucide uppdateras ofta) | `lucide-react` package exports |
| URL-alias-map | Per-request | Varje request | Genereras dynamiskt |
| Kända npm-packages | ~200 entries | Månadsvis | Manuellt kurerad |

---

## Testplan

1. Samla 50–100 riktiga v0-generationer från sajtmaskins logg
2. Kör dem genom Suspense-lagret
3. Mät: hur många imports fixades? Hur många var redan korrekta?
4. Verifiera: ingen korrekt kod sönder av reglerna (false positive-rate)
5. Målsättning: <1% false positives, >80% av kända felproblem fixade

---

## Insatssammanfattning

| Fas | Innehåll | Insats | Förväntat lyft |
|-----|----------|--------|----------------|
| 1 | Import-fix, icon-fix, URL-alias | 2–3 veckor | Fångar ~70% av kända streamingfel |
| 2 | Dep-detektion, provider-check, CSS-validering | 2–3 veckor | Ytterligare ~15% |
| **Totalt** | | **4–6 veckor** | **~85% av LLM Suspense-effekten** |

Jämförelse med v0:s Suspense:
- v0 har dessutom en embedding-databas för icon-matching (snabbare, mer korrekt)
- v0 hanterar fler edge cases (de har miljontals generationer att lära av)
- Uppskattad paritet med v0: ~70–80% med Fas 1+2
