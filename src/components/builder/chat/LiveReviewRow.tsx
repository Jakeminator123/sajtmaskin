"use client";

import { useState } from "react";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fillChatInput } from "@/lib/builder/fill-chat-input";
import type { ReviewDecision, ReviewVerdict } from "@/lib/gen/verify/live-review-types";
import { cn } from "@/lib/utils";
import type { LiveReviewChatResult } from "./tooling/output-parsers";

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

function normalizeReviewText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function reasoningAddsDetail(rationale: string, reasoning: string | undefined): boolean {
  const detail = reasoning?.trim() ?? "";
  if (!detail) return false;
  const a = normalizeReviewText(rationale);
  const b = normalizeReviewText(detail);
  if (!a || a === b) return false;
  if (b.startsWith(a) && b.length <= a.length + 24) return false;
  return true;
}

function LiveReviewScreenshots({
  screenshots,
}: {
  screenshots: LiveReviewChatResult["screenshots"];
}) {
  const items = [
    screenshots?.desktopUrl
      ? { label: "Desktop", src: screenshots.desktopUrl }
      : null,
    screenshots?.mobileUrl ? { label: "Mobil", src: screenshots.mobileUrl } : null,
  ].filter((item): item is { label: string; src: string } => item !== null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<Record<string, true>>({});
  const visible = items.filter((item) => !failed[item.src]);

  if (visible.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid="live-review-screenshots">
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-4 hover:underline">
        Skärmdumpar
      </CollapsibleTrigger>
      <CollapsibleContent>
        {open ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {visible.map((item) => (
              <figure
                key={item.src}
                className="min-w-0"
                data-testid={`live-review-thumb-${item.label.toLowerCase()}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Vercel Blob JPEGs; same convention as other builder chat thumbs */}
                <img
                  src={item.src}
                  alt={`${item.label}-skärmdump av previewn`}
                  loading="lazy"
                  className="border-border bg-background h-20 w-full rounded-sm border object-cover object-top"
                  onError={() =>
                    setFailed((current) => ({ ...current, [item.src]: true }))
                  }
                />
                <figcaption className="text-muted-foreground mt-1 text-[10px]">
                  {item.label}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function LiveReviewRow({ result }: { result: LiveReviewChatResult }) {
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
      {reasoningAddsDetail(decision.rationale, decision.reasoning) ? (
        <Reasoning>
          <ReasoningTrigger>Granskarens motivering</ReasoningTrigger>
          <ReasoningContent>
            <p className="whitespace-pre-wrap">{decision.reasoning}</p>
          </ReasoningContent>
        </Reasoning>
      ) : null}
      <LiveReviewScreenshots screenshots={result.screenshots} />
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
