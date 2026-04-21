# P32 — Request-Type Taxonomy & Right-Sized Pipelines

**Status:** Förslag — väntar på agreement innan implementation.
**Skapad:** 2026-04-21.
**Triggad av:** SAJ-flödesrunda — användaren vill att olika typer av frågor får olika tunga rörelser ("text-edit" ≠ "ny sida" ≠ "fråga utan generering"). Ska minska wasted compute och göra svar snabbare utan att förlora kvalitet.

---

## Problem

Idag går nästan allt genom samma codegen-stream med full orkestrering (`resolveOrchestrationBase` → `finalizeOrchestrationPrompts` → `buildGenerationInputPackage`) + samma post-stream-pipeline (autofix → URL-expansion → image-materialize → validate-syntax → optional verifier → merge → preflight → persist) oavsett om användaren faktiskt behöver:

- Ändra en CSS-rad i `globals.css` (ingen install, ingen tsc-kritisk yta)
- Lägga till en helt ny route med form + validation (full pipeline befogad)
- Bara fråga "hur ska jag prompta för en parallax?" (ingen filgenerering alls)
- Installera ett nytt paket (kräver dep-completer + warm tsc + build)

Det är slöseri på snabba ändringar och under-investerat på tunga ändringar.

Samtidigt finns redan **byggblock** för differentiering — bara inte sammankopplade:
- `classifyFollowUpIntent()` (`src/lib/gen/follow-up-intent-types.ts`) → `clear-refine` / `clear-redesign` / `ambiguous-*` / `neutral`
- `BuildSpec.changeScope` (`copy` / `local-layout` / `page-addition` / `redesign` / `integration`)
- `BuildSpec.contextPolicy` (`light` / `normal` / `heavy`)
- `BuildSpec.previewPolicy` (`fidelity2` / `fidelity3`)
- `BuildSpec.verificationPolicy` (`fast` / `standard` / `strict`)
- `analyzeComplexity()` + `scoreComplexity()` i `promptOrchestration.ts`

---

## Föreslagen taxonomi (8 klasser)

| # | Klass | Exempel | Pipeline |
|---|---|---|---|
| 1 | **Q&A / Score (no-gen)** | "Hur prompt:ar jag för 3D?" / "Ge mig ett betyg på sidan" / "Vad finns i mitt projekt?" | Bara assist-LLM (gpt-5.4), inga filer skapas, ingen validate, ingen preview-rerun. Ev. `buildFileContext({ maxChars: 8_000, maxFilesWithContent: 0 })` för "vad finns"-frågor. |
| 2 | **External-fetch** | "Hämta färgtema från www.aftonbladet.se" / "Ta logotypen från X.com" / "Hitta bilder på pizza" | Pre-step: en tool-call till en `fetchExternalArtifact(url, kind)` (sandboxa inte hela CLI; bara HTTP fetch + parse). Resultatet (palette/asset-URL/text) injiceras i den efterföljande micro-edit / page-addition pipelinen som extra context-block. |
| 3 | **Multi-change (compound)** | "Byt färg OCH ersätt hero-bilden" / "Lägg till 2 sektioner: pricing + testimonials" | Splitta till en arrays av sub-changes via `splitMultiChangePrompt(prompt)` (regex/LLM-fallback), kör som EN generation men med tydligt numrerade `Requested Changes (1/N): ...` i wrap. Ingen ny build per change (för dyrt) — ett pass med strukturerad lista. |
| 4 | **Micro-edit** | "Ändra primärfärg till orange" / "Byt ut copy i hero h1" | `changeScope: copy`, `contextPolicy: light`, `verificationPolicy: fast`, **skip image-materialize** om inga nya bilder, **skip warm-tsc** om inga `.ts`-ändringar |
| 5 | **Local layout** | "Lägg en CTA i hero-sektionen" / "Flytta features-blocket före pricing" | `changeScope: local-layout`, `contextPolicy: light`, full validate men `verificationPolicy: fast` |
| 6 | **Page addition / capability** | "Lägg till en kontakt-sida med formulär" / "Lägg till parallax i hero" | `changeScope: page-addition`, `contextPolicy: normal`, full pipeline inkl. dep-completer + warm-tsc |
| 7 | **Redesign** | "Bygg om från scratch" / "Helt nytt visuellt språk" | `changeScope: redesign`, `contextPolicy: heavy`, full pipeline + verifier |
| 8 | **Integration** | "Koppla in Stripe" / "Sätt upp Supabase-DB" | `changeScope: integration`, `contextPolicy: heavy`, full pipeline + verifier + F3-flow + dossier-driven env-readiness gate |

---

## Klassifierare

**Strategi:** snabb regex-first, LLM-fallback bara när regex är osäker.

```
classifyRequestKind(message, fileContext, lifecycleStage)
  → "qa-or-score" | "external-fetch" | "multi-change" | "micro-edit"
  | "local-layout" | "page-addition" | "redesign" | "integration"
```

**Heuristik (regex/keyword, ingen LLM-cost):**
- **Q&A / Score**: prompten innehåller `?`, ord som "vad", "hur", "varför", "betyg", "poäng", "score", "kan du förklara" + INGEN ord som "ändra", "byt", "lägg till", "skapa". Score-frågor är typiskt korta + nämner "sida" eller "design".
- **External-fetch**: prompten innehåller en URL ELLER fraser som "hämta från", "ta från", "kopiera från X", "hitta bilder på", "få färgtema från", "scraping". URL-extraktor återanvänder `compressUrls`/`expandUrls`-helpers.
- **Multi-change**: explicit numerering ("gör 2 ändringar", "två saker"), kommaseparerade verb ("byt X OCH Y"), "samtidigt", "+", eller minst 2 distinkta changeScope-signaler (ex. en copy-instruktion + en page-addition). LLM-fallback för osäkra fall.
- **Micro-edit**: ord som "byt färg", "ändra text", "byt copy", "ändra h1", "rgb", "#hex", + längd <140 chars + INGA capability-keywords
- **Page-addition**: ord som "lägg till sida", "ny route", "skapa /<path>", + capability-keywords
- **Redesign**: triggers från befintliga `clear-redesign`-mönster (`classifyFollowUpIntent`)
- **Integration**: triggers från `inferPreGenerationContracts` när providers/env-keys nämns

**LLM-fallback** (en cheap-tier-call, t.ex. gpt-5.2):
Bara när regex returnerar `ambiguous`. Input: `prompt + previousFileSummary[ut max 1k chars]`. Output: en av de 5 klasserna + confidence. Cache på `sha256(prompt)` (24h, samma pattern som brief-cache).

---

## Plumbing

**Var hookas det in?**
- `chat-message-stream-post.ts` runt rad 271 (efter `orchestratePromptMessage`, före `previousFiles` resolution)
- Resultat injiceras i `OrchestrationInput` som `requestKind?: RequestKind`
- `deriveBuildSpec()` läser `requestKind` och overridar `contextPolicy` / `verificationPolicy` / `changeScope` när relevant
- Q&A-klass → kortsluter HELA codegen-flödet, returnerar bara assist-LLM-svar via SSE som `assistant-message` (inte `done`)

**Backwards compat:** Om klassifieraren failar eller är ny default-klass `unclassified` → kör befintlig pipeline oförändrat.

---

## Telemetri

- Logga `request_kind_classified{kind, source: regex|llm|fallback}` per request
- Mät P50 prompt-to-done per klass (separat från nuvarande `prompt_to_done_total`)
- Counter `pipeline_steps_skipped{step, request_kind}` när en pipeline-fas hoppas över

---

## Steg (faser)

| Fas | Vad | Risk | Estimerad effekt |
|---|---|---|---|
| **A** | Lägg till `RequestKind`-typ + `classifyRequestKind()` (regex-first) i ny modul `src/lib/gen/request-kind.ts`. Wira in i `OrchestrationInput`. **Bara klassifiera, inte förgrena.** Logga klassificering. | Låg | Mätbar baseline |
| **B** | Q&A / Score-shortcut: när klass = `qa-or-score`, kortslut till assist-LLM via befintlig `/api/ai/chat` + returnera SSE utan filgenerering. UI-ändring: visa svar i chat utan version-card. | Medel — UI-yta + ny SSE-händelsetyp | Stor — sparar 30-90s per Q&A-prompt |
| **C** | Micro-edit pipeline: när klass = `micro-edit`, sätt `contextPolicy: light`, `verificationPolicy: fast`, skip image-materialize om inga `<img>`-ändringar i diff. | Låg-medel | Medium — sparar 10-20s per micro-edit |
| **D** | Multi-change wrap: när klass = `multi-change`, kör `splitMultiChangePrompt(prompt)` och rendera `## Requested Changes (1/N)` i prompt-wrappen. Ingen ny build per change. | Låg | Bättre LLM-fokus på kompositprompts |
| **E** | External-fetch tool: implementera `fetchExternalArtifact(url, kind)` server-side (HTTP + safe parse — palette via dominant-color, text via readability, bilder via OG-tag). Injicera resultatet som `## External Reference`-block i system-prompten. | Medel — ny server-tool, behöver allowlist + timeout | Stor — låser upp "kopiera från X"-prompts |
| **F** | LLM-fallback för `ambiguous` klassificering med Redis-cache. | Låg | Hjälper edge cases |

**Hold-back:** Page-addition + redesign + integration kör befintlig pipeline. Vinsterna är på Q&A + micro-edit + multi-change-grenen.

---

## Risker

1. **Felklassificering** → user begär stor ändring men får mini-pipeline. Mitigera: konservativ regex (default till `unclassified`/full pipeline vid tveksamhet); gör inte page-addition→micro-edit downgrade.
2. **Q&A-shortcut bryter UI-flow** → version-cards saknas. UI måste hantera `assistant-only`-meddelanden.
3. **Skip-logik döljer buggar** → om vi skippar warm-tsc på micro-edits men edit:en ändå bryter typecheck, märks det först i preview. Mitigera: lägg till en "tryggare" version som ALLTID kör typecheck men skippar bara verifier+image-materialize.

---

## Avgränsningar (ut ur scope)

- Multi-prompt-orkestrering (två frågor → två builds → konsolidator-modell) — separat plan, kräver ny arkitektur
- Dynamisk `contextPolicy` via LLM-bedömning utöver `requestKind` — kan tillkomma senare
- Ändring av `BUILD_INTENT` system — ortogonalt

---

## Open questions

1. Q&A-klassen — ska den ha tillgång till project files för "vad finns i mitt projekt?"-frågor? Förslag: ja, men bara via `buildFileContext({ maxChars: 8_000, maxFilesWithContent: 0 })` (bara filträd).
2. Ska klassifierare köras på init också, eller bara follow-up? Förslag: bara follow-up i fas A; init är alltid full pipeline.
3. Vilken verifierings-policy ska micro-edit ha? Förslag: `fast` (skip verifier-LLM, behåll typecheck + build).

---

## Nästa steg

Användaren ger OK på taxonomi → Fas A implementeras (~30-60 min). Mätning i 1-2 dagar. Sedan B/C beslut.
