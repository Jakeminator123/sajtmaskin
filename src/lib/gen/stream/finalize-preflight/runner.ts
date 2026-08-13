import { buildPreviewHtml } from "@/lib/gen/preview/build-preview-document";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "@/lib/gen/parser";
import { buildCompleteProject } from "@/lib/gen/export/project-scaffold";
import { collectRequiredUiComponents } from "@/lib/gen/export/project-scaffold-ui-reader";
import {
  extractAppRoutePathsFromFilePaths,
  findMissingPlannedRoutes,
  getRoutePlanPrimarySource,
} from "@/lib/gen/route-plan";
import { repairGeneratedFiles } from "@/lib/gen/autofix/repair-generated-files";
import type { FixEntry } from "@/lib/gen/autofix/types";
import {
  completeProjectDependencies,
  detectLockfilePackageManager,
  markLockfileStaleInFiles,
} from "@/lib/gen/autofix/dep-completer";
import { capDegeneratePayload, detectDegenerateFiles } from "@/lib/gen/verify/degeneracy-guard";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { RepairLedger, runLlmRepairGate } from "@/lib/gen/autofix/llm-repair-gate";
import { partitionGeneratedFilesForProtectedPaths } from "@/lib/gen/scaffolds/protected-paths";
import { devLogAppend } from "@/lib/logging/dev-log";
import { buildPreviewStartContract } from "../preflight-contract";
import {
  collectBaseIdenticalPaths,
  inferCodeFenceLanguage,
  looksLikeEmptyPage,
  removeLiteralRouteDuplicates,
  resolveAppPagePath,
} from "./file-heuristics";
import {
  createIssue,
  describePreviewBlockFromIssues,
  type FinalizePreflightIssue,
} from "./issues";
import { buildMissingHomeRouteIssue, findHomePageFile } from "./home-route-analysis";
import {
  HOME_ROUTE_RECOVERY_PATH,
  tryRecoverMissingHomeRoute,
} from "./home-route-recovery";
import {
  buildContractBackedRoutePlan,
  collectOrchestrationContractIssues,
} from "./orchestration-contract-checks";
import { runFinalizePreflightAll } from "./passes";
import { ensureDeferredRouteShells } from "./route-shells";
import type { RunFinalizePreflightParams, RunFinalizePreflightResult } from "./types";

export async function runFinalizePreflight({
  chatId,
  model: _model,
  resolvedTier: _resolvedTier,
  filesJson,
  buildSpec = null,
  routePlan = null,
  orchestrationContract = null,
  originalPrompt: _originalPrompt,
  repairLedger: providedRepairLedger,
  repairScopeId,
  projectEnvLocalOptions,
  importedRepoMode = false,
  previousFiles,
}: RunFinalizePreflightParams): Promise<RunFinalizePreflightResult> {
  const repairLedger = providedRepairLedger ?? new RepairLedger();
  const previousContentByPath = new Map(
    (previousFiles ?? []).map((file) => [file.path, file.content] as const),
  );
  let nextFilesJson = filesJson;
  const preflightIssues: FinalizePreflightIssue[] = [];
  let preflightFileCount = 0;
  let previewBlockingReason: string | null = null;
  let finalizedFilesForPreview: CodeFile[] = [];
  let unresolvedImportFallbackUsed = false;
  let postMergeFixes: FixEntry[] = [];
  let previewStart = buildPreviewStartContract({
    issues: [],
    finalizedPreviewFileCount: 0,
  });

  try {
    let finalFiles = (
      JSON.parse(nextFilesJson) as Array<{ path: string; content: string; language?: string }>
    ).map((file) => ({ ...file, language: file.language || "tsx" }));

    // GUARD 0 — last-line defence for SCAFFOLD_PROTECTED_PATHS.
    //
    // `mergeGeneratedProjectFiles` (upstream of this function) already
    // partitions LLM-broken protected paths out of `generatedFiles` before
    // merging with the scaffold base. Empirically (eval restaurant /
    // booking-service / multi-page-brochure / consultant-landing
    // 2026-04-27) we still see broken `app/api/placeholder/route.ts`
    // arriving here, which means *some* upstream code path either
    //   (a) bypasses partitionGeneratedFilesForProtectedPaths in merge, or
    //   (b) re-introduces the LLM emission between merge and preflight.
    //
    // Until that source is pinned, run partition once on the parsed
    // input. `buildCompleteProject` lower in this function injects the
    // scaffold default for any path that ends up missing, so dropping
    // is safe — we will never persist a route.ts without route.ts.
    {
      const partition = partitionGeneratedFilesForProtectedPaths(finalFiles);
      if (partition.dropped.length > 0) {
        const droppedPaths = partition.dropped.map((f) => f.path);
        finalFiles = partition.kept;
        nextFilesJson = JSON.stringify(finalFiles);
        console.warn(
          "[finalize-preflight] Initial post-merge files contained scaffold-protected paths — dropped to keep scaffold default",
          { chatId, droppedPaths },
        );
        devLogAppend("in-progress", {
          type: "scaffold-protected-overwrite-blocked",
          chatId,
          branch: "post-merge-initial-parse",
          droppedPaths,
        });
      }
    }

    // Early degenerate/oversized-output guard (M#og1). Runs BEFORE the
    // merged-syntax validation + LLM repair escalation and before
    // `buildCompleteProject`, so a multi-MB / self-repetitive project never
    // churns the preflight LLM repair (Codex #322) and the bloat is not
    // persisted whole. The offending file is replaced with a small marker stub
    // and a blocking `code_structure_failure` issue is recorded; the rest of
    // preflight then runs cheaply on the trimmed content, and the issue gates
    // preview-start + verification through the normal preflight contract.
    {
      const baseIdenticalPaths = collectBaseIdenticalPaths(
        finalFiles,
        previousContentByPath,
      );
      const degeneracy = detectDegenerateFiles(finalFiles, undefined, {
        preservePaths: baseIdenticalPaths,
      });
      if (degeneracy.degenerate) {
        // Fully de-bloat via capDegeneratePayload (stub ALL oversized files +
        // largest until total is under cap) — not just the single named file —
        // so the total-size / split-bloat case is handled here too and the
        // merged-syntax repair below never runs on bloat (Bugbot #322).
        // The cap is binary-aware and skips base-identical inherited content,
        // so it can legitimately stub NOTHING (e.g. detection flagged an
        // imported template's large binary asset — prod chat 4d6b5546); the
        // blocking issue below still gates preview either way.
        const capped = capDegeneratePayload(finalFiles, degeneracy.reason, {
          preservePaths: baseIdenticalPaths,
        });
        if (capped.stubbedPaths.length > 0) {
          finalFiles = capped.files;
          nextFilesJson = JSON.stringify(finalFiles);
        }
        preflightIssues.push(
          createIssue(
            degeneracy.file ?? "preflight",
            "error",
            `Degenerate output blocked: ${degeneracy.reason}`,
            "code_structure_failure",
          ),
        );
        previewBlockingReason =
          previewBlockingReason ?? `Degenerate output blocked: ${degeneracy.reason}`;
        devLogAppend("in-progress", {
          type: "degenerate-output.blocked",
          chatId,
          branch: "pre-assembly",
          file: degeneracy.file,
          reason: degeneracy.reason,
          stubbedPaths: capped.stubbedPaths,
          sizeBytes: degeneracy.sizeBytes,
          repeatedLine: degeneracy.repeatedLine,
          repeatCount: degeneracy.repeatCount,
        });
      }
    }

    const shellFill = ensureDeferredRouteShells({ files: finalFiles, routePlan, buildSpec });
    finalFiles = shellFill.files;
    if (shellFill.addedPaths.length > 0) {
      nextFilesJson = JSON.stringify(finalFiles);
      devLogAppend("in-progress", {
        type: "route-shells.added",
        chatId,
        paths: shellFill.addedPaths,
      });
    }
    if (shellFill.preservedRealPaths.length > 0) {
      // Add-only guard fired: the model's real page for a deferred route was
      // kept instead of being overwritten by a generic shell. Loud so the
      // "shell silently replaced my real page" fidelity loss is observable.
      devLogAppend("in-progress", {
        type: "route-shells.preserved-real-page",
        chatId,
        paths: shellFill.preservedRealPaths,
      });
    }

    // Imported repos skip the own-engine mechanical fixer pass (parity with
    // the verbatim init import's `skipRepair`) — the rules are tuned for the
    // scaffold stack and must not rewrite an arbitrary repo. Merged-syntax
    // validation and the render-safety gates below still run.
    const repairResult = importedRepoMode
      ? { files: finalFiles, fixes: [] }
      : repairGeneratedFiles(finalFiles);
    finalFiles = repairResult.files;
    postMergeFixes = repairResult.fixes;
    if (repairResult.fixes.length > 0) {
      nextFilesJson = JSON.stringify(finalFiles);
      devLogAppend("in-progress", {
        type: "file-repair",
        chatId,
        fixes: repairResult.fixes,
      });
    }

    const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");
    let mergedProjectContent = serializeCodeProject(
      finalFiles.map((file) => ({
        ...file,
        language: file.language || inferCodeFenceLanguage(file.path),
      })),
    );
    let mergedSyntax = await validateGeneratedCode(mergedProjectContent);
    if (!mergedSyntax.valid) {
      devLogAppend("in-progress", {
        type: "merged-syntax.invalid",
        chatId,
        errorCount: mergedSyntax.errors.length,
        errors: mergedSyntax.errors.slice(0, 8),
      });

      // Repair-loop hardening C — skip the LLM-fixer escalation when only
      // merged-syntax fails. Stream-syntax already passed (otherwise we
      // would not be here) so merged-only failures are nearly always import
      // re-stiging, comment stripping, or a duplicate export — all cleanly
      // handled by the deterministic mechanical pipeline. Saves 1 (often
      // wasted) LLM-fixer call per follow-up.
      //
      // Inlined unconditionally 2026-04-28 (was hardcoded ON since
      // omtag-04 / 2026-04-23 via FEATURES.skipDoubleValidateAndFixOnMerge).
      const mechanicalStartedAt = Date.now();
      try {
        const mechanicalResult = await runAutoFix(mergedProjectContent, {
          chatId,
          model: _model,
          // Thread the version's real policy: with `undefined` the tier-3 SDK
          // guard in the autofix pipeline treats the project as F2 and can
          // strip genuine integration imports from an F3 (fidelity3) build.
          previewPolicy: buildSpec?.previewPolicy,
        });
        mergedProjectContent = mechanicalResult.fixedContent;
        mergedSyntax = await validateGeneratedCode(mergedProjectContent);
        devLogAppend("in-progress", {
          type: "merged-syntax.mechanical-only.result",
          chatId,
          fixCount: mechanicalResult.fixes.length,
          warningCount: mechanicalResult.warnings.length,
          durationMs: Date.now() - mechanicalStartedAt,
          stillInvalid: !mergedSyntax.valid,
        });
        if (mechanicalResult.fixes.length > 0) {
          const fixedProject = parseCodeProject(mergedProjectContent);
          if (fixedProject.files.length > 0) {
            // Belt-and-braces: mechanical autofix is deterministic and
            // unlikely to (re)emit `app/api/placeholder/route.ts`, but
            // mirror the post-LLM-escalation guard so any future fixer
            // that does mutate the project payload cannot bypass
            // SCAFFOLD_PROTECTED_PATHS via this code path.
            const partition =
              partitionGeneratedFilesForProtectedPaths(fixedProject.files);
            finalFiles = partition.kept;
            if (partition.dropped.length > 0) {
              const droppedPaths = partition.dropped.map((f) => f.path);
              mergedProjectContent = serializeCodeProject(finalFiles);
              mergedSyntax = await validateGeneratedCode(mergedProjectContent);
              console.warn(
                "[finalize-preflight] Mechanical autofix output contained scaffold-protected paths — dropped to keep scaffold default",
                { chatId, droppedPaths },
              );
              devLogAppend("in-progress", {
                type: "scaffold-protected-overwrite-blocked",
                chatId,
                branch: "post-merge-mechanical",
                droppedPaths,
              });
            }
            nextFilesJson = JSON.stringify(finalFiles);
          }
        }
      } catch (mechErr) {
        console.warn(
          "[merged-syntax] mechanical-only autofix failed, keeping invalid content:",
          mechErr,
        );
        devLogAppend("in-progress", {
          type: "merged-syntax.mechanical-only.error",
          chatId,
          message:
            mechErr instanceof Error ? mechErr.message : "Unknown mechanical autofix error",
        });
      }

      // Escalate to LLM repair whenever merged syntax is still invalid after
      // the mechanical pass. Previous version required mechanicalFixCount === 0
      // which (a) missed the throw case (count stays null) and (b) silently
      // skipped escalation when mechanical applied unrelated fixes (e.g. an
      // import) but the underlying brace/parse error remained. The failure
      // mode that motivated this gate (the v2/flying-can `Unexpected "}"`)
      // happens precisely when mechanical can't see the brace context.
      //
      // Inlined unconditionally 2026-04-28 (was hardcoded ON since omtag-04
      // via FEATURES.escalateMergeSyntaxToLlm).
      if (!mergedSyntax.valid) {
        const errorsBefore = mergedSyntax.errors.length;
        const requiredFiles = [
          ...new Set(
            mergedSyntax.errors
              .map((error) => error.file)
              .filter((file): file is string => Boolean(file)),
          ),
        ];
        try {
          const repairGate = await runLlmRepairGate({
            content: mergedProjectContent,
            errors: mergedSyntax.errors.map(
              (error) => `${error.file}:${error.line}:${error.column} ${error.message}`,
            ),
            chatId,
            timeoutMs: 60_000,
            ...(requiredFiles.length > 0 ? { requiredFiles } : {}),
            scopeId: repairScopeId,
            phase: "merged-syntax",
            ledger: repairLedger,
          });
          const repairResult = repairGate.result;
          let errorsAfter = errorsBefore;
          let fixed = false;
          if (
            (repairResult.success || repairResult.partial) &&
            typeof repairResult.fixedContent === "string"
          ) {
            const llmValidation = await validateGeneratedCode(repairResult.fixedContent);
            errorsAfter = llmValidation.errors.length;
            if (llmValidation.valid || errorsAfter < errorsBefore) {
              mergedProjectContent = repairResult.fixedContent;
              mergedSyntax = llmValidation;
              const repairedProject = parseCodeProject(mergedProjectContent);
              // Block the post-merge LLM-escalation bypass of
              // SCAFFOLD_PROTECTED_PATHS: runLlmRepairGate is given the
              // merged project (which contains the canonical scaffold
              // version of protected paths after finalize-merge's
              // partition) and can re-emit broken JSX-in-`.ts` versions
              // while fixing unrelated syntax errors. Drop those LLM
              // emissions; `buildCompleteProject` lower in this function
              // re-injects the scaffold default for any path that's
              // missing afterwards.
              const partition =
                partitionGeneratedFilesForProtectedPaths(repairedProject.files);
              finalFiles = partition.kept;
              if (partition.dropped.length > 0) {
                const droppedPaths = partition.dropped.map((f) => f.path);
                mergedProjectContent = serializeCodeProject(finalFiles);
                mergedSyntax = await validateGeneratedCode(mergedProjectContent);
                errorsAfter = mergedSyntax.errors.length;
                console.warn(
                  "[finalize-preflight] LLM-escalation re-emitted scaffold-protected paths — dropped to keep scaffold default",
                  { chatId, droppedPaths },
                );
                devLogAppend("in-progress", {
                  type: "scaffold-protected-overwrite-blocked",
                  chatId,
                  branch: "post-merge-llm-escalation",
                  droppedPaths,
                });
              }
              nextFilesJson = JSON.stringify(finalFiles);
              fixed = true;
            }
          }
          devLogAppend("in-progress", {
            type: "merged-syntax.llm-escalation",
            chatId,
            errorsBefore,
            errorsAfter,
            fixed,
          });
        } catch (llmErr) {
          devLogAppend("in-progress", {
            type: "merged-syntax.llm-escalation.error",
            chatId,
            message: llmErr instanceof Error ? llmErr.message : "Unknown LLM escalation error",
          });
        }
      }

      if (!mergedSyntax.valid) {
        preflightIssues.push(
          ...mergedSyntax.errors.slice(0, 20).map((error) =>
            createIssue(
              error.file,
              "error",
              `Merged syntax error line ${error.line}:${error.column} — ${error.message}`,
            )
          ),
        );
      }
    }

    const homeRecovery = await tryRecoverMissingHomeRoute({
      chatId,
      resolvedTier: _resolvedTier,
      files: finalFiles,
      originalPrompt: _originalPrompt,
      buildSpec,
      routePlan,
      repairLedger,
      repairScopeId,
    });
    if (homeRecovery.attempted) {
      if (homeRecovery.recovered) {
        finalFiles = homeRecovery.files;
        nextFilesJson = JSON.stringify(finalFiles);
        mergedProjectContent = serializeCodeProject(
          finalFiles.map((file) => ({
            ...file,
            language: file.language || inferCodeFenceLanguage(file.path),
          })),
        );
        mergedSyntax = await validateGeneratedCode(mergedProjectContent);
        devLogAppend("in-progress", {
          type: "home-route-recovery.succeeded",
          chatId,
          path: HOME_ROUTE_RECOVERY_PATH,
          fileCount: finalFiles.length,
          syntaxValid: mergedSyntax.valid,
        });
        if (!mergedSyntax.valid) {
          preflightIssues.push(
            ...mergedSyntax.errors.slice(0, 20).map((error) =>
              createIssue(
                error.file,
                "error",
                `Home route recovery produced syntax error line ${error.line}:${error.column} — ${error.message}`,
                "code_structure_failure",
              )
            ),
          );
        }
      } else {
        devLogAppend("in-progress", {
          type: "home-route-recovery.failed",
          chatId,
          path: HOME_ROUTE_RECOVERY_PATH,
          message: homeRecovery.message ?? "unknown failure",
        });
      }
    }

    try {
      const previewHtml = buildPreviewHtml(finalFiles);
      if (!previewHtml) {
        previewBlockingReason =
          "Automatic preflight could not build a renderable own-engine preview entrypoint.";
        preflightIssues.push(createIssue("preview", "error", previewBlockingReason));
      }
    } catch (previewErr) {
      previewBlockingReason =
        previewErr instanceof Error
          ? `Automatic preflight failed while preparing preview: ${previewErr.message}`
          : "Automatic preflight failed while preparing preview.";
      preflightIssues.push(createIssue("preview", "error", previewBlockingReason));
      devLogAppend("in-progress", {
        type: "preview-preflight.error",
        chatId,
        message: previewBlockingReason,
      });
    }

    const cleanedFiles = removeLiteralRouteDuplicates(finalFiles);
    if (cleanedFiles.length !== finalFiles.length) {
      finalFiles = cleanedFiles;
      nextFilesJson = JSON.stringify(finalFiles);
      devLogAppend("in-progress", {
        type: "route-literal-duplicates.removed",
        chatId,
      });
    }
    finalizedFilesForPreview = finalFiles;
    // Imported repos are persisted VERBATIM: no scaffold-file injection, no
    // baseline package.json merge (which force-pins next/react/react-dom and
    // adds scaffold deps — breaking templates on other framework majors and
    // invalidating their lockfiles), and no mechanical autofix pass tuned for
    // the own-engine stack. Parity with the init import path, which starts
    // the preview with `skipRepair` + `skipProjectScaffold`. The preview host
    // injects the placeholder API route and builds `.env.local` at session
    // start; `env.example` is injected separately by the preflight phase.
    let completeProjectFiles = importedRepoMode
      ? cleanedFiles
      : repairGeneratedFiles(
          buildCompleteProject(
            cleanedFiles,
            collectRequiredUiComponents(cleanedFiles),
            projectEnvLocalOptions,
          ),
        ).files;
    let importedRepoPinnedDependencies: string[] = [];
    if (importedRepoMode) {
      // Verbatim assembly must still be installable: a follow-up that
      // introduces a new import (e.g. `@clerk/nextjs`) without emitting
      // `package.json` leaves the template's own manifest untouched, the
      // preview host's dependency fingerprint (package.json + lockfiles)
      // stays identical, install is skipped and the runtime 500s on the
      // missing module (prod chat 0d52e5c9, 2026-07-31). Pin missing KNOWN
      // packages into the template's existing package.json — never touch
      // declared versions, framework majors or lockfile identity.
      const depCompletion = completeProjectDependencies(completeProjectFiles);
      importedRepoPinnedDependencies = Object.keys(
        depCompletion.pinnedDependencies,
      );
      if (importedRepoPinnedDependencies.length > 0) {
        completeProjectFiles = depCompletion.files;
        // Stale-lockfile protocol: we just mutated package.json while the
        // template still carries its own lockfile. Mark it stale so the preview
        // host runs one non-frozen install (otherwise a frozen install against
        // warm node_modules answers "Already up to date" and never installs the
        // newly-pinned dep — the radix-ui incident). Only when a lockfile is
        // actually present; a fresh install regenerates from scratch otherwise.
        const lockfilePackageManager =
          detectLockfilePackageManager(completeProjectFiles);
        if (lockfilePackageManager) {
          completeProjectFiles = markLockfileStaleInFiles(completeProjectFiles, {
            reason: `dep-completer pinned ${importedRepoPinnedDependencies.length} dependency/-ies: ${importedRepoPinnedDependencies.join(", ")}`,
            packageManager: lockfilePackageManager,
            makeFile: (path, content) => ({ path, content, language: "json" }),
          });
        }
        preflightIssues.push(
          createIssue(
            "package.json",
            "warning",
            `Pinned ${importedRepoPinnedDependencies.length} missing ${
              importedRepoPinnedDependencies.length === 1
                ? "dependency"
                : "dependencies"
            } in the imported template's package.json: ${importedRepoPinnedDependencies.join(", ")}.`,
            "non_blocking_quality_warning",
          ),
        );
      }
      devLogAppend("in-progress", {
        type: "preflight.imported-repo.assembly-skipped",
        chatId,
        fileCount: completeProjectFiles.length,
        pinnedDependencies: importedRepoPinnedDependencies,
      });
    }
    // Final degenerate-payload guard (Codex #322): the ASSEMBLED project — not
    // just the pre-assembly input — is what gets persisted, and finalize can
    // AMPLIFY size (the credential-deck incident: ~84 KB model output → ~4.4 MB
    // files_json). Re-check the assembled set; if degenerate, record a blocking
    // issue and cap the persisted payload (stub the largest files) so a
    // multi-MB files_json is never written and the home/sanity passes below run
    // on the trimmed content.
    {
      const assembledBaseIdenticalPaths = collectBaseIdenticalPaths(
        completeProjectFiles,
        previousContentByPath,
      );
      const assembledDegeneracy = detectDegenerateFiles(
        completeProjectFiles,
        undefined,
        { preservePaths: assembledBaseIdenticalPaths },
      );
      if (assembledDegeneracy.degenerate) {
        const capped = capDegeneratePayload(
          completeProjectFiles,
          assembledDegeneracy.reason,
          { preservePaths: assembledBaseIdenticalPaths },
        );
        if (capped.stubbedPaths.length > 0) {
          completeProjectFiles = capped.files;
        }
        const alreadyFlagged = preflightIssues.some((issue) =>
          issue.message.startsWith("Degenerate output blocked"),
        );
        if (!alreadyFlagged) {
          preflightIssues.push(
            createIssue(
              assembledDegeneracy.file ?? "preflight",
              "error",
              `Degenerate output blocked: ${assembledDegeneracy.reason}`,
              "code_structure_failure",
            ),
          );
          previewBlockingReason =
            previewBlockingReason ??
            `Degenerate output blocked: ${assembledDegeneracy.reason}`;
        }
        devLogAppend("in-progress", {
          type: "degenerate-output.blocked",
          chatId,
          branch: "assembled",
          file: assembledDegeneracy.file,
          reason: assembledDegeneracy.reason,
          stubbedPaths: capped.stubbedPaths,
        });
      }
    }
    // Canonical persistence payload after finalize-preflight:
    // store the complete scaffold-merged + repaired project so downstream
    // preview/bootstrap does not need to rebuild it again.
    nextFilesJson = JSON.stringify(completeProjectFiles);
    preflightFileCount = completeProjectFiles.length;

    // Plan 11 / open-question #5: hard gate on missing or trivial home
    // route AFTER scaffold + UI-component assembly. This must fire even
    // if `LLM_ONLY_PATHS` already emitted `missingEmittedEssentials`
    // upstream because the user's complaint is "blank promoted site",
    // and the only way that can happen is if `completeProjectFiles`
    // reaches persist without a renderable Home route.
    // Home-route gate is a universal render-safety check (composition-aware, so
    // legit deep delegation to PRESENT components passes). It stays BLOCKING even
    // for imported repos — a follow-up that drops/breaks the page or a delegated
    // component must not ship a blank site. Only the scaffold-contract check
    // (project-sanity) is relaxed for imported repos (see runFinalizePreflightAll).
    const homePageGateIssue = buildMissingHomeRouteIssue(
      findHomePageFile(completeProjectFiles),
      completeProjectFiles,
    );
    if (homePageGateIssue) {
      preflightIssues.push(homePageGateIssue);
      devLogAppend("in-progress", {
        type: "preflight.home-route.blocked",
        chatId,
        file: homePageGateIssue.file,
        message: homePageGateIssue.message,
        completeProjectFileCount: completeProjectFiles.length,
      });
    }

    // Plan 11 / Bug 1·2 — count-parity assertion. Historic 26-vs-6
    // drift (commit 7a6a6d589) had `preflightFileCount` reporting the
    // assembled count while `nextFilesJson` still pointed at the
    // pre-assembly array. The fix landed but there is no invariant
    // guarding against future regressions. Now: if
    // `JSON.parse(nextFilesJson).length !== preflightFileCount`,
    // emit a hard error and let the caller block persist in strict mode.
    let persistedFileCount: number | null = null;
    try {
      const persistedParsed = JSON.parse(nextFilesJson) as unknown;
      if (Array.isArray(persistedParsed)) {
        persistedFileCount = persistedParsed.length;
      }
    } catch {
      persistedFileCount = null;
    }
    if (
      persistedFileCount !== null &&
      persistedFileCount !== preflightFileCount
    ) {
      const message = `Preflight file count drift: counted ${preflightFileCount} files but nextFilesJson serializes ${persistedFileCount}. Refusing silent persist (plan 11 / count parity invariant).`;
      preflightIssues.push(
        createIssue(
          "preflight",
          "error",
          message,
          "code_structure_failure",
        ),
      );
      devLogAppend("in-progress", {
        type: "preflight.count-parity.failed",
        chatId,
        preflightFileCount,
        persistedFileCount,
      });
    }
    devLogAppend("in-progress", {
      type: "preflight.summary",
      chatId,
      filesChecked: preflightFileCount,
      persistedFilesCount: persistedFileCount,
      hasHomeRouteBlock: Boolean(homePageGateIssue),
    });
    const actualRoutes = extractAppRoutePathsFromFilePaths(
      completeProjectFiles.map((file) => file.path),
    );
    const effectiveRoutePlan = routePlan ?? buildContractBackedRoutePlan(orchestrationContract);
    const preflightAll = runFinalizePreflightAll({
      files: completeProjectFiles,
      actualRoutes,
      importedRepoMode,
      plannedRoutePaths: (effectiveRoutePlan?.routes ?? []).map((route) => route.path),
    });
    preflightIssues.push(...preflightAll.issues);
    if (preflightAll.unresolvedImportFallbackUsed) {
      unresolvedImportFallbackUsed = true;
    }

    const appPagePath = resolveAppPagePath(completeProjectFiles);
    if (appPagePath) {
      const pageFile = completeProjectFiles.find((f) => f.path.replace(/\\/g, "/") === appPagePath);
      if (pageFile?.content && looksLikeEmptyPage(pageFile.content)) {
        preflightIssues.push(
          createIssue(
            appPagePath,
            "warning",
            "Main page appears to render empty content.",
            "non_blocking_quality_warning",
          ),
        );
      }
    }

    const missingPlannedRoutes = findMissingPlannedRoutes(effectiveRoutePlan, actualRoutes);

    // Deterministic href ↔ actual-route cross-check. Today this only emits
    // non-blocking warnings while we measure false-positive rate; the gate
    // can be flipped to blocking via repairPolicies once the signal proves
    // clean (see docs/plans/active/repair-loop-hardening.md).
    const hrefMismatches = preflightAll.hrefMismatches;
    if (hrefMismatches.length > 0) {
      devLogAppend("in-progress", {
        type: "href-route.cross-check",
        chatId,
        mismatchCount: hrefMismatches.length,
        sample: hrefMismatches.slice(0, 5).map((m) => ({
          file: m.file,
          line: m.line,
          basePath: m.basePath,
          suggestion: m.suggestion,
        })),
        actualRouteCount: actualRoutes.length,
      });
    }
    if (preflightAll.unlinkedPlannedRoutes.length > 0) {
      devLogAppend("in-progress", {
        type: "href-route.unlinked-planned",
        chatId,
        paths: preflightAll.unlinkedPlannedRoutes.map((route) => route.path),
      });
    }

    if (missingPlannedRoutes.length > 0) {
      // Missing secondary routes should not block preview/Tier 2; autofix or follow-up can add them.
      preflightIssues.push(
        ...missingPlannedRoutes.slice(0, 10).map((route) =>
          createIssue(
            route.path,
            "warning",
            `Planned route is missing from generated files: ${route.path} (${route.name})`,
            "non_blocking_quality_warning",
          )
        ),
      );
      devLogAppend("in-progress", {
        type: "route-plan.preflight",
        chatId,
        source: getRoutePlanPrimarySource(effectiveRoutePlan),
        siteType: effectiveRoutePlan?.siteType ?? null,
        missingRoutes: missingPlannedRoutes.map((route) => route.path),
      });
    }
    const orchestrationContractIssues = collectOrchestrationContractIssues(
      orchestrationContract,
      completeProjectFiles,
    );
    if (orchestrationContractIssues.length > 0) {
      preflightIssues.push(...orchestrationContractIssues);
      devLogAppend("in-progress", {
        type: "orchestration-contract.validate",
        chatId,
        issueCount: orchestrationContractIssues.length,
        issues: orchestrationContractIssues.slice(0, 10),
      });
    }
    if (preflightAll.sanityIssuesForLog.length > 0) {
      devLogAppend("in-progress", {
        type: "project-sanity",
        chatId,
        valid: preflightAll.sanityValid,
        issues: preflightAll.sanityIssuesForLog.slice(0, 20),
        completeProjectFiles: completeProjectFiles.length,
      });
    }
    previewStart = buildPreviewStartContract({
      issues: preflightIssues,
      finalizedPreviewFileCount: finalizedFilesForPreview.length,
    });
    if (!previewStart.canStartPreview) {
      previewBlockingReason =
        previewBlockingReason ?? describePreviewBlockFromIssues(preflightIssues);
    }
  } catch (preflightErr) {
    const message =
      preflightErr instanceof Error
        ? `Finalize preflight crashed: ${preflightErr.message}`
        : "Finalize preflight crashed unexpectedly.";
    console.warn("[preflight] Finalize preflight error:", preflightErr);
    previewBlockingReason = previewBlockingReason ?? message;
    preflightIssues.push(
      createIssue("preflight", "error", message, "code_structure_failure"),
    );
    previewStart = buildPreviewStartContract({
      issues: preflightIssues,
      finalizedPreviewFileCount: finalizedFilesForPreview.length,
    });
    devLogAppend("in-progress", {
      type: "preflight.error",
      chatId,
      message,
    });
  }

  return {
    filesJson: nextFilesJson,
    finalizedFilesForPreview,
    preflightFileCount,
    preflightIssues,
    previewBlockingReason,
    previewStart,
    unresolvedImportFallbackUsed,
    postMergeFixes,
  };
}
