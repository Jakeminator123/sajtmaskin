"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, Info, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SeoStatusFinding, SeoStatusPersisted } from "@/lib/projects/seo-status";

type SeoStatusSectionProps = {
  status: SeoStatusPersisted | null;
  projectId: string;
  /** True once the site has a published version; drives the empty-state copy. */
  hasLiveVersion: boolean;
};

const SEVERITY_LABEL: Record<SeoStatusFinding["severity"], string> = {
  critical: "Kritiskt",
  important: "Viktigt",
  advisory: "Tips",
};

const SEVERITY_CLASS: Record<SeoStatusFinding["severity"], string> = {
  critical: "border-red-500/30 bg-red-500/10 text-red-300",
  important: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  advisory: "border-gray-700 bg-gray-900/40 text-gray-300",
};

export function scoreTone(score: number): { label: string; className: string } {
  if (score >= 80) return { label: "Bra", className: "text-emerald-300 border-emerald-500/30" };
  if (score >= 50) return { label: "Okej", className: "text-amber-200 border-amber-500/30" };
  return { label: "Behöver jobb", className: "text-red-300 border-red-500/30" };
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * SEO status for one site: Sajtmaskin's own 0–100 audit from the last publish.
 * Read-only on purpose — fixing findings happens in the builder, where the
 * SEO pass runs again on the next publish.
 */
export function SeoStatusSection({ status, projectId, hasLiveVersion }: SeoStatusSectionProps) {
  if (!status) {
    return (
      <div className="flex items-start gap-3 text-sm text-gray-500">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {hasLiveVersion
            ? "Ingen SEO-kontroll har körts ännu. Slå på SEO när du publicerar i byggaren, så granskas sajten vid varje publicering."
            : "SEO-kontrollen körs när sajten publiceras med SEO påslaget i byggaren."}
        </p>
      </div>
    );
  }

  const tone = scoreTone(status.score);
  const improved = status.score - status.scoreBefore;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`flex h-20 w-20 flex-col items-center justify-center border ${tone.className}`}
          aria-label={`SEO-poäng ${status.score} av 100`}
        >
          <span className="text-2xl font-semibold text-white">{status.score}</span>
          <span className="text-[10px] tracking-wide text-gray-500 uppercase">av 100</span>
        </div>
        <dl className="grid flex-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Bedömning</dt>
            <dd className={tone.className.split(" ")[0]}>{tone.label}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Kontrollerad</dt>
            <dd className="text-gray-300">{formatDate(status.checkedAt)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Sidor granskade</dt>
            <dd className="text-gray-300">{status.pagesInspected}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Fixat vid publicering</dt>
            <dd className="text-gray-300">
              {status.improvementCount} {status.improvementCount === 1 ? "sak" : "saker"}
              {improved > 0 ? ` (+${improved} poäng)` : ""}
            </dd>
          </div>
        </dl>
      </div>

      {status.remaining.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Inga öppna punkter. Allt vi kontrollerar är på plats.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-400">
            {status.remainingCount} {status.remainingCount === 1 ? "öppen punkt" : "öppna punkter"}
            {status.remainingBlockingCount > 0
              ? `, ${status.remainingBlockingCount} ${status.remainingBlockingCount === 1 ? "viktig" : "viktiga"}`
              : ""}
            {status.remainingCount > status.remaining.length
              ? ` — de ${status.remaining.length} viktigaste visas`
              : ""}
            .
          </p>
          <ul className="space-y-2">
            {status.remaining.map((finding, index) => (
              <li
                key={`${finding.id}-${index}`}
                className={`flex items-start gap-2 border p-2 text-sm ${SEVERITY_CLASS[finding.severity]}`}
              >
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <span className="mr-2 text-xs tracking-wide uppercase opacity-80">
                    {SEVERITY_LABEL[finding.severity]}
                  </span>
                  <span>{finding.message}</span>
                </div>
              </li>
            ))}
          </ul>
          <Link href={`/builder?project=${projectId}`} className="inline-block">
            <Button variant="outline" size="sm" className="gap-2">
              <PencilLine className="h-4 w-4" />
              Åtgärda i byggaren
            </Button>
          </Link>
        </div>
      )}

      <p className="text-xs text-gray-600">
        Sajtmaskins egen kontroll av titlar, beskrivningar, sitemap, robots, rubriker, alt-texter
        och strukturerad data. Inte Google Search Console eller Lighthouse.
      </p>
    </div>
  );
}
