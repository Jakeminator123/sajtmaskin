/**
 * Dossier manifest validator — the ONE source of truth for manifest shape.
 *
 * Replaces three drift-prone validators:
 *   - docs/schemas/strict/dossier.schema.json (was IDE-only, never run at runtime)
 *   - backoffice/pages/dossiers.py _validate_manifest (handwritten Python)
 *   - scripts/dossiers/curate-from-reference.ts assertManifestShape (mini-version)
 *
 * All three now go through this module (backoffice via a small node helper,
 * curate via direct import). Registry uses `validateDossierManifest` to REJECT
 * invalid manifests (returns null → excluded from the pool) so a malformed
 * dossier can't silently participate in prompt injection.
 *
 * See OMTAG/fas2/D-dossier-contract.md for the full contract and rationale.
 */
import Ajv, { type ValidateFunction } from "ajv";

import dossierSchema from "../../../../docs/schemas/strict/dossier.schema.json";

import type { DossierClass, DossierEntry } from "./types";

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
// Silence repeated `unknown format "uri" ignored in schema` warnings without
// adding the full `ajv-formats` dependency. We don't actually need uri format
// validation here — sourceRepoUrl is curator-supplied and string-typed is
// enough. Registering as no-op just stops the warning at compile time.
ajv.addFormat("uri", true);
const _validate: ValidateFunction = ajv.compile(dossierSchema);

export interface DossierValidationContext {
  /** Directory name; must match manifest.id. */
  expectedId: string;
  /** Folder class (`hard` | `soft`). */
  class: DossierClass;
}

export type DossierValidationOk = {
  valid: true;
  /** Raw manifest cast to the runtime shape once AJV says it's well-formed. */
  data: Omit<DossierEntry, "class" | "instructions">;
  warnings: string[];
};

export type DossierValidationErr = {
  valid: false;
  errors: string[];
};

export type DossierValidationResult = DossierValidationOk | DossierValidationErr;

/**
 * Validate a parsed manifest against the strict JSON schema + expected id.
 *
 * Returns `{ valid: true, data, warnings }` when the manifest is usable, or
 * `{ valid: false, errors }` when it must be rejected. `warnings` is a
 * currently-unused channel for non-blocking advisories so callers don't need
 * to reshape their logic when we add soft checks later.
 */
export function validateDossierManifest(
  raw: unknown,
  context: DossierValidationContext,
): DossierValidationResult {
  const errors: string[] = [];

  const ok = _validate(raw);
  if (!ok && _validate.errors) {
    for (const e of _validate.errors) {
      const loc = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "/";
      errors.push(`${loc} ${e.message ?? "invalid"}`);
    }
  }

  if (typeof raw === "object" && raw !== null) {
    const id = (raw as { id?: unknown }).id;
    if (id !== context.expectedId) {
      errors.push(
        `manifest.id (${JSON.stringify(id)}) does not match directory name (${JSON.stringify(
          context.expectedId,
        )})`,
      );
    }
  } else {
    errors.push("manifest must be a JSON object");
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: raw as DossierValidationOk["data"],
    warnings: [],
  };
}

/**
 * Aggregated cross-dossier check: `defaultForCapability: true` must be unique
 * per capability. Returns a list of error strings (empty if all good).
 *
 * Called by `scripts/dossiers/validate-all.ts`. Not used by registry runtime
 * (which would need the full pool; this is a batch-time invariant).
 */
export function findDuplicateDefaults(
  entries: Array<{ id: string; capability: string; defaultForCapability: boolean }>,
): string[] {
  const byCap = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.defaultForCapability) continue;
    const list = byCap.get(e.capability) ?? [];
    list.push(e.id);
    byCap.set(e.capability, list);
  }
  const errors: string[] = [];
  for (const [cap, ids] of byCap) {
    if (ids.length > 1) {
      errors.push(
        `capability "${cap}" has ${ids.length} dossiers with defaultForCapability=true: ${ids
          .sort()
          .join(", ")} (must be exactly one per capability)`,
      );
    }
  }
  return errors;
}

/**
 * Canonical rubriker for dossier instructions.md. Split into two tiers so
 * existing hand-crafted dossiers (that use domain-specific heading names
 * like "Composition rules" or "Verification checklist") don't get rejected
 * for prose style, only for structural absence.
 *
 * Required (block pool load if missing): high-signal blocks every dossier
 * actually needs to be selectable + integrable.
 *
 * Recommended (warning only): rubriker som guiderar LLM:en men finns ofta
 * insprängt i andra sektioner i handkuraterade dossiers.
 */
export const REQUIRED_INSTRUCTIONS_HEADINGS: readonly string[] = [
  "When to use",
  "How to integrate",
] as const;

export const RECOMMENDED_INSTRUCTIONS_HEADINGS: readonly string[] = [
  "UX rules",
  "Avoid",
  "Verification",
] as const;

/**
 * Partitioned rubrik-check for instructions.md.
 *
 * `missingRequired` → these block validation (registry would reject).
 * `missingRecommended` → surfaced as warnings; dossier still loads.
 *
 * Case-insensitive substring match so "Verification checklist (…)" counts
 * as satisfying "Verification".
 */
export function findMissingInstructionsHeadingsPartitioned(markdown: string): {
  missingRequired: string[];
  missingRecommended: string[];
} {
  const headingsSeen: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    headingsSeen.push(m[1].trim().toLowerCase());
  }
  const hasHeading = (required: string): boolean => {
    const needle = required.toLowerCase();
    return headingsSeen.some((h) => h.includes(needle));
  };
  const missingRequired: string[] = [];
  for (const required of REQUIRED_INSTRUCTIONS_HEADINGS) {
    if (!hasHeading(required)) missingRequired.push(required);
  }
  const missingRecommended: string[] = [];
  for (const recommended of RECOMMENDED_INSTRUCTIONS_HEADINGS) {
    if (!hasHeading(recommended)) missingRecommended.push(recommended);
  }
  return { missingRequired, missingRecommended };
}

/**
 * Back-compat convenience: returns only the blocking list (required).
 * Prefer `findMissingInstructionsHeadingsPartitioned` when you also want
 * the warning channel.
 */
export function findMissingInstructionsHeadings(markdown: string): string[] {
  return findMissingInstructionsHeadingsPartitioned(markdown).missingRequired;
}
