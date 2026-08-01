/**
 * SEO publish pass — audit, improve, then report what actually changed.
 *
 * The ordering matters and is the whole design:
 *
 *   1. **Audit** the files the deploy is about to ship.
 *   2. **Improve** them, driven by the findings (deterministic first, then the
 *      optional copy pass for the two fields a model is genuinely better at).
 *   3. **Report** by diffing before/after and re-auditing the result.
 *
 * Step 3 is what keeps the report honest. An improvement is only reported when
 * the file content genuinely differs, and `remaining` comes from a fresh audit
 * of the shipped files rather than from subtracting what we intended to fix.
 * The alternative — reporting the improver's intentions — is exactly the class
 * of false-green this repo keeps finding, so it is not available here.
 *
 * Never throws. SEO must not be able to block a publish: a crash here returns
 * the input files untouched with the reason recorded.
 */

import type { ProjectTextFile } from "@/lib/gen/scaffolds/seo-defaults";
import type { SeoBrand } from "@/lib/projects/preferences-schema";
import { auditProjectSeo } from "./audit";
import { applyDeterministicSeoImprovements } from "./improve";
import { improveSeoCopyWithLlm } from "./llm-copy";
import type { SeoImprovement, SeoPublishReport } from "./types";

export { auditProjectSeo, scoreFromFindings, PLACEHOLDER_SITE_URL } from "./audit";
export { applyDeterministicSeoImprovements } from "./improve";
export { improveSeoCopyWithLlm } from "./llm-copy";
export type {
  SeoAuditResult,
  SeoFinding,
  SeoFindingId,
  SeoImprovement,
  SeoPublishReport,
  SeoSeverity,
} from "./types";

export interface SeoPublishPassOptions {
  siteUrl: string;
  brand?: SeoBrand;
  language?: string;
  /** Model for the copy pass. Omit to run deterministic improvements only. */
  copyModelId?: string | null;
}

export interface SeoPublishPassResult {
  files: ProjectTextFile[];
  report: SeoPublishReport;
}

function toAuditFiles(files: ReadonlyArray<ProjectTextFile>) {
  return files.map((f) => ({ path: f.name, content: f.content }));
}

/**
 * Drop improvements whose file is byte-identical to how it started.
 *
 * An improver step can legitimately decide not to change anything (an
 * idempotent re-run, a regex that found nothing to replace) and still have
 * pushed an entry. Reporting those would mean telling the owner we fixed
 * something we did not.
 */
export function keepOnlyRealChanges(
  before: ReadonlyArray<ProjectTextFile>,
  after: ReadonlyArray<ProjectTextFile>,
  improvements: ReadonlyArray<SeoImprovement>,
): SeoImprovement[] {
  const beforeByName = new Map(before.map((f) => [f.name, f.content]));
  const afterByName = new Map(after.map((f) => [f.name, f.content]));
  return improvements.filter((improvement) => {
    const previous = beforeByName.get(improvement.file);
    const next = afterByName.get(improvement.file);
    // A newly added file has no `previous` — that is a real change.
    if (previous === undefined) return next !== undefined;
    return previous !== next;
  });
}

/**
 * Drop improvements whose finding survived them.
 *
 * A changed file is necessary evidence but not sufficient: the copy pass
 * rewrites the title whenever the model answers, so a reply that is still 80
 * characters long changes the file AND leaves `title-too-long` standing. The
 * report would then list the same defect under both "Åtgärdat" and "Kvar att
 * göra", which is worse than saying nothing — it claims a fix the owner can
 * see is not there.
 *
 * Matching is per finding id AND file, so a rewrite that trades one defect for
 * another (`title-too-short` gone, `title-too-long` new) still counts as the
 * fix it was, with the new defect reported honestly beside it.
 */
export function dropUnresolvedImprovements(
  improvements: ReadonlyArray<SeoImprovement>,
  remaining: ReadonlyArray<{ id: string; file: string }>,
): SeoImprovement[] {
  const stillPresent = new Set(remaining.map((f) => `${f.id}\u0000${f.file}`));
  return improvements.filter(
    (improvement) => !stillPresent.has(`${improvement.findingId}\u0000${improvement.file}`),
  );
}

export async function runSeoPublishPass(
  files: ReadonlyArray<ProjectTextFile>,
  options: SeoPublishPassOptions,
): Promise<SeoPublishPassResult> {
  const before = auditProjectSeo(toAuditFiles(files));

  try {
    const deterministic = applyDeterministicSeoImprovements(files, before, {
      siteUrl: options.siteUrl,
      brand: options.brand,
      language: options.language,
    });

    let working = deterministic.files;
    let improvements: SeoImprovement[] = [...deterministic.improvements];
    let llmSkippedReason: string | null = null;

    if (options.copyModelId) {
      // Re-audit first: the deterministic step can fill a missing title or
      // description from the brand, and driving the copy pass off the stale
      // `before` audit would spend a model call rewriting a field that is
      // already correct — and overwrite what the brand just supplied.
      const afterDeterministic = auditProjectSeo(toAuditFiles(working));
      const copy = await improveSeoCopyWithLlm(working, afterDeterministic, {
        modelId: options.copyModelId,
        brand: options.brand,
        language: options.language,
      });
      working = copy.files;
      improvements = [...improvements, ...copy.improvements];
      llmSkippedReason = copy.skippedReason;
    } else {
      llmSkippedReason = "copy_pass_disabled";
    }

    const after = auditProjectSeo(toAuditFiles(working));
    return {
      files: working,
      report: {
        before,
        after,
        improvements: dropUnresolvedImprovements(
          keepOnlyRealChanges(files, working, improvements),
          after.findings,
        ),
        remaining: after.findings,
        llmSkippedReason,
      },
    };
  } catch (err) {
    // Publishing must not fail because SEO did. Ship the original files and
    // say so, rather than half-applied output nobody audited.
    console.error("[seo] Publish pass failed, shipping files unchanged:", err);
    return {
      files: files as ProjectTextFile[],
      report: {
        before,
        after: before,
        improvements: [],
        remaining: before.findings,
        llmSkippedReason: "seo_pass_error",
      },
    };
  }
}
