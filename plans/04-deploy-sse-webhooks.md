# Plan 4: Deployment Status via SSE (ersätt polling)

## Mål
Ersätt klient-polling med Server-Sent Events (SSE) för deploy-status.
Webhook-händelser från Vercel pushas i realtid till klienten via Redis pub/sub.

## Bakgrund
- Vercel webhook-handler finns: `src/app/api/webhooks/vercel/route.ts`
  - Tar emot deployment.created, .succeeded, .error, .canceled
  - Verifierar HMAC-signatur
  - Uppdaterar deployment-status i DB via `updateDeploymentStatus()`
- Polling-endpoint finns: `src/app/api/v0/deployments/[deploymentId]/route.ts`
  - GET – hämtar deployment, pollar Vercel om icke-terminal status
- Redis finns: ioredis (`REDIS_URL` env var)
- Klienten pollar förmodligen med setInterval eller useEffect

## Steg

### S1. Skapa Redis pub/sub helper
**Fil:** `src/lib/redis-pubsub.ts` (ny)

```typescript
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

export function createPublisher() {
  if (!REDIS_URL) return null;
  return new Redis(REDIS_URL);
}

export function createSubscriber() {
  if (!REDIS_URL) return null;
  return new Redis(REDIS_URL);
}

export function deployChannel(vercelDeploymentId: string) {
  return `deploy:status:${vercelDeploymentId}`;
}
```

### S2. Publicera från webhook-handler
**Fil:** `src/app/api/webhooks/vercel/route.ts`

Efter `updateDeploymentStatus()` (rad 131), publicera till Redis:

```typescript
import { createPublisher, deployChannel } from "@/lib/redis-pubsub";

// After DB update:
const publisher = createPublisher();
if (publisher) {
  await publisher.publish(
    deployChannel(deploymentId),
    JSON.stringify({ status, url, inspectorUrl })
  );
  publisher.disconnect();
}
```

### S3. Skapa SSE-endpoint
**Fil:** `src/app/api/v0/deployments/[deploymentId]/events/route.ts` (ny)

```typescript
export async function GET(req, { params }) {
  const { deploymentId } = params;
  // Hämta deployment från DB, verifiera tenant
  // Skapa SSE-stream
  // Prenumerera på Redis channel
  // Skicka initial status
  // Lyssna på Redis messages -> push SSE events
  // Cleanup: unsubscribe + disconnect on close
}
```

Returnera `ReadableStream` med `text/event-stream` content type.

### S4. Fallback: poll om Redis inte finns
Om `REDIS_URL` inte är satt, falla tillbaka till server-side polling:
- SSE-endpointen pollar Vercel API var 3:e sekund
- Skickar SSE-event vid statusändring
- Klienten slipper ändå polla

### S5. Klient-hook: useDeploymentStatus
**Fil:** `src/lib/hooks/useDeploymentStatus.ts` (ny)

```typescript
export function useDeploymentStatus(deploymentId: string | null) {
  const [status, setStatus] = useState<DeploymentStatus>("pending");
  const [url, setUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (!deploymentId) return;
    const es = new EventSource(`/api/v0/deployments/${deploymentId}/events`);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data.status);
      if (data.url) setUrl(data.url);
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [deploymentId]);
  
  return { status, url };
}
```

### S6. Integrera i deploy-UI
Byt ut befintlig polling-logik mot `useDeploymentStatus` hooken.
Visa:
- Spinner + "Bygger..." under building
- Grön check + URL vid ready
- Felmeddelande vid error

## Filer som ändras
| Fil | Ändring |
|-----|---------|
| `src/lib/redis-pubsub.ts` | Ny – pub/sub helpers |
| `src/app/api/webhooks/vercel/route.ts` | Publicera till Redis |
| `src/app/api/v0/deployments/[deploymentId]/events/route.ts` | Ny SSE-endpoint |
| `src/lib/hooks/useDeploymentStatus.ts` | Ny klient-hook |
| Deploy-UI komponent(er) | Byt polling -> SSE |

## Acceptanskriterier
- [ ] Redis pub/sub fungerar (publish från webhook, subscribe i SSE)
- [ ] SSE-endpoint streamar statusändringar korrekt
- [ ] Fallback till polling om Redis saknas
- [ ] useDeploymentStatus hook fungerar
- [ ] Deploy-UI visar realtidsstatus
- [ ] SSE-anslutning stängs korrekt vid cleanup
- [ ] Bygger utan TypeScript-fel
