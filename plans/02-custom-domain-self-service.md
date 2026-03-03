# Plan 2: Custom Domain Self-Service UI

## Mål
Bygg ett end-to-end UI-flöde där användare kan söka, köpa/koppla, och verifiera
en egen domän direkt i deploy-steget – från "beskriv din sajt" till "live på din domän".

## Bakgrund
Backend finns redan:
- `/api/domains/check` – kollar tillgänglighet via Vercel + Loopia + DNS fallback
- `/api/domains/link` – lägger till domän på Vercel-projekt + Loopia DNS
- `/api/vercel/domains/price` – priskoll via Vercel
- `/api/domain-suggestions` – föreslår domäner
- `src/lib/vercel/vercel-client.ts` har: `addDomainToProject`, `listProjectDomains`,
  `getDomainPrice`, `checkDomainAvailability`, `purchaseDomain`, `getDomainOrderStatus`
- `src/components/builder/DomainSearchDialog.tsx` finns redan (okänt tillstånd)
- `BuilderHeader.tsx` har redan `onDomainSearch` callback

Det som saknas: ett sammanhängande flöde i deploy-steget.

## Steg

### S1. Inventera befintlig DomainSearchDialog
**Fil:** `src/components/builder/DomainSearchDialog.tsx`
- Läs igenom befintlig kod
- Identifiera vad som redan fungerar vs vad som behöver byggas till
- Den kopplar redan till `onDomainSearch` i BuilderHeader

### S2. Skapa DomainManager-komponent
**Fil:** `src/components/builder/DomainManager.tsx` (ny)

En panel/dialog som visas efter lyckad deploy, med 3 steg:

**Steg 1 – Sök domän:**
- Input-fält med sökning mot `/api/domains/check`
- Visa resultat: domän, tillgänglighet, pris i SEK, provider
- Filtrera per TLD (.se, .com, etc.)

**Steg 2 – Koppla/Köp:**
- Om domänen är ledig: visa "Koppla domän"-knapp
  - Om .se/.nu: externt köp (Loopia purchaseUrl) + auto-DNS via `/api/domains/link`
  - Om .com/.io etc: Vercel purchaseUrl eller direkt-köp via `purchaseDomain` (om tillgänglig)
- Om domänen redan ägs av användaren: direkt "Koppla" via `/api/domains/link`

**Steg 3 – Verifiera:**
- Visa DNS-instruktioner (returneras redan av `/api/domains/link`)
- Poll `/api/domains/link` eller bygg en verify-endpoint
- Visa status: "Väntar på DNS-propagering...", "Verifierad!", "Fel"

### S3. Lägg till domain-kolumn i deployments-schema
**Fil:** `src/lib/db/schema.ts`
- Lägg till `domain: text("domain")` i deployments-tabellen (nullable)
- Kör Drizzle migration

### S4. Spara domän vid koppling
**Fil:** `src/lib/deployment.ts`
- Uppdatera `updateDeploymentStatus` eller skapa `setDeploymentDomain(deploymentId, domain)`
- Anropas efter lyckad domain-link

### S5. Integrera DomainManager i deploy-flödet
**Fil:** Beror på var deploy-UI:t bor – troligen i builder-sidan
- Visa DomainManager-panelen efter att deployment.status === "ready"
- Skicka med `vercelProjectId` och `deploymentId`

### S6. Skapa verify-endpoint (om det behövs)
**Fil:** `src/app/api/domains/verify/route.ts` (ny)
- POST `{ domain, projectId }`
- Anropar Vercel API: `POST /projects/:id/domains/:domain/verify`
- Returnerar verification-status

## Filer som ändras
| Fil | Ändring |
|-----|---------|
| `src/components/builder/DomainSearchDialog.tsx` | Utöka/refaktorera |
| `src/components/builder/DomainManager.tsx` | Ny komponent |
| `src/lib/db/schema.ts` | domain-kolumn i deployments |
| `src/lib/deployment.ts` | setDeploymentDomain |
| `src/app/api/domains/verify/route.ts` | Ny endpoint |
| Builder deploy-UI | Integrera DomainManager |

## Acceptanskriterier
- [ ] Användare kan söka domäner efter deploy
- [ ] Tillgänglighet och pris visas korrekt
- [ ] .se/.nu hanteras via Loopia, .com etc via Vercel
- [ ] DNS-instruktioner visas tydligt
- [ ] Domän sparas på deployment i DB
- [ ] Bygger utan TypeScript-fel
