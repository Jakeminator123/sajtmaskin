# Plan 3: v0 Environment Variables via Proper SDK

## Mål
Ersätt den fragila `(v0 as any).projects?.findEnvVars?.(...)` i deploy-routen
med typade v0 SDK-metoder. Bygg en UI-panel för env var-hantering.

## Bakgrund
- Nuvarande diff: `src/app/api/v0/deployments/route.ts` använder `(v0 as any)` cast
  för att hämta env vars vid deploy.
- v0 SDK har fullt typat stöd:
  - `v0.projects.findEnvVars({ projectId, decrypted })` 
  - `v0.projects.createEnvVars({ projectId, upsert, environmentVariables })`
  - `v0.projects.deleteEnvVars({ projectId, ids/keys })`
- Det finns redan en route: `src/app/api/v0/projects/[projectId]/env-vars/route.ts` (280 rader)
  som använder SDK:t korrekt för GET/POST/DELETE.
- Det finns redan en UI-komponent: `src/components/builder/ProjectEnvVarsPanel.tsx`

## Steg

### S1. Fixa deploy-routens env var-fetch
**Fil:** `src/app/api/v0/deployments/route.ts`

Ersätt den osäkra `(v0 as any).projects?.findEnvVars?.(...)` blocken (rad 449-480 i diff)
med ett anrop till den redan typade hjälpfunktionen.

Extrahera en helper-funktion:

```typescript
async function fetchV0ProjectEnvVars(
  v0: V0Client,
  v0ProjectId: string,
): Promise<Record<string, string>> {
  const SYNTHETIC_PREFIXES = ["chat:", "registry:"];
  if (SYNTHETIC_PREFIXES.some((p) => v0ProjectId.startsWith(p))) {
    return {};
  }

  const response = await v0.projects.findEnvVars({
    projectId: v0ProjectId,
    decrypted: "true",
  });

  const envVars: Record<string, string> = {};
  const envList = Array.isArray(response) ? response : (response?.envVars ?? []);
  
  for (const item of envList) {
    if (typeof item.key === "string" && typeof item.value === "string") {
      envVars[item.key] = item.value;
    }
  }
  
  return envVars;
}
```

### S2. Verifiera v0 SDK typings
**Fil:** `node_modules/v0-sdk` (inspektera) + `src/lib/v0/v0-client.ts` (om finns)

Kontrollera att `v0.projects.findEnvVars` faktiskt finns i de installerade typerna.
Om inte – kontrollera v0-sdk version (nuvarande: ^0.16.1) och uppdatera om nödvändigt.

Om SDK-typerna inte matchar, skapa en typad wrapper i `src/lib/v0/v0-env-vars.ts`
som wrapprar SDK-anropet med korrekt typning.

### S3. Kontrollera ProjectEnvVarsPanel.tsx
**Fil:** `src/components/builder/ProjectEnvVarsPanel.tsx`

Läs och verifiera:
- Visar det env vars för projektet?
- Kan man lägga till/ta bort?
- Är det kopplat till rätt API-routes?
- Hanterar det synthetic projects (chat:, registry:)?

### S4. Koppla ProjectEnvVarsPanel i builder-UI
Verifiera att panelen redan visas i builder-sidan. Om inte, integrera den
i sidopanelen eller som en modal/dialog.

### S5. Testa edge cases
- Synthetic project (chat:/registry:) -> ska inte hämta env vars
- Tomt project -> ska fungera utan fel
- Env vars med specialtecken i value
- Deploy med env vars -> verifieras mot Vercel

## Filer som ändras
| Fil | Ändring |
|-----|---------|
| `src/app/api/v0/deployments/route.ts` | Refaktorera env var-fetch |
| `src/lib/v0/v0-env-vars.ts` | Ny typad wrapper (om behövs) |
| `src/components/builder/ProjectEnvVarsPanel.tsx` | Verifiera + förbättra |

## Acceptanskriterier
- [ ] Ingen `(v0 as any)` kvar i deploy-routen
- [ ] Typat SDK-anrop för findEnvVars
- [ ] Helper-funktion med korrekt error handling
- [ ] ProjectEnvVarsPanel visas och fungerar i builder
- [ ] Synthetic projects hanteras korrekt
- [ ] Bygger utan TypeScript-fel
