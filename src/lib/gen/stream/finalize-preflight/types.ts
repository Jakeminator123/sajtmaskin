import type { CodeFile } from "@/lib/gen/parser";
import type { ProjectEnvLocalOptions } from "@/lib/gen/export/project-scaffold";
import type { RoutePlan } from "@/lib/gen/route-plan";
import type { FixEntry } from "@/lib/gen/autofix/types";
import type { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import type { CanonicalModelId } from "@/lib/models/catalog";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { PreviewStartContract } from "../preflight-contract";
import type { FinalizePreflightIssue } from "./issues";

export interface RunFinalizePreflightParams {
  chatId: string;
  model: string;
  resolvedTier?: CanonicalModelId;
  filesJson: string;
  buildSpec?: BuildSpec | null;
  routePlan?: RoutePlan | null;
  orchestrationContract?: OrchestrationContract | null;
  originalPrompt?: string;
  repairLedger?: RepairLedger;
  repairScopeId?: string;
  /**
   * Limits the pipeline-authored `.env.local` persisted by the scaffold merge.
   * Preview still builds its runtime env independently.
   */
  projectEnvLocalOptions?: ProjectEnvLocalOptions;
  /**
   * Base-version files (previous version / imported template) the merged
   * output was built on. Used ONLY to protect inherited content from the
   * degeneracy cap: a merged file whose content is byte-identical with the
   * base version is by definition not this round's degenerate output and must
   * never be stubbed (prod chat 4d6b5546: an imported template's 1.3 MB
   * texture was destroyed by the cap on the first follow-up).
   */
  previousFiles?: ReadonlyArray<Pick<CodeFile, "path" | "content">>;
  /**
   * True for verbatim imported-repo edits (v0-template chats). Two effects:
   *
   * 1. Skips the own-engine project assembly (`buildCompleteProject` +
   *    `repairGeneratedFiles`): no scaffold-file injection, no baseline
   *    `package.json` merge/force-pins (next/react/react-dom/lucide), no
   *    mechanical autofix pass over the whole repo. The imported repo keeps
   *    its own dependency versions, lockfile consistency, config files and
   *    structure — parity with the verbatim init import (`skipRepair` +
   *    `skipProjectScaffold` in `/api/template`).
   * 2. Relaxes ONLY the scaffold-*contract* check (project-sanity) from
   *    blocking errors to non-blocking warnings — an arbitrary v0 repo does
   *    not conform to the own-engine scaffold contract.
   *
   * Render-safety gates stay blocking for all chats: the composition-aware
   * home-route gate (a dropped/broken page or missing delegated component
   * must still block, not ship blank), merged-syntax, degeneracy, and
   * buildable-preview.
   */
  importedRepoMode?: boolean;
}

export interface RunFinalizePreflightResult {
  filesJson: string;
  finalizedFilesForPreview: CodeFile[];
  preflightFileCount: number;
  preflightIssues: FinalizePreflightIssue[];
  previewBlockingReason: string | null;
  previewStart: PreviewStartContract;
  unresolvedImportFallbackUsed: boolean;
  /**
   * Fixes from the post-merge `repairGeneratedFiles()` lane that mutated the
   * PERSISTED files. Previously these only reached the ephemeral devLog, so a
   * post-merge fixer that broke a site (layout-provider-fixer, prod chat
   * e8bd3ba6 2026-08-01) was invisible in prod telemetry. The finalize runner
   * merges these into `generation_telemetry.meta.autofix.fixers`.
   */
  postMergeFixes: FixEntry[];
}
