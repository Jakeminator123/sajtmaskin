"use client";

import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { fillChatInput } from "@/lib/builder/fill-chat-input";
import type { LiveReviewResult, ReviewDecision, ReviewVerdict } from "@/lib/gen/verify/live-review-types";
import { cn } from "@/lib/utils";

const VERDICT_LABEL: Record<ReviewVerdict, string> = {
  pass: "Godkänd",
  micro_fix: "Liten justering",
  targeted_repair: "Riktad reparation",
  advisory: "Förslag",
};

function verdictClass(verdict: ReviewVerdict): string {
  if (verdict === "pass") return "text-emerald-300";
  if (verdict === "advisory") return "text-amber-200";
  return "text-amber-300";
}

function suggestionText(issue: ReviewDecision["issues"][number]): string {
  return (issue.suggestedOperation || issue.evidence).trim();
}

export function LiveReviewRow({ result }: { result: LiveReviewResult }) {
  if (result.status === "skipped") {
    return null;
  }

  const { decision } = result;
  const suggestions = decision.issues.filter((issue) => suggestionText(issue).length > 0);

  return (
    <div
      className="border-border bg-muted/40 mb-3 space-y-2 rounded-md border px-3 py-2 text-xs"
      data-testid="live-review-row"
    >
      <div className="text-muted-foreground inline-flex items-center gap-2">
        <span className="uppercase tracking-wide">Live-granskning</span>
        <span className={cn("font-semibold", verdictClass(decision.verdict))}>
          {VERDICT_LABEL[decision.verdict]}
        </span>
      </div>
      <p className="text-foreground text-sm">{decision.rationale}</p>
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
