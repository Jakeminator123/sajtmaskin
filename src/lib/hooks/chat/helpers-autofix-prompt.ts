import type { AutoFixPayload } from "./types";

export function buildAutoFixPrompt(payload: AutoFixPayload): string {
  const repair = payload.repair;

  const currentVersionErrors = repair?.currentVersionErrors
    ?? (Array.isArray(payload.meta?.currentVersionErrors)
      ? payload.meta!.currentVersionErrors.filter((value): value is string => typeof value === "string")
      : []);
  const previousVersionErrors = repair?.previousVersionErrors
    ?? (Array.isArray(payload.meta?.previousVersionErrors)
      ? payload.meta!.previousVersionErrors.filter((value): value is string => typeof value === "string")
      : []);

  // Aggregate the headline from ALL known sources, not just `reasons[]`.
  //
  // The previous implementation joined `payload.reasons[]` only, which on
  // the Snickar Anders run produced "Issues detected: contact-form invalid
  // imports, autofix heavy load." while the actual persisted errors
  // included three distinct verifier-blocking findings (`floating-cta`,
  // `contact-form`, `project-gallery`) plus a fresh typecheck failure.
  // The LLM read the headline first and ended up "fixing" only the named
  // contact-form, missing `floating-cta` (the SSR-500 root cause).
  //
  // The new headline merges:
  //   1. payload.reasons[] (legacy summary)
  //   2. quality-gate check names (typecheck/build/lint)
  //   3. one-line summaries extracted from currentVersionErrors that
  //      look like verifier or build/typecheck blockers (so the LLM
  //      sees them up front, not just in the "Persisted errors" tail).
  const headlineEntries = new Set<string>();
  for (const reason of payload.reasons) {
    if (reason) headlineEntries.add(reason);
  }
  if (repair?.qualityGate?.length) {
    for (const failure of repair.qualityGate) {
      if (failure.check) {
        headlineEntries.add(`${failure.check} failed (exit ${failure.exitCode})`);
      }
    }
  }
  for (const entry of currentVersionErrors) {
    if (typeof entry !== "string") continue;
    // Headline shouldn't drown in 16 long lines — pick verifier/typecheck/
    // build/preflight categories which are the actual promotion-blockers.
    const isBlocker =
      entry.startsWith("[quality-gate:") ||
      entry.startsWith("[preflight:") ||
      entry.startsWith("[verifier") ||
      entry.startsWith("[react") ||
      entry.startsWith("[syntax") ||
      entry.startsWith("[routes") ||
      entry.startsWith("[preview]") ||
      entry.startsWith("[preview:") ||
      entry.startsWith("[render-telemetry]") ||
      entry.startsWith("[product_postcheck.console_error]") ||
      entry.startsWith("[product_postcheck.runtime_crash]") ||
      entry.startsWith("[product_postcheck.hydration_mismatch]") ||
      entry.startsWith("[product_postcheck.hydration_dom_loss]");
    if (!isBlocker) continue;
    // Trim to a single line + cap length so the headline stays readable.
    const oneLine = entry.replace(/\s+/g, " ").trim();
    if (oneLine.length > 0) headlineEntries.add(oneLine.slice(0, 220));
    if (headlineEntries.size > 8) break;
  }
  const reasons =
    headlineEntries.size > 0 ? [...headlineEntries].join("; ") : "unknown issues";

  const scaffoldRetry = repair?.scaffoldRetry
    ?? (payload.meta?.scaffoldRetry && typeof payload.meta.scaffoldRetry === "object"
      ? (payload.meta.scaffoldRetry as {
          labels?: string[];
          currentScaffoldLabel?: string;
          suggestedScaffoldLabel?: string;
          reason?: string;
        })
      : null);

  const scaffoldRetryReason =
    scaffoldRetry && typeof scaffoldRetry.reason === "string" ? scaffoldRetry.reason : null;
  const scaffoldRetryLabels =
    scaffoldRetry && Array.isArray(scaffoldRetry.labels) && scaffoldRetry.labels.length >= 2
      ? scaffoldRetry.labels
      : null;
  const currentScaffoldLabel =
    scaffoldRetryLabels?.[0]
    ?? (scaffoldRetry && typeof scaffoldRetry.currentScaffoldLabel === "string"
      ? scaffoldRetry.currentScaffoldLabel
      : null);
  const suggestedScaffoldLabel =
    scaffoldRetryLabels?.[1]
    ?? (scaffoldRetry && typeof scaffoldRetry.suggestedScaffoldLabel === "string"
      ? scaffoldRetry.suggestedScaffoldLabel
      : null);

  const lines = [
    "AUTO-FIX REQUEST — TARGETED REPAIR",
    "",
    `Issues detected: ${reasons}.`,
    "",
    "Rules:",
    "1. Make the smallest change that fixes the listed issues.",
    "2. Do NOT change layout, naming, styling, or architecture unless required by the fix.",
    "3. You MAY add a missing dependency import or install if the error requires it.",
    "4. Return ONLY the changed files with minimal edits, but every returned file MUST be complete from first line to last line.",
    "5. NEVER ask the user questions, request confirmation, or wait for input. Fix immediately and silently.",
    "6. NEVER return snippets, diff hunks, partial import sections, or excerpted fragments of a file.",
    "",
    "Acceptance criteria (the fix MUST pass all):",
    "- TypeScript typecheck (tsc --noEmit) passes.",
    "- Build (next build) succeeds.",
    "- Preview/demo URL loads without errors.",
    "- All internal links resolve to existing routes.",
    "- No broken images or invalid React use() calls.",
    '- Every `file="..."` block is a complete file, not a partial snippet.',
  ];

  if (currentVersionErrors.length > 0) {
    lines.push("", "Persisted errors for this version:", ...currentVersionErrors.map((entry) => `- ${entry}`));
  }
  if (previousVersionErrors.length > 0) {
    lines.push("", "Related unresolved errors from previous version:", ...previousVersionErrors.map((entry) => `- ${entry}`));
  }

  if (
    scaffoldRetry &&
    scaffoldRetryReason &&
    currentScaffoldLabel &&
    suggestedScaffoldLabel
  ) {
    lines.push(
      "",
      "Scaffold-aware retry guidance:",
      `- Current scaffold: ${currentScaffoldLabel}`,
      `- Suggested repair scaffold: ${suggestedScaffoldLabel}`,
      `- Why: ${scaffoldRetryReason}`,
      "- Treat this as a hint only. Preserve the current scaffold unless the listed errors make the existing structure impossible to repair with a small change.",
    );
  }

  if (repair?.qualityGateMeta) {
    const {
      verifyLaneDurationMs,
      firstFailureCheck,
      jobStartedAt,
      jobFinishedAt,
    } = repair.qualityGateMeta;
    const qualityGateMetaLines = [
      firstFailureCheck ? `- First failure: ${firstFailureCheck}` : null,
      typeof verifyLaneDurationMs === "number" && Number.isFinite(verifyLaneDurationMs)
        ? `- Total verify duration: ${verifyLaneDurationMs}ms`
        : null,
      jobStartedAt ? `- Verify started: ${jobStartedAt}` : null,
      jobFinishedAt ? `- Verify finished: ${jobFinishedAt}` : null,
    ].filter((line): line is string => Boolean(line));
    if (qualityGateMetaLines.length > 0) {
      lines.push("", "Verify-lane context:", ...qualityGateMetaLines);
    }
  }

  if (repair?.qualityGate?.length) {
    for (const failure of repair.qualityGate) {
      const trimmed = failure.output.trim();
      if (trimmed) {
        const durationSuffix =
          typeof failure.durationMs === "number" && Number.isFinite(failure.durationMs)
            ? `, ${failure.durationMs}ms`
            : "";
        lines.push(
          "",
          `## ${failure.check} output (exit ${failure.exitCode}${durationSuffix})`,
          trimmed.slice(0, 4000),
        );
      }
    }
    if (repair.qualityGate.every((f) => !f.output.trim())) {
      lines.push(
        "",
        "NOTE: Quality gate failed but no error output was captured.",
        "Likely causes: missing type imports, undeclared variables, JSX errors, or missing dependencies.",
        "Review the generated files for obvious TypeScript and build errors.",
      );
    }
  } else if (payload.meta) {
    const qualityGate = payload.meta.qualityGate as Record<string, string> | undefined;
    if (qualityGate && typeof qualityGate === "object") {
      const hasOutput = Object.values(qualityGate).some((v) => typeof v === "string" && v.trim().length > 0);
      if (hasOutput) {
        for (const [check, output] of Object.entries(qualityGate)) {
          if (typeof output === "string" && output.trim()) {
            lines.push("", `## ${check} output`, output.trim().slice(0, 2000));
          }
        }
      } else {
        lines.push(
          "",
          "NOTE: Quality gate failed but no error output was captured.",
          "Likely causes: missing type imports, undeclared variables, JSX errors, or missing dependencies.",
          "Review the generated files for obvious TypeScript and build errors.",
        );
      }
    }
  }

  if (repair?.visualQA?.length) {
    lines.push("", "Visual QA failures:");
    for (const vq of repair.visualQA) {
      lines.push(`- ${vq.check}: score ${vq.score}/100 — ${vq.detail}`);
    }
  }

  if (payload.meta && !repair) {
    const metaStr = JSON.stringify(payload.meta, null, 2);
    const truncated = metaStr.length > 3000 ? metaStr.slice(0, 3000) + "\n..." : metaStr;
    lines.push("", "Diagnostic context:", truncated);
  }

  return lines.join("\n");
}
