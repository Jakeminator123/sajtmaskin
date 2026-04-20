"use client";

import type { ReasoningStep } from "../../lib/schema";

export function ReasoningStep({ step }: { step: ReasoningStep }) {
  return (
    <div className="rounded-lg border p-3 bg-muted/30">
      <div className="text-sm font-medium">{step.title}</div>
      <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
        {step.content}
      </div>
      <div className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
        {step.nextStep === "continue" ? "Reasoning" : "Final answer next"}
      </div>
    </div>
  );
}
