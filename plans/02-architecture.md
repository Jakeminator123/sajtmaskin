# Plan 02 – Arkitektur-förbättringar

Prioritet: **Hög**
Uppskattad insats: ~4–8 timmar

---

## 1. Skapa Next.js middleware

**Status:** Saknas helt
**Problem:** Ingen `middleware.ts` existerar. Auth kontrolleras per API-route.

### Validering

- Ingen `middleware.ts` i projektroten eller `src/`
- Auth sker via `getSession()` / `requireAuth()` anrop i varje enskild route
- `src/lib/auth/auth.ts` har session-hantering men ingen central gatekeeper
- `src/lib/auth/session.ts` hanterar anonyma sessioner

### Uppgifter

- [x] Skapa `src/middleware.ts` (Next.js 16 standard)
- [x] Skydda `/builder` – kräv session (redirect till `/` om ej inloggad)
- [x] Skydda `/admin` – kräv admin-session
- [x] Skydda `/api/v0/*` – kräv session (returnera 401)
- [x] Skydda `/api/ai/*` – kräv session (returnera 401)
- [x] Låt publika routes passera: `/`, `/api/auth/*`, `/api/health`, `/api/stripe/webhook`, `/api/webhooks/*`
- [x] Lägg till rate-limit headers (om Upstash Redis finns tillgänglig)
- [x] Testa att OAuth-callbacks (`/api/auth/github/callback`, `/api/auth/google/callback`) fortfarande fungerar

### Referens-implementation

```typescript
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/api/auth",
  "/api/health",
  "/api/stripe/webhook",
  "/api/webhooks",
  "/api/kostnadsfri",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const session = request.cookies.get("session");
  if (!session && pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session && (pathname.startsWith("/builder") || pathname.startsWith("/admin"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/builder/:path*", "/admin/:path*", "/api/:path*"],
};
```

---

## 2. Streaming prompt assist

**Status:** Klart
**Problem:** `/api/ai/chat` använder `generateText` (synkront). Användaren väntar utan feedback.

### Validering

- `src/app/api/ai/chat/route.ts` använder `generateText()` → returnerar färdigt `text`
- `src/lib/hooks/usePromptAssist.ts` gör `fetch("/api/ai/chat")` → väntar på fullständigt svar
- AI SDK 6 har `streamText()` + `toDataStreamResponse()` redo att använda
- v0 Platform API-streaming redan implementerad (custom SSE), men prompt assist är synkront

### Uppgifter

- [x] Byt `generateText` → `streamText` i `/api/ai/chat/route.ts`
- [x] Returnera `result.toDataStreamResponse()` istället för JSON
- [x] Uppdatera `usePromptAssist.ts` att konsumera streamen (visa tokens progressivt)
- [x] Behåll `generateText`-fallback för `generateObject` i `/api/ai/brief` (structured output kan inte streamas lika enkelt)
- [x] Testa med gateway-provider och v0-provider

### Referens

```typescript
import { streamText, gateway } from "ai";

export async function POST(req: Request) {
  const { messages, model } = await req.json();
  const result = streamText({
    model: gateway(model),
    messages,
  });
  return result.toDataStreamResponse();
}
```

---

## 3. Provider=off toggle

**Status:** Ej implementerat
**Problem:** Ingen möjlighet att stänga av prompt assist helt.

### Validering (AC-item #5)

- `src/lib/builder/defaults.ts` nämner "off: No preprocessing" i en kommentar
- `PROMPT_ASSIST_MODEL_OPTIONS` har enbart gateway- och v0-modeller, inget "off"-alternativ
- `promptAssist.ts` har ingen "off" guard – alltid preprocessing
- Användaren kan inte välja att skicka direkt utan att prompten bearbetas

### Uppgifter

- [x] Lägg till `{ value: "off", label: "Av (direkt)" }` i `PROMPT_ASSIST_MODEL_OPTIONS`
- [x] Hantera `provider === "off"` i `usePromptAssist.ts` – returnera prompten oförändrad
- [x] Uppdatera `BuilderHeader.tsx` dropdown att visa "Av"-alternativet
- [x] Verifiera att inga `/api/ai/*`-anrop görs när off är valt

---

## 4. Förbättra felmeddelanden vid saknade nycklar

**Status:** Delvis gjort
**Problem:** Gateway-routes har tydliga meddelanden, v0-stream har generiska.

### Validering (AC-item #7)

- `/api/ai/chat`: Returnerar `"Missing AI Gateway auth for gateway provider"` + setup-instruktioner ✓
- `/api/ai/brief`: Returnerar `"Missing AI Gateway auth"` + setup ✓
- `/api/v0/chats/stream`: `assertV0Key()` kastar `"Missing V0_API_KEY"` men `normalizeV0Error` mappar det till generisk `"API-nyckel saknas eller är ogiltig."` utan specifik kontext

### Uppgifter

- [x] Förbättra `normalizeV0Error` i `/api/v0/chats/stream/route.ts` – behåll specifikt v0-meddelande
- [x] Lägg till `setup`-fält i v0-stream felsvaret (likt ai/chat): `"Set V0_API_KEY in your environment."`
- [x] Verifiera att klienten visar felmeddelandet tydligt (inte bara loggar det)
