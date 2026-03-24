# Post-mortem: v0-fallback-myt, env och dokumentation (2026-03-24)

Källa: fyra LLM-granskningar under `pot_buggs/buggar _llm/` (fzrm, hxmp, kzwr, qvnj).

## Vad som var fel i praktiken

- **Dokumentations-/kontraktsbrist (åtgärdad):** `src/lib/gen/README.md`, filhuvuden i `v0.ts` / `v0-generator.ts`, cursor-regler, flera arkitekturdoc och `ENV.md` påstod att `V0_FALLBACK_BUILDER` växlade builder-codegen till v0 Platform API via `createGenerationPipeline`. I kod anropar `src/lib/gen/fallback.ts` alltid own-engine; en `createV0FallbackStream` fanns aldrig.
- **`V0_FALLBACK_BUILDER=n`:** Variabeln lästes inte i runtime före denna ändring, så `n` kan inte i sig ha brutit codegen via den flaggan; förvirring kom från felaktiga docs snarare än från parsning.

## Vad som gjordes

- **Sanning i kod och README:** `fallback.ts` och `gen/README.md` beskriver own-engine only; v0 SDK kvar för mall/registry/zip m.m.
- **Delad parsning:** `src/lib/env-affirmative.ts` med `isAffirmativeEnvValue` / `sanitizeEnvString`; `env.ts` använder och re-exporterar; tydlig semantik: endast `y`/`yes`/`true`/`1`/`on` är på.
- **Serverhjälpare:** `isV0BuilderPreviewFallbackEnabled()` i `env.ts` (preview-flagga, inte codegen).
- **Builder-preview:** `next.config.ts` exponerar `NEXT_PUBLIC_V0_BUILDER_PREVIEW_FALLBACK`; `src/lib/builder/v0-preview-priority.ts` + `src/app/builder/useBuilderPageController.ts` föredrar `*.vusercontent.net` före sandbox när flaggan är på och båda URL:er finns.
- **Doc/cursor/policy:** Uppdaterat `docs/ENV.md`, `v0-soft-deprecation.md`, `prompt-tree.md`, `engine-status.md`, `meritmind-build-flows.md`, `.cursor/rules/terminology.mdc`, `project-overview.mdc`, `config/env-policy.json`.
- **Tester:** `src/lib/env-affirmative.test.ts`.

## Medvetet ej åtgärdat (ingår inte i scope)

- Byte från AI SDK till rå OpenAI/Anthropic REST.
- Omdöpning av `/api/v0/*` till annat prefix.
- Browser-autofix som standard, obligatorisk LLM-uppföljning, sammanslagning av dubbla LLM-fixpipelines, “Gravity”.

## Övriga observationer (inte egna buggfixar i denna runda)

Under samma fyra rapporter dök följande upp som **risker eller backlog**, inte som verifierade runtime-buggar vi åtgärdade:

| Tema | Kort kommentar |
|------|----------------|
| **AI SDK överallt** | Arkitekturval; `streamText` + `@ai-sdk/*` är avsiktligt tills en eventuell migration till rå REST. |
| **Prefix `/api/v0/`** | Naming-debt; egen motor bor i samma route-träd som historiska v0-proxy — kan förvirra nya utvecklare. |
| **Dubblerad LLM-fix** | `validateAndFix` vs `runFinalizePreflight` (qvnj): risk för divergerande beteende över tid; refaktor snarare än en enkel bugfix. |
| **Browser-autofix av** | Produktsbeslut (`useAutoFix`); rapporterna noterar att preview-fel inte alltid triggar auto-omgenerering utan flagga/query. |
| **“Uppföljningsprompt”** | Produktgap om kravet är alltid LLM-genererad nästa steg; idag fri assistenttext + heuristiska post-checks. |
| **Klargörande före bygg** | UX-risk: användare kan uppleva “ingenting hände” om UI inte förtydligar att svaret är en fråga, inte codegen (fzrm). |
| **SQLite vs Postgres i äldre text** | Dokumentationsdrift i enstaka anteckningar; kanon är Postgres/Drizzle i aktuell kodbas (kzwr). |
| **Gravity** | Nämnd som önskad stack men ingen tydlig dependency som Fiber/Three — framtida capability om produkt väljer bibliotek. |
