"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Formatting helpers (moved here since only used in review rendering)
// ---------------------------------------------------------------------------

export function formatDurationMsShort(durationMs: number | null | undefined): string | null {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1000;
  return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1).replace(/\.0$/, "")}s`;
}

export function formatUtcClock(timestamp: string | null | undefined): string | null {
  if (typeof timestamp !== "string" || !timestamp.trim()) return null;
  const value = timestamp.trim();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toISOString().slice(11, 19)}Z`;
}

// ---------------------------------------------------------------------------
// PostCheckPanel (structured only)
// ---------------------------------------------------------------------------

export type PostCheckPanelProps = {
  files: number | null;
  added: number | null;
  modified: number | null;
  removed: number | null;
  warnings: number | null;
  demoUrl: string | null;
  previousVersionId: string | null;
  provisional: boolean;
  qualityGatePending: boolean;
  autoFixQueued: boolean;
  /**
   * Files whose updated output was rejected because the merge guard detected
   * a suspicious shrink (< 50% of prior size). The old content was kept.
   */
  rejectedShrinks?: Array<{ file: string; previousSize: number; newSize: number }> | null;
  /**
   * Top verifier-blocking findings surfaced from finalize preflight. When
   * present the version was flagged as verification-blocked even though it
   * was saved.
   */
  verifierFindings?: Array<{ id: string; detail: string }> | null;
  /**
   * Scaffold-retry suggestion from finalize. When present we surface a
   * "Byt scaffold"-CTA that re-issues the generation with a different
   * scaffold family.
   */
  scaffoldRetry?: {
    currentScaffoldLabel: string;
    suggestedScaffoldLabel: string;
    suggestedScaffoldId: string;
    reason: string;
  } | null;
  onRetryWithScaffold?: (scaffoldId: string) => void;
  /**
   * Shrink-retry suggestion from finalize. Emitted when the merge-guard
   * rejects critical scaffold files (e.g. `app/page.tsx`) because the model
   * returned a drastically shrunken replacement. Surfacing the CTA gives
   * the user a one-click retry with a hardened prompt.
   */
  shrinkRetry?: {
    files: string[];
    reason: string;
    retryPrompt: string;
    ctaLabel: string;
  } | null;
  onRetryAfterShrink?: (retryPrompt: string) => void;
};

export function PostCheckPanel(props: PostCheckPanelProps) {
  const rejectedShrinks = props.rejectedShrinks ?? [];
  const verifierFindings = props.verifierFindings ?? [];
  const scaffoldRetry = props.scaffoldRetry ?? null;
  const shrinkRetry = props.shrinkRetry ?? null;

  return (
    <div className="border-border bg-muted/40 mb-3 rounded-md border p-3 text-xs">
      <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">
        Post-check-sammanfattning
      </div>
      <div className="text-muted-foreground space-y-1">
        {props.files !== null && <div>Filer: {props.files}</div>}
        {props.added !== null &&
          props.modified !== null &&
          props.removed !== null && (
            <div>
              Ändringar: +{props.added} ~{props.modified} -
              {props.removed}
            </div>
          )}
        {props.warnings !== null && (
          <div>Varningar: {props.warnings}</div>
        )}
        {props.autoFixQueued ? (
          <div className="text-amber-300">Status: autofix är köad efter post-check</div>
        ) : props.qualityGatePending ? (
          <div className="text-blue-300">Status: quality gate körs fortfarande</div>
        ) : props.provisional ? (
          <div className="text-amber-300">
            Status: preliminär version medan verifieringen slutförs
          </div>
        ) : null}
        {rejectedShrinks.length > 0 && (
          <div className="text-amber-300">
            Avvisade krympningar: {rejectedShrinks.length} fil
            {rejectedShrinks.length === 1 ? "" : "er"} behöll den förra
            versionen eftersom modellen skickade en kraftigt nedbantad variant.
            {rejectedShrinks.slice(0, 3).map((shrink) => (
              <div key={shrink.file} className="text-muted-foreground/80 text-[11px]">
                - {shrink.file} ({shrink.previousSize} → {shrink.newSize} tecken)
              </div>
            ))}
            {rejectedShrinks.length > 3 && (
              <div className="text-muted-foreground/60 text-[11px]">
                …och {rejectedShrinks.length - 3} till
              </div>
            )}
          </div>
        )}
        {verifierFindings.length > 0 && (
          <div className="text-red-300">
            Verifierare blockerade: {verifierFindings.length} fynd
            <ul className="mt-0.5 space-y-0.5">
              {verifierFindings.slice(0, 3).map((finding) => (
                <li key={finding.id} className="text-muted-foreground/80 text-[11px]">
                  - {finding.detail}
                </li>
              ))}
            </ul>
          </div>
        )}
        {shrinkRetry && props.onRetryAfterShrink && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2">
            <span className="text-amber-200">
              {shrinkRetry.reason}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                props.onRetryAfterShrink?.(shrinkRetry.retryPrompt)
              }
            >
              {shrinkRetry.ctaLabel || "Försök igen"}
            </Button>
          </div>
        )}
        {scaffoldRetry && props.onRetryWithScaffold && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2">
            <span className="text-amber-200">
              Förslag: byt från <strong>{scaffoldRetry.currentScaffoldLabel}</strong>{" "}
              till <strong>{scaffoldRetry.suggestedScaffoldLabel}</strong>.
              {scaffoldRetry.reason ? ` Orsak: ${scaffoldRetry.reason}` : ""}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                props.onRetryWithScaffold?.(scaffoldRetry.suggestedScaffoldId)
              }
            >
              Byt scaffold
            </Button>
          </div>
        )}
        {props.previousVersionId && (
          <div>Föregående version: {props.previousVersionId}</div>
        )}
        {props.demoUrl && (
          <a
            className="text-primary inline-flex items-center gap-1"
            href={props.demoUrl}
            rel="noreferrer"
            target="_blank"
          >
            Öppna preview-länk
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewBlock — generic pass/fail review panel for SEO, analytics, editorial,
// business workflows. Renders full (structured) or compact mode.
// ---------------------------------------------------------------------------

export type ReviewBlockProps = {
  variant: "full" | "compact";
  title: string;
  passed: boolean;
  passedLabel: string;
  failedLabel: string;
  details: string[];
  issues: string[];
  tips: string[];
  maxIssues?: number;
  maxTips?: number;
};

export function ReviewBlock({
  variant,
  title,
  passed,
  passedLabel,
  failedLabel,
  details,
  issues,
  tips,
  maxIssues,
  maxTips,
}: ReviewBlockProps) {
  const issueLimit = maxIssues ?? (variant === "full" ? 4 : 1);
  const tipLimit = maxTips ?? (variant === "full" ? 3 : 1);

  if (variant === "compact") {
    return (
      <div className="border-border bg-muted/20 mt-2 rounded-md border p-2 text-xs">
        <p className={passed ? "text-green-300" : "text-amber-300"}>
          {passed ? passedLabel : failedLabel}
        </p>
        {details.length > 0 && (
          <p className="text-muted-foreground mt-1">{details.join(" • ")}</p>
        )}
        {issues.slice(0, issueLimit).map((issue) => (
          <p key={issue} className="text-muted-foreground mt-1">{issue}</p>
        ))}
        {tips.slice(0, tipLimit).map((tip) => (
          <p key={tip} className="text-muted-foreground mt-1">Tips: {tip}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="border-border bg-muted/40 mb-3 rounded-md border p-3 text-xs">
      <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">
        {title}
      </div>
      <div className="space-y-1 text-muted-foreground">
        <div className={passed ? "text-green-300" : "text-amber-300"}>
          {passed ? passedLabel : failedLabel}
        </div>
        {details.map((detail) => (
          <div key={detail}>{detail}</div>
        ))}
        {issues.length > 0 && (
          <ul className="mt-1 space-y-1">
            {issues.slice(0, issueLimit).map((issue) => (
              <li key={issue}>- {issue}</li>
            ))}
          </ul>
        )}
        {tips.length > 0 && (
          <ul className="mt-1 space-y-1">
            {tips.slice(0, tipLimit).map((tip) => (
              <li key={tip}>- {tip}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActionStrip — quick-reply buttons (structured) or text hint (compact)
// ---------------------------------------------------------------------------

export type ActionStripProps = {
  variant: "full" | "compact";
  show: boolean;
  color: "cyan" | "violet" | "sky" | "emerald";
  title: string;
  question: string;
  options: string[];
  labels: string[];
  keyPrefix: string;
  messageId: string;
  pendingQuickReplyKey: string | null;
  onQuickReply?: (messageId: string, optionIndex: number, text: string) => void;
  quickReplyDisabled?: boolean;
  formatButtonLabel?: (option: string, index: number, total: number) => string;
};

const COLOR_CLASSES = {
  cyan: "border-blue-500/50 bg-blue-500/10 text-blue-200",
  violet: "border-violet-500/50 bg-violet-500/10 text-violet-200",
  sky: "border-blue-500/50 bg-blue-500/10 text-blue-200",
  emerald: "border-green-500/50 bg-green-500/10 text-green-200",
} as const;

export function ActionStrip({
  variant,
  show,
  color,
  title,
  question,
  options,
  labels,
  keyPrefix,
  messageId,
  pendingQuickReplyKey,
  onQuickReply,
  quickReplyDisabled = false,
  formatButtonLabel,
}: ActionStripProps) {
  if (!show) return null;

  if (variant === "compact") {
    return (
      <div className="border-border bg-muted/20 mt-2 rounded-md border p-2 text-xs">
        <p className={COLOR_CLASSES[color].split(" ").pop()}>{question}</p>
        {labels.length > 0 && (
          <p className="text-muted-foreground mt-1">
            Förslag: {labels.slice(0, 2).join(" • ")}
          </p>
        )}
      </div>
    );
  }

  if (!onQuickReply) return null;

  return (
    <div className={`mb-3 rounded-md border p-3 text-xs ${COLOR_CLASSES[color]}`}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide">
        {title}
      </p>
      <p className="text-foreground text-sm font-semibold">{question}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option, optionIndex) => {
          const replyKey = `${messageId}:${keyPrefix}:${optionIndex}:${option}`;
          const isPending = pendingQuickReplyKey === replyKey;
          const label = formatButtonLabel
            ? formatButtonLabel(option, optionIndex, options.length)
            : (labels[optionIndex] ?? option);
          return (
            <Button
              key={replyKey}
              size="sm"
              variant="secondary"
              disabled={quickReplyDisabled || pendingQuickReplyKey !== null}
              onClick={() => void onQuickReply(messageId, optionIndex, option)}
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QualityGatePanel
// ---------------------------------------------------------------------------

export type QualityGateCheckInfo = {
  check: string;
  passed: boolean;
  exitCode: number;
  output: string;
  durationMs?: number | null;
};

export type QualityGatePanelProps = {
  variant: "full" | "compact";
  passed: boolean;
  skipped: boolean;
  reason?: string;
  checks: QualityGateCheckInfo[];
  verifyLaneDurationMs: number | null;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  visualQA: {
    overallScore: number;
    passed: boolean;
    checks: Array<{ check: string; passed: boolean; score: number; detail: string }>;
  } | null;
  errorText?: string | null;
};

export function QualityGatePanel(props: QualityGatePanelProps) {
  if (props.variant === "compact") {
    return <QualityGateCompact {...props} />;
  }
  return <QualityGateFull {...props} />;
}

function QualityGateFull(props: QualityGatePanelProps) {
  if (props.skipped) {
    return (
      <div className="border-border bg-muted/40 mb-3 rounded-md border p-3 text-xs">
        <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">Kvalitetsgrind</div>
        <div className="text-muted-foreground">
          Hoppades över{props.reason ? `: ${props.reason}` : ""}
        </div>
      </div>
    );
  }

  const totalDuration = formatDurationMsShort(props.verifyLaneDurationMs);
  const startedAt = formatUtcClock(props.jobStartedAt);
  const finishedAt = formatUtcClock(props.jobFinishedAt);
  const timeLabels = [
    startedAt ? `Start: ${startedAt}` : null,
    finishedAt ? `Slut: ${finishedAt}` : null,
  ].filter((v): v is string => Boolean(v));

  return (
    <div className="border-border bg-muted/40 mb-3 rounded-md border p-3 text-xs">
      <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">Kvalitetsgrind</div>
      <div className="space-y-1">
        <div className={props.passed ? "text-green-400" : "text-red-400"}>
          {props.passed ? "OK" : "FEL"}
        </div>
        {props.checks.map((check) => {
          const checkDuration = formatDurationMsShort(check.durationMs);
          return (
            <div key={check.check} className="text-muted-foreground flex items-center gap-1.5">
              <span className={check.passed ? "text-green-400" : "text-red-400"}>
                {check.passed ? "\u2713" : "\u2717"}
              </span>
              <span>{check.check}</span>
              {checkDuration && (
                <span className="text-muted-foreground/50 text-[10px]">{checkDuration}</span>
              )}
              {!check.passed && check.output && (
                <span
                  className="ml-1 max-w-[280px] truncate text-[10px] text-red-400/70"
                  title={check.output}
                >
                  {check.output.split("\n")[0]?.slice(0, 80)}
                </span>
              )}
            </div>
          );
        })}
        {totalDuration && (
          <div className="text-muted-foreground/50 text-[10px]">Total: {totalDuration}</div>
        )}
        {timeLabels.length > 0 && (
          <div className="text-muted-foreground/50 text-[10px]">{timeLabels.join(" • ")}</div>
        )}
        {props.firstFailureCheck && (
          <div className="text-amber-300/80 text-[10px]">
            Första felet: {props.firstFailureCheck}
          </div>
        )}
        {props.visualQA && (
          <div className="text-muted-foreground/80 text-[10px]">
            Visuell QA: {props.visualQA.overallScore}/100{" "}
            {props.visualQA.passed ? "OK" : "UNDER TRÖSKELVÄRDET"}
          </div>
        )}
      </div>
    </div>
  );
}

function QualityGateCompact(props: QualityGatePanelProps) {
  if (props.skipped) {
    return (
      <div className="border-border bg-muted/20 mt-2 rounded-md border p-2 text-xs">
        <p className="text-amber-300">Verifiera: hoppades över</p>
        {props.reason && <p className="text-muted-foreground mt-1">{props.reason}</p>}
      </div>
    );
  }

  if (props.errorText) {
    return (
      <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs">
        <p className="text-red-300">Verifiera: fel</p>
        <p className="text-muted-foreground mt-1">{props.errorText}</p>
      </div>
    );
  }

  const firstFailedOutput = props.checks
    .find((check) => !check.passed && check.output.trim())
    ?.output.split("\n")[0]
    ?.slice(0, 120);
  const totalDuration = formatDurationMsShort(props.verifyLaneDurationMs);
  const startedAt = formatUtcClock(props.jobStartedAt);
  const finishedAt = formatUtcClock(props.jobFinishedAt);

  return (
    <div className="border-border bg-muted/20 mt-2 rounded-md border p-2 text-xs">
      <p className={props.passed ? "text-green-300" : "text-red-300"}>
        Verifiera: {props.passed ? "OK" : "FEL"}
      </p>
      {props.checks.length > 0 && (
        <p className="text-muted-foreground mt-1 wrap-break-word">
          {props.checks
            .map((check) => {
              const duration = formatDurationMsShort(check.durationMs);
              return `${check.check}${duration ? ` (${duration})` : ""}`;
            })
            .join(" • ")}
        </p>
      )}
      {firstFailedOutput && (
        <p className="text-muted-foreground mt-1">Detalj: {firstFailedOutput}</p>
      )}
      {(totalDuration || props.firstFailureCheck) && (
        <p className="text-muted-foreground mt-1">
          {[
            totalDuration ? `Total: ${totalDuration}` : null,
            props.firstFailureCheck ? `Första felet: ${props.firstFailureCheck}` : null,
          ]
            .filter((v): v is string => Boolean(v))
            .join(" • ")}
        </p>
      )}
      {(startedAt || finishedAt) && (
        <p className="text-muted-foreground mt-1">
          {[
            startedAt ? `Start: ${startedAt}` : null,
            finishedAt ? `Slut: ${finishedAt}` : null,
          ]
            .filter((v): v is string => Boolean(v))
            .join(" • ")}
        </p>
      )}
      {props.visualQA && (
        <p className="text-muted-foreground mt-1">
          Visual QA: {props.visualQA.overallScore}/100{" "}
          {props.visualQA.passed ? "PASS" : "BELOW THRESHOLD"}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServerRepairPanel
// ---------------------------------------------------------------------------

export type ServerRepairPanelProps = {
  variant: "full" | "compact";
  repaired: boolean;
  status: string | null;
  reason: string | null;
  method: string | null;
  newVersionId: string | null;
  remainingErrors: number | null;
  improvedSyntax: boolean | null;
  earlyStopReason: string | null;
};

export function ServerRepairPanel(props: ServerRepairPanelProps) {
  if (props.variant === "compact") {
    const secondaryParts = [
      props.remainingErrors !== null ? `Kvarvarande fel: ${props.remainingErrors}` : null,
      props.improvedSyntax !== null ? `Syntax förbättrades: ${props.improvedSyntax ? "ja" : "nej"}` : null,
      props.earlyStopReason ? `Stopporsak: ${props.earlyStopReason}` : null,
    ].filter((v): v is string => Boolean(v));

    return (
      <div className="border-border bg-muted/20 mt-2 rounded-md border p-2 text-xs">
        <p className={props.repaired ? "text-green-300" : "text-amber-300"}>
          Repair: {props.repaired ? "lyckades" : "ej fullständig"}
        </p>
        {props.status && <p className="text-muted-foreground mt-1">Status: {props.status}</p>}
        {props.method && <p className="text-muted-foreground mt-1">Metod: {props.method}</p>}
        {props.reason && <p className="text-muted-foreground mt-1">Orsak: {props.reason}</p>}
        {secondaryParts.length > 0 && (
          <p className="text-muted-foreground mt-1">{secondaryParts.join(" • ")}</p>
        )}
        {props.newVersionId && (
          <p className="text-muted-foreground mt-1">Ny version: {props.newVersionId}</p>
        )}
      </div>
    );
  }

  return (
    <div className="border-border bg-muted/40 mb-3 rounded-md border p-3 text-xs">
      <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">Serverreparation</div>
      <div className="space-y-1 text-muted-foreground">
        <div className={props.repaired ? "text-green-300" : "text-amber-300"}>
          {props.repaired ? "Reparation lyckades" : "Reparationsförsök slutfört utan full fix"}
        </div>
        {props.status && <div>Status: {props.status}</div>}
        {props.method && <div>Metod: {props.method}</div>}
        {props.reason && <div>Orsak: {props.reason}</div>}
        {props.remainingErrors !== null && <div>Kvarvarande fel: {props.remainingErrors}</div>}
        {props.improvedSyntax !== null && <div>Syntax förbättrades: {props.improvedSyntax ? "ja" : "nej"}</div>}
        {props.earlyStopReason && <div>Stopporsak: {props.earlyStopReason}</div>}
        {props.newVersionId && <div>Ny version: {props.newVersionId}</div>}
      </div>
    </div>
  );
}
