"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Check, Search, Sparkles, TriangleAlert } from "lucide-react";
import type { SeoReportPayload } from "@/app/api/v0/deployments/seo-publish";

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Viktigast",
  important: "Bör fixas",
  advisory: "Kan förbättras",
};

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
  important: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  advisory: "bg-muted text-muted-foreground",
};

/**
 * Shows what the SEO pass changed at publish time.
 *
 * Two lists, deliberately separate: what was fixed, and what is still open.
 * Merging them into one "SEO-status" would let a long list of green rows hide
 * the fact that the site still has no h1 — and the whole point of deriving the
 * report from a real before/after diff is to keep those two honest.
 */
export function SeoReportDialog({
  report,
  onClose,
}: {
  report: SeoReportPayload | null;
  onClose: () => void;
}) {
  if (!report) return null;
  const hiddenImprovements = report.improvementCount - report.improvements.length;
  const hiddenRemaining = report.remainingCount - report.remaining.length;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            SEO förbättrades vid publicering
          </DialogTitle>
          <DialogDescription>
            Vi granskade sajten innan den publicerades och åtgärdade det vi kunde.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-border flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm">
              <Search className="text-muted-foreground h-4 w-4" />
              <span className="text-muted-foreground">
                {report.pagesInspected} {report.pagesInspected === 1 ? "sida" : "sidor"} granskade
                {", "}
                {report.findingsBefore} {report.findingsBefore === 1 ? "brist" : "brister"} hittade
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="text-muted-foreground">{report.scoreBefore}</span>
              <ArrowRight className="text-muted-foreground h-3.5 w-3.5" />
              <span className="text-brand-teal">{report.scoreAfter}</span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">
              Åtgärdat ({report.improvementCount})
            </p>
            <ul className="space-y-1.5">
              {report.improvements.map((improvement, index) => (
                <li
                  key={`${improvement.file}-${improvement.findingId}-${index}`}
                  className="flex items-start gap-2 text-sm"
                >
                  <Check className="text-brand-teal mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {improvement.change}
                    {improvement.by === "llm" && (
                      <Badge variant="secondary" className="ml-1.5 text-[10px]">
                        AI-text
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {hiddenImprovements > 0 && (
              <p className="text-muted-foreground mt-1.5 text-xs">
                och {hiddenImprovements} till.
              </p>
            )}
          </div>

          {report.remainingCount > 0 && (
            <>
              <Separator />
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Kvar att göra ({report.remainingCount})
                </p>
                <ul className="space-y-1.5">
                  {report.remaining.map((finding, index) => (
                    <li
                      key={`${finding.file}-${finding.id}-${index}`}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Badge
                        variant="secondary"
                        className={`shrink-0 text-[10px] ${SEVERITY_CLASS[finding.severity] ?? ""}`}
                      >
                        {SEVERITY_LABEL[finding.severity] ?? finding.severity}
                      </Badge>
                      <span className="text-muted-foreground">{finding.message}</span>
                    </li>
                  ))}
                </ul>
                {hiddenRemaining > 0 && (
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    och {hiddenRemaining} till.
                  </p>
                )}
              </div>
            </>
          )}

          <Button className="w-full" onClick={onClose}>
            Stäng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
