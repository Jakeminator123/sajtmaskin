---
paths:
  - "sajtmaskin_backoffice.py"
  - "backoffice/**"
  - "config/codegen-core-manifest.json"
  - "config/prompt-core/**"
  - "config/integrations/**"
  - "config/ai_models/**"
  - "config/scaffold-variants/**"
  - "src/lib/gen/**"
  - "src/lib/providers/own-engine/**"
  - "src/lib/models/**"
  - "src/lib/builder/**"
  - "docs/architecture/**"
  - "docs/schemas/**"
---

<!-- Genererad av npm run claude:sync från .cursor/rules/pipeline-rules.mdc — redigera källan, inte den här filen. -->

# Pipeline-regler

Stärk prompt/kontrakt först. Nytt orkestreringssteg, fixer eller signal bara
när befintlig ägare inte räcker. Single sources: intent, prompt composition,
runtime status, repair gate, F2/F3 (`docs/architecture/README.md`). Importera
från mapparna, inte gamla toppfiler: `src/lib/gen/system-prompt/`,
`src/lib/gen/build-spec/`, `src/lib/gen/stream/finalize-version/`,
`src/lib/builder/prompt-assist/`.

När runtime-sanning, env, schema, signal eller adminflöde ändras: ändra
ägaren → uppdatera schema/validator bara om kontraktet kräver det →
`npm run docs:generate` → `docs:check` / `docs:links` + domänvalidatorer.
Handskriven modell bara om stabil semantik ändras. Se
`docs/documentation-lifecycle.md`.

Innan ny callsite till `runLlmFixer`: kolla befintlig repair-gate /
verifier-loop / partial-file-repair.
