/**
 * Fasad för import-validator (den regex-/radbaserade import-kirurgin i
 * Normalize). Implementationen ligger i `import-validator-steps/` sedan
 * 2026-08-04 (mekanisk uppdelning, oförändrad publik yta):
 *   import-validator-steps/bound-names.ts             → collectImportBoundNames
 *   import-validator-steps/known-imports.ts           → KNOWN_MODULE_SPECIFIERS m.fl.
 *   import-validator-steps/import-statements.ts       → IMPORT_RE + validateImports
 *   import-validator-steps/nested-import-blocks.ts    → fixNestedImportBlocks
 *   import-validator-steps/duplicate-default-export.ts→ fixDuplicateDefaultExport
 *   import-validator-steps/shadcn-imports.ts          → fixShadcnImports
 *   import-validator-steps/lucide-imports.ts          → fixLucideImports
 *   import-validator-steps/radix-imports.ts           → fixRadixImports/-SlotUsage
 *   import-validator-steps/missing-imports.ts         → detectMissingImports
 *   import-validator-steps/icon-value-imports.ts      → fixMissingIconValueImports
 *   import-validator-steps/run-import-validator.ts    → runImportValidator(+Guarded)
 *
 * Körordningen mellan stegen ägs av `run-import-validator.ts`.
 */
export { collectImportBoundNames } from "./import-validator-steps/bound-names";
export { KNOWN_MODULE_SPECIFIERS } from "./import-validator-steps/known-imports";
export {
  runImportValidator,
  runImportValidatorGuarded,
} from "./import-validator-steps/run-import-validator";
