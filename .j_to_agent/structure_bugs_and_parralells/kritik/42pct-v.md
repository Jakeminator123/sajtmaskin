# Parallell granskning — `11f443db` (~42pct manifest + deploy readiness)

**Commit:** `11f443db` — `chore: remediation ~42pct — W2 integration manifest + deploy readiness`  
**Jämförelsebas:** tidigare W2 (~39pct registry); detta steg fullföljer `1.txt` idén om **manifest som primär sanning** + **enhetlig env-resolving**.

---

## 1. Vad som levererats (stämmer med agentens beskrivning)

| Påstående | Verifierat |
|-----------|------------|
| `sajtmaskin.integration-manifest.json` skrivs in vid finalize efter preflight | **Ja** — `finalize-version.ts`: `runFinalizePreflight` → sedan `injectIntegrationManifestIntoFilesJson(filesJson)` före `createDraftVersion`. |
| Innehåll härlett från nuvarande heuristik | **Ja** — `inject-integration-manifest.ts` kör `detectIntegrations(combined)` på filer **utan** befintlig manifestrad, bygger JSON via `buildManifestJsonFromDetected`. |
| `detectIntegrationsFromVersionFiles`: giltigt `schemaVersion: 1` → manifest primärt | **Ja** — `detect-integrations.ts`: parsar manifest, `detectedIntegrationsFromManifest`, sedan `appendCustomEnvIntegrations(codeForScan, fromManifest)` där `codeForScan` **exkluderar** manifestfilen. |
| `custom-env` via `process.env`-scan på övriga filer | **Ja** — samma mönster som `detectIntegrations`: `appendCustomEnvIntegrations` på strängen utan manifest. |
| `resolveEnvRequirementsFromVersionFiles` i readiness, files-GET, deploy-POST | **Ja** — anrop i `readiness/route.ts`, `files/route.ts`, `deployments/route.ts` (med `fixedFiles` efter `applyPreDeployFixes` på deploy). |
| `deployReadiness` loggas + skickas i svar; blockerar inte deploy | **Ja** — `site.deploy.precheck` innehåller `deployReadiness`; JSON-svar inkluderar `deployReadiness`; ingen early return som stoppar Vercel-anrop utifrån `ready`. |
| Tester `integration-manifest.test.ts` | **Ja** — 2 tester; körda lokalt: **pass**. |
| Progress + orchestrator-workloads uppdaterade | **Ja** — `external-review-remediation-progress.md`: **~42%** helhet, **~52%** integrationer+deploy; *Next* nämner tunnare auto-fix / valideringsfas. |

---

## 2. Vad som kan vara “missat” eller tunnare än idealet

1. **`external-review-remediation-progress.md` — översta “Last code touch”**  
   Första stycket nämner fortfarande Playwright/e2e som senaste kodrörelse, medan W2-manifest är den faktiska **senaste** stora integrationändringen i tabellen. **Liten dokumentationsdrift** (inte kodbugg).

2. **Testtäckning**  
   Bara **2** Vitest-fall: parse + “manifest vinner över kod”. Saknas t.ex. explicit test för **ogiltig manifest → fallback** till full heuristik, **tomma filer**, **`injectIntegrationManifestIntoFilesJson` idempotens**, och **merge** manifest + custom-env med kända env i kod.

3. **`buildDeployReadiness.invalidFiles`**  
   Fältet finns men sätts alltid till `[]` — dokumenterat som “thin contract”; om ni vill spegla filvalidering senare behövs fyllnad.

4. **Övriga kodvägar**  
   `resolveEnvRequirements(code)` / ren `detectIntegrations(code)` används fortfarande på andra ställen (t.ex. `integration-checks.ts`, `shared-own-engine-helpers.ts`) — **avsiktligt** om de inte jobbar mot version-filer, men värt att hålla koll så panel/readiness/deploy **förblir** den enda sanningen för “sparad version”.

5. **Kvar enligt plan (agenten nämnde)**  
   **`applyPreDeployFixes`** kvar; **ingen hård server-side gate** som speglar readiness-UI — **medvetet** lämnat; ökar risk att någon API-klient deployar trots “inte ready” om de ignorerar svarsfältet.

---

## 3. Sammanfattande bedömning

- **Genomfört:** ~**90–95%** av vad som utlovats i din bulletlista — arkitekturen för manifest + env-väg är **på plats** och **sammanhängande** med registry/pipeline.  
- **Missat / tunt:** mest **testdjup**, **progress “Last code touch”-rad**, och **framtida** hård validering / färre auto-fixar — i linje med er egen “valfritt enligt plan”.

---

*Fil: `42pct-v.md` — ~42pct + bokstav.*
