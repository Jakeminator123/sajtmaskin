# Preview guest (SM-080) — pilotrunbook

`guest/` är bilden och agenten som kör **inne i** ett kundprojekts egen Fly
Machine. Kontrollplanet (`preview-host/src/`) skapar en maskin per chat ur den
här bilden; ingenting här deployas med `fly deploy` som en tjänst.

## Vad som finns

| Fil | Roll |
| --- | --- |
| `agent.js` | HTTP-agent: token-skyddade workspace-, exec-, dev- och proxy-endpoints. Vägrar starta utan `SAJTMASKIN_GUEST_TOKEN` och `SAJTMASKIN_GUEST_CHAT_ID`. |
| `lib/workspace.js` | Path-jail och manifest-semantik (samma kontrakt som hostens `workspace-files.js`). |
| `lib/process.js` | `sh -lc`-körning med timeout/processgrupp, allowlistad barn-env, en dev-process med generation. |
| `warm/package.json` | Baslinjens beroenden; bygget förvärmer npm-cachen och ett `node_modules` som kopieras vid exakt fingerprint-träff. |
| `scripts/write-warm-state.cjs` | Stämplar den varma baslinjens fingerprint (samma algoritm som hostens `dependencyFingerprint`). |
| `Dockerfile`, `fly.toml` | Bild (node:22-alpine, egen användare `guest`) och gäst-appens hem. |

Agentens miljö är **bara** token, chatId och portar. Hostens API-nyckel,
Fly-token eller andra projekts filer finns inte i maskinen. Dev-servern
binder `127.0.0.1`; syskonmaskiner kommer inte åt den utan token.

## Pilot steg för steg

1. Skapa gäst-appen i samma organisation som hosten (namnet ska matcha
   `fly.toml` eller sättas i `PREVIEW_GUEST_FLY_APP`):

   ```powershell
   fly apps create sajtmaskin-preview-guests --org <org>
   ```

2. Bygg och pusha bilden utan att starta någon maskin:

   ```powershell
   cd preview-host/guest
   fly deploy --build-only --push -a sajtmaskin-preview-guests
   ```

   Anteckna bildreferensen (`registry.fly.io/sajtmaskin-preview-guests:deployment-…`).

3. Ge kontrollplanet en Fly API-token med rätt att hantera maskiner i
   gäst-appen (deploy-token för appen räcker) och konfigurationen:

   ```powershell
   fly secrets set -a vm-fly-jakem FLY_API_TOKEN=<token>
   fly secrets set -a vm-fly-jakem PREVIEW_GUEST_FLY_APP=sajtmaskin-preview-guests PREVIEW_GUEST_IMAGE=registry.fly.io/sajtmaskin-preview-guests:deployment-XXXX PREVIEW_GUEST_MACHINES_API_BASE=http://_api.internal:4280
   ```

   Slå **inte** på läget i prod ännu. Kör piloten mot en separat kontrollplans-
   app (klona `vm-fly-jakem` som `vm-fly-pilot` med egen volym) eller lokalt
   mot riktiga Machines med `PREVIEW_GUEST_MACHINES_API_BASE=https://api.machines.dev`.

4. Aktivera läget på pilothosten och verifiera:

   ```powershell
   fly secrets set -a vm-fly-pilot PREVIEW_HOST_ISOLATION=machine
   curl.exe -s https://vm-fly-pilot.fly.dev/health      # isolation.mode = machine, configured = true
   ```

5. Kör acceptansproven i `../README.md` § Öppen lanseringsblocker (två
   syntetiska projekt A och B, sentinel-filer, försök att nå varandra och
   kontrollplanet). Spara käll-SHA, image-id, maskinkonfiguration och de
   faktiska nekandena.

6. Besluta driftvärden (inte ratificerade ännu): `PREVIEW_GUEST_CPU_KIND`,
   `PREVIEW_GUEST_CPUS`, `PREVIEW_GUEST_MEMORY_MB`, idle-/stopp-policy
   (`PREVIEW_GUEST_STOP_ON_HIBERNATE`), region. Först därefter: samma nycklar
   på `vm-fly-jakem` och `PREVIEW_HOST_ISOLATION=machine` i `fly.toml`.

## Drift

- `GET /admin/machines` på hosten listar poster (utan token) och läget.
- Städsvepet (`cleanupPreviewHostStorage`) förstör maskiner vars chat saknar
  användbar session, och orphan-maskiner märkta med hostens
  `PREVIEW_GUEST_HOST_IDENTITY`. Maskiner från en annan host rörs aldrig.
- Ny bild: pusha, uppdatera `PREVIEW_GUEST_IMAGE`; hosten byter ut gäster med
  gammal bild vid nästa boot.
- Nödläge: `PREVIEW_HOST_ISOLATION=shared` återgår till baslinjen
  (`docs/runbooks/preview-host-shared-baseline.md`). `fly machines list -a
  sajtmaskin-preview-guests` + `fly machines destroy` rensar gäster för hand.

## Lokal verifiering

```bash
cd preview-host
npm run test:guest-agent   # agentens egna kontrakt
npm run test:isolation     # host + agent + fejkat Machines-API, end to end
```
