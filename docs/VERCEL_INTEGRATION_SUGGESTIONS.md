# Vercel Integration Förslag

## Översikt

Detta dokument sammanfattar förslag för att förbättra integrationen med Vercel baserat på officiell dokumentation.

## 1. Vercel AI SDK för OpenAI-anrop

### Nuvarande situation

- Direktanrop till OpenAI API via `openai`-paketet
- Används i: `openai-agent.ts`, `audit/route.ts`, `expand-prompt/route.ts`, `domain-suggestions/route.ts`, etc.
- Manuell hantering av API-nycklar, retries, och error handling

### Fördelar med Vercel AI SDK

1. **Unified API** - Samma interface för alla modeller (OpenAI, Anthropic, etc.)
2. **Streaming support** - Inbyggt stöd för streaming responses
3. **React Server Components** - Optimerad för Next.js
4. **Tool calling** - Enklare implementation av function calling
5. **Structured outputs** - Type-safe JSON generation med zod schemas
6. **Bättre error handling** - Automatisk retry och rate limit hantering

### Implementation

```typescript
// Installera
npm install ai @ai-sdk/openai

// Exempel: Ersätt i openai-agent.ts
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';

// Istället för:
const response = await client.responses.create({...});

// Använd:
const { text } = await generateText({
  model: openai('gpt-4o'),
  prompt: '...',
  tools: [...],
});
```

### Migreringsplan

1. Installera `ai` och `@ai-sdk/openai`
2. Migrera en route i taget (börja med enklare routes)
3. Behåll fallback till direkt OpenAI API om AI SDK inte fungerar
4. Testa noggrant innan full migration

---

## 2. Domänköp i Publish-steget

### Nuvarande situation

- `finalize-modal.tsx` visar domänsökningar
- Använder `/api/domain-suggestions` som genererar förslag med OpenAI
- Kollar tillgänglighet via RDAP/DNS
- Länkar till externa registrars (iis.se, namecheap) för köp

### Fördelar med Vercel Domains

1. **Direktköp i appen** - Användare kan köpa domänen direkt
2. **Automatisk konfiguration** - Domänen konfigureras automatiskt efter köp
3. **WHOIS privacy** - Inkluderad som standard
4. **Prisvisning** - Realtidspriser direkt från Vercel
5. **Sömlös integration** - Domänen kopplas direkt till deployment

### Implementation

#### Steg 1: Lägg till Vercel Domains API i vercel-client.ts

```typescript
/**
 * Search for available domains
 */
export async function searchDomains(
  query: string,
  teamId?: string
): Promise<
  Array<{
    domain: string;
    available: boolean;
    price?: number;
    currency?: string;
    period?: number;
  }>
> {
  const queryParams = new URLSearchParams({
    name: query,
    ...(teamId && { teamId }),
  });

  const { domains } = await vercelFetch<{
    domains: Array<{
      name: string;
      available: boolean;
      price?: number;
      currency?: string;
      period?: number;
    }>;
  }>(`/v5/domains/search?${queryParams.toString()}`);

  return domains;
}

/**
 * Purchase a domain
 */
export async function purchaseDomain(
  domain: string,
  teamId?: string
): Promise<{
  domain: string;
  purchaseId: string;
  status: string;
}> {
  const body: any = {
    name: domain,
  };

  if (teamId) {
    body.teamId = teamId;
  }

  const result = await vercelFetch<{
    domain: string;
    purchaseId: string;
    status: string;
  }>("/v5/domains/purchase", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return result;
}

/**
 * Get domain price
 */
export async function getDomainPrice(
  domain: string,
  teamId?: string
): Promise<{
  domain: string;
  price: number;
  currency: string;
  period: number;
}> {
  const queryParams = new URLSearchParams({
    name: domain,
    ...(teamId && { teamId }),
  });

  return await vercelFetch<{
    domain: string;
    price: number;
    currency: string;
    period: number;
  }>(`/v5/domains/price?${queryParams.toString()}`);
}
```

#### Steg 2: Skapa API route för domänsökning med Vercel

```typescript
// app/src/app/api/vercel/domains/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { searchDomains } from "@/lib/vercel-client";
import { isVercelConfigured } from "@/lib/vercel-client";

export async function GET(request: NextRequest) {
  try {
    if (!isVercelConfigured()) {
      return NextResponse.json(
        { error: "Vercel not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const teamId = searchParams.get("teamId") || undefined;

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const domains = await searchDomains(query, teamId);

    return NextResponse.json({ success: true, domains });
  } catch (error) {
    console.error("[API/vercel/domains/search] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

#### Steg 3: Uppdatera finalize-modal.tsx

```typescript
// Lägg till:
const [domainPrices, setDomainPrices] = useState<Record<string, number>>({});

// När domänresultat visas, hämta priser:
useEffect(() => {
  const fetchPrices = async () => {
    for (const result of domainResults) {
      if (result.available) {
        try {
          const priceRes = await fetch(
            `/api/vercel/domains/price?q=${result.domain}`
          );
          const priceData = await priceRes.json();
          if (priceData.success) {
            setDomainPrices((prev) => ({
              ...prev,
              [result.domain]: priceData.price,
            }));
          }
        } catch (err) {
          console.error("Failed to fetch price:", err);
        }
      }
    }
  };

  if (domainResults.length > 0) {
    fetchPrices();
  }
}, [domainResults]);

// Visa pris och köpknapp:
{
  result.available && (
    <div className="flex items-center gap-2">
      {domainPrices[result.domain] && (
        <span className="text-xs text-gray-400">
          {domainPrices[result.domain]} kr/år
        </span>
      )}
      <Button
        onClick={() => handlePurchaseDomain(result.domain)}
        className="bg-teal-600 hover:bg-teal-500"
      >
        Köp nu
      </Button>
    </div>
  );
}
```

### API Endpoints att använda

- **Sök domäner**: `GET /v5/domains/search?name={query}`
- **Hämta pris**: `GET /v5/domains/price?name={domain}`
- **Köp domän**: `POST /v5/domains/purchase` (kräver betalningsinfo)
- **Lista domäner**: `GET /v5/domains`
- **Lägg till domän till projekt**: `POST /v9/projects/{projectId}/domains`

### Viktiga noteringar

- Domänköp kräver betalningsinformation (kreditkort)
- Vercel stöder många TLDs men inte alla (.se stöds)
- Priser varierar beroende på TLD
- WHOIS privacy är automatiskt aktiverad

---

## 3. Vercel SDK för bättre integration

### Nuvarande situation

- Egen fetch-baserad klient i `vercel-client.ts`
- Fungerar bra men saknar type safety och automatisk error handling

### Fördelar med @vercel/sdk

1. **Type safety** - Fullständig TypeScript support
2. **Automatisk retry** - Inbyggd retry logic
3. **Bättre error handling** - Strukturerade error types
4. **Dokumentation** - Bättre IDE support och autocomplete
5. **Framtidskompatibilitet** - Automatiska uppdateringar

### Implementation

```typescript
// Installera
npm install @vercel/sdk

// Exempel användning
import { Vercel } from '@vercel/sdk';

const vercel = new Vercel({
  bearerToken: process.env.VERCEL_API_TOKEN!,
});

// Domänsökning
const domains = await vercel.domains.search({
  name: 'example',
});

// Köp domän
const purchase = await vercel.domains.purchase({
  name: 'example.com',
  // Payment info...
});

// Deployment
const deployment = await vercel.deployments.create({
  name: 'my-project',
  files: [...],
});
```

### Migreringsplan

1. Installera `@vercel/sdk`
2. Skapa wrapper-funktioner som behåller samma interface
3. Migrera gradvis, behåll fallback till fetch-baserad klient
4. Testa noggrant innan full migration

---

## 4. Ytterligare förbättringar

### Domain Management

- Automatisk DNS-konfiguration när domän köps
- SSL-certifikat hanteras automatiskt av Vercel
- Wildcard-domäner stöds

### Deployment Integration

- När domän köps, koppla automatiskt till deployment
- Automatisk redirect från www till apex (eller vice versa)
- Environment variables kan sättas per domän

### Pricing & Billing

- Visa priser i SEK (konvertera från USD om nödvändigt)
- Visa årskostnad tydligt
- Hantera auto-renewal

---

## Rekommendationer

### Prioritet 1: Domänköp i Publish-steget

- Högst värde för användare
- Förbättrar UX avsevärt
- Genererar potentiell intäkt

### Prioritet 2: Vercel AI SDK migration

- Förbättrar kodkvalitet
- Gör det enklare att byta modeller
- Bättre error handling

### Prioritet 3: Vercel SDK adoption

- Nice-to-have, men nuvarande implementation fungerar
- Kan göras gradvis

---

## API Referens

### Domains API

- Dokumentation: https://vercel.com/docs/rest-api/reference/domains
- Endpoints:
  - `GET /v5/domains/search` - Sök domäner
  - `GET /v5/domains/price` - Hämta pris
  - `POST /v5/domains/purchase` - Köp domän
  - `GET /v5/domains` - Lista köpta domäner
  - `POST /v9/projects/{id}/domains` - Lägg till domän till projekt

### AI SDK

- Dokumentation: https://vercel.com/docs/ai-sdk
- Installation: `npm install ai @ai-sdk/openai`

### Vercel SDK

- Dokumentation: https://vercel.com/docs/rest-api/reference/sdk
- Installation: `npm install @vercel/sdk`

---

## Nästa steg

1. **Testa Vercel Domains API** - Verifiera att API-nyckeln har rätt scope
2. **Implementera domänsökning** - Börja med sökning och prisvisning
3. **Implementera köpfunktion** - Lägg till checkout-flow
4. **Migrera AI SDK** - Börja med en enklare route
5. **Testa noggrant** - Verifiera att allt fungerar i produktion
