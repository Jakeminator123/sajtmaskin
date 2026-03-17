# Commit Selection Report

Det har urvalet fokuserar pa commits som mest tydligt paverkar byggkedjan for
egna sidor: prompt/streaming, finalisering, previewtillit och recovery-floden.

## Rekommenderade commits

### 1. `5eef955` - Harden own-engine preview fidelity and diagnostics

Varfor den ar bra:

- Samlar preview-logik over flera lager samtidigt:
  `preview-render`, stream-routes, `finalize-version`, `post-checks` och
  `PreviewPanel`.
- Markerar ett tydligt steg dar egen preview blev mer medveten om kvalitet och
  diagnosticering, i stallet for att bara vara en enkel iframe-yta.
- Ar stark som referenspunkt om du vill hitta nar previewn borjade behandlas som
  en produktfunktion snarare an en ren teknisk fallback.

Viktigast att jamfora i:

- `src/app/api/preview-render/route.ts`
- `src/app/api/v0/chats/stream/route.ts`
- `src/app/api/v0/chats/[chatId]/stream/route.ts`
- `src/lib/gen/stream/finalize-version.ts`
- `src/components/builder/PreviewPanel.tsx`

### 2. `51ee7ea` - Polish preview diagnostics and autofix flow

Varfor den ar bra:

- Forbattrar bryggan mellan previewfel och auto-fix genom att centralisera
  event-dispatch i `auto-fix-events.ts`.
- Gor `PreviewPanel` och `VersionDiagnosticsDialog` mer handlingsbara genom att
  visa senaste preview-kod/steg och skicka samma typ av recovery-signal.
- Ar bra om du vill studera nar previewdiagnostik gick fran "logga fel" till
  "mata upp fel till ett reparationsflode".

Viktigast att jamfora i:

- `src/components/builder/PreviewPanel.tsx`
- `src/components/builder/VersionDiagnosticsDialog.tsx`
- `src/lib/hooks/chat/auto-fix-events.ts`
- `src/lib/hooks/chat/useAutoFix.ts`

### 3. `8d7c2ba` - Fix stream tool-call buffering, finalize-version materialization, and post-check autofix

Varfor den ar bra:

- Fixar en mycket central del av promptkedjan: hur verktygsanrop buffras och
  oversatts till SSE-handelser i `stream-format.ts`.
- Gor finalize-steget mer robust genom image materialization och starkare
  efterarbete i `finalize-version.ts`.
- Markerar ett viktigt steg for multi-step prompting och blockande fragor i
  stream-routes, alltsa hur egna modellen "pratar med sig sjalv" och UI:t utan
  att tappa struktur.

Viktigast att jamfora i:

- `src/lib/gen/stream-format.ts`
- `src/lib/gen/stream/finalize-version.ts`
- `src/app/api/v0/chats/stream/route.ts`
- `src/app/api/v0/chats/[chatId]/stream/route.ts`

### 4. `1cdee77` - Harden preview gating and autofix diagnostics

Varfor den ar bra:

- Introducerar den viktiga skillnaden mellan "version finns" och
  "preview far visas", genom att gora `previewUrl` nullable vid blockerande
  preflight-fel.
- Forbattrar auto-fix-signalerna genom att sammanfatta relevanta persisted logs
  i stallet for att skicka brus.
- Ar sannolikt en av de battre commitsen for att forsta nar previewtillit blev
  en forstaklassig regel i inhouse-kedjan.

Viktigast att jamfora i:

- `src/lib/gen/stream/finalize-version.ts`
- `src/lib/hooks/chat/useAutoFix.ts`
- `src/lib/mcp/generate-site.ts`

### 5. `c0b7f67` - Historical own-engine docs snapshot

Varfor den ar bra:

- Skapar `OWN_ENGINE_FLOW_V2.md` och `OWN_ENGINE_PREVIEW_SUMMARY.txt`, vilket ar
  en tydlig historisk snapshot av hur den egna pipelinen och preview-iden
  forklarades precis da.
- Bra "anchor commit" for att jamfora gammal mental modell mot nuvarande
  implementation.
- Ar extra relevant eftersom den ligger precis i `stortest`-perioden och
  sammanfaller med att preview/flow-tanket dokumenterades explicit.

Historiska artefakter:

- `OWN_ENGINE_FLOW_V2.md`
- `OWN_ENGINE_PREVIEW_SUMMARY.txt`

### 6. `bcedbca` - Refactor documentation structure and remove obsolete files

Varfor den ar bra:

- Visar brytpunkten dar aldre `stortest`/own-engine-dokument flyttades eller
  togs bort, vilket gor den idealisk som jamforelse mot `c0b7f67`.
- Flyttar `stortest`-material till `docs/analyses/2026-03-smb-orchestration-notes/`
  och tar bort de tva `OWN_ENGINE_*`-filerna fran roten.
- Bra for recovery, eftersom den visar vad som bevarades, vad som arkiverades
  och vad som forsvann ur den dagliga arbetsytan.

Viktiga historiska flyttar:

- `stora_natten/stortest_repo/stortest_gpt_utvardering.txt` ->
  `docs/analyses/2026-03-smb-orchestration-notes/stortest-gpt-utvardering.txt`
- `OWN_ENGINE_FLOW_V2.md` -> borttagen
- `OWN_ENGINE_PREVIEW_SUMMARY.txt` -> borttagen

## Kort rekommendation

Om du bara vill diffa fyra saker for att hitta "den starkaste alternativa
bygglogiken", borja i den har ordningen:

1. `8d7c2ba`
2. `1cdee77`
3. `5eef955`
4. `51ee7ea`

Och anvand sedan `c0b7f67` + `bcedbca` som historisk forklaringsram for hur
preview- och own-engine-tanket dokumenterades och sedan konsoliderades.
