"use client";

import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { fillChatInput } from "@/lib/builder/fill-chat-input";
import type {
  LiveReviewResult,
  LiveReviewScreenshotSet,
  LiveReviewSkipReason,
  ReviewDecision,
  ReviewVerdict,
} from "@/lib/gen/verify/live-review-types";
import { cn } from "@/lib/utils";

const VERDICT_LABEL: Record<ReviewVerdict, string> = {
  pass: "Godkänd",
  micro_fix: "Liten justering",
  targeted_repair: "Riktad reparation",
  advisory: "Förslag",
};

const SKIP_LABEL: Record<LiveReviewSkipReason, string> = {
  flag_off: "Avstängd i konfigurationen.",
  grant_off: "Live review är inte aktiverad för chatten.",
  edit_off: "OC_EDIT är avstängt.",
  missing_revision: "Versionens filrevision saknas.",
  cost_capped: "Kostnadstaket för granskningen är nått.",
  claim_busy: "En annan granskning arbetar redan med versionen.",
  postcheck_skipped: "Preview-efterkontrollen kördes inte.",
  preview_not_ready: "Previewen var inte redo.",
  preview_unreadable: "Previewen gick inte att läsa visuellt.",
  runtime_crash: "Previewen kraschade innan granskningen kunde köras.",
  followup_no_sensor: "Uppföljningen saknade nytt visuellt underlag.",
  no_screenshots: "Ingen desktop- eller mobilbild kunde tas.",
  model_unavailable: "Ingen granskningsmodell var tillgänglig.",
  invalid_model_output: "Granskningsmodellen gav ett ogiltigt svar.",
  review_error: "Granskningen misslyckades.",
};

function verdictClass(verdict: ReviewVerdict): string {
  if (verdict === "pass") return "text-emerald-300";
  if (verdict === "advisory") return "text-amber-200";
  return "text-amber-300";
}

function suggestionText(issue: ReviewDecision["issues"][number]): string {
  return (issue.suggestedOperation || issue.evidence).trim();
}

function jpegSummary(screenshots: LiveReviewScreenshotSet | null | undefined): string {
  const viewports = [
    screenshots?.desktopUrl ? "desktop" : null,
    screenshots?.mobileUrl ? "mobil" : null,
  ].filter(Boolean);
  return viewports.length > 0
    ? `JPEG-underlag: ${viewports.join(" + ")}.`
    : "JPEG-underlag: inget sparat.";
}

export function LiveReviewRow({
  result,
  screenshots,
}: {
  result: LiveReviewResult;
  screenshots?: LiveReviewScreenshotSet | null;
}) {
  if (result.status === "skipped") {
    return (
      <div
        className="border-border bg-muted/20 mb-3 space-y-1 rounded-md border px-3 py-2 text-xs"
        data-testid="live-review-row"
        data-status="skipped"
      >
        <div className="text-muted-foreground inline-flex items-center gap-2">
          <span className="tracking-wide uppercase">Live-granskning</span>
          <span className="font-semibold">Ej körd</span>
        </div>
        <p className="text-foreground text-sm">{SKIP_LABEL[result.reason]}</p>
        {result.detail?.trim() ? (
          <p className="text-muted-foreground">{result.detail.trim().slice(0, 300)}</p>
        ) : null}
        <p className="text-muted-foreground">{jpegSummary(screenshots)}</p>
      </div>
    );
  }

  const { decision } = result;
  const suggestions = decision.issues.filter((issue) => suggestionText(issue).length > 0);

  return (
    <div
      className="border-border bg-muted/40 mb-3 space-y-2 rounded-md border px-3 py-2 text-xs"
      data-testid="live-review-row"
    >
      <div className="text-muted-foreground inline-flex items-center gap-2">
        <span className="tracking-wide uppercase">Live-granskning</span>
        <span className={cn("font-semibold", verdictClass(decision.verdict))}>
          {VERDICT_LABEL[decision.verdict]}
        </span>
      </div>
      <p className="text-foreground text-sm">{decision.rationale}</p>
      <p className="text-muted-foreground">{jpegSummary(screenshots)}</p>
      {decision.reasoning?.trim() ? (
        <Reasoning>
          <ReasoningTrigger />
          <ReasoningContent>
            <p className="whitespace-pre-wrap">{decision.reasoning}</p>
          </ReasoningContent>
        </Reasoning>
      ) : null}
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((issue, index) => {
            const text = suggestionText(issue);
            return (
              <button
                key={`${issue.severity}-${index}`}
                type="button"
                className="border-border bg-background hover:bg-accent rounded-md border px-2 py-1 text-left text-[11px]"
                onClick={() => fillChatInput(text)}
              >
                {text}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
