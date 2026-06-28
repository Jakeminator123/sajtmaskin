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
};

export function PostCheckPanel(props: PostCheckPanelProps) {
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
          <div className="text-cyan-300">Status: quality gate körs fortfarande</div>
        ) : props.provisional ? (
          <div className="text-amber-300">
            Status: preliminär version medan verifieringen slutförs
          </div>
        ) : null}
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
        <p className={passed ? "text-emerald-300" : "text-amber-300"}>
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
        <div className={passed ? "text-emerald-300" : "text-amber-300"}>
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
  cyan: "border-cyan-500/50 bg-cyan-500/10 text-cyan-200",
  violet: "border-violet-500/50 bg-violet-500/10 text-violet-200",
  sky: "border-sky-500/50 bg-sky-500/10 text-sky-200",
  emerald: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
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
        <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">Quality gate</div>
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
      <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">Quality gate</div>
      <div className="space-y-1">
        <div className={props.passed ? "text-emerald-400" : "text-rose-400"}>
          {props.passed ? "Godkänd" : "Underkänd"}
        </div>
        {props.checks.map((check) => {
          const checkDuration = formatDurationMsShort(check.durationMs);
          return (
            <div key={check.check} className="text-muted-foreground flex items-center gap-1.5">
              <span className={check.passed ? "text-emerald-400" : "text-rose-400"}>
                {check.passed ? "\u2713" : "\u2717"}
              </span>
              <span>{check.check}</span>
              {checkDuration && (
                <span className="text-muted-foreground/50 text-[10px]">{checkDuration}</span>
              )}
              {!check.passed && check.output && (
                <span
                  className="ml-1 max-w-[280px] truncate text-[10px] text-rose-400/70"
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
            Första fel: {props.firstFailureCheck}
          </div>
        )}
        {props.visualQA && (
          <div className="text-muted-foreground/80 text-[10px]">
            Visuell QA: {props.visualQA.overallScore}/100{" "}
            {props.visualQA.passed ? "Godkänd" : "Under tröskel"}
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
        <p className="text-amber-300">Verifiering: hoppades över</p>
        {props.reason && <p className="text-muted-foreground mt-1">{props.reason}</p>}
      </div>
    );
  }

  if (props.errorText) {
    return (
      <div className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs">
        <p className="text-rose-300">Verifiering: fel</p>
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
      <p className={props.passed ? "text-emerald-300" : "text-rose-300"}>
        Verifiering: {props.passed ? "Godkänd" : "Underkänd"}
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
            props.firstFailureCheck ? `Första fel: ${props.firstFailureCheck}` : null,
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
          Visuell QA: {props.visualQA.overallScore}/100{" "}
          {props.visualQA.passed ? "Godkänd" : "Under tröskel"}
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
        {props.status === "repair_available" && (
          <div className="mb-2 rounded-md border border-indigo-500/50 bg-indigo-500/10 p-2 text-indigo-200">
            <p className="font-semibold">Fixen är klar – men inte applicerad ännu</p>
            <p className="text-indigo-200/80 mt-1">
              Öppna versionspanelen och klicka &quot;Acceptera fix&quot; för att byta till den
              lagade versionen.
            </p>
          </div>
        )}
        <p className={props.repaired ? "text-emerald-300" : "text-amber-300"}>
          Reparation: {props.repaired ? "lyckades" : "ej fullständig"}
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
      {props.status === "repair_available" && (
        <div className="mb-2 rounded-md border border-indigo-500/50 bg-indigo-500/10 p-2 text-indigo-200">
          <p className="font-semibold">Fixen är klar – men inte applicerad ännu</p>
          <p className="text-indigo-200/80 mt-1">
            Öppna versionspanelen och klicka &quot;Acceptera fix&quot; för att byta till den
            lagade versionen.
          </p>
        </div>
      )}
      <div className="space-y-1 text-muted-foreground">
        <div className={props.repaired ? "text-emerald-300" : "text-amber-300"}>
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
