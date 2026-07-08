---
status: active
owner: unassigned
created: 2026-07-01
updated: 2026-07-08
topic: OpenClaw edit-agent (reversibel) — spår B/C levererade, spår A väntar i PR #346 [HOLD]
---

# OpenClaw edit-agent + follow-up-fix + mall→Blob — plan & sekvens

## TL;DR (2026-07-08: 2 av 3 spår klara — bara spår A kvar)

Tre spår, medvetet åtskilda så `master` inte störs och allt är reversibelt:

| Spår | Vad | Leverans | Status |
|---|---|---|---|
| **C — mallar→Blob** | Backoffice-upload + Blob-manifest + katalog som styr `Mallar`/Templates | PR #336 (`feat/mallar-blob-catalog`) | ✅ **MERGAD** 2026-07-01 |
| **B — follow-up-fix** | Fixa att follow-up i vanliga LLM-flödet blockeras på mall-chattar | egen PR | ✅ **LEVERERAD** — `imported-repo`-läget finns i koden (`finalize-preflight.ts`, `finalize-version/preflight-phase.ts`, `engine/chats/init/route.ts` + test) |
| **A — OpenClaw edit-agent** | OpenClaw redigerar användarprojekt från en prompt i OpenClaw-chatten → ändringar till VM | branch `feat/openclaw-edit-agent` | 🟡 **PR #346, draft, [HOLD - MERGA INTE]** — se detaljer nedan |

Enda kvarvarande beslutet är om/när PR #346 ska tas av HOLD. Resten av dokumentet nedan (spår B:s rotorsak/fix-detaljer, spår A:s design) är historik/kontext — spår B:s sektion beskriver vad som byggdes, inte längre öppet arbete.

---

## Spår C — mallar → Blob (pågår)

- Uploader: `scripts/v0-templates/upload-mallar-blob.mjs --upload --write-catalog` (inkrementell, hoppar redan uppladdade per SHA-256).
- Skriver `template-blob-manifest.json` (runtime-källa) + regenererar `templates.json` + `template-categories.json` (galleri).
- För stora mallar (>2 MB/fil eller >12 MB totalt, `preview-host/src/validate.js`) laddas upp men **utesluts ur katalogen** (`previewFits:false`) så de aldrig blir klickbara.
- Verifiering: `verify-mallar-blob.mjs`. Status: 313 mallar på disk, uppladdning körs.

## Spår B — follow-up-fixen (rotorsak + fix)

### Rotorsak (kod-verifierad)

En follow-up på en **mall-initierad chatt** mergas korrekt mot mallens filer
(`finalize-merge.ts` → `hasMergeablePrevious` = previousFiles>0 → previousFiles vinner),
**men** resten av finalize-kedjan kör scaffold-antaganden som är byggda för
own-engine-scaffolds, inte importerade v0-repon:

1. `chat-message-stream-post.ts` kör scaffold-selection ändå → `scaffoldId=landing-page`, `variant_lock_fallback=corporate-grid` (mall-chatten saknar "importerat repo"-markör).
2. `finalize-preflight.ts`:
   - `partitionGeneratedFilesForProtectedPaths` → *"scaffold-protected paths — dropped to keep scaffold default"*.
   - `buildCompleteProject(...)` injicerar scaffold-defaults som inte hör till v0-repot.
   - Home-route-grind `HOME_PAGE_MIN_RENDERED_CHARS = 200` + `runProjectSanityChecks` → `code_structure_failure`.
3. `previewBlocked=true, verificationBlocked=true` → nya versionen kan inte promotas → preview-panelen byter aldrig → `preview_status … version_mismatch → stopped`. **Ingen krasch.**

Jämför init-vägen: mall importeras med `skipProjectScaffold:true, skipRepair:true` i `startPreviewSession` — men follow-up-finalize har **ingen motsvarande flagga**.

### Fix (reversibel, bakåtkompatibel)

1. **Persistera ursprung** vid mall-init (`src/app/api/template/route.ts`): markera chatten som `origin="imported-repo"` (ny kolumn/flagga eller scaffold-sentinel).
2. **Tråda flaggan** genom `chat-message-stream-post.ts` → `finalize-version/runner.ts` → `preflight-phase.ts`.
3. **Imported-repo-läge i finalize-preflight**: hoppa scaffold-injektion (`buildCompleteProject`) + relaxa home-route-grinden och scaffold-specifik `project-sanity`; **behåll** syntax- + degeneracy-guards (säkerhet).
4. **Ingen scaffold-selection** för imported-repo-chattar i stream.

- **Reversibelt:** allt bakom flaggan. Saknas flaggan → oförändrat beteende.
- **Tester:** vitest för preflight imported-repo-läge (blockerar EJ ett giltigt v0-repo; blockerar fortfarande tomt `<main>`).
- **Kvarstående okänt (låg risk):** exakta 2 felsträngarna (per-version error-log ej hämtad; servern var nedstängd) + om det räcker att relaxa grindarna eller om `buildCompleteProject` också måste hoppas. Bekräftas med en riktad körning.
- **Berörda filer:** `src/app/api/template/route.ts`, `src/lib/api/engine/chats/chat-message-stream-post.ts`, `src/lib/gen/stream/finalize-preflight.ts`, `src/lib/gen/stream/finalize-version/{runner,preflight-phase}.ts`.
- **Review:** protected path (`src/lib/gen`) → kräver tester + oberoende granskning (Codex/Bugbot) före merge.

## Spår A — OpenClaw som edit-agent (ny branch, senare)

### Mål

Användaren skriver i **OpenClaw-chatten** t.ex. *"gör färgen blå ist för rosa"* →
OpenClaw läser projektets senaste version, tar fram ändringar och skickar dem till VM-previewn.

### Design — återanvänder befintlig infrastruktur (minimal ny kod)

| Steg | Återanvänd (finns) | Nytt (isolerat) |
|---|---|---|
| Läs senaste version | `resolveFileContext` + `getEngineVersionForChatByIdForRequest` (tenant-guard) | — |
| Prompt → ändringar | — | Gateway producerar `QuickEditOp[]` (deterministiska `replace_text`) |
| Applicera → VM | `POST /api/engine/chats/[chatId]/quick-edit` → `runQuickEdit` → `tryPatchPreviewSession` → preview-host `/preview/session/patch` | Tunn route `src/app/api/openclaw/edit/route.ts` som proxar med session-auth |

**Nyckelinsikt + synergi med spår B:** små ändringar ("gör blå") ska gå via
**quick-edit-lanen**, inte vanliga follow-up-strömmen. Quick-edit applicerar
deterministiska ops och kör **inte** den tunga scaffold/preflight-kedjan →
möjliggör agenten **och** kringgår follow-up-blocket för små edits. Stora
redesigns kan falla tillbaka på befintlig `fill_text_field` → builder-send → stream.

### Reversibilitet (borttagning ska vara trivial)

- All ny kod i **isolerade sökvägar**: `src/lib/openclaw/edit/**`, `src/app/api/openclaw/edit/**`, ev. `src/components/openclaw/edit-*`.
- **Inga** ändringar i kärn-pipelinen (gen/finalize/preview) för spår A.
- Bakom env-flagga `OPENCLAW_EDIT_AGENT` — av = routen 404:ar, allt återgår till dagens "föreslå prompt".
- Varje edit skapar **ny draft-version** → `Restore` återställer.
- **Borttagnings-checklista** (dokumenteras i branch A): radera `**/openclaw/edit/**`, ta bort flaggan i `src/lib/config.ts`, ta bort ev. widget-knapp. Inga migrationer, inga kärnfil-diffar → ren revert.

### Env som (kan) behövas — .env.local + Vercel "All Environments"

Sätts först i branch A (inget konsumeras innan dess). Policy: läsbara
(`encrypted`, ej `sensitive`) så värden kan inspekteras; rör **aldrig**
`ENV_VAR_ENCRYPTION_KEY`.

| Var | Roll | Ny? |
|---|---|---|
| `OPENCLAW_EDIT_AGENT` | Master på/av för edit-vägen | **Ny** |
| `SAJTMASKIN_PREVIEW_PATCH_LANE=true` | Hot-patch till VM (quick-edit) | Kontrollera/aktivera |
| `NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT` | Client quick-edit-lane | Kontrollera/aktivera |
| `OPENCLAW_GATEWAY_URL` / `OPENCLAW_GATEWAY_TOKEN` | Extern gateway (finns) | Befintlig |

### Kontrakt att respektera (från kartläggningen)

- Stale-base → 409 (`quick-edit/route.ts`), F3-versioner nekar quick-edit.
- Alltid `getEngineVersionForChatByIdForRequest(req, chatId, versionId)` före fil-läsning (cross-tenant).
- Ingen direkt DB-/logg-skrivning i edit-flödet.

---

## Branch/PR-strategi

```text
master
 ├── feat/mallar-blob-catalog   (PR #336)  → spår C  (+ ev. spår B, om du vill bunta)
 └── feat/openclaw-edit-agent    (ny, av master, SENARE) → spår A
```

- Rekommendation: **spår B som egen liten PR av `master`** (renare review, rör pipeline-kontrakt). Kan buntas i #336 om du hellre vill — ditt val.
- Spår A startar **först** efter B+C, på egen branch, efter påminnelse.

## Beslut (bekräftade 2026-07-01)

1. **Sekvens: C → B → (påminnelse) → A.** OpenClaw sist, på egen branch efter påminnelse.
2. **Spår B = egen liten PR av `master`** (inte buntad i #336).
3. **Env i spår A:** OK att sätta nya var (t.ex. `OPENCLAW_EDIT_AGENT`) i både `.env.local` och Vercel "All Environments" som läsbar (`encrypted`, ej `sensitive`) — men **först när branch A skapas**.
