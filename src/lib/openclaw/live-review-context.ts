import type { LiveReviewRunRow } from "@/lib/gen/verify/live-review-claim";
import type { LiveReviewResult } from "@/lib/gen/verify/live-review-types";

const MAX_BLOCK_CHARS = 2_400;

function clip(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

export function formatOpenClawLiveReviewBlock(
  row: LiveReviewRunRow | null | undefined,
): string | null {
  if (!row?.result) return null;
  const result: LiveReviewResult = row.result;
  const lines = [
    "[LIVE-REVIEW] Senaste strukturerade live-granskningen för versionen. Använd den när användaren frågar hur sajten ser ut eller vad som ska ändras. Hitta inte på en annan dom.",
  ];
  if (result.status === "completed") {
    lines.push(`- status: completed`);
    lines.push(`- verdict: ${result.decision.verdict}`);
    lines.push(`- confidence: ${result.decision.confidence}`);
    lines.push(`- rationale: ${clip(result.decision.rationale, 240)}`);
    if (result.decision.issues.length > 0) {
      lines.push("- issues:");
      for (const issue of result.decision.issues.slice(0, 6)) {
        lines.push(
          `  • [${issue.severity}] ${clip(issue.evidence, 180)}${issue.target ? ` → ${clip(issue.target, 80)}` : ""}`,
        );
      }
    }
  } else {
    lines.push(`- status: skipped`);
    lines.push(`- reason: ${result.reason}`);
    if (result.detail) lines.push(`- detail: ${clip(result.detail, 180)}`);
  }
  if (row.desktopUrl) lines.push(`- desktop: ${row.desktopUrl}`);
  if (row.mobileUrl) lines.push(`- mobile: ${row.mobileUrl}`);
  lines.push("[/LIVE-REVIEW]");
  const block = lines.join("\n");
  return block.length > MAX_BLOCK_CHARS
    ? `${block.slice(0, MAX_BLOCK_CHARS)}\n… (avkortat)\n[/LIVE-REVIEW]`
    : block;
}
