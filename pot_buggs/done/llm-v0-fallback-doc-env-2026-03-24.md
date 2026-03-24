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
