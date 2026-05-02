# Incidentrapport - Builder/Preview (2026-05-02)

## 1) Executive summary

| Omrade | Status | Kommentar |
|---|---|---|
| Dev-start (`npm run dev`) | OK | Preflight, schema-drift, shadcn-sync, db-init, index-kontroll gick igenom. |
| Core generation (init + follow-up) | OK | Versioner skapades och sparades (`969bb605...`, `77be8a80...`). |
| Senaste freeform-korning (chat `c174...`) | Blockerad efter finalize | `project-sanity valid=false`, `scaffold-import-drift`, `previewBlocked=true`, `verificationBlocked=true`. |
| Preview runtime | Delvis OK | Preview blev `ready/running`, men mycket poll-brus och versionsmix i UI. |
| Metadata-/diagnostik-API | Bristfalligt lokalt | `collaboration-summaries` och `error-log` gav aterkommande `404`. |
| Download for version zip | Fallerar | `.../versions/.../download?format=zip` gav `404`. |
| Template-load med stor payload | Fallerar i preview-start | `Invalid filesJson: total payload too large`. |
| UX/a11y/signaler | Brusar | Label/id/name-varningar, CSP report-only, CORB, D-ID 400. |

Kort slutsats: motorn bygger, men runtomkring finns flera lokala "sidecar"-fel (metadata, download, preview payload limits) som gor upplevelsen ostadig.

---

## 2) Tidslinje (komprimerad)

```text
03:15-03:17  Dev boot OK (preflight/db/shadcn/token/db-indexer)
01:21-01:26  Init-generation (chat 8e35...) -> finalize OK -> version 969bb605 skapad
01:26        Preview start 'recreated' -> preview_ready (sandbox sbx_7262...)
01:26+       Aterkommande 404: collaboration-summaries + versions/<id>/error-log
01:33-01:35  Follow-up generation -> version 77be8a80 skapad -> preview resumed/ready
01:35+       'version_mismatch' nar UI pollar bade gammal (969...) och ny (77...)
01:37+       Console: Fast Refresh, D-ID DELETE 400, fortsatt 404 pa metadata-endpoints
01:38-01:39  En follow-up gav 'done_empty_output' (bara suggestIntegration tool-calls)
01:44+       Nytt projekt/chat (c174...) startas, generation fortsatter normalt
01:48        Version 20e3ba46 skapas men stoppas i preflight:
             `project-sanity valid=false`, `scaffold-import-drift`,
             `previewBlocked=true`, `verificationBlocked=true`,
             `preview_status=missing` (ingen sandbox startad)
Fly VM logs   Preview-host VM restartar (SIGINT/reboot) men kommer upp igen och health check passerar
template test  Template preview fail: "Invalid filesJson: total payload too large"
download test  versions/<id>/download?format=zip -> 404
```

---

## 3) Vad som fungerade bra

| Del | Evidens i logg | Bedomning |
|---|---|---|
| Infrastrukturstart | Next.js ready, inspector-worker up, db checks pass | Stabil bas |
| Generation pipeline | `reasoning done`, `finalize pipeline complete`, `version.created` | Core fungerar |
| Autofix/syntax-validering | Syntaxfel hittades och fixerades i pass 1 | Skyddsnat fungerar |
| Preview session lifecycle | `preview_start_outcome` + `preview_ready` + heartbeat | Runtime uppe |
| Redis | Connect/ready + cache hits pa projects | Prestandastod aktivt |

---

## 4) Fel, varningar och sannolika orsaker

### 4.1 Hogst affarspaverkan

| Problem | Symptom | Trolig orsak | Konsekvens |
|---|---|---|---|
| Preflight blockerar ny version trots lyckad stream | `project-sanity valid=false`, `errors=2`, `previewBlocked=true`, `verificationBlocked=true` | Scaffold import drift/strukturdrift mot `landing-page` | Version sparas men kan inte previewas/verifieras |
| Template preview payload for stor | `preview_failed ... Invalid filesJson: total payload too large` | For stort filesJson till preview-host | Kan inte oppna vissa templates i buildern |
| Version-download fallerar | `GET .../versions/<id>/download?format=zip -> 404` | Route saknas/ej aktiverad/feature-gate mismatch | "Ladda ned" fungerar inte for vissa versioner |

### 4.2 Medelhog paverkan

| Problem | Symptom | Trolig orsak | Konsekvens |
|---|---|---|---|
| Saknade metadata-endpoints lokalt | `collaboration-summaries 404`, `error-log 404` | Lokalt ej exponerade routes eller feature-gates | Rod logg, svagare diagnos i paneler |
| Version poll mismatch | `preview_status: version_mismatch` | UI pollar gammal + ny version samtidigt | Forvirrande status i preview/versionhistorik |
| Empty follow-up output | `done_empty_output`, endast tool-calls (`suggestIntegration`) | Promptklassning/intent gav inga kod-delta | Follow-up "gor inget" trots request |

### 4.3 Lagre paverkan (brus/quality debt)

| Problem | Symptom | Trolig orsak | Konsekvens |
|---|---|---|---|
| A11y/form-koppling | Label-for mismatch, fält utan id/name | Form wrappers/fält-attribut ej konsekventa | Sämre autofill och tillgänglighet |
| CSP report-only | Mixpanel connect-src violations | Avsiktlig report-only policy i dev | Loggbrus, ej blockerande nu |
| CORB pa externa bilder | 16 blockerade cross-origin svar | Externa assetanrop med fel headers/mime/cross-origin | Vissa thumbnails/media kan utebli |
| D-ID cleanup 400 | `DELETE api.d-id.com ... 400` | State/payload mismatch i avatar-flode | Avatar-sidoflode instabilt |

---

## 5) Hur detta hanger ihop (varfor "allt ser daligt ut")

| Lager | Realitet | Upplevd effekt |
|---|---|---|
| Core engine | Funkar | Versioner skapas och sparas |
| Side APIs (diagnostik/metadata/download) | Delvis trasiga i lokal miljo | Console full av 404 + osakerhet |
| Preview UI polling | Aggressiv + flera versioner | Mismatch-meddelanden och "fladdrig" status |
| Browser warnings (CSP/CORB/A11y) | Mest quality/brus | Ser kritiskt ut trots att builden fortsatter |

Bottom line: det ar fler samtidiga sidofel an ett enda totalt fel. Därfor upplevs allt trasigt, fast core-pipelinen samtidigt levererar.

---

## 6) Koppling till det vi diskuterat i chatten

| Tidigare observation i chatten | Bekraftad av logg |
|---|---|
| "Core build funkar men sidofunktioner brakar" | Ja - finalize/version.created/preview_ready + separata 404/varningar |
| "404 pa collaboration/error-log ar oftast ej blockerande for build" | Ja - build och preview gick vidare trots 404 |
| "Version mismatch ar ofta UI/poll-beteende" | Ja - syns nar bada versioner pollas parallellt |
| "Nedladdning verkar redirecta/falla fel" | Ja - explicit `download?format=zip` gav 404 |
| "Template kunde inte oppnas pga stor payload" | Ja - explicit preview_failed med payload-too-large |

---

## 7) Prioriterad atgardslista

| Prioritet | Atgard | Mal |
|---|---|---|
| P0 | Fixa/aktivera `versions/<id>/download?format=zip` | Download far ej ge 404 |
| P0 | Hantera `filesJson` storlek for template preview (chunking/minifiering/filtering) | Stoppa payload-too-large fel |
| P1 | Tydlig fallback i UI nar `collaboration-summaries`/`error-log` saknas | Inga "hard fail"-paneler pa 404 |
| P1 | Debounce/version-pin i preview polling | Minska `version_mismatch`-brus |
| P2 | Ratta label/id/name i formularkomponenter | Bättre a11y + autofill |
| P2 | Rensa externa asset/CSP/CORB-brus i dev | Renare signal i console |
| P3 | D-ID cleanup hardening (idempotent delete/ignore 400) | Mindre sidoflodesbrus |

---

## 8) Riskbedomning nu

| Omrade | Risk nu |
|---|---|
| Core generation | Medel (stream/finalize fungerar, men preflight kan blockera leverans) |
| Template onboarding | Hog (payload-too-large blocker) |
| Download/export | Hog (404 blocker) |
| Team-diagnostik i builder UI | Medel (saknade metadata-routes) |
| Slutanvandar-kvalitet | Medel (a11y/varningsbrus) |

---

## 9) Rekommenderad beslutsrad

1. Behandla detta som en **stabil core + instabil kringyta**-incident.
2. Lyft `download 404` och `payload-too-large` till blockerande arbetspaket.
3. Lagg nu aven till **preflight/scaffold-import-drift** som blockerande arbetspaket, eftersom det stoppar preview trots lyckad generation.
4. Separera "noise cleanup" (A11y/CSP/CORB/D-ID) fran "hard blockers" så teamet inte tappar fokus.

---

## 10) Tillägg: OC/Fly-logg + senaste kommentar

| Ny signal | Tolkning | Påverkan |
|---|---|---|
| Fly-logg: `SIGINT` -> reboot -> health check passerar | Process/VM restart men tjänsten återhämtar sig | Ej huvudorsak till blockerad version |
| Fly-logg: `preview-host listening on :8080` + senare passing health check | Preview-host i sig startar korrekt | Stodjer att blocker i detta fall låg högre upp i pipeline |
| OC-kommentar om trasig `features`-array | Möjligt syntaxfel i ett specifikt genererat utdrag | Kan ge TS-fel i enskild sida, men var inte primär blocker i `c174...`-körningen |
| Senaste körning: `syntax-validation ... passed`, men `project-sanity valid=false` | Koden var parsebar men bröt scaffold-/sanity-regler | Därför `previewBlocked=true` och ingen sandbox |

---

## 11) Varför post-LLM fixer inte löste detta

| Steg | Vad fixern gör | Vad som hände här | Varför det inte räckte |
|---|---|---|---|
| Syntax-validering + LLM-fix | Lagar parser-/syntaxfel i output | `syntax-validation ... passed (errors=0)` | Inget syntaxfel kvar att laga |
| Mechanical autofix | Små mekaniska korrigeringar | Fixar kördes (`autofix.result`) | Löser inte scaffold-arkitekturdrift |
| Preflight/project-sanity | Kontroll av scaffold-kontrakt/importstruktur/protected paths | `project-sanity valid=false`, `scaffold-import-drift`, `errors=2` | Detta är policy/strukturfel, inte token/syntaxfel |
| Scaffold retry | Föreslår alternativ scaffold | `scaffold-retry.suggested ... to=base-nextjs` | Förslag autoappliceras inte alltid (risk för oönskad stor ändring) |

Praktisk slutsats: post-LLM-fixern är stark på "kod som inte kompilerar", men den här incidenten var främst "kod som kompilerar men bryter scaffoldens kontrakt". Då stoppar preflight, och preview blockeras.

